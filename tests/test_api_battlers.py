"""Saved presets, a cube's game list and its summary, as the dashboard and cube pages read them."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from server.db import database
from server.db.models import BattleSnapshot, CubeMetadata, GameRecord, PlayerGameHistory


@dataclass(frozen=True)
class Seat:
    name: str
    placement: int | None
    user_id: str | None = None
    is_puppet: bool = False
    hand: tuple[str, ...] = ()


def _add_game(
    game_id: str,
    *,
    cube_id: str,
    seats: list[Seat],
    played_on: datetime,
    config: dict | None = None,
    ended: bool = True,
) -> None:
    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id=game_id,
                cube_id=cube_id,
                created_at=played_on,
                ended_at=played_on if ended else None,
                config_json=json.dumps(
                    config if config is not None else {"play_mode": "limited", "use_upgrades": True}
                ),
            )
        )
        for seat in seats:
            history = PlayerGameHistory(
                game_id=game_id,
                player_name=seat.name,
                battler_elo=1200,
                max_stage=3,
                max_round=1,
                final_placement=seat.placement,
                user_id=seat.user_id,
                is_puppet=seat.is_puppet,
            )
            db.add(history)
            db.flush()
            if seat.hand:
                db.add(
                    BattleSnapshot(
                        player_history_id=history.id,
                        stage=3,
                        round=1,
                        hand_json=json.dumps([{"scryfall_id": card} for card in seat.hand]),
                        basic_lands_json="[]",
                        applied_upgrades_json="[]",
                        treasures=0,
                        full_state_json="{}",
                    )
                )
        db.commit()
    finally:
        db.close()


def _day(day: int) -> datetime:
    return datetime(2026, 11, day, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def offline_cubecobra(monkeypatch):
    def _no_network(url: str):
        raise LookupError(url)

    monkeypatch.setattr("mtb.utils.json_helpers.get_json", _no_network)


@pytest.fixture
def vintage_cube(client):
    db = database.SessionLocal()
    try:
        db.add(CubeMetadata(cube_id="vintage", name="Vintage Cube", image_uri="https://img/vintage"))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def kestrel(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": "kestrel", "password": "password123", "email": "kestrel@test.com"},
    )
    assert response.status_code == 200
    return response.json()["user_id"]


def _save_preset(client, **settings) -> dict:
    response = client.post("/api/battlers", json={"cube_id": "vintage", **settings})
    assert response.status_code == 200
    return response.json()


def _my_stats(preset: dict) -> tuple:
    return (
        preset["my_game_count"],
        preset["my_win_count"],
        preset["my_average_placement"],
        preset["my_last_played"],
    )


class TestPresetStats:
    def test_a_preset_counts_only_your_finished_games_with_its_settings(self, client, vintage_cube, kestrel):
        limited = {"play_mode": "limited", "use_upgrades": True}
        _add_game("won", cube_id="vintage", config=limited, played_on=_day(10), seats=[Seat("kestrel", 1, kestrel)])
        _add_game("third", cube_id="vintage", config=limited, played_on=_day(12), seats=[Seat("kestrel", 3, kestrel)])
        _add_game("old-format", cube_id="vintage", config={}, played_on=_day(11), seats=[Seat("kestrel", 2, kestrel)])
        _add_game(
            "no-upgrades",
            cube_id="vintage",
            config={"play_mode": "limited", "use_upgrades": False},
            played_on=_day(13),
            seats=[Seat("kestrel", 1, kestrel)],
        )
        _add_game(
            "constructed",
            cube_id="vintage",
            config={"play_mode": "constructed", "use_upgrades": True},
            played_on=_day(14),
            seats=[Seat("kestrel", 4, kestrel)],
        )
        _add_game("someone-else", cube_id="vintage", config=limited, played_on=_day(15), seats=[Seat("rook", 1)])
        _add_game(
            "other-cube", cube_id="legacy", config=limited, played_on=_day(16), seats=[Seat("kestrel", 1, kestrel)]
        )
        _add_game(
            "unfinished",
            cube_id="vintage",
            config=limited,
            played_on=_day(17),
            ended=False,
            seats=[Seat("kestrel", 1, kestrel)],
        )

        _save_preset(client, display_name="Friday Vintage", play_mode="limited", use_upgrades=True)
        _save_preset(client, display_name="Vintage Decks", play_mode="constructed", use_upgrades=True)
        _save_preset(client, display_name="No Upgrades", play_mode="limited", use_upgrades=False)

        presets = {p["display_name"]: p for p in client.get("/api/battlers").json()["battlers"]}

        assert _my_stats(presets["Friday Vintage"]) == (3, 1, 2.0, _day(12).replace(tzinfo=None).isoformat())
        assert _my_stats(presets["Vintage Decks"])[:3] == (1, 0, 4.0)
        assert _my_stats(presets["No Upgrades"])[:3] == (1, 1, 1.0)
        assert presets["Friday Vintage"]["game_count"] == 6

    def test_a_preset_with_no_games_has_empty_stats(self, client, vintage_cube, kestrel):
        _add_game("someone-else", cube_id="vintage", played_on=_day(15), seats=[Seat("rook", 1)])

        preset = _save_preset(client)

        assert _my_stats(preset) == (0, 0, None, None)
        assert preset["game_count"] == 1

    def test_saving_a_preset_returns_its_stats_and_cube_name(self, client, vintage_cube, kestrel):
        _add_game("won", cube_id="vintage", played_on=_day(10), seats=[Seat("kestrel", 1, kestrel)])

        preset = _save_preset(client, play_mode="limited", use_upgrades=True)

        assert preset["cube_name"] == "Vintage Cube"
        assert preset["my_game_count"] == 1
        assert preset["game_count"] == 1

    def test_changing_a_presets_settings_returns_the_stats_for_its_new_settings(self, client, vintage_cube, kestrel):
        _add_game(
            "constructed",
            cube_id="vintage",
            config={"play_mode": "constructed", "use_upgrades": True},
            played_on=_day(14),
            seats=[Seat("kestrel", 2, kestrel)],
        )
        preset = _save_preset(client, play_mode="limited", use_upgrades=True)

        updated = client.put(f"/api/battlers/{preset['id']}", json={"play_mode": "constructed"}).json()

        assert preset["my_game_count"] == 0
        assert updated["my_game_count"] == 1
        assert updated["cube_name"] == "Vintage Cube"


class TestMyGamesFilter:
    def test_mine_only_lists_just_your_games_shown_by_your_seat(self, client, vintage_cube, kestrel):
        _add_game(
            "shared",
            cube_id="vintage",
            played_on=_day(10),
            seats=[Seat("rook", 1, hand=("rook-card",)), Seat("kestrel", 2, kestrel, hand=("kestrel-card",))],
        )
        _add_game("rooks-solo", cube_id="vintage", played_on=_day(11), seats=[Seat("rook", 1)])
        _add_game(
            "with-a-puppet",
            cube_id="vintage",
            played_on=_day(12),
            seats=[Seat("kestrel", 1, kestrel), Seat("bot", 2, is_puppet=True)],
        )
        preset = _save_preset(client)

        mine = client.get(f"/api/battlers/{preset['id']}/games", params={"mine_only": "true"}).json()
        everyone = client.get(f"/api/battlers/{preset['id']}/games").json()

        assert [(g["game_id"], g["best_human_name"], g["best_human_placement"]) for g in mine["games"]] == [
            ("with-a-puppet", "kestrel", 1),
            ("shared", "kestrel", 2),
        ]
        assert mine["games"][1]["hand_scryfall_ids"] == ["kestrel-card"]
        assert mine["total_games"] == 2
        assert [g["game_id"] for g in everyone["games"]] == ["with-a-puppet", "rooks-solo", "shared"]
        assert everyone["games"][2]["best_human_name"] == "rook"

    def test_mine_only_combines_with_the_mode_and_upgrades_filters(self, client, vintage_cube, kestrel):
        _add_game("old-format", cube_id="vintage", config={}, played_on=_day(10), seats=[Seat("kestrel", 1, kestrel)])
        _add_game(
            "constructed",
            cube_id="vintage",
            config={"play_mode": "constructed", "use_upgrades": False},
            played_on=_day(11),
            seats=[Seat("kestrel", 1, kestrel)],
        )
        preset = _save_preset(client)

        limited_with_upgrades = client.get(
            f"/api/battlers/{preset['id']}/games",
            params={"mine_only": "true", "play_mode": "limited", "use_upgrades": "true"},
        ).json()

        assert [g["game_id"] for g in limited_with_upgrades["games"]] == ["old-format"]
        assert limited_with_upgrades["total_games"] == preset["my_game_count"] == 1

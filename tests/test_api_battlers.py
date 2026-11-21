"""Saved presets, game lists, cube summaries and searches, as the dashboard and cube pages read them."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from server.db import database
from server.db.models import BattleSnapshot, CubeMetadata, GameRecord, PlayerGameHistory

CARD_NAMES = {"bolt": "Lightning Bolt", "oko": "Oko, Thief of Crowns", "crown": "Sprouting Crown"}


@dataclass(frozen=True)
class Seat:
    """A seat in a finished game. hand and upgrades hold Scryfall ids, basics hold land names."""

    name: str
    placement: int | None
    user_id: str | None = None
    is_puppet: bool = False
    hand: tuple[str, ...] = ()
    basics: tuple[str, ...] = ()
    upgrades: tuple[str, ...] = ()


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
            if seat.hand or seat.basics or seat.upgrades:
                registry = {card: {"name": CARD_NAMES.get(card, card)} for card in seat.hand + seat.upgrades}
                db.add(
                    BattleSnapshot(
                        player_history_id=history.id,
                        stage=3,
                        round=1,
                        hand_json=json.dumps([{"scryfall_id": card} for card in seat.hand]),
                        basic_lands_json=json.dumps(list(seat.basics)),
                        applied_upgrades_json=json.dumps([{"scryfall_id": card} for card in seat.upgrades]),
                        treasures=0,
                        full_state_json=json.dumps({"data": {}, "card_registry": registry}),
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


class TestCubeSummary:
    def test_summarizes_a_cube_whatever_the_filters(self, client, vintage_cube):
        constructed = {"play_mode": "constructed", "use_upgrades": False}
        _add_game(
            "a", cube_id="vintage", config=constructed, played_on=_day(10), seats=[Seat("rook", 1), Seat("wren", 2)]
        )
        _add_game("b", cube_id="vintage", config=constructed, played_on=_day(11), seats=[Seat("rook", 1)])
        _add_game("c", cube_id="vintage", played_on=_day(12), seats=[Seat("kestrel", 1)])
        _add_game("unfinished", cube_id="vintage", played_on=_day(13), ended=False, seats=[Seat("rook", 1)])

        summary = client.get("/api/battlers/cube/vintage").json()

        assert summary == {
            "cube_id": "vintage",
            "cube_name": "Vintage Cube",
            "cube_image_uri": "https://img/vintage",
            "game_count": 3,
            "human_player_count": 3,
            "last_played": _day(12).replace(tzinfo=None).isoformat(),
            "popular_setup": {"play_mode": "constructed", "use_upgrades": False},
            "is_following": False,
            "follow_id": None,
        }

    def test_a_cube_with_no_games_has_no_popular_setup(self, client, vintage_cube):
        summary = client.get("/api/battlers/cube/vintage").json()

        assert (summary["cube_name"], summary["game_count"], summary["popular_setup"]) == ("Vintage Cube", 0, None)

    def test_tells_a_follower_which_follow_to_remove(self, client, vintage_cube, kestrel):
        follow = client.post("/api/battlers/follow", json={"cube_id": "vintage"}).json()

        summary = client.get("/api/battlers/cube/vintage").json()
        client.post("/api/auth/logout")
        signed_out = client.get("/api/battlers/cube/vintage").json()

        assert (summary["is_following"], summary["follow_id"]) == (True, follow["id"])
        assert (signed_out["is_following"], signed_out["follow_id"]) == (False, None)


def _add_cube_name(cube_id: str, name: str) -> None:
    db = database.SessionLocal()
    try:
        db.add(CubeMetadata(cube_id=cube_id, name=name))
        db.commit()
    finally:
        db.close()


def _discover(client, **params) -> dict:
    response = client.get("/api/discover", params=params)
    assert response.status_code == 200
    return response.json()


class TestCubeSearch:
    def test_finds_cubes_by_name_or_id_ignoring_case(self, client, vintage_cube):
        _add_cube_name("thepaupercube", "The Pauper Cube")
        for day, cube_id in enumerate(("vintage", "thepaupercube", "legacy"), start=10):
            _add_game(f"game-{cube_id}", cube_id=cube_id, played_on=_day(day), seats=[Seat("rook", 1)])

        def found(q: str) -> list[str]:
            return sorted(r["cube_id"] for r in _discover(client, q=q)["results"])

        assert found("pauper") == ["thepaupercube"]
        assert found("LEG") == ["legacy"]
        assert found("cube") == ["thepaupercube", "vintage"]
        assert found("  ") == ["legacy", "thepaupercube", "vintage"]

    def test_pages_and_counts_only_the_matches(self, client):
        for i in range(25):
            _add_game(f"pod-game-{i}", cube_id=f"pod-{i}", played_on=_day(1 + i % 20), seats=[Seat("rook", 1)])
        _add_game("other-game", cube_id="vintage", played_on=_day(1), seats=[Seat("rook", 1)])

        first = _discover(client, q="pod")
        rest = _discover(client, q="pod", offset=20)

        assert (len(first["results"]), first["has_more"], first["total"]) == (20, True, 25)
        assert (len(rest["results"]), rest["has_more"]) == (5, False)

    def test_wildcards_in_the_search_match_only_themselves(self, client):
        _add_game("underscore", cube_id="a_b", played_on=_day(1), seats=[Seat("rook", 1)])
        _add_game("letter", cube_id="axb", played_on=_day(2), seats=[Seat("rook", 1)])

        assert [r["cube_id"] for r in _discover(client, q="a_b")["results"]] == ["a_b"]
        assert _discover(client, q="%")["results"] == []


class TestGameSearch:
    @pytest.fixture
    def kestrels_games(self, client, vintage_cube, kestrel):
        _add_game(
            "limited",
            cube_id="vintage",
            played_on=_day(10),
            seats=[Seat("kestrel", 1, kestrel, hand=("bolt",)), Seat("rook", 2)],
        )
        _add_game(
            "constructed",
            cube_id="vintage",
            config={"play_mode": "constructed", "use_upgrades": True},
            played_on=_day(11),
            seats=[Seat("kestrel", 2, kestrel), Seat("wren", 1, hand=("oko",))],
        )
        _add_game(
            "legacy",
            cube_id="legacy",
            played_on=_day(12),
            seats=[
                Seat("kestrel", 1, kestrel, basics=("Island", "Swamp"), upgrades=("crown",)),
                Seat("Puppet A", 2, is_puppet=True),
            ],
        )
        _save_preset(client, display_name="Friday Vintage", play_mode="limited", use_upgrades=True)

    def _search(self, client, q: str) -> tuple[list[str], int, int]:
        data = client.get("/api/battlers/my-games", params={"q": q}).json()
        return [g["game_id"] for g in data["games"]], data["total_games"], data["total_wins"]

    def test_finds_games_by_another_players_name(self, client, kestrels_games):
        assert self._search(client, "ROOK") == (["limited"], 1, 1)
        assert self._search(client, "puppet a") == (["legacy"], 1, 1)

    def test_does_not_match_the_players_own_name(self, client, kestrels_games):
        assert self._search(client, "kestrel") == ([], 0, 0)

    def test_finds_games_by_cube_name_or_id(self, client, kestrels_games):
        assert self._search(client, "vintage cube") == (["constructed", "limited"], 2, 1)
        assert self._search(client, "legacy") == (["legacy"], 1, 1)

    def test_finds_the_games_a_preset_name_stands_for(self, client, kestrels_games):
        assert self._search(client, "friday") == (["limited"], 1, 1)

    def test_finds_games_by_a_card_in_the_players_hand(self, client, kestrels_games):
        assert self._search(client, "LIGHTNING") == (["limited"], 1, 1)

    def test_finds_games_by_a_basic_land_or_an_applied_upgrade(self, client, kestrels_games):
        assert self._search(client, "island") == (["legacy"], 1, 1)
        assert self._search(client, "sprouting") == (["legacy"], 1, 1)

    def test_does_not_match_a_card_only_another_player_held(self, client, kestrels_games):
        assert self._search(client, "oko") == ([], 0, 0)

    def test_an_empty_search_lists_every_game(self, client, kestrels_games):
        assert self._search(client, "") == (["legacy", "constructed", "limited"], 3, 2)

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

import server.db.database as db
import server.routers.games as games_module
from mtb.models.card_registry import clear_registry
from mtb.models.game import Game, restore_game_from_snapshot
from server.db.models import ActiveGameSnapshot, GameRecord, QuarantinedGameSnapshot
from server.main import app
from server.services.game_manager import GameManager

FIXTURE_SNAPSHOTS = sorted((Path(__file__).parent / "fixtures" / "active_game_snapshots").glob("*.json"))
_MISSING = object()

# Shaped like a current snapshot, with game data that a model change has made invalid.
UNRESTORABLE_SNAPSHOT = json.dumps({"data": {"players": "renamed-field"}, "card_registry": {}})


def test_server_start_sets_aside_a_snapshot_it_cannot_restore(test_db, mock_cube_data, caplog):
    with db.SessionLocal() as session:
        session.add(ActiveGameSnapshot(game_id="g1", state_json=UNRESTORABLE_SNAPSHOT))
        session.commit()

    with caplog.at_level(logging.ERROR), TestClient(app):
        pass

    with db.SessionLocal() as session:
        assert session.get(ActiveGameSnapshot, "g1") is None
        quarantined = session.query(QuarantinedGameSnapshot).one()
    assert (quarantined.game_id, quarantined.state_json) == ("g1", UNRESTORABLE_SNAPSHOT)
    assert quarantined.error
    assert any("g1" in record.getMessage() for record in caplog.records if record.levelno >= logging.ERROR)


def _lost_state(saved: Any, restored: Any, path: str = "") -> list[str]:
    """Paths whose saved value the restored game no longer holds. Keys only the restored game has are new fields."""
    if isinstance(saved, dict) and isinstance(restored, dict):
        return [
            lost
            for key, value in saved.items()
            for lost in _lost_state(value, restored.get(key, _MISSING), f"{path}/{key}")
        ]
    if isinstance(saved, list) and isinstance(restored, list) and len(saved) == len(restored):
        return [
            lost
            for index, (saved_item, restored_item) in enumerate(zip(saved, restored, strict=True))
            for lost in _lost_state(saved_item, restored_item, f"{path}[{index}]")
        ]
    # Comparing types too keeps 1 from matching True when a field changes from int to bool.
    return [] if type(saved) is type(restored) and saved == restored else [path]


@pytest.mark.parametrize("snapshot_path", FIXTURE_SNAPSHOTS, ids=lambda path: path.stem)
def test_games_saved_by_the_deployed_code_restore_with_their_state(snapshot_path):
    """A fixture that fails here means a deploy would set aside, or silently change, every game in that state.

    Keep the old format readable rather than regenerating the fixture.
    """
    saved_json = snapshot_path.read_text()

    restored_json = restore_game_from_snapshot(saved_json).snapshot_dump_json()

    assert _lost_state(json.loads(saved_json), json.loads(restored_json)) == []


def _saved_names(game_id: str) -> dict[str, str]:
    with db.SessionLocal() as session:
        row = session.get(ActiveGameSnapshot, game_id)
        assert row is not None
        registry = json.loads(cast(str, row.state_json))["card_registry"]
    return {sid: card["name"] for sid, card in registry.items()}


def _ready_and_copy_a_card(manager: GameManager, game_id: str, game: Game) -> None:
    with db.SessionLocal() as session:
        for player in game.players:
            player.hand, player.sideboard = player.sideboard[:3], player.sideboard[3:]
            assert manager.handle_build_ready(game, player, ["Plains", "Island", "Swamp"], game_id, session) is None
    fight = game.active_battles[0]
    assert manager.handle_battle_update_card_state(game, fight.player, "copy_token", fight.player_zones.hand[0].id)


def test_a_game_saved_in_lowercase_keeps_its_names_beside_a_newer_game_with_real_ones(
    client, game_with_players, start_lobby, monkeypatch
):
    game_id, alice = game_with_players["game_id"], game_with_players["alice"]
    assert start_lobby(game_id, alice["session_id"]).status_code == 200
    games_module.game_manager.persist_all_games()  # the mock cube's names are lowercase, as games saved them
    with db.SessionLocal() as session:
        row = session.get(ActiveGameSnapshot, game_id)
        assert row is not None
        newer_json = json.loads(cast(str, row.state_json))
    saved = _saved_names(game_id)
    for card in newer_json["card_registry"].values():
        card["name"] = card["name"].title()

    clear_registry()  # a restart
    manager = GameManager()
    monkeypatch.setattr(games_module, "game_manager", manager)
    assert manager.restore_game_from_snapshot(game_id)
    old = manager.get_game(game_id)
    assert old is not None
    newer = restore_game_from_snapshot(json.dumps(newer_json))
    _ready_and_copy_a_card(manager, game_id, old)
    manager.persist_all_games()
    saved_with_copy = _saved_names(game_id)
    _ready_and_copy_a_card(manager, "newer", newer)

    manager.persist_all_games()
    now = _saved_names(game_id)
    assert now == saved_with_copy
    assert {sid: now[sid] for sid in saved} == saved
    bootstrap = manager.get_game_bootstrap(game_id, alice["player_id"])
    assert bootstrap is not None
    for catalog in (bootstrap.catalog, bootstrap.state.catalog_delta):
        assert {sid: card.name for sid, card in catalog.items() if saved.get(sid, card.name) != card.name} == {}
    pool = client.get(f"/api/games/{game_id}/cards").json()["cards"]
    assert all(card["name"].startswith("card") for card in pool)
    with db.SessionLocal() as session:
        record = session.get(GameRecord, game_id)
        assert record is not None
        record.ended_at = datetime.now(UTC)  # ty: ignore[invalid-assignment]
        session.commit()
    review = client.get(f"/api/games/{game_id}/share/Alice").json()["players"][0]["snapshots"][-1]
    assert all(card["name"].startswith("card") for card in review["hand"] + review["sideboard"])

"""Verify read, view, status, share, and resumable paths never mutate game or manager state."""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

import server.db.database as db
import server.routers.ws as ws_module
from pitfight.models.cards import Battler, Card
from pitfight.models.game import (
    Puppet,
    StaticOpponent,
    create_game,
    restore_game_from_snapshot,
    set_battler,
)
from pitfight.phases import battle
from server.db.models import ActiveGameSnapshot, GamePlayerRecord, GameRecord, PlayerGameHistory
from server.services.game.view_builder import build_game_bootstrap, build_game_state
from server.services.game_manager import GameManager

FIXTURE_SNAPSHOTS = sorted((Path(__file__).parent / "fixtures" / "active_game_snapshots").glob("*.json"))


def _manager_in_memory_snapshot(manager: GameManager) -> dict[str, object]:
    return {
        "pending_games": set(manager.pending_games.keys()),
        "active_games": set(manager.active_games.keys()),
        "player_to_game": dict(manager.player_to_game),
        "player_id_to_name": dict(manager.player_id_to_name),
        "dirty_games": set(manager.dirty_games),
        "finished_games": set(manager._finished_games),  # noqa: SLF001 -- internal state inspected by test
        "last_human_activity": dict(manager.last_human_activity),
        "action_locks": set(manager._action_locks.keys()),  # noqa: SLF001 -- internal state inspected by test
    }


def _make_battler() -> Battler:
    cards = [Card(name=f"c{i}", image_url="img", id=f"c{i}", type_line="Creature") for i in range(60)]
    return Battler(cards=cards, upgrades=[], vanguards=[])


@pytest.mark.parametrize("snapshot_path", FIXTURE_SNAPSHOTS, ids=lambda path: path.stem)
def test_view_builders_leave_fixture_games_byte_identical(snapshot_path: Path) -> None:
    game = restore_game_from_snapshot(snapshot_path.read_text())
    before_json = game.snapshot_dump_json()

    for player in game.players:
        state = build_game_state(game, player, game_id=snapshot_path.stem)
        bootstrap = build_game_bootstrap(game, player, game_id=snapshot_path.stem)
        assert state.self_player.name == player.name
        assert bootstrap.state.self_player.name == player.name

    assert game.snapshot_dump_json() == before_json


def test_get_game_state_does_not_lazily_create_missing_battle_or_mutate_puppets() -> None:
    manager = GameManager()
    game = create_game(["Alice"], num_players=1)
    set_battler(game, _make_battler())
    alice = game.players[0]
    alice.phase = "battle"
    alice.chosen_basics = ["Plains", "Island", "Mountain"]

    puppet_snap = StaticOpponent(
        name="Bot",
        hand=[],
        sideboard=[],
        command_zone=[],
        upgrades=[],
        chosen_basics=["Plains", "Island", "Mountain"],
        treasures=2,
        poison=0,
        hand_revealed=True,
        is_ghost=False,
        source_player_history_id=1,
    )
    puppet = Puppet(name="Bot", player_history_id=1, poison=5, snapshots={"3_1": puppet_snap})
    game.puppets.append(puppet)

    manager.active_games["g1"] = game
    manager.player_to_game["pid_alice"] = "g1"
    manager.player_id_to_name["pid_alice"] = "Alice"

    before_json = game.snapshot_dump_json()
    before_manager = _manager_in_memory_snapshot(manager)

    state = manager.get_game_state("g1", "pid_alice")
    bootstrap = manager.get_game_bootstrap("g1", "pid_alice")

    assert state is not None
    assert bootstrap is not None
    assert state.current_battle is None
    assert game.active_battles == []
    assert puppet.snapshots["3_1"].poison == 0
    assert game.snapshot_dump_json() == before_json
    assert _manager_in_memory_snapshot(manager) == before_manager


def test_pvp_face_down_view_and_puppet_pairing_reads_leave_game_byte_identical() -> None:
    manager = GameManager()
    game = create_game(["Alice", "Bob"], num_players=2)
    set_battler(game, _make_battler())
    alice, bob = game.players
    for player in (alice, bob):
        player.phase = "battle"
        player.chosen_basics = ["Plains", "Island", "Mountain"]
        player.hand = player.sideboard[:3]
        player.sideboard = player.sideboard[3:]

    puppet_snap = StaticOpponent(
        name="Bot",
        hand=[],
        chosen_basics=["Plains", "Island", "Mountain"],
        treasures=1,
        poison=0,
        hand_revealed=True,
        is_ghost=False,
        source_player_history_id=7,
    )
    game.puppets.append(Puppet(name="Bot", player_history_id=7, poison=4, snapshots={"3_1": puppet_snap}))

    active_battle = battle.start(game, alice, opponent=bob)
    secret_card = bob.hand[0]
    battle.move_zone(active_battle, bob, card=secret_card, from_zone="hand", to_zone="battlefield")
    battle.update_card_state(active_battle, bob, action_type="face_down", card_id=secret_card.id)
    battle.move_zone(active_battle, bob, card=bob.hand[1], from_zone="hand", to_zone="library")

    manager.active_games["g1"] = game
    manager.player_to_game["pid_alice"] = "g1"
    manager.player_to_game["pid_bob"] = "g1"
    manager.player_id_to_name["pid_alice"] = "Alice"
    manager.player_id_to_name["pid_bob"] = "Bob"

    before_json = game.snapshot_dump_json()
    before_manager = _manager_in_memory_snapshot(manager)

    alice_state = manager.get_game_state("g1", "pid_alice")
    bob_state = manager.get_game_state("g1", "pid_bob")
    assert alice_state is not None
    assert bob_state is not None
    assert alice_state.current_battle is not None
    assert bob_state.current_battle is not None

    assert game.snapshot_dump_json() == before_json
    assert _manager_in_memory_snapshot(manager) == before_manager


def test_http_read_routes_leave_active_game_byte_identical(
    client: TestClient, game_with_players: dict[str, Any], *, start_lobby: Callable[[str, str], Response]
) -> None:
    game_id = game_with_players["game_id"]
    alice = game_with_players["alice"]
    bob = game_with_players["bob"]

    assert client.get(f"/api/games/{game_id}/lobby").status_code == 200
    assert client.get(f"/api/games/{game_id}/status").status_code == 200

    assert start_lobby(game_id, alice["session_id"]).status_code == 200
    manager = ws_module.game_manager
    game = manager.get_game(game_id)
    assert game is not None

    # Seed a finished share record for an eliminated seat to cover GET /share too.
    with db.SessionLocal() as session:
        session.add(
            PlayerGameHistory(
                game_id=game_id,
                player_name="Bob",
                battler_elo=1200.0,
                max_stage=3,
                max_round=1,
                final_placement=2,
                final_poison=10,
                final_treasures=1,
            )
        )
        session.commit()

    before_json = game.snapshot_dump_json()
    before_manager = _manager_in_memory_snapshot(manager)

    assert client.get(f"/api/games/{game_id}", params={"session_id": alice["session_id"]}).status_code == 200
    assert client.get(f"/api/games/{game_id}/status").status_code == 200
    assert client.get(f"/api/games/{game_id}/cards").status_code == 200
    assert client.get(f"/api/games/{game_id}/share/Bob").status_code == 200
    resumable = client.post(
        "/api/games/resumable",
        json={"seats": [{"game_id": game_id, "player_name": "Alice", "seat_token": alice["seat_token"]}]},
    )
    assert resumable.status_code == 200
    assert len(resumable.json()["games"]) == 1
    assert manager.can_rejoin(game_id, bob.get("player_name", "Bob")) is True

    assert game.snapshot_dump_json() == before_json
    assert _manager_in_memory_snapshot(manager) == before_manager


def test_status_resumable_and_can_rejoin_do_not_load_evicted_snapshot(
    client: TestClient, game_with_players: dict[str, Any], *, start_lobby: Callable[[str, str], Response]
) -> None:
    game_id = game_with_players["game_id"]
    alice = game_with_players["alice"]
    assert start_lobby(game_id, alice["session_id"]).status_code == 200

    manager = ws_module.game_manager
    manager.mark_game_dirty(game_id)
    manager.persist_dirty_games()
    manager.cleanup_game(game_id, preserve_snapshot=True)

    with db.SessionLocal() as session:
        row = session.get(ActiveGameSnapshot, game_id)
        assert row is not None
        snapshot_before = row.state_json

    before_manager = _manager_in_memory_snapshot(manager)

    status_response = client.get(f"/api/games/{game_id}/status")
    assert status_response.status_code == 200
    status_data = status_response.json()
    assert status_data["is_started"] is True
    assert {player["name"] for player in status_data["players"]} == {"Alice", "Bob"}
    assert all(not player["is_connected"] for player in status_data["players"])

    resumable = client.post(
        "/api/games/resumable",
        json={"seats": [{"game_id": game_id, "player_name": "Alice", "seat_token": alice["seat_token"]}]},
    )
    assert resumable.status_code == 200
    assert len(resumable.json()["games"]) == 1

    assert manager.can_rejoin(game_id, "Alice") is True
    assert manager.can_rejoin(game_id, "Nobody") is False

    assert manager.get_game(game_id) is None
    assert _manager_in_memory_snapshot(manager) == before_manager
    with db.SessionLocal() as session:
        row_after = session.get(ActiveGameSnapshot, game_id)
        assert row_after is not None
        assert row_after.state_json == snapshot_before


def test_restore_all_snapshots_acquires_game_lock_for_recovery(test_db: None) -> None:
    _ = test_db
    manager = GameManager()
    game = create_game(["Alice"], num_players=1)
    set_battler(game, _make_battler())
    alice = game.players[0]
    alice.phase = "battle"
    alice.chosen_basics = ["Plains", "Island", "Mountain"]
    puppet_snap = StaticOpponent(
        name="Bot",
        hand=[],
        chosen_basics=["Plains", "Island", "Mountain"],
        hand_revealed=True,
        is_ghost=False,
        source_player_history_id=1,
    )
    game.puppets.append(Puppet(name="Bot", player_history_id=1, snapshots={"3_1": puppet_snap}))

    now = datetime.now(UTC)
    with db.SessionLocal() as session:
        session.add(GameRecord(id="locked-game"))
        session.add(GamePlayerRecord(game_id="locked-game", player_id="pid_a", player_name="Alice", is_puppet=False))
        session.add(
            ActiveGameSnapshot(
                game_id="locked-game",
                state_json=game.snapshot_dump_json(),
                last_human_activity_at=now,
                updated_at=now,
            )
        )
        session.commit()

    async def run_with_lock_contention() -> int:
        async with manager.get_action_lock("locked-game"):
            restore_task = asyncio.create_task(manager.restore_all_snapshots())
            await asyncio.sleep(0)
            assert not restore_task.done()
            assert manager.get_game("locked-game") is None
        return await restore_task

    restored_count = asyncio.run(run_with_lock_contention())
    assert restored_count == 1

    restored_game = manager.get_game("locked-game")
    assert restored_game is not None
    assert len(restored_game.active_battles) == 1
    snapshot_after_restore = restored_game.snapshot_dump_json()

    state = manager.get_game_state("locked-game", "pid_a")
    assert state is not None
    assert state.current_battle is not None
    assert state.current_battle.opponent_name == "Bot"
    assert restored_game.snapshot_dump_json() == snapshot_after_restore

import asyncio
import json
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Any, Never

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

import server.db.database as db_module
import server.routers.ws as ws_module
import server.services.game.lobby_service as lobby_service_module
from mtb.models.cards import Battler, Card
from mtb.models.game import Game
from server.runtime_config import MAX_GAME_STARTS_IN_FLIGHT
from server.services.game_manager import BattlerReady, GameManager, LobbyStage, LobbyStartFailedError, PendingGame


async def _no_broadcast() -> None:
    pass


def _two_player_lobby(manager: GameManager, **settings: Any) -> PendingGame:  # noqa: ANN401 -- forwards lobby kwargs
    pending = manager.create_game("Alice", "pid-alice", cube_id="test", target_player_count=2, **settings)
    manager.join_game(pending.join_code, "Bob", player_id="pid-bob")
    return pending


def _ready_everyone(manager: GameManager, pending: PendingGame) -> None:
    for player_id in pending.player_ids:
        assert manager.set_player_ready(pending.game_id, player_id, is_ready=True) == (True, None)


def _socket(client: TestClient, game: dict[str, Any], *, player: str) -> AbstractContextManager[WebSocketTestSession]:
    return client.websocket_connect(f"/ws/{game['game_id']}?session_id={game[player]['session_id']}")


def _ready_both(
    ws_alice: WebSocketTestSession,
    ws_bob: WebSocketTestSession,
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
) -> None:
    for ws in (ws_alice, ws_bob):
        ws.send_json({"action": "set_ready", "payload": {"is_ready": True}})
    for ws in (ws_alice, ws_bob):
        ws_receive_json_until(
            ws,
            lambda m: m["type"] == "lobby_state" and all(p["is_ready"] for p in m["payload"]["players"]),
            description="both players ready",
        )


def test_guests_see_the_lobby_starting_before_the_game(
    client: TestClient,
    game_with_players: dict[str, Any],
    *,
    ws_receive_json: Callable[..., dict[str, Any]],
    ws_receive_json_until: Callable[..., dict[str, Any]],
) -> None:
    with (
        _socket(client, game_with_players, player="alice") as ws_alice,
        _socket(client, game_with_players, player="bob") as ws_bob,
    ):
        _ready_both(ws_alice, ws_bob, ws_receive_json_until=ws_receive_json_until)

        ws_alice.send_json({"action": "start_game", "payload": {}})
        seen: list[str] = []
        while not seen or seen[-1] != "game_state":
            message = ws_receive_json(ws_bob)
            seen.append(message["payload"]["start_status"] if message["type"] == "lobby_state" else message["type"])

    assert seen[-2:] == ["starting", "game_state"]


def test_a_refused_start_leaves_the_lobby_open_and_tells_the_host(
    client: TestClient, game_with_players: dict[str, Any], *, ws_receive_json_until: Callable[..., dict[str, Any]]
) -> None:
    game_id = game_with_players["game_id"]
    with client.websocket_connect(f"/ws/{game_id}?session_id={game_with_players['alice']['session_id']}") as ws:
        ws_receive_json_until(ws, lambda m: m["type"] == "lobby_state", description="Alice's lobby")

        ws.send_json({"action": "start_game", "payload": {}})
        error = ws_receive_json_until(ws, lambda m: m["type"] == "error", description="the refusal")

    assert error["payload"]["message"] == "Not all players are ready"
    lobby = client.get(f"/api/games/{game_id}/lobby").json()
    assert lobby["start_status"] == "open"
    assert lobby["is_started"] is False


def test_a_start_that_fails_reopens_the_lobby_for_everyone_and_can_be_tried_again(
    client: TestClient,
    game_with_players: dict[str, Any],
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    real_create_game = lobby_service_module.create_game
    monkeypatch.setattr(lobby_service_module, "create_game", lambda *_args, **_kwargs: 1 / 0)
    with (
        _socket(client, game_with_players, player="alice") as ws_alice,
        _socket(client, game_with_players, player="bob") as ws_bob,
    ):
        _ready_both(ws_alice, ws_bob, ws_receive_json_until=ws_receive_json_until)
        ws_alice.send_json({"action": "start_game", "payload": {}})
        failed = [
            ws_receive_json_until(
                ws,
                lambda m: m["type"] == "lobby_state" and m["payload"]["start_status"] == "failed",
                description="the failed start",
            )["payload"]
            for ws in (ws_alice, ws_bob)
        ]

        assert [lobby["start_error"] for lobby in failed] == ["Failed to start game"] * 2
        assert all(lobby["is_started"] is False for lobby in failed)

        monkeypatch.setattr(lobby_service_module, "create_game", real_create_game)
        ws_alice.send_json({"action": "start_game", "payload": {}})
        ws_receive_json_until(ws_bob, lambda m: m["type"] == "game_state", description="Bob's game state")


def test_the_lobby_cannot_change_while_it_starts(mock_cube_data: None, test_db: None) -> None:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    pending = _two_player_lobby(manager)
    _ready_everyone(manager, pending)

    async def scenario() -> tuple[dict[str, object], bool, Game]:
        cube_loaded = asyncio.Event()
        pending.loading_task = asyncio.create_task(cube_loaded.wait())
        start = asyncio.create_task(manager.start_lobby(pending.game_id, "pid-alice", db=None, on_change=_no_broadcast))
        while pending.stage is not LobbyStage.STARTING:  # noqa: ASYNC110 -- test polling loop
            await asyncio.sleep(0)

        refused = {
            "unready": manager.set_player_ready(pending.game_id, "pid-bob", is_ready=False),
            "player count": manager.set_target_player_count(pending.game_id, "pid-alice", target_player_count=4),
            "kick": manager.kick_player(pending.game_id, "pid-alice", target_player_id="pid-bob"),
            "join": manager.join_game(pending.join_code, "Carol", player_id="pid-carol"),
        }
        manager.schedule_pending_disconnect(pending.game_id, "pid-bob", delay=60)
        bob_still_ready = pending.player_ready["pid-bob"]
        manager.cancel_pending_disconnect(pending.game_id, "pid-bob")

        cube_loaded.set()
        return refused, bob_still_ready, await start

    refused, bob_still_ready, game = asyncio.run(scenario())

    assert refused == {
        "unready": (False, "The game is starting"),
        "player count": (False, "The game is starting"),
        "kick": False,
        "join": None,
    }
    assert bob_still_ready
    assert [player.name for player in game.players] == ["Alice", "Bob"]


def test_players_who_left_during_a_failed_start_are_not_ready_when_the_lobby_reopens(
    mock_cube_data: None, test_db: None, *, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    manager.attach_connected_player_ids(lambda _game_id: {"pid-alice"})
    pending = _two_player_lobby(manager)
    _ready_everyone(manager, pending)
    monkeypatch.setattr(lobby_service_module, "create_game", lambda *_args, **_kwargs: 1 / 0)

    with pytest.raises(LobbyStartFailedError):
        asyncio.run(manager.start_lobby(pending.game_id, "pid-alice", db=None, on_change=_no_broadcast))

    assert pending.stage is LobbyStage.FAILED
    assert manager.get_pending_game(pending.game_id) is pending
    assert pending.player_ready == {"pid-alice": True, "pid-bob": False}


@pytest.mark.parametrize("play_mode", ["limited", "constructed"])
def test_a_start_that_fails_after_dealing_leaves_the_cube_and_decks_whole(
    play_mode: str, mock_cube_data: None, *, test_db: None, card_factory: Callable[..., Card]
) -> None:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    pending = _two_player_lobby(manager, play_mode=play_mode)
    if play_mode == "limited":
        pending.battler = manager._load_battler(  # noqa: SLF001 -- internal state inspected by test
            pending.cube_id, use_upgrades=pending.use_upgrades, use_vanguards=pending.use_vanguards, play_mode=play_mode
        )
    else:
        for player_id in pending.player_ids:
            deck = Battler(cards=[card_factory(f"{player_id}-{i}") for i in range(100)], upgrades=[], vanguards=[])
            pending.player_battlers[player_id] = BattlerReady(f"{player_id}-deck", deck)
    _ready_everyone(manager, pending)

    def card_counts() -> list[int]:
        if pending.battler is not None:
            return [len(pending.battler.cards)]
        return [len(slot.battler.cards) for slot in pending.player_battlers.values() if isinstance(slot, BattlerReady)]

    before = card_counts()

    def fail_to_save(*args: object, **kwargs: object) -> None:
        _ = (args, kwargs)
        msg = "database is locked"
        raise RuntimeError(msg)

    manager._persist_human_player_mappings = fail_to_save  # noqa: SLF001 -- internal state inspected by test
    db = db_module.SessionLocal()
    try:
        with pytest.raises(LobbyStartFailedError):
            asyncio.run(manager.start_lobby(pending.game_id, "pid-alice", db=db, on_change=_no_broadcast))
    finally:
        db.close()

    assert card_counts() == before


def test_a_cube_id_cubecobra_answers_with_a_web_page_fails_the_start_in_players_words(
    test_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = test_db

    def answered_with_a_web_page(cube_id: str) -> Never:
        _ = cube_id
        msg = "Expecting value"
        raise json.JSONDecodeError(msg, "<!doctype html>", 0)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", answered_with_a_web_page)
    manager = GameManager()
    pending = _two_player_lobby(manager)
    _ready_everyone(manager, pending)

    with pytest.raises(LobbyStartFailedError) as failed:
        asyncio.run(manager.start_lobby(pending.game_id, "pid-alice", db=None, on_change=_no_broadcast))

    assert str(failed.value) == (
        "Couldn't load cube 'test'. Check that the CubeCobra ID is correct and the cube is public."
    )


def test_a_lobby_closed_while_it_waits_to_start_does_not_become_a_game(mock_cube_data: None, test_db: None) -> None:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    pending = _two_player_lobby(manager)
    _ready_everyone(manager, pending)

    async def scenario() -> None:
        for _ in range(MAX_GAME_STARTS_IN_FLIGHT):
            await manager._game_start_slots.acquire()  # noqa: SLF001 -- internal state inspected by test
        start = asyncio.create_task(manager.start_lobby(pending.game_id, "pid-alice", db=None, on_change=_no_broadcast))
        while manager.game_start_waiters_count() == 0:  # noqa: ASYNC110 -- test polling loop
            await asyncio.sleep(0)
        manager.cleanup_game(pending.game_id)
        manager._game_start_slots.release()  # noqa: SLF001 -- internal state inspected by test
        with pytest.raises(LobbyStartFailedError):
            await start

    asyncio.run(scenario())

    assert manager.get_game(pending.game_id) is None


def test_the_lobby_view_and_the_start_route_refuse_a_table_short_of_puppets(client: TestClient) -> None:
    created = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2, "puppet_count": 1},
    ).json()
    ws_module.game_manager.set_player_ready(created["game_id"], created["player_id"], is_ready=True)

    lobby = client.get(f"/api/games/{created['game_id']}/lobby").json()
    response = client.post(f"/api/games/{created['game_id']}/start", params={"session_id": created["session_id"]})

    assert lobby["can_start"] is False
    assert response.status_code == 400
    assert response.json()["detail"] == "Not enough puppets are available for this table"


def test_a_deck_submitted_twice_shows_as_loading_until_it_loads(
    test_db: None, card_factory: Callable[..., Card]
) -> None:
    _ = test_db
    manager = GameManager()
    pending = manager.create_game("Alice", "pid-alice", play_mode="constructed")
    release = threading.Event()

    def load_deck(battler_id: str, *, use_upgrades: bool, use_vanguards: bool) -> Battler:
        _ = (battler_id, use_upgrades, use_vanguards)
        release.wait(timeout=5)
        return Battler(cards=[card_factory(f"c{i}") for i in range(100)], upgrades=[], vanguards=[])

    manager._load_constructed_battler = load_deck  # noqa: SLF001 -- internal state inspected by test

    def deck_status() -> str | None:
        lobby = manager.get_lobby_state(pending.game_id)
        assert lobby is not None
        return lobby.players[0].battler_status

    async def scenario() -> tuple[str | None, str | None]:
        try:
            assert manager.start_player_battler_preload(pending, "pid-alice", battler_id="deck-1") is None
            await asyncio.sleep(0.01)
            assert manager.start_player_battler_preload(pending, "pid-alice", battler_id="deck-1") is None
            await asyncio.sleep(0.05)
            while_loading = deck_status()
        finally:
            release.set()
        while deck_status() == "loading":  # noqa: ASYNC110 -- test polling loop
            await asyncio.sleep(0.01)
        return while_loading, deck_status()

    assert asyncio.run(scenario()) == ("loading", "ready")


def test_a_cube_too_small_to_give_everyone_a_pack_refuses_to_start(
    test_db: None, card_factory: Callable[..., Card], *, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Every cube needs 100 cards to load, so only a full table of eight can find one too small.
    _ = test_db
    cube_size = 103
    monkeypatch.setattr(
        "mtb.utils.cubecobra.get_cube_data", lambda _cube_id: [card_factory(f"c{i}") for i in range(cube_size)]
    )
    manager = GameManager()
    pending = manager.create_game("Host", "pid-0", cube_id="small", target_player_count=8, use_upgrades=False)
    for seat in range(1, 8):
        manager.join_game(pending.join_code, f"Guest {seat}", player_id=f"pid-{seat}")
    manager.attach_connected_player_ids(lambda _game_id: set(pending.player_ids))
    _ready_everyone(manager, pending)

    def start() -> Game:
        return asyncio.run(manager.start_lobby(pending.game_id, "pid-0", db=None, on_change=_no_broadcast))

    with pytest.raises(LobbyStartFailedError) as failed:
        start()
    assert str(failed.value) == "This cube has 103 playable cards and needs at least 104 to give everyone a pack."
    assert pending.start_error == str(failed.value)

    cube_size = 104
    pending.battler = None
    assert len(start().players) == 8

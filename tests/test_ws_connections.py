"""How player sockets come and go: replaced sockets, late closes and failing actions."""

import asyncio
import threading
import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from starlette.websockets import WebSocket, WebSocketDisconnect

import server.routers.ws as ws_module
from server.services.connection_manager import SEAT_MOVED_CLOSE_CODE


def _player_url(game_id: str, credentials: dict) -> str:
    return f"/ws/{game_id}?session_id={credentials['session_id']}"


def _is_connected(client: TestClient, game_id: str, *, name: str) -> bool:
    players = client.get(f"/api/games/{game_id}/status").json()["players"]
    return next(p["is_connected"] for p in players if p["name"] == name)


def _unloads_once_idle(monkeypatch: pytest.MonkeyPatch, game_id: str) -> bool:
    monkeypatch.setattr("server.services.game.snapshot_store.IDLE_EVICT_MINUTES", 0)
    ws_module.game_manager.evict_cold_games()
    return ws_module.game_manager.get_game(game_id) is None


def _lobby_player(client: TestClient, game_id: str, *, name: str) -> dict:
    players = client.get(f"/api/games/{game_id}/lobby").json()["players"]
    return next(p for p in players if p["name"] == name)


def test_a_failing_action_answers_with_an_error_and_keeps_the_socket(
    start_lobby: Callable[[str, str], Response],
    client: TestClient,
    *,
    game_with_players: dict[str, Any],
    ws_receive_json: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200

    with client.websocket_connect(_player_url(game_id, game_with_players["alice"])) as ws:
        assert ws_receive_json(ws)["type"] == "game_bootstrap"
        ws.send_json({"action": "build_swap", "payload": {}})
        assert ws_receive_json(ws)["type"] == "error"
        ws.send_json({"action": "build_swap", "payload": {}})
        assert ws_receive_json(ws)["type"] == "error"

    assert not _is_connected(client, game_id, name="Alice")
    assert _unloads_once_idle(monkeypatch, game_id)


def test_a_second_socket_for_the_same_session_replaces_the_first(
    start_lobby: Callable[[str, str], Response],
    client: TestClient,
    *,
    game_with_players: dict[str, Any],
    ws_receive_json: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    url = _player_url(game_id, game_with_players["alice"])

    with client.websocket_connect(url) as first:
        ws_receive_json(first)
        with client.websocket_connect(url) as second:
            assert ws_receive_json(second)["type"] == "game_bootstrap"
            assert ws_receive_json(first)["type"] == "seat_moved"
            with pytest.raises(WebSocketDisconnect) as closed:
                ws_receive_json(first)
            assert closed.value.code == 4006
            assert _is_connected(client, game_id, name="Alice")

    assert not _is_connected(client, game_id, name="Alice")
    assert _unloads_once_idle(monkeypatch, game_id)


def test_a_replaced_socket_that_is_slow_to_close_does_not_delay_the_new_one(
    start_lobby: Callable[[str, str], Response],
    client: TestClient,
    *,
    game_with_players: dict[str, Any],
    ws_receive_json: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    url = _player_url(game_id, game_with_players["alice"])

    old_socket_may_close = threading.Event()
    close = WebSocket.close

    async def close_once_allowed(websocket: WebSocket, code: int = 1000, *, reason: str | None = None) -> None:
        if code == SEAT_MOVED_CLOSE_CODE:
            await asyncio.to_thread(old_socket_may_close.wait)
        await close(websocket, code, reason)

    monkeypatch.setattr(WebSocket, "close", close_once_allowed)

    with client.websocket_connect(url) as first:
        ws_receive_json(first)
        with client.websocket_connect(url) as second:
            try:
                assert ws_receive_json(second)["type"] == "game_bootstrap"
            finally:
                old_socket_may_close.set()


def test_a_slow_socket_holds_up_no_one_else_and_still_gets_its_messages_in_order(
    client: TestClient,
    game_with_players: dict[str, Any],
    *,
    ws_receive_json: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game_id = game_with_players["game_id"]
    bob_session = game_with_players["bob"]["session_id"]
    bob_may_receive = threading.Event()
    send_json = WebSocket.send_json

    async def send_to_bob_once_allowed(websocket: WebSocket, message: object, *, mode: str = "text") -> None:
        if websocket.query_params.get("session_id") == bob_session:
            await asyncio.to_thread(bob_may_receive.wait)
        await send_json(websocket, message, mode)

    def alice_is_ready(message: dict) -> bool:
        return next(p["is_ready"] for p in message["payload"]["players"] if p["name"] == "Alice")

    with client.websocket_connect(_player_url(game_id, game_with_players["bob"])) as bob:
        ws_receive_json(bob)
        with client.websocket_connect(_player_url(game_id, game_with_players["alice"])) as alice:
            ws_receive_json(alice)
            ws_receive_json(bob)
            monkeypatch.setattr(WebSocket, "send_json", send_to_bob_once_allowed)
            try:
                for is_ready in (True, False):
                    alice.send_json({"action": "set_ready", "payload": {"is_ready": is_ready}})
                    assert alice_is_ready(ws_receive_json(alice)) is is_ready
            finally:
                bob_may_receive.set()

            assert [alice_is_ready(ws_receive_json(bob)) for _ in range(2)] == [True, False]


def test_a_late_close_from_a_replaced_socket_keeps_the_lobby_player_ready(
    client: TestClient, game_with_players: dict[str, Any], *, ws_receive_json: Callable[..., dict[str, Any]]
) -> None:
    game_id = game_with_players["game_id"]
    url = _player_url(game_id, game_with_players["alice"])

    first = client.websocket_connect(url).__enter__()
    ws_receive_json(first)
    first.send_json({"action": "set_ready", "payload": {"is_ready": True}})
    ws_receive_json(first)
    with client.websocket_connect(url) as second:
        ws_receive_json(second)
        first.__exit__(None, None, None)
        time.sleep(0.2)

        alice = _lobby_player(client, game_id, name="Alice")
        assert alice["is_ready"] is True


def test_a_session_from_another_game_cannot_play_a_same_named_seat(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, ws_receive_json: Callable[..., dict[str, Any]]
) -> None:
    def started_game() -> dict:
        host = client.post(
            "/api/games", json={"player_name": "Tester", "cube_id": "test", "target_player_count": 2}
        ).json()
        client.post("/api/games/join", json={"join_code": host["join_code"], "player_name": "Friend"})
        assert start_lobby(host["game_id"], host["session_id"]).status_code == 200
        return host

    game_a, game_b = started_game(), started_game()

    bootstrap = client.get(f"/api/games/{game_a['game_id']}", params={"session_id": game_b["session_id"]})
    assert bootstrap.status_code == 404
    with client.websocket_connect(_player_url(game_a["game_id"], game_b)) as ws:
        assert ws_receive_json(ws)["payload"]["code"] == "INVALID_SESSION"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws_receive_json(ws)
    assert closed.value.code == 4001

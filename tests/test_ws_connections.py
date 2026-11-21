"""How player sockets come and go: replaced sockets, late closes and failing actions."""

import time

import pytest
from starlette.websockets import WebSocketDisconnect

import server.routers.ws as ws_module


def _player_url(game_id: str, credentials: dict) -> str:
    return f"/ws/{game_id}?session_id={credentials['session_id']}"


def _is_connected(client, game_id: str, name: str) -> bool:
    players = client.get(f"/api/games/{game_id}/status").json()["players"]
    return next(p["is_connected"] for p in players if p["name"] == name)


def _unloads_once_idle(monkeypatch, game_id: str) -> bool:
    monkeypatch.setattr("server.services.game_manager.IDLE_EVICT_MINUTES", 0)
    ws_module.game_manager.evict_cold_games()
    return ws_module.game_manager.get_game(game_id) is None


def _lobby_player(client, game_id: str, name: str) -> dict:
    players = client.get(f"/api/games/{game_id}/lobby").json()["players"]
    return next(p for p in players if p["name"] == name)


def test_a_failing_action_answers_with_an_error_and_keeps_the_socket(
    client, game_with_players, ws_receive_json, monkeypatch
):
    game_id = game_with_players["game_id"]
    client.post(f"/api/games/{game_id}/start")

    with client.websocket_connect(_player_url(game_id, game_with_players["alice"])) as ws:
        assert ws_receive_json(ws)["type"] == "game_bootstrap"
        ws.send_json({"action": "build_swap", "payload": {}})
        assert ws_receive_json(ws)["type"] == "error"
        ws.send_json({"action": "build_swap", "payload": {}})
        assert ws_receive_json(ws)["type"] == "error"

    assert not _is_connected(client, game_id, "Alice")
    assert _unloads_once_idle(monkeypatch, game_id)


def test_a_second_socket_for_the_same_session_replaces_the_first(
    client, game_with_players, ws_receive_json, monkeypatch
):
    game_id = game_with_players["game_id"]
    client.post(f"/api/games/{game_id}/start")
    url = _player_url(game_id, game_with_players["alice"])

    with client.websocket_connect(url) as first:
        ws_receive_json(first)
        with client.websocket_connect(url) as second:
            assert ws_receive_json(second)["type"] == "game_bootstrap"
            assert ws_receive_json(first)["type"] == "seat_moved"
            with pytest.raises(WebSocketDisconnect) as closed:
                ws_receive_json(first)
            assert closed.value.code == 4006
            assert _is_connected(client, game_id, "Alice")

    assert not _is_connected(client, game_id, "Alice")
    assert _unloads_once_idle(monkeypatch, game_id)


def test_a_late_close_from_a_replaced_socket_keeps_the_lobby_player_ready(client, game_with_players, ws_receive_json):
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

        alice = _lobby_player(client, game_id, "Alice")
        assert alice["is_ready"] is True

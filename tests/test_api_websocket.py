"""WebSocket connection tests - focus on message shapes, not game logic."""

import pytest
from starlette.websockets import WebSocketDisconnect


class TestWebSocketConnection:
    def test_invalid_session_closes_connection(self, client, game_with_players):
        game_id = game_with_players["game_id"]

        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/ws/{game_id}?session_id=invalid"),
        ):
            pass

        assert exc_info.value.code == 4001

    def test_nonexistent_game_closes_connection(self, client, game_with_players):
        session_id = game_with_players["alice"]["session_id"]

        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/ws/nonexistent?session_id={session_id}"),
        ):
            pass

        assert exc_info.value.code == 4004


class TestLobbyWebSocket:
    def test_connect_to_lobby_receives_lobby_state(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws.receive_json()

            assert msg["type"] == "lobby_state"
            assert "payload" in msg
            assert "players" in msg["payload"]


class TestGameWebSocket:
    def test_connect_to_started_game_receives_game_state(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws.receive_json()

            assert msg["type"] == "game_state"
            assert "payload" in msg
            assert "phase" in msg["payload"]
            assert "self_player" in msg["payload"]

    def test_unknown_action_receives_error(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            ws.receive_json()
            ws.send_json({"action": "unknown_action", "payload": {}})
            msg = ws.receive_json()

            assert msg["type"] == "error"
            assert "payload" in msg

    def test_start_game_broadcasts_game_state(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        alice_session = game_with_players["alice"]["session_id"]
        bob_session = game_with_players["bob"]["session_id"]

        with client.websocket_connect(f"/ws/{game_id}?session_id={alice_session}") as ws_alice:
            ws_alice.receive_json()

            with client.websocket_connect(f"/ws/{game_id}?session_id={bob_session}") as ws_bob:
                ws_alice.receive_json()
                ws_bob.receive_json()

                ws_alice.send_json({"action": "start_game", "payload": {}})

                msg_alice = ws_alice.receive_json()
                msg_bob = ws_bob.receive_json()

                assert msg_alice["type"] == "game_state"
                assert msg_bob["type"] == "game_state"

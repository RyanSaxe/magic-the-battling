"""WebSocket connection tests - focus on message shapes, not game logic."""

import asyncio
from typing import cast
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

import server.routers.ws as ws_module
from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID


class TestWebSocketConnection:
    def test_invalid_session_closes_connection(self, client, game_with_players):
        game_id = game_with_players["game_id"]

        with (
            client.websocket_connect(f"/ws/{game_id}?session_id=invalid") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws.receive_json()

        assert exc_info.value.code == 4001

    def test_nonexistent_game_closes_connection(self, client, game_with_players):
        session_id = game_with_players["alice"]["session_id"]

        with (
            client.websocket_connect(f"/ws/nonexistent?session_id={session_id}") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws.receive_json()

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

    def test_constructed_submit_battler_updates_lobby_state(self, client, monkeypatch, card_factory):
        def fake_get_cube_data(cube_id: str):
            if cube_id in {DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID}:
                return []
            return [card_factory(f"{cube_id}_{i}") for i in range(100)]

        monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

        create = client.post(
            "/api/games",
            json={"player_name": "Alice", "cube_id": "ignored", "play_mode": "constructed"},
        )
        game_id = create.json()["game_id"]
        session_id = create.json()["session_id"]

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            initial = ws.receive_json()
            assert initial["type"] == "lobby_state"

            ws.send_json({"action": "submit_battler", "payload": {"battler_id": "deck_alpha"}})
            statuses: list[str] = []
            for _ in range(3):
                message = ws.receive_json()
                if message["type"] != "lobby_state":
                    continue
                statuses.append(message["payload"]["players"][0]["battler_status"])
                if statuses[-1] == "ready":
                    break

            assert "loading" in statuses
            assert statuses[-1] == "ready"


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

                ws_alice.send_json({"action": "set_ready", "payload": {"is_ready": True}})
                ws_alice.receive_json()
                ws_bob.receive_json()

                ws_bob.send_json({"action": "set_ready", "payload": {"is_ready": True}})
                ws_alice.receive_json()
                ws_bob.receive_json()

                ws_alice.send_json({"action": "start_game", "payload": {}})

                msg_alice = ws_alice.receive_json()
                msg_bob = ws_bob.receive_json()

                assert msg_alice["type"] == "game_state"
                assert msg_bob["type"] == "game_state"

    def test_reconnect_after_snapshot_restore_uses_persisted_mapping(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        game_manager = ws_module.game_manager
        game_manager.mark_game_dirty(game_id)
        game_manager.persist_dirty_games()
        game_manager._cleanup_game(game_id, preserve_snapshot=True)

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"

    def test_missing_runtime_mapping_rejects_invalid_session(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        game_manager = ws_module.game_manager
        game_manager._clear_runtime_player_mappings_for_game(game_id)

        with (
            client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws.receive_json()

        assert exc_info.value.code == 4001

    def test_duplicate_build_ready_after_battle_transition_resyncs_instead_of_error(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        alice_player_id = game_with_players["alice"]["player_id"]
        client.post(f"/api/games/{game_id}/start")

        game = ws_module.game_manager.get_game(game_id)
        assert game is not None
        alice = ws_module.game_manager.get_player(game, alice_player_id)
        assert alice is not None

        alice.phase = "battle"

        broadcast_game_state = AsyncMock()
        send_error = AsyncMock()
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(ws_module.connection_manager, "broadcast_game_state", broadcast_game_state)
        monkeypatch.setattr(ws_module.connection_manager, "send_error", send_error)
        try:
            asyncio.run(
                ws_module.handle_message(
                    game_id,
                    alice_player_id,
                    {
                        "action": "build_ready",
                        "payload": {
                            "basics": ["Plains", "Island", "Mountain"],
                            "play_draw_preference": "play",
                        },
                    },
                    cast(WebSocket, AsyncMock(spec=WebSocket)),
                )
            )
        finally:
            monkeypatch.undo()

        broadcast_game_state.assert_awaited_once_with(game_id)
        send_error.assert_not_called()

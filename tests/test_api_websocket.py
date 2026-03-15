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
    def test_invalid_session_closes_connection(self, client, game_with_players, ws_receive_json):
        game_id = game_with_players["game_id"]

        with (
            client.websocket_connect(f"/ws/{game_id}?session_id=invalid") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws_receive_json(ws)

        assert exc_info.value.code == 4001

    def test_nonexistent_game_closes_connection(self, client, game_with_players, ws_receive_json):
        session_id = game_with_players["alice"]["session_id"]

        with (
            client.websocket_connect(f"/ws/nonexistent?session_id={session_id}") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws_receive_json(ws)

        assert exc_info.value.code == 4004


class TestLobbyWebSocket:
    def test_connect_to_lobby_receives_lobby_state(self, client, game_with_players, ws_receive_json):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws_receive_json(ws)

            assert msg["type"] == "lobby_state"
            assert "payload" in msg
            assert "players" in msg["payload"]

    def test_constructed_submit_battler_updates_lobby_state(
        self, client, monkeypatch, card_factory, ws_receive_json, ws_receive_json_until
    ):
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
            initial = ws_receive_json(ws)
            assert initial["type"] == "lobby_state"

            ws.send_json({"action": "submit_battler", "payload": {"battler_id": "deck_alpha"}})
            statuses: list[str] = []

            def _battler_ready(message: dict) -> bool:
                if message["type"] != "lobby_state":
                    return False
                statuses.append(message["payload"]["players"][0]["battler_status"])
                return statuses[-1] == "ready"

            ws_receive_json_until(
                ws,
                _battler_ready,
                description="constructed battler to become ready",
            )

            assert "loading" in statuses
            assert statuses[-1] == "ready"

    def test_constructed_clear_battler_updates_lobby_state(
        self, client, monkeypatch, card_factory, ws_receive_json, ws_receive_json_until
    ):
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
            initial = ws_receive_json(ws)
            assert initial["type"] == "lobby_state"

            ws.send_json({"action": "submit_battler", "payload": {"battler_id": "deck_alpha"}})
            latest_lobby_payload = ws_receive_json_until(
                ws,
                lambda message: (
                    message["type"] == "lobby_state" and message["payload"]["players"][0]["battler_status"] == "ready"
                ),
                description="constructed battler ready lobby state",
            )["payload"]

            assert latest_lobby_payload["players"][0]["battler_status"] == "ready"

            ws.send_json({"action": "set_ready", "payload": {"is_ready": True}})
            ready_message = ws_receive_json_until(
                ws,
                lambda message: (
                    message["type"] == "lobby_state" and message["payload"]["players"][0]["is_ready"] is True
                ),
                description="ready lobby state",
            )
            assert ready_message["type"] == "lobby_state"
            assert ready_message["payload"]["players"][0]["is_ready"] is True

            ws.send_json({"action": "clear_battler", "payload": {}})
            cleared_message = ws_receive_json_until(
                ws,
                lambda message: (
                    message["type"] == "lobby_state"
                    and message["payload"]["players"][0]["battler_id"] is None
                    and message["payload"]["players"][0]["battler_status"] == "missing"
                    and message["payload"]["players"][0]["is_ready"] is False
                ),
                description="cleared battler lobby state",
            )
            assert cleared_message["type"] == "lobby_state"
            assert cleared_message["payload"]["players"][0]["battler_id"] is None
            assert cleared_message["payload"]["players"][0]["battler_status"] == "missing"
            assert cleared_message["payload"]["players"][0]["is_ready"] is False


class TestGameWebSocket:
    def test_connect_to_started_game_receives_game_state(self, client, game_with_players, ws_receive_json):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws_receive_json(ws)

            assert msg["type"] == "game_bootstrap"
            assert "payload" in msg
            assert "catalog" in msg["payload"]
            assert "phase" in msg["payload"]["state"]
            assert "self_player" in msg["payload"]["state"]

    def test_unknown_action_receives_error(self, client, game_with_players, ws_receive_json, ws_receive_json_until):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            ws_receive_json(ws)
            ws.send_json({"action": "unknown_action", "payload": {}})
            msg = ws_receive_json_until(
                ws,
                lambda message: message["type"] == "error",
                description="error response for unknown action",
            )

            assert msg["type"] == "error"
            assert "payload" in msg

    def test_start_game_broadcasts_game_state(self, client, game_with_players, ws_receive_json, ws_receive_json_until):
        game_id = game_with_players["game_id"]
        alice_session = game_with_players["alice"]["session_id"]
        bob_session = game_with_players["bob"]["session_id"]

        with client.websocket_connect(f"/ws/{game_id}?session_id={alice_session}") as ws_alice:
            ws_receive_json(ws_alice)

            with client.websocket_connect(f"/ws/{game_id}?session_id={bob_session}") as ws_bob:
                ws_receive_json_until(
                    ws_alice,
                    lambda message: message["type"] == "lobby_state",
                    description="Alice lobby update after Bob joins",
                )
                ws_receive_json_until(
                    ws_bob,
                    lambda message: message["type"] == "lobby_state",
                    description="Bob lobby update after joining",
                )

                ws_alice.send_json({"action": "set_ready", "payload": {"is_ready": True}})
                ws_receive_json_until(
                    ws_alice,
                    lambda message: (
                        message["type"] == "lobby_state" and message["payload"]["players"][0]["is_ready"] is True
                    ),
                    description="Alice ready lobby state",
                )
                ws_receive_json_until(
                    ws_bob,
                    lambda message: (
                        message["type"] == "lobby_state" and message["payload"]["players"][0]["is_ready"] is True
                    ),
                    description="Bob sees Alice ready",
                )

                ws_bob.send_json({"action": "set_ready", "payload": {"is_ready": True}})
                ws_receive_json_until(
                    ws_alice,
                    lambda message: (
                        message["type"] == "lobby_state" and message["payload"]["players"][1]["is_ready"] is True
                    ),
                    description="Alice sees Bob ready",
                )
                ws_receive_json_until(
                    ws_bob,
                    lambda message: (
                        message["type"] == "lobby_state" and message["payload"]["players"][1]["is_ready"] is True
                    ),
                    description="Bob ready lobby state",
                )

                ws_alice.send_json({"action": "start_game", "payload": {}})

                msg_alice = ws_receive_json_until(
                    ws_alice,
                    lambda message: message["type"] == "game_state",
                    description="Alice game_state after game start",
                )
                msg_bob = ws_receive_json_until(
                    ws_bob,
                    lambda message: message["type"] == "game_state",
                    description="Bob game_state after game start",
                )

                assert msg_alice["type"] == "game_state"
                assert msg_bob["type"] == "game_state"

    def test_reconnect_after_snapshot_restore_uses_persisted_mapping(self, client, game_with_players, ws_receive_json):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        game_manager = ws_module.game_manager
        game_manager.mark_game_dirty(game_id)
        game_manager.persist_dirty_games()
        game_manager._cleanup_game(game_id, preserve_snapshot=True)

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            msg = ws_receive_json(ws)
            assert msg["type"] == "game_bootstrap"

    def test_missing_runtime_mapping_rejects_invalid_session(self, client, game_with_players, ws_receive_json):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        game_manager = ws_module.game_manager
        game_manager._clear_runtime_player_mappings_for_game(game_id)

        with (
            client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws,
            pytest.raises(WebSocketDisconnect) as exc_info,
        ):
            ws_receive_json(ws)

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

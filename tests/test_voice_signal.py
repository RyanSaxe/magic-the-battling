"""Tests for voice signal relay — target-based routing and validation."""

import pytest

import server.routers.ws as ws_module
from server.routers.ws import _handle_voice_signal


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def two_players(monkeypatch):
    game_id = "test-game"
    gm = ws_module.game_manager
    gm._player_id_to_name["alice-id"] = "Alice"
    gm._player_id_to_name["bob-id"] = "Bob"
    gm._player_to_game["alice-id"] = game_id
    gm._player_to_game["bob-id"] = game_id
    sent: list[tuple[str, str, dict]] = []

    async def record_send(target_game_id: str, player_id: str, message: dict) -> None:
        sent.append((target_game_id, player_id, message))

    monkeypatch.setattr(ws_module.connection_manager, "send_to_player", record_send)
    return game_id, sent


class TestHandleVoiceSignal:
    @pytest.mark.anyio
    async def test_relays_signal_to_target(self, two_players):
        game_id, sent = two_players
        await _handle_voice_signal(
            game_id,
            "alice-id",
            payload={
                "signal_type": "offer",
                "data": {"sdp": "..."},
                "target_player": "Bob",
            },
        )

        assert sent == [
            (
                game_id,
                "bob-id",
                {
                    "type": "voice_signal",
                    "payload": {
                        "signal_type": "offer",
                        "data": {"sdp": "..."},
                        "from_player": "Alice",
                    },
                },
            )
        ]

    @pytest.mark.anyio
    async def test_drops_signal_without_target(self, two_players):
        game_id, sent = two_players
        await _handle_voice_signal(
            game_id,
            "alice-id",
            payload={
                "signal_type": "offer",
                "data": {"sdp": "..."},
            },
        )

        assert sent == []

    @pytest.mark.anyio
    async def test_drops_signal_for_unknown_target(self, two_players):
        game_id, sent = two_players
        await _handle_voice_signal(
            game_id,
            "alice-id",
            payload={
                "signal_type": "offer",
                "data": {"sdp": "..."},
                "target_player": "Charlie",
            },
        )

        assert sent == []

    @pytest.mark.anyio
    async def test_drops_signal_for_target_in_different_game(self, two_players):
        game_id, sent = two_players
        gm = ws_module.game_manager
        gm._player_id_to_name["charlie-id"] = "Charlie"
        gm._player_to_game["charlie-id"] = "other-game"

        await _handle_voice_signal(
            game_id,
            "alice-id",
            payload={
                "signal_type": "offer",
                "data": {"sdp": "..."},
                "target_player": "Charlie",
            },
        )

        assert sent == []

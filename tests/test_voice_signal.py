"""Tests for voice signal relay — target-based routing and validation."""

from unittest.mock import AsyncMock, patch

import pytest

from server.routers.ws import _handle_voice_signal
from server.services.game_manager import GameManager


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def gm():
    return GameManager()


@pytest.fixture
def two_players(gm):
    game_id = "test-game"
    gm._player_id_to_name["alice-id"] = "Alice"
    gm._player_id_to_name["bob-id"] = "Bob"
    gm._player_to_game["alice-id"] = game_id
    gm._player_to_game["bob-id"] = game_id
    return game_id


class TestHandleVoiceSignal:
    @pytest.mark.anyio
    async def test_relays_signal_to_target(self, gm, two_players):
        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                two_players,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                    "target_player": "Bob",
                },
            )

        mock_cm.send_to_player.assert_awaited_once_with(
            two_players,
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

    @pytest.mark.anyio
    async def test_drops_signal_without_target(self, gm, two_players):
        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                two_players,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                },
            )

        mock_cm.send_to_player.assert_not_awaited()

    @pytest.mark.anyio
    async def test_drops_signal_for_unknown_target(self, gm, two_players):
        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                two_players,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                    "target_player": "Charlie",
                },
            )

        mock_cm.send_to_player.assert_not_awaited()

    @pytest.mark.anyio
    async def test_drops_signal_for_target_in_different_game(self, gm, two_players):
        gm._player_id_to_name["charlie-id"] = "Charlie"
        gm._player_to_game["charlie-id"] = "other-game"

        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                two_players,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                    "target_player": "Charlie",
                },
            )

        mock_cm.send_to_player.assert_not_awaited()

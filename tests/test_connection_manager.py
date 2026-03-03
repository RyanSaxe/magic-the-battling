from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from server.routers.ws import ConnectionManager
from server.runtime_config import MAX_WS_CONNECTIONS


@pytest.fixture
def anyio_backend():
    return "asyncio"


class TestDisconnectRaceCondition:
    """Regression: stale WS1 disconnect must not evict newer WS2."""

    def test_stale_disconnect_does_not_remove_newer_connection(self):
        cm = ConnectionManager()
        old_ws = MagicMock(name="old_ws")
        new_ws = MagicMock(name="new_ws")

        cm._connections["game1"]["player1"] = new_ws

        cm.disconnect("game1", "player1", old_ws)

        assert cm._connections["game1"]["player1"] is new_ws

    def test_matching_disconnect_removes_connection(self):
        cm = ConnectionManager()
        ws = MagicMock(name="ws")

        cm._connections["game1"]["player1"] = ws

        cm.disconnect("game1", "player1", ws)

        assert "player1" not in cm._connections.get("game1", {})

    def test_disconnect_cleans_up_empty_game(self):
        cm = ConnectionManager()
        ws = MagicMock(name="ws")

        cm._connections["game1"]["player1"] = ws

        cm.disconnect("game1", "player1", ws)

        assert "game1" not in cm._connections


class TestConnectionCapacity:
    @pytest.mark.anyio
    async def test_connect_capacity_reject_clears_pending_connection(self):
        cm = ConnectionManager()
        ws = MagicMock(name="ws")
        ws.accept = AsyncMock()
        ws.close = AsyncMock()

        cm.reserve_connection("game1", "player1")
        with patch.object(cm, "total_connections", return_value=MAX_WS_CONNECTIONS):
            connected = await cm.connect("game1", "player1", ws)

        assert connected is False
        assert "player1" not in cm._pending_connections["game1"]

    def test_clear_stale_pending_connection_only_removes_pending(self):
        cm = ConnectionManager()
        cm.reserve_connection("game1", "player1")

        assert cm.clear_stale_pending_connection("game1", "player1") is True
        assert "player1" not in cm._pending_connections["game1"]

        connected_ws = MagicMock(name="ws")
        cm._connections["game1"]["player2"] = connected_ws
        cm.reserve_connection("game1", "player2")
        assert cm.clear_stale_pending_connection("game1", "player2") is False

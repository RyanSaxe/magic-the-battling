from unittest.mock import MagicMock

from server.routers.ws import ConnectionManager


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

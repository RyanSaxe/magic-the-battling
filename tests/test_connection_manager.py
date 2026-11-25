import asyncio
import gzip
import json
import time
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import WebSocket

from server import compression
from server.runtime_config import MAX_WS_CONNECTIONS
from server.services.connection_manager import ConnectionManager
from server.services.game_manager import GameManager


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []
        self.closed: int | None = None
        self.accepted = False
        self.accept_gate = asyncio.Event()
        self.accept_gate.set()

    async def accept(self) -> None:
        await self.accept_gate.wait()
        self.accepted = True

    async def send_bytes(self, data: bytes) -> None:
        self.sent.append(json.loads(gzip.decompress(data)))

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.closed = code


class TestDisconnectRaceCondition:
    """Regression: stale WS1 disconnect must not evict newer WS2."""

    def test_stale_disconnect_does_not_remove_newer_connection(self):
        cm = ConnectionManager(GameManager())
        old_ws = cast(WebSocket, _FakeWebSocket())
        new_ws = cast(WebSocket, _FakeWebSocket())

        cm._connections["game1"]["player1"] = new_ws

        cm.disconnect("game1", "player1", old_ws)

        assert cm._connections["game1"]["player1"] is new_ws

    def test_matching_disconnect_removes_connection(self):
        cm = ConnectionManager(GameManager())
        ws = cast(WebSocket, _FakeWebSocket())

        cm._connections["game1"]["player1"] = ws

        cm.disconnect("game1", "player1", ws)

        assert "player1" not in cm._connections.get("game1", {})

    def test_disconnect_cleans_up_empty_game(self):
        cm = ConnectionManager(GameManager())
        ws = cast(WebSocket, _FakeWebSocket())

        cm._connections["game1"]["player1"] = ws

        cm.disconnect("game1", "player1", ws)

        assert "game1" not in cm._connections


class TestConnectionCapacity:
    @pytest.mark.anyio
    async def test_connect_capacity_reject_clears_pending_connection(self, monkeypatch):
        cm = ConnectionManager(GameManager())
        ws = _FakeWebSocket()

        cm.reserve_connection("game1", "player1")
        monkeypatch.setattr(cm, "total_connections", lambda: MAX_WS_CONNECTIONS)
        connected = await cm.connect("game1", "player1", cast(WebSocket, ws))

        assert connected is False
        assert "player1" not in cm._pending_connections["game1"]

    def test_clear_stale_pending_connection_only_removes_pending(self):
        cm = ConnectionManager(GameManager())
        cm.reserve_connection("game1", "player1")

        assert cm.clear_stale_pending_connection("game1", "player1") is True
        assert "player1" not in cm._pending_connections["game1"]

        connected_ws = cast(WebSocket, _FakeWebSocket())
        cm._connections["game1"]["player2"] = connected_ws
        cm.reserve_connection("game1", "player2")
        assert cm.clear_stale_pending_connection("game1", "player2") is False


class TestSpectateMessages:
    @pytest.mark.anyio
    async def test_request_lists_reach_the_player_in_the_order_the_queue_changed(self, monkeypatch):
        queue = [SimpleNamespace(request_id="r1", spectator_name="Carol")]
        manager = GameManager()
        monkeypatch.setattr(manager, "get_player_id_by_name", lambda _game, _name: "p1")
        monkeypatch.setattr(manager, "pending_spectate_requests", lambda _game, _name: list(queue))
        monkeypatch.setattr(compression, "WS_COMPRESSION_ENABLED", True)
        real_compress = gzip.compress
        compressed = []

        def compress_first_slowly(raw: bytes) -> bytes:
            compressed.append(raw)
            if len(compressed) == 1:
                time.sleep(0.05)
            return real_compress(raw)

        monkeypatch.setattr(compression.gzip, "compress", compress_first_slowly)
        cm = ConnectionManager(manager)
        player = _FakeWebSocket()
        cm._connections["game1"]["p1"] = cast(WebSocket, player)

        cm.spectate_requests_changed("game1", "Bob")
        await asyncio.sleep(0.01)
        queue.append(SimpleNamespace(request_id="r2", spectator_name="Dan"))
        cm.spectate_requests_changed("game1", "Bob")
        await asyncio.sleep(0.2)

        lists = [[r["spectator_name"] for r in m["payload"]["requests"]] for m in player.sent]
        assert lists == [["Carol"], ["Carol", "Dan"]]

    @pytest.mark.anyio
    async def test_a_spectator_accepted_after_its_game_was_dropped_is_closed(self, monkeypatch):
        loaded = {"game1": True}
        manager = GameManager()
        monkeypatch.setattr(manager, "is_loaded", lambda game_id: loaded.get(game_id, False))
        cm = ConnectionManager(manager)
        spectator = _FakeWebSocket()
        spectator.accept_gate.clear()

        connecting = asyncio.create_task(cm.connect_spectator("game1", "Bob", cast(WebSocket, spectator)))
        await asyncio.sleep(0)
        loaded["game1"] = False
        await cm.close_spectators("game1")
        spectator.accept_gate.set()

        assert not await connecting
        assert spectator.closed == 4004
        assert not cm._spectators.get("game1")


class TestConnectionManagerPendingConnections:
    def test_reserve_connection_marks_player_as_connected(self):
        cm = ConnectionManager(GameManager())
        assert not cm.is_player_connected("game1", "player1")

        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

    def test_reserved_player_not_included_in_active_connected_ids(self):
        cm = ConnectionManager(GameManager())
        cm.reserve_connection("game1", "player1")

        connected_ids = cm.get_connected_player_ids("game1")
        assert "player1" not in connected_ids

    def test_disconnect_clears_pending_connection(self):
        cm = ConnectionManager(GameManager())
        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

        cm.disconnect("game1", "player1", cast(WebSocket, _FakeWebSocket()))
        assert not cm.is_player_connected("game1", "player1")

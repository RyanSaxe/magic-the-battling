import asyncio
import gzip
import json
import time
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocket

import server.routers.ws as ws_module
from server import compression
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


class _SpectateSocket:
    def __init__(self):
        self.sent: list[dict] = []
        self.closed: int | None = None
        self.accept_gate = asyncio.Event()
        self.accept_gate.set()

    async def accept(self):
        await self.accept_gate.wait()

    async def send_bytes(self, data: bytes):
        self.sent.append(json.loads(gzip.decompress(data)))

    async def send_json(self, message):
        self.sent.append(message)

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed = code


class TestSpectateMessages:
    @pytest.mark.anyio
    async def test_request_lists_reach_the_player_in_the_order_the_queue_changed(self, monkeypatch):
        queue = [SimpleNamespace(request_id="r1", spectator_name="Carol")]
        monkeypatch.setattr(ws_module.game_manager, "get_player_id_by_name", lambda _game, _name: "p1")
        monkeypatch.setattr(ws_module.game_manager, "pending_spectate_requests", lambda _game, _name: list(queue))
        monkeypatch.setattr(compression, "WS_COMPRESSION_ENABLED", True)
        real_compress = gzip.compress
        compressed = []

        def compress_first_slowly(raw: bytes) -> bytes:
            compressed.append(raw)
            if len(compressed) == 1:
                time.sleep(0.05)
            return real_compress(raw)

        monkeypatch.setattr(compression.gzip, "compress", compress_first_slowly)
        cm = ConnectionManager()
        player = _SpectateSocket()
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
        monkeypatch.setattr(ws_module, "_game_is_loaded", lambda game_id: loaded.get(game_id, False))
        cm = ConnectionManager()
        spectator = _SpectateSocket()
        spectator.accept_gate.clear()

        connecting = asyncio.create_task(cm.connect_spectator("game1", "Bob", cast(WebSocket, spectator)))
        await asyncio.sleep(0)
        loaded["game1"] = False
        await cm.close_spectators("game1")
        spectator.accept_gate.set()

        assert not await connecting
        assert spectator.closed == 4004
        assert not cm._spectators.get("game1")

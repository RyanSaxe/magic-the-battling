"""WebSocket connections for every game: player and spectator sockets, their outgoing queues, and broadcasts.

The connection manager is handed the game manager it reads views from, so it holds no module-level state of
its own beyond the socket close codes it sends.
"""

import asyncio
import contextlib
import logging
from collections import defaultdict
from collections.abc import Callable, Coroutine
from functools import partial
from time import perf_counter
from typing import Any, Protocol

from server.compression import send_ws
from server.errors import ErrorCode, ws_error_payload
from server.observability import OBSERVABILITY_LOGGER_NAME, record_ws_broadcast_latency
from server.outgoing import OutgoingWrites
from server.runtime_config import MAX_WS_CONNECTIONS
from server.schemas.api import GameStateResponse
from server.services.game.manager import GameManager

logger = logging.getLogger(__name__)
obs_logger = logging.getLogger(OBSERVABILITY_LOGGER_NAME)

KICKED_CLOSE_CODE = 4005
SEAT_MOVED_CLOSE_CODE = 4006
GAME_ENDED_CLOSE_CODE = 4004
SPECTATE_TARGET_GONE_CLOSE_CODE = 4007
# Not a final code to the client, so it reconnects and gets a fresh bootstrap.
FELL_BEHIND_CLOSE_CODE = 1012


class WebSocketLike(Protocol):
    async def accept(self) -> None: ...
    async def send_bytes(self, data: bytes, /) -> None: ...
    async def send_json(self, data: dict[str, Any], /) -> None: ...
    async def close(self, code: int = 1000, reason: str = "") -> None: ...


async def reject_websocket(websocket: WebSocketLike, *, code: int, reason: str, error_code: ErrorCode | str) -> None:
    # Accept-then-close ensures browsers receive the WebSocket close code
    # instead of a generic HTTP 403 handshake rejection.
    with contextlib.suppress(Exception):
        await websocket.accept()
    with contextlib.suppress(Exception):
        await send_ws(
            websocket,
            {
                "type": "connection_error",
                "payload": ws_error_payload(error_code, reason),
            },
        )
    await websocket.close(code=code, reason=reason)


async def _record_broadcast(
    kind: str, game_id: str, *, start: float, sends: list[asyncio.Task], recipient_count: int, spectator_count: int
) -> None:
    if sends:
        await asyncio.wait(sends)
    duration_ms = (perf_counter() - start) * 1000
    record_ws_broadcast_latency(
        kind, game_id, duration_ms=duration_ms, recipients=recipient_count, spectators=spectator_count
    )
    obs_logger.info(
        "WS broadcast latency: kind=%s game_id=%s recipients=%d spectators=%d duration_ms=%.2f",
        kind,
        game_id,
        recipient_count,
        spectator_count,
        duration_ms,
    )


class ConnectionManager:
    def __init__(self, game_manager: GameManager) -> None:
        self._game_manager = game_manager
        self._connections: dict[str, dict[str, WebSocketLike]] = defaultdict(dict)
        self._pending_connections: dict[str, set[str]] = defaultdict(set)
        # game id -> watched player's name -> sockets. By name, so a player who comes back with a new id keeps them.
        self._spectators: dict[str, dict[str, list[WebSocketLike]]] = defaultdict(lambda: defaultdict(list))
        self._background_tasks: set[asyncio.Task] = set()
        self._outgoing = OutgoingWrites()

    def reserve_connection(self, game_id: str, player_id: str) -> None:
        self._pending_connections[game_id].add(player_id)

    def total_connections(self) -> int:
        return sum(len(v) for v in self._connections.values())

    def total_spectators(self) -> int:
        return sum(len(sockets) for target_map in self._spectators.values() for sockets in target_map.values())

    async def reset_runtime_state(self) -> dict[str, int]:
        player_sockets = [ws for players in self._connections.values() for ws in players.values()]
        spectator_sockets = [
            ws for target_map in self._spectators.values() for sockets in target_map.values() for ws in sockets
        ]
        pending_count = sum(len(players) for players in self._pending_connections.values())

        closed_players = 0
        for ws in player_sockets:
            with contextlib.suppress(Exception):
                await ws.close(code=1012, reason="Runtime reset")
            closed_players += 1

        closed_spectators = 0
        for ws in spectator_sockets:
            with contextlib.suppress(Exception):
                await ws.close(code=1012, reason="Runtime reset")
            closed_spectators += 1

        self._connections.clear()
        self._pending_connections.clear()
        self._spectators.clear()

        return {
            "player_connections_closed": closed_players,
            "spectator_connections_closed": closed_spectators,
            "pending_connections_cleared": pending_count,
        }

    async def connect(self, game_id: str, player_id: str, *, websocket: WebSocketLike) -> bool:
        if self.total_connections() >= MAX_WS_CONNECTIONS:
            self._pending_connections[game_id].discard(player_id)
            await reject_websocket(
                websocket,
                code=1013,
                reason="Server is at websocket capacity",
                error_code=ErrorCode.WS_CAPACITY,
            )
            return False
        self._game_manager.cancel_abandoned_cleanup(game_id)
        await websocket.accept()
        previous = self._connections[game_id].get(player_id)
        self._connections[game_id][player_id] = websocket
        self._pending_connections[game_id].discard(player_id)
        self._game_manager.note_human_activity(game_id)
        if previous is not None and previous is not websocket:
            self.send(previous, {"type": "seat_moved", "payload": {}})
            self._close(previous, code=SEAT_MOVED_CLOSE_CODE, reason="Seat opened elsewhere")
        return True

    def disconnect(self, game_id: str, player_id: str, *, websocket: WebSocketLike) -> None:
        logger.debug("Disconnect called for game_id=%s, player_id=%s", game_id, player_id)
        if game_id in self._pending_connections:
            self._pending_connections[game_id].discard(player_id)
        players = self._connections.get(game_id)
        if players is None or players.get(player_id) is not websocket:
            logger.debug("Disconnect ignored for stale socket game_id=%s player_id=%s", game_id, player_id)
            return
        del players[player_id]
        self._game_manager.note_human_activity(game_id)
        logger.debug("Remaining connections for game_id=%s: %d", game_id, len(players))
        if not players:
            del self._connections[game_id]
            logger.info("All players disconnected from game_id=%s, scheduling abandoned cleanup", game_id)
            self._game_manager.schedule_abandoned_cleanup(game_id)

    def get_connected_player_ids(self, game_id: str) -> set[str]:
        return set(self._connections.get(game_id, {}).keys())

    def is_player_connected(self, game_id: str, player_id: str) -> bool:
        if player_id in self._connections.get(game_id, {}):
            return True
        return player_id in self._pending_connections.get(game_id, set())

    def clear_stale_pending_connection(self, game_id: str, player_id: str) -> bool:
        if player_id in self._connections.get(game_id, {}):
            return False
        pending = self._pending_connections.get(game_id)
        if pending is None or player_id not in pending:
            return False
        pending.discard(player_id)
        return True

    async def connect_spectator(self, game_id: str, target_player_name: str, *, websocket: WebSocketLike) -> bool:
        await websocket.accept()
        # The game may have been dropped, and its spectators closed, while this socket was being accepted.
        if not self._game_manager.is_loaded(game_id):
            await websocket.close(code=GAME_ENDED_CLOSE_CODE, reason="Game ended")
            return False
        self._spectators[game_id][target_player_name].append(websocket)
        return True

    def disconnect_spectator(self, game_id: str, target_player_name: str, *, websocket: WebSocketLike) -> None:
        if game_id in self._spectators and target_player_name in self._spectators[game_id]:
            self._spectators[game_id][target_player_name] = [
                ws for ws in self._spectators[game_id][target_player_name] if ws != websocket
            ]

    def send(
        self,
        websocket: WebSocketLike,
        message: dict,
        *,
        spectator: bool = False,
        on_failure: Callable[[], None] | None = None,
    ) -> asyncio.Task:
        return self._outgoing.add(
            websocket, partial(send_ws, websocket, message, spectator=spectator), on_failure=on_failure
        )

    async def wait_until_sent(self, websocket: WebSocketLike) -> None:
        await self._outgoing.wait_until_sent(websocket)

    def _close(self, websocket: WebSocketLike, *, code: int, reason: str) -> None:
        # A close ends only when the other end lets go of it, which behind a proxy takes seconds.
        self._outgoing.add(websocket, partial(websocket.close, code=code, reason=reason))

    def _send_registered(
        self, websocket: WebSocketLike, messages: list[dict], *, unregister: Callable[[], None], spectator: bool = False
    ) -> list[asyncio.Task]:
        if self._outgoing.has_fallen_behind(websocket):
            logger.warning("Closing a socket that fell behind on its messages")
            unregister()
            self._close(websocket, code=FELL_BEHIND_CLOSE_CODE, reason="Connection fell behind")
            return []
        return [self.send(websocket, message, spectator=spectator, on_failure=unregister) for message in messages]

    def _send_player(
        self, game_id: str, player_id: str, *, websocket: WebSocketLike, messages: list[dict]
    ) -> list[asyncio.Task]:
        unregister = partial(self.disconnect, game_id, player_id, websocket=websocket)
        return self._send_registered(websocket, messages, unregister=unregister)

    def _send_spectator(
        self, game_id: str, target_player_name: str, *, websocket: WebSocketLike, messages: list[dict]
    ) -> list[asyncio.Task]:
        unregister = partial(self.disconnect_spectator, game_id, target_player_name, websocket=websocket)
        return self._send_registered(websocket, messages, unregister=unregister, spectator=True)

    def _send_spectators_their_view(
        self, game_id: str, messages_for: Callable[[GameStateResponse], list[dict]]
    ) -> list[asyncio.Task]:
        sends: list[asyncio.Task] = []
        for target_player_name, sockets in list(self._spectators.get(game_id, {}).items()):
            target_player_id = self._game_manager.get_player_id_by_name(game_id, target_player_name)
            if target_player_id is None and self._game_manager.get_game(game_id) is not None:
                # A started game takes no new players, so someone who left its lobby never comes back to watch.
                self._close_spectators_of(game_id, target_player_name)
                continue
            state = self._game_manager.get_game_state(game_id, target_player_id) if target_player_id else None
            if state is None:
                continue
            messages = messages_for(state)
            for ws in list(sockets):
                sends += self._send_spectator(game_id, target_player_name, websocket=ws, messages=messages)
        return sends

    async def close_spectators(self, game_id: str) -> None:
        for sockets in self._spectators.pop(game_id, {}).values():
            for ws in sockets:
                self._close(ws, code=GAME_ENDED_CLOSE_CODE, reason="Game ended")

    def _close_spectators_of(self, game_id: str, target_player_name: str) -> None:
        for ws in self._spectators.get(game_id, {}).pop(target_player_name, []):
            self._close(ws, code=SPECTATE_TARGET_GONE_CLOSE_CODE, reason="Target player not found")

    def kick(self, game_id: str, player_id: str) -> None:
        if websocket := self._connections.get(game_id, {}).get(player_id):
            self.send(websocket, {"type": "kicked", "payload": {}})
            self._close(websocket, code=KICKED_CLOSE_CODE, reason="Kicked by host")
            self.disconnect(game_id, player_id, websocket=websocket)

    async def send_spectate_requests(self, game_id: str, target_player_name: str) -> None:
        """Send a player every request still waiting on their answer, oldest first."""
        target_player_id = self._game_manager.get_player_id_by_name(game_id, target_player_name)
        if target_player_id is None:
            return
        requests = self._game_manager.pending_spectate_requests(game_id, target_player_name)
        payload = {"requests": [{"request_id": r.request_id, "spectator_name": r.spectator_name} for r in requests]}
        await self.send_to_player(game_id, target_player_id, message={"type": "spectate_requests", "payload": payload})

    def spectate_requests_changed(self, game_id: str, target_player_name: str) -> None:
        self._run_soon(self.send_spectate_requests(game_id, target_player_name))

    def game_dropped(self, game_id: str) -> None:
        self._run_soon(self.close_spectators(game_id))

    def _run_soon(self, work: Coroutine[Any, Any, None]) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # A manager used outside the server's event loop (rules tests) has no sockets to tell.
            work.close()
            return
        task = loop.create_task(work)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def end_seat_connection(self, game_id: str, player_id: str) -> None:
        websocket = self._connections.get(game_id, {}).get(player_id)
        if websocket is None:
            return
        self.disconnect(game_id, player_id, websocket=websocket)
        self._close(websocket, code=GAME_ENDED_CLOSE_CODE, reason="Game ended")

    async def send_to_player(self, game_id: str, player_id: str, *, message: dict) -> None:
        if game_id in self._connections and player_id in self._connections[game_id]:
            self._send_player(game_id, player_id, websocket=self._connections[game_id][player_id], messages=[message])

    async def broadcast_game_state(self, game_id: str) -> None:
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])
        spectator_count = sum(len(sockets) for sockets in self._spectators.get(game_id, {}).values())

        sends: list[asyncio.Task] = []
        for player_id, websocket in list(self._connections[game_id].items()):
            state = self._game_manager.get_game_state(game_id, player_id)
            if state:
                sends += self._send_player(
                    game_id,
                    player_id,
                    websocket=websocket,
                    messages=[
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        }
                    ],
                )

        sends += self._send_spectators_their_view(
            game_id, lambda state: [{"type": "game_state", "payload": state.model_dump()}]
        )

        self._run_soon(
            _record_broadcast(
                "game_state",
                game_id,
                start=start,
                sends=sends,
                recipient_count=recipient_count,
                spectator_count=spectator_count,
            )
        )

    async def broadcast_lobby_state(self, game_id: str) -> None:
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])

        lobby = self._game_manager.get_lobby_state(game_id)
        if not lobby:
            return

        message = {"type": "lobby_state", "payload": lobby.model_dump()}
        sends: list[asyncio.Task] = []
        for player_id, websocket in list(self._connections[game_id].items()):
            sends += self._send_player(game_id, player_id, websocket=websocket, messages=[message])

        self._run_soon(
            _record_broadcast(
                "lobby_state", game_id, start=start, sends=sends, recipient_count=recipient_count, spectator_count=0
            )
        )

    async def send_error(
        self,
        websocket: WebSocketLike,
        message: str,
        *,
        error_code: ErrorCode | str = ErrorCode.USER_MESSAGE,
    ) -> None:
        self.send(
            websocket,
            {
                "type": "error",
                "payload": ws_error_payload(error_code, message),
            },
        )

    async def broadcast_game_over(self, game_id: str, winner_name: str | None) -> None:
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])
        spectator_count = sum(len(sockets) for sockets in self._spectators.get(game_id, {}).values())

        sends: list[asyncio.Task] = []
        for player_id, websocket in list(self._connections[game_id].items()):
            state = self._game_manager.get_game_state(game_id, player_id)
            if state:
                sends += self._send_player(
                    game_id,
                    player_id,
                    websocket=websocket,
                    messages=[
                        {
                            "type": "game_over",
                            "payload": {"winner_name": winner_name},
                        },
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        },
                    ],
                )

        sends += self._send_spectators_their_view(
            game_id,
            lambda state: [
                {"type": "game_over", "payload": {"winner_name": winner_name}},
                {"type": "game_state", "payload": state.model_dump()},
            ],
        )

        self._run_soon(
            _record_broadcast(
                "game_over",
                game_id,
                start=start,
                sends=sends,
                recipient_count=recipient_count,
                spectator_count=spectator_count,
            )
        )

    async def broadcast_server_notice(self, payload: dict) -> None:
        if not self._connections and not self._spectators:
            return

        message = {"type": "server_notice", "payload": payload}
        for game_id, recipients in list(self._connections.items()):
            for player_id, websocket in list(recipients.items()):
                self._send_player(game_id, player_id, websocket=websocket, messages=[message])

        for game_id, target_map in list(self._spectators.items()):
            for target_player_name, sockets in list(target_map.items()):
                for websocket in list(sockets):
                    self._send_spectator(game_id, target_player_name, websocket=websocket, messages=[message])

    @property
    def connections(self) -> dict[str, dict[str, WebSocketLike]]:
        return self._connections

    @property
    def spectators(self) -> dict[str, dict[str, list[WebSocketLike]]]:
        return self._spectators

    def clear_all_connections(self) -> None:
        self._connections.clear()
        self._pending_connections.clear()
        self._spectators.clear()

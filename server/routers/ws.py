import logging
from collections import defaultdict
from time import perf_counter

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import server.db.database as db
from server.compression import send_ws
from server.observability import (
    OBSERVABILITY_LOGGER_NAME,
    record_ws_action_latency,
    record_ws_broadcast_latency,
)
from server.runtime_config import MAX_WS_CONNECTIONS
from server.services.game_manager import game_manager
from server.services.ops_manager import ops_manager
from server.services.session_manager import session_manager

logger = logging.getLogger(__name__)
obs_logger = logging.getLogger(OBSERVABILITY_LOGGER_NAME)

router = APIRouter()

ACTION_REQUIRED_PHASES: dict[str, str] = {
    "draft_swap": "draft",
    "draft_roll": "draft",
    "draft_done": "draft",
    "build_move": "build",
    "build_swap": "build",
    "build_ready": "build",
    "build_unready": "build",
    "build_apply_upgrade": "build",
    "build_set_companion": "build",
    "build_remove_companion": "build",
    "battle_move": "battle",
    "battle_submit_result": "battle",
    "battle_update_card_state": "battle",
    "battle_update_life": "battle",
    "battle_pass_turn": "battle",
    "reward_pick_upgrade": "reward",
    "reward_apply_upgrade": "reward",
    "reward_done": "reward",
}


async def _reject_websocket(websocket: WebSocket, code: int, reason: str) -> None:
    # Accept-then-close ensures browsers receive the WebSocket close code
    # instead of a generic HTTP 403 handshake rejection.
    try:
        await websocket.accept()
    except Exception:
        pass
    await websocket.close(code=code, reason=reason)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self._pending_connections: dict[str, set[str]] = defaultdict(set)
        self._spectators: dict[str, dict[str, list[WebSocket]]] = defaultdict(lambda: defaultdict(list))

    def reserve_connection(self, game_id: str, player_id: str):
        self._pending_connections[game_id].add(player_id)

    def total_connections(self) -> int:
        return sum(len(v) for v in self._connections.values())

    async def reset_runtime_state(self) -> dict[str, int]:
        player_sockets = [ws for players in self._connections.values() for ws in players.values()]
        spectator_sockets = [
            ws for target_map in self._spectators.values() for sockets in target_map.values() for ws in sockets
        ]
        pending_count = sum(len(players) for players in self._pending_connections.values())

        closed_players = 0
        for ws in player_sockets:
            try:
                await ws.close(code=1012, reason="Runtime reset")
            except Exception:
                pass
            closed_players += 1

        closed_spectators = 0
        for ws in spectator_sockets:
            try:
                await ws.close(code=1012, reason="Runtime reset")
            except Exception:
                pass
            closed_spectators += 1

        self._connections.clear()
        self._pending_connections.clear()
        self._spectators.clear()

        return {
            "player_connections_closed": closed_players,
            "spectator_connections_closed": closed_spectators,
            "pending_connections_cleared": pending_count,
        }

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        if self.total_connections() >= MAX_WS_CONNECTIONS:
            self._pending_connections[game_id].discard(player_id)
            await _reject_websocket(websocket, code=1013, reason="Server is at websocket capacity")
            return False
        game_manager.cancel_abandoned_cleanup(game_id)
        await websocket.accept()
        self._connections[game_id][player_id] = websocket
        self._pending_connections[game_id].discard(player_id)
        game_manager.update_connected_humans(game_id, +1)
        return True

    def disconnect(self, game_id: str, player_id: str, websocket: WebSocket):
        logger.debug("Disconnect called for game_id=%s, player_id=%s", game_id, player_id)
        if game_id in self._connections:
            was_tracked = self._connections[game_id].get(player_id) is websocket
            if self._connections[game_id].get(player_id) is websocket:
                self._connections[game_id].pop(player_id, None)
                game_manager.update_connected_humans(game_id, -1)
            remaining = len(self._connections[game_id])
            logger.debug("Remaining connections for game_id=%s: %d", game_id, remaining)
            if not self._connections[game_id]:
                del self._connections[game_id]
                logger.info("All players disconnected from game_id=%s, scheduling abandoned cleanup", game_id)
                game_manager.schedule_abandoned_cleanup(game_id)
            elif not was_tracked:
                logger.debug("Disconnect ignored for stale socket game_id=%s player_id=%s", game_id, player_id)
        if game_id in self._pending_connections:
            self._pending_connections[game_id].discard(player_id)

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

    async def connect_spectator(self, game_id: str, target_player_id: str, websocket: WebSocket):
        await websocket.accept()
        self._spectators[game_id][target_player_id].append(websocket)

    def disconnect_spectator(self, game_id: str, target_player_id: str, websocket: WebSocket):
        if game_id in self._spectators and target_player_id in self._spectators[game_id]:
            self._spectators[game_id][target_player_id] = [
                ws for ws in self._spectators[game_id][target_player_id] if ws != websocket
            ]

    async def send_to_player(self, game_id: str, player_id: str, message: dict):
        if game_id in self._connections and player_id in self._connections[game_id]:
            ws = self._connections[game_id][player_id]
            try:
                await send_ws(ws, message)
            except Exception:
                self.disconnect(game_id, player_id, ws)

    async def broadcast_game_state(self, game_id: str):
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])
        spectator_count = sum(len(sockets) for sockets in self._spectators.get(game_id, {}).values())

        for player_id, websocket in list(self._connections[game_id].items()):
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                try:
                    await send_ws(
                        websocket,
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        },
                    )
                except Exception:
                    self.disconnect(game_id, player_id, websocket)

        for player_id, spectator_list in self._spectators.get(game_id, {}).items():
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                for ws in list(spectator_list):
                    try:
                        await send_ws(ws, {"type": "game_state", "payload": state.model_dump()}, spectator=True)
                    except Exception:
                        self.disconnect_spectator(game_id, player_id, ws)

        duration_ms = (perf_counter() - start) * 1000
        record_ws_broadcast_latency("game_state", game_id, duration_ms, recipient_count, spectator_count)
        obs_logger.info(
            "WS broadcast latency: kind=%s game_id=%s recipients=%d spectators=%d duration_ms=%.2f",
            "game_state",
            game_id,
            recipient_count,
            spectator_count,
            duration_ms,
        )

    async def broadcast_lobby_state(self, game_id: str):
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])

        lobby = game_manager.get_lobby_state(game_id)
        if not lobby:
            return

        for player_id, websocket in list(self._connections[game_id].items()):
            try:
                await send_ws(
                    websocket,
                    {
                        "type": "lobby_state",
                        "payload": lobby.model_dump(),
                    },
                )
            except Exception:
                self.disconnect(game_id, player_id, websocket)

        duration_ms = (perf_counter() - start) * 1000
        record_ws_broadcast_latency("lobby_state", game_id, duration_ms, recipient_count, 0)
        obs_logger.info(
            "WS broadcast latency: kind=%s game_id=%s recipients=%d spectators=%d duration_ms=%.2f",
            "lobby_state",
            game_id,
            recipient_count,
            0,
            duration_ms,
        )

    async def send_error(self, websocket: WebSocket, message: str):
        await send_ws(
            websocket,
            {
                "type": "error",
                "payload": {"message": message},
            },
        )

    async def broadcast_game_over(self, game_id: str, winner_name: str | None):
        if game_id not in self._connections:
            return

        start = perf_counter()
        recipient_count = len(self._connections[game_id])

        for player_id, websocket in list(self._connections[game_id].items()):
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                try:
                    await send_ws(
                        websocket,
                        {
                            "type": "game_over",
                            "payload": {"winner_name": winner_name},
                        },
                    )
                    await send_ws(
                        websocket,
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        },
                    )
                except Exception:
                    self.disconnect(game_id, player_id, websocket)

        duration_ms = (perf_counter() - start) * 1000
        record_ws_broadcast_latency("game_over", game_id, duration_ms, recipient_count, 0)
        obs_logger.info(
            "WS broadcast latency: kind=%s game_id=%s recipients=%d spectators=%d duration_ms=%.2f",
            "game_over",
            game_id,
            recipient_count,
            0,
            duration_ms,
        )

    async def broadcast_server_notice(self, payload: dict):
        if not self._connections and not self._spectators:
            return

        message = {"type": "server_notice", "payload": payload}
        for game_id, recipients in list(self._connections.items()):
            for player_id, websocket in list(recipients.items()):
                try:
                    await send_ws(websocket, message)
                except Exception:
                    self.disconnect(game_id, player_id, websocket)

        for game_id, target_map in list(self._spectators.items()):
            for target_player_id, sockets in list(target_map.items()):
                for websocket in list(sockets):
                    try:
                        await send_ws(websocket, message, spectator=True)
                    except Exception:
                        self.disconnect_spectator(game_id, target_player_id, websocket)


connection_manager = ConnectionManager()


async def _handle_spectator_connection(
    websocket: WebSocket, game_id: str, session_id: str, spectate_player: str, request_id: str
) -> bool:
    req = game_manager.get_spectate_request(request_id)
    if not req or req.status != "approved" or req.session_id != session_id:
        await _reject_websocket(websocket, code=4003, reason="Invalid spectate request")
        return True

    target_player_id = game_manager.get_player_id_by_name(game_id, spectate_player)
    if not target_player_id:
        await _reject_websocket(websocket, code=4004, reason="Target player not found")
        return True

    await connection_manager.connect_spectator(game_id, target_player_id, websocket)

    bootstrap = game_manager.get_game_bootstrap(game_id, target_player_id)
    if bootstrap:
        await send_ws(websocket, {"type": "game_bootstrap", "payload": bootstrap.model_dump()}, spectator=True)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect_spectator(game_id, target_player_id, websocket)
    return True


async def _handle_player_disconnect(game_id: str, player_id: str, websocket: WebSocket) -> None:
    connection_manager.disconnect(game_id, player_id, websocket)
    game_manager.schedule_pending_disconnect(
        game_id,
        player_id,
        on_removed=lambda: connection_manager.broadcast_lobby_state(game_id),
    )
    await connection_manager.broadcast_lobby_state(game_id)


def _resolve_pending_or_game(game_id: str):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)
    if not pending and not game:
        game_manager.restore_game_from_snapshot(game_id)
        game = game_manager.get_game(game_id)
    return pending, game


async def _connect_player_to_game(websocket: WebSocket, game_id: str, player_id: str):
    pending, game = _resolve_pending_or_game(game_id)
    if not pending and not game:
        connection_manager.disconnect(game_id, player_id, websocket)
        await _reject_websocket(websocket, code=4004, reason="Game not found")
        return None

    if pending and player_id not in pending.player_ids:
        await _reject_websocket(websocket, code=4001, reason="Invalid session")
        return None

    if game and not game_manager.get_player(game, player_id):
        await _reject_websocket(websocket, code=4001, reason="Player not found in game")
        return None

    game_manager.cancel_pending_disconnect(game_id, player_id)
    connected = await connection_manager.connect(game_id, player_id, websocket)
    if not connected:
        return None
    return pending, game


async def _send_initial_player_state(
    websocket: WebSocket,
    game_id: str,
    player_id: str,
    pending,
    game,
) -> None:
    if pending and not pending.is_started:
        await connection_manager.broadcast_lobby_state(game_id)
    elif game:
        bootstrap = game_manager.get_game_bootstrap(game_id, player_id)
        if bootstrap:
            await send_ws(
                websocket,
                {
                    "type": "game_bootstrap",
                    "payload": bootstrap.model_dump(),
                },
            )

    notice = ops_manager.notice_payload()
    if notice.get("mode") != "normal":
        await send_ws(
            websocket,
            {
                "type": "server_notice",
                "payload": notice,
            },
        )


@router.websocket("/ws/{game_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    game_id: str,
    session_id: str,
    spectate_player: str | None = None,
    request_id: str | None = None,
):
    session = session_manager.get_session(session_id)
    if not session:
        await _reject_websocket(websocket, code=4001, reason="Invalid session")
        return

    if spectate_player and request_id:
        await _handle_spectator_connection(websocket, game_id, session_id, spectate_player, request_id)
        return

    player_id = session.player_id
    connection_result = await _connect_player_to_game(websocket, game_id, player_id)
    if connection_result is None:
        return
    pending, game = connection_result

    try:
        await _send_initial_player_state(websocket, game_id, player_id, pending, game)

        while True:
            data = await websocket.receive_json()
            action = str(data.get("action", ""))
            action_start = perf_counter()
            action_result = "ok"
            try:
                await handle_message(game_id, player_id, data, websocket)
            except Exception:
                action_result = "exception"
                raise
            finally:
                duration_ms = (perf_counter() - action_start) * 1000
                record_ws_action_latency(action, game_id, duration_ms)
                obs_logger.info(
                    "WS action latency: action=%s game_id=%s player_id=%s result=%s duration_ms=%.2f",
                    action,
                    game_id,
                    player_id,
                    action_result,
                    duration_ms,
                )

    except WebSocketDisconnect:
        await _handle_player_disconnect(game_id, player_id, websocket)
    except RuntimeError as exc:
        if "WebSocket is not connected" not in str(exc):
            raise
        await _handle_player_disconnect(game_id, player_id, websocket)


def _validate_action_phase(action: str, player) -> str | None:
    """Returns error message if action invalid for player's phase, None if valid."""
    required_phase = ACTION_REQUIRED_PHASES.get(action)
    if required_phase is None:
        return None
    if player.phase != required_phase:
        return f"Cannot {action}: player is in {player.phase} phase, requires {required_phase}"
    return None


async def _handle_lobby_action(  # noqa: PLR0912, PLR0915
    action: str, payload: dict, game_id: str, player_id: str, websocket: WebSocket
) -> bool:
    if action == "set_ready":
        is_ready = payload.get("is_ready", True)
        success, error = game_manager.set_player_ready(game_id, player_id, is_ready)
        if success:
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, error or "Failed to set ready state")
        return True

    if action == "submit_battler":
        pending = game_manager.get_pending_game(game_id)
        if not pending:
            await connection_manager.send_error(websocket, "Game not found")
            return True

        error = game_manager.start_player_battler_preload(
            pending,
            player_id,
            str(payload.get("battler_id", "")),
            on_complete=lambda: connection_manager.broadcast_lobby_state(game_id),
        )
        if error:
            await connection_manager.send_error(websocket, error)
        else:
            await connection_manager.broadcast_lobby_state(game_id)
        return True

    if action == "clear_battler":
        success, error = game_manager.clear_player_battler(game_id, player_id)
        if success:
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, error or "Failed to clear battler")
        return True

    if action == "start_game":
        if ops_manager.blocks_new_games():
            await connection_manager.send_error(websocket, "Server is updating. New games are temporarily blocked.")
            return True
        can_start, error = game_manager.can_start_game(game_id, player_id)
        if not can_start:
            await connection_manager.send_error(websocket, error or "Cannot start game")
            return True

        db_session = db.SessionLocal()
        try:
            result = await game_manager.start_game_async(game_id, db_session)
        finally:
            db_session.close()

        if result:
            await connection_manager.broadcast_game_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Failed to start game")
        return True

    if action == "add_puppet":
        if game_manager.add_puppet(game_id, player_id):
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Cannot add puppet")
        return True

    if action == "remove_puppet":
        if game_manager.remove_puppet(game_id, player_id):
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Cannot remove puppet")
        return True

    if action == "kick_player":
        target_id = payload.get("target_player_id", "")
        if game_manager.kick_player(game_id, player_id, target_id):
            kicked_ws = connection_manager._connections.get(game_id, {}).get(target_id)
            if kicked_ws:
                await send_ws(kicked_ws, {"type": "kicked", "payload": {}})
                await kicked_ws.close(code=4005, reason="Kicked by host")
                connection_manager.disconnect(game_id, target_id, kicked_ws)
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Cannot kick player")
        return True

    if action == "set_target_player_count":
        success, error = game_manager.set_target_player_count(
            game_id,
            player_id,
            int(payload.get("target_player_count", 0)),
        )
        if success:
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, error or "Cannot change player cap")
        return True

    return False


def _dispatch_game_action(action: str, payload: dict, game, player, game_id: str) -> bool | str | None:  # noqa: PLR0912
    match action:
        case "draft_swap":
            return game_manager.handle_draft_swap(
                game, player, payload["pack_card_id"], payload["player_card_id"], payload["destination"]
            )
        case "draft_roll":
            return game_manager.handle_draft_roll(game, player)
        case "draft_done":
            return game_manager.handle_draft_done(game, player)
        case "build_move":
            return game_manager.handle_build_move(player, payload["card_id"], payload["source"], payload["destination"])
        case "build_swap":
            return game_manager.handle_build_swap(
                player,
                payload["card_a_id"],
                payload["source_a"],
                payload["card_b_id"],
                payload["source_b"],
            )
        case "build_ready":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_build_ready(
                    game,
                    player,
                    payload["basics"],
                    game_id,
                    db_session,
                    play_draw_preference=payload.get("play_draw_preference", "play"),
                    hand_order=payload.get("hand_order"),
                )
            finally:
                db_session.close()
        case "build_unready":
            return game_manager.handle_build_unready(player)
        case "build_apply_upgrade":
            return game_manager.handle_build_apply_upgrade(player, payload["upgrade_id"], payload["target_card_id"])
        case "build_set_companion":
            return game_manager.handle_build_set_companion(player, payload["card_id"])
        case "build_remove_companion":
            return game_manager.handle_build_remove_companion(player)
        case "battle_move":
            return game_manager.handle_battle_move(
                game,
                player,
                payload["card_id"],
                payload["from_zone"],
                payload["to_zone"],
                payload.get("from_owner", "player"),
                payload.get("to_owner", "player"),
            )
        case "battle_submit_result":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_battle_submit_result(game, player, payload["result"], game_id, db_session)
            finally:
                db_session.close()
        case "battle_update_card_state":
            return game_manager.handle_battle_update_card_state(
                game, player, payload["action_type"], payload["card_id"], payload.get("data")
            )
        case "battle_update_life":
            return game_manager.handle_battle_update_life(game, player, payload["target"], payload["life"])
        case "battle_pass_turn":
            return game_manager.handle_battle_pass_turn(game, player)
        case "reward_pick_upgrade":
            return game_manager.handle_reward_pick_upgrade(game, player, payload["upgrade_id"])
        case "reward_apply_upgrade":
            return game_manager.handle_reward_apply_upgrade(player, payload["upgrade_id"], payload["target_card_id"])
        case "reward_done":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_reward_done(game, player, payload.get("upgrade_id"), game_id, db_session)
            finally:
                db_session.close()
        case _:
            return False


def _handle_spectate_response(payload: dict) -> None:
    request_id = payload.get("request_id")
    if not request_id:
        return
    if payload.get("allowed", False):
        game_manager.approve_spectate_request(request_id)
    else:
        game_manager.deny_spectate_request(request_id)


async def _handle_phase_error(
    action: str,
    player,
    phase_error: str | None,
    game_id: str,
    websocket: WebSocket,
) -> bool:
    if not phase_error:
        return False
    if action == "build_ready" and player.phase == "battle":
        await connection_manager.broadcast_game_state(game_id)
        return True
    await connection_manager.send_error(websocket, phase_error)
    return True


async def _handle_voice_signal(game_id: str, player_id: str, payload: dict) -> None:
    target_name = payload.get("target_player")
    if not target_name:
        return
    target_id = game_manager.get_player_id_by_name(game_id, target_name)
    if not target_id:
        return
    sender_name = game_manager._player_id_to_name.get(player_id, "")
    await connection_manager.send_to_player(
        game_id,
        target_id,
        {
            "type": "voice_signal",
            "payload": {
                "signal_type": payload.get("signal_type"),
                "data": payload.get("data"),
                "from_player": sender_name,
            },
        },
    )


async def _handle_passthrough_action(action: str, game_id: str, player_id: str, payload: dict) -> bool:
    if action == "voice_signal":
        await _handle_voice_signal(game_id, player_id, payload)
        return True
    if action == "spectate_response":
        _handle_spectate_response(payload)
        return True
    return False


async def handle_message(game_id: str, player_id: str, data: dict, websocket: WebSocket):
    action = data.get("action", "")
    payload = data.get("payload", {})

    if await _handle_passthrough_action(action, game_id, player_id, payload):
        return

    if ops_manager.is_maintenance():
        await connection_manager.send_error(websocket, "Server maintenance in progress. Please reconnect shortly.")
        return

    lock = game_manager.get_action_lock(game_id)
    async with lock:
        if await _handle_lobby_action(action, payload, game_id, player_id, websocket):
            return

        game = game_manager.get_game(game_id)
        if not game:
            await connection_manager.send_error(websocket, "Game not started")
            return

        player = game_manager.get_player(game, player_id)
        if not player:
            await connection_manager.send_error(websocket, "Player not found in game")
            return

        phase_error = _validate_action_phase(action, player)
        if await _handle_phase_error(action, player, phase_error, game_id, websocket):
            return

        result = _dispatch_game_action(action, payload, game, player, game_id)

        if result in {"sudden_death", "game_over", True, None}:
            game_manager.mark_game_dirty(game_id)

        if result is False:
            await connection_manager.send_error(websocket, f"Unknown action: {action}")
        elif result == "game_over":
            winners = [p for p in game.players if p.phase == "winner"]
            winner_name = winners[0].name if winners else None
            await connection_manager.broadcast_game_over(game_id, winner_name)
        elif result == "sudden_death" or result is True or result is None:
            await connection_manager.broadcast_game_state(game_id)
        elif isinstance(result, str):
            await connection_manager.send_error(websocket, result)
        else:
            await connection_manager.send_error(websocket, f"Failed to execute action: {action}")

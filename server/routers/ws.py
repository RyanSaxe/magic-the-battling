"""The game WebSocket: connecting players and spectators, and dispatching each message a player sends."""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import server.db.database as db
from mtb.models.game import Game, Player
from server.errors import ErrorCode
from server.observability import OBSERVABILITY_LOGGER_NAME, record_ws_action_latency
from server.routers.ws_actions import (
    ActionResult,
    GameActionRequest,
    dispatch_game_action,
    validate_action_phase,
)
from server.services.connection_manager import (
    GAME_ENDED_CLOSE_CODE,
    SPECTATE_TARGET_GONE_CLOSE_CODE,
    ConnectionManager,
    reject_websocket,
)
from server.services.game_manager import LobbyStartFailedError, LobbyStartRefusedError, PendingGame, game_manager
from server.services.ops_manager import ops_manager
from server.services.session_manager import Session, session_manager

logger = logging.getLogger(__name__)
obs_logger = logging.getLogger(OBSERVABILITY_LOGGER_NAME)

router = APIRouter()


type LobbyResult = tuple[bool, str | None]


@dataclass(frozen=True)
class _LobbyRequest:
    game_id: str
    player_id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class _LobbyAction:
    run: Callable[[_LobbyRequest], LobbyResult]
    failure_message: str


connection_manager = ConnectionManager(game_manager)
game_manager.attach_connected_player_ids(connection_manager.get_connected_player_ids)
game_manager.attach_spectate_listener(connection_manager)


async def _handle_spectator_connection(
    websocket: WebSocket, game_id: str, *, session_id: str, spectate_player: str, request_id: str
) -> None:
    # A dropped game took its spectate requests with it, so say the game ended rather than that the request is bad.
    if not game_manager.is_loaded(game_id):
        await reject_websocket(
            websocket,
            code=GAME_ENDED_CLOSE_CODE,
            reason="Game ended",
            error_code=ErrorCode.GAME_NOT_FOUND,
        )
        return

    if not game_manager.admit_spectator(
        request_id, session_id=session_id, game_id=game_id, target_player_name=spectate_player
    ):
        await reject_websocket(
            websocket,
            code=4003,
            reason="Invalid spectate request",
            error_code=ErrorCode.INVALID_REQUEST,
        )
        return

    target_player_id = game_manager.get_player_id_by_name(game_id, spectate_player)
    if not target_player_id:
        await reject_websocket(
            websocket,
            code=SPECTATE_TARGET_GONE_CLOSE_CODE,
            reason="Target player not found",
            error_code=ErrorCode.SPECTATE_TARGET_NOT_FOUND,
        )
        return

    if not await connection_manager.connect_spectator(game_id, spectate_player, websocket=websocket):
        return

    bootstrap = game_manager.get_game_bootstrap(game_id, target_player_id)
    if bootstrap:
        connection_manager.send(
            websocket, {"type": "game_bootstrap", "payload": bootstrap.model_dump()}, spectator=True
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect_spectator(game_id, spectate_player, websocket=websocket)


async def _handle_player_disconnect(game_id: str, player_id: str, *, websocket: WebSocket) -> None:
    connection_manager.disconnect(game_id, player_id, websocket=websocket)
    # A late close from a socket that a newer one replaced must not mark the still-connected player as gone,
    # and a kicked player has no seat left to mark.
    if player_id in connection_manager.get_connected_player_ids(game_id):
        return
    if not game_manager.holds_seat(game_id, player_id):
        return
    if game_manager.get_pending_game(game_id) is not None:
        async with game_manager.get_action_lock(game_id):
            game_manager.schedule_pending_disconnect(
                game_id,
                player_id,
                on_removed=lambda: connection_manager.broadcast_lobby_state(game_id),
            )
            game_manager.note_lobby_player_away(
                game_id,
                player_id,
                on_host_change=lambda: connection_manager.broadcast_lobby_state(game_id),
            )
    await connection_manager.broadcast_lobby_state(game_id)


async def _resolve_pending_or_game(game_id: str) -> tuple[PendingGame | None, Game | None]:
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)
    if not pending and not game and game_manager.has_game(game_id):
        async with game_manager.get_action_lock(game_id):
            if not game_manager.get_pending_game(game_id) and not game_manager.get_game(game_id):
                game_manager.restore_game_from_snapshot(game_id)
        pending = game_manager.get_pending_game(game_id)
        game = game_manager.get_game(game_id)
    return pending, game


def _connection_refusal(
    session: Session, game_id: str, *, pending: PendingGame | None, game: Game | None
) -> tuple[int, str, ErrorCode] | None:
    player_id = session.player_id
    if not pending and not game:
        return 4004, "Game not found", ErrorCode.GAME_NOT_FOUND
    if session.game_id != game_id:
        return 4001, "Session belongs to another game", ErrorCode.INVALID_SESSION
    if pending and player_id not in pending.player_ids:
        return 4001, "Invalid session", ErrorCode.INVALID_SESSION
    if game and not game_manager.get_player(game, player_id):
        return 4001, "Player not found in game", ErrorCode.PLAYER_NOT_IN_GAME
    return None


async def _connect_player_to_game(
    websocket: WebSocket, game_id: str, *, session: Session
) -> tuple[PendingGame | None, Game | None] | None:
    player_id = session.player_id
    pending, game = await _resolve_pending_or_game(game_id)
    refusal = _connection_refusal(session, game_id, pending=pending, game=game)
    if refusal is not None:
        code, reason, error_code = refusal
        if not pending and not game:
            connection_manager.disconnect(game_id, player_id, websocket=websocket)
        await reject_websocket(websocket, code=code, reason=reason, error_code=error_code)
        return None

    game_manager.cancel_pending_disconnect(game_id, player_id)
    connected = await connection_manager.connect(game_id, player_id, websocket=websocket)
    if not connected:
        return None
    if pending is not None:
        async with game_manager.get_action_lock(game_id):
            game_manager.note_lobby_player_present(game_id, player_id)
    return pending, game


async def _send_initial_player_state(
    websocket: WebSocket,
    game_id: str,
    *,
    player_id: str,
    pending: PendingGame | None,
    game: Game | None,
) -> None:
    if pending and not pending.is_started:
        await connection_manager.broadcast_lobby_state(game_id)
    elif game:
        bootstrap = game_manager.get_game_bootstrap(game_id, player_id)
        if bootstrap:
            connection_manager.send(
                websocket,
                {
                    "type": "game_bootstrap",
                    "payload": bootstrap.model_dump(),
                },
            )

    # Each connection starts with no requests on the client, so only waiting ones need sending.
    player_name = game_manager.get_player_name(player_id)
    if player_name is not None and game_manager.pending_spectate_requests(game_id, player_name):
        await connection_manager.send_spectate_requests(game_id, player_name)

    notice = ops_manager.notice_payload()
    if notice.get("mode") != "normal":
        connection_manager.send(
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
    *,
    session_id: str,
    spectate_player: str | None = None,
    request_id: str | None = None,
) -> None:
    session = session_manager.get_session(session_id)
    if not session:
        await reject_websocket(
            websocket,
            code=4001,
            reason="Invalid session",
            error_code=ErrorCode.INVALID_SESSION,
        )
        return

    if spectate_player and request_id:
        await _handle_spectator_connection(
            websocket, game_id, session_id=session_id, spectate_player=spectate_player, request_id=request_id
        )
        return

    player_id = session.player_id
    connection_result = await _connect_player_to_game(websocket, game_id, session=session)
    if connection_result is None:
        return
    pending, game = connection_result

    try:
        await _send_initial_player_state(websocket, game_id, player_id=player_id, pending=pending, game=game)
        while True:
            # Outside the game's lock: a client that isn't reading its replies slows down only its own actions.
            await connection_manager.wait_until_sent(websocket)
            data = await websocket.receive_json()
            await _run_player_action(game_id, player_id, data=data, websocket=websocket)
    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:
        if "WebSocket is not connected" not in str(exc):
            raise
    finally:
        await _handle_player_disconnect(game_id, player_id, websocket=websocket)


async def _run_player_action(game_id: str, player_id: str, *, data: dict, websocket: WebSocket) -> None:
    action = str(data.get("action", ""))
    action_start = perf_counter()
    action_result = "ok"
    try:
        await handle_message(game_id, player_id, data=data, websocket=websocket)
    except Exception:
        # A bug in one action must not end the socket: the player keeps playing and can still rejoin.
        action_result = "exception"
        logger.exception("WS action failed: action=%s game_id=%s player_id=%s", action, game_id, player_id)
        await connection_manager.send_error(
            websocket, "That action failed. Please try again.", error_code=ErrorCode.UNKNOWN
        )
    finally:
        duration_ms = (perf_counter() - action_start) * 1000
        record_ws_action_latency(action, game_id, duration_ms=duration_ms)
        obs_logger.info(
            "WS action latency: action=%s game_id=%s player_id=%s result=%s duration_ms=%.2f",
            action,
            game_id,
            player_id,
            action_result,
            duration_ms,
        )


def _kick_player(r: _LobbyRequest) -> LobbyResult:
    target_id = r.payload.get("target_player_id", "")
    if not game_manager.kick_player(r.game_id, r.player_id, target_player_id=target_id):
        return False, None
    connection_manager.kick(r.game_id, target_id)
    return True, None


_LOBBY_ACTIONS: dict[str, _LobbyAction] = {
    "set_ready": _LobbyAction(
        lambda r: game_manager.set_player_ready(r.game_id, r.player_id, is_ready=r.payload.get("is_ready", True)),
        "Failed to set ready state",
    ),
    "clear_battler": _LobbyAction(
        lambda r: game_manager.clear_player_battler(r.game_id, r.player_id),
        "Failed to clear your deck",
    ),
    "add_puppet": _LobbyAction(
        lambda r: (game_manager.add_puppet(r.game_id, r.player_id), None),
        "Cannot add puppet",
    ),
    "remove_puppet": _LobbyAction(
        lambda r: (game_manager.remove_puppet(r.game_id, r.player_id), None),
        "Cannot remove puppet",
    ),
    "kick_player": _LobbyAction(_kick_player, "Cannot kick player"),
    "set_target_player_count": _LobbyAction(
        lambda r: game_manager.set_target_player_count(
            r.game_id, r.player_id, target_player_count=int(r.payload.get("target_player_count", 0))
        ),
        "Cannot change player cap",
    ),
    "set_voice_chat": _LobbyAction(
        lambda r: game_manager.set_voice_chat_enabled(r.game_id, r.player_id, enabled=r.payload.get("enabled", True)),
        "Cannot toggle voice chat",
    ),
}


async def _submit_battler(game_id: str, player_id: str, *, payload: dict[str, Any], websocket: WebSocket) -> None:
    pending = game_manager.get_pending_game(game_id)
    if not pending:
        await connection_manager.send_error(websocket, "Game not found", error_code=ErrorCode.GAME_NOT_FOUND)
        return

    error = game_manager.start_player_battler_preload(
        pending,
        player_id,
        battler_id=str(payload.get("battler_id", "")),
        on_complete=lambda: connection_manager.broadcast_lobby_state(game_id),
    )
    if error:
        await connection_manager.send_error(websocket, error)
    else:
        await connection_manager.broadcast_lobby_state(game_id)


async def _handle_lobby_action(
    action: str, payload: dict[str, Any], *, game_id: str, player_id: str, websocket: WebSocket
) -> bool:
    if action == "submit_battler":
        await _submit_battler(game_id, player_id, payload=payload, websocket=websocket)
        return True

    lobby_action = _LOBBY_ACTIONS.get(action)
    if lobby_action is None:
        return False
    success, error = lobby_action.run(_LobbyRequest(game_id=game_id, player_id=player_id, payload=payload))
    if success:
        await connection_manager.broadcast_lobby_state(game_id)
    else:
        await connection_manager.send_error(websocket, error or lobby_action.failure_message)
    return True


async def _start_lobby(game_id: str, player_id: str, *, websocket: WebSocket) -> None:
    """Start the lobby without holding its lock, so other players' changes are refused rather than queued."""
    if game_manager.get_game(game_id):
        # A second click that reached the server after the first start finished; the game is already on its way.
        return
    if ops_manager.blocks_new_games():
        await connection_manager.send_error(
            websocket,
            "Server is updating. New games are temporarily blocked.",
            error_code=ErrorCode.SERVER_UPDATING,
        )
        return

    db_session = db.SessionLocal()
    try:
        await game_manager.start_lobby(
            game_id,
            player_id,
            db=db_session,
            on_change=lambda: connection_manager.broadcast_lobby_state(game_id),
        )
    except LobbyStartRefusedError as exc:
        await connection_manager.send_error(websocket, str(exc))
        return
    except LobbyStartFailedError:
        # The lobby state every player was just sent carries the reason.
        return
    finally:
        db_session.close()
    await connection_manager.broadcast_game_state(game_id)


def _handle_spectate_response(game_id: str, player_id: str, *, payload: dict[str, Any]) -> None:
    request_id = payload.get("request_id")
    if not request_id:
        return
    game_manager.respond_to_spectate_request(
        request_id,
        game_id=game_id,
        responder_id=player_id,
        allowed=bool(payload.get("allowed", False)),
    )


async def _handle_phase_error(
    action: str, player: Player, *, phase_error: str | None, game_id: str, websocket: WebSocket
) -> bool:
    if not phase_error:
        return False
    if action == "build_ready" and player.phase == "battle":
        await connection_manager.broadcast_game_state(game_id)
        return True
    await connection_manager.send_error(websocket, phase_error)
    return True


async def _handle_voice_signal(game_id: str, player_id: str, *, payload: dict[str, Any]) -> None:
    target_name = payload.get("target_player")
    if not target_name:
        return
    target_id = game_manager.get_player_id_by_name(game_id, target_name)
    if not target_id:
        return
    sender_name = game_manager.get_player_name(player_id) or ""
    await connection_manager.send_to_player(
        game_id,
        target_id,
        message={
            "type": "voice_signal",
            "payload": {
                "signal_type": payload.get("signal_type"),
                "data": payload.get("data"),
                "from_player": sender_name,
            },
        },
    )


async def _handle_passthrough_action(action: str, game_id: str, *, player_id: str, payload: dict[str, Any]) -> bool:
    if action == "voice_signal":
        await _handle_voice_signal(game_id, player_id, payload=payload)
        return True
    if action == "spectate_response":
        _handle_spectate_response(game_id, player_id, payload=payload)
        return True
    return False


async def _seat_in_started_game(game_id: str, player_id: str, *, websocket: WebSocket) -> tuple[Game, Player] | None:
    game = game_manager.get_game(game_id)
    if not game:
        await connection_manager.send_error(websocket, "Game not started", error_code=ErrorCode.GAME_NOT_FOUND)
        return None
    player = game_manager.get_player(game, player_id)
    if not player:
        await connection_manager.send_error(
            websocket, "Player not found in game", error_code=ErrorCode.PLAYER_NOT_IN_GAME
        )
        return None
    return game, player


async def handle_message(game_id: str, player_id: str, *, data: dict, websocket: WebSocket) -> None:
    action = data.get("action", "")
    payload = data.get("payload", {})

    if await _handle_passthrough_action(action, game_id, player_id=player_id, payload=payload):
        return

    if ops_manager.is_maintenance():
        await connection_manager.send_error(
            websocket,
            "Server maintenance in progress. Please reconnect shortly.",
            error_code=ErrorCode.SERVER_MAINTENANCE,
        )
        return

    if action == "start_game":
        await _start_lobby(game_id, player_id, websocket=websocket)
        return

    async with game_manager.get_action_lock(game_id):
        if await _handle_lobby_action(action, payload, game_id=game_id, player_id=player_id, websocket=websocket):
            return

        seat = await _seat_in_started_game(game_id, player_id, websocket=websocket)
        if seat is None:
            return
        game, player = seat

        phase_error = validate_action_phase(action, player)
        if await _handle_phase_error(action, player, phase_error=phase_error, game_id=game_id, websocket=websocket):
            return

        request = GameActionRequest(manager=game_manager, game=game, player=player, payload=payload, game_id=game_id)
        result = dispatch_game_action(action, request)
        await _report_game_action_result(action, result, game=game, game_id=game_id, websocket=websocket)


async def _report_game_action_result(
    action: str, result: ActionResult, *, game: Game, game_id: str, websocket: WebSocket
) -> None:
    if result in {"sudden_death", "game_over", True, None}:
        game_manager.mark_game_dirty(game_id)

    if result is False:
        await connection_manager.send_error(
            websocket,
            f"Unknown action: {action}",
            error_code=ErrorCode.UNKNOWN_ACTION,
        )
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

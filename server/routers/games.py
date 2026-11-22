import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from mtb.utils.cubecobra import get_cube_data
from server.db import database
from server.db.models import User
from server.errors import ErrorCode, api_error
from server.routers.ws import connection_manager
from server.schemas.api import (
    CloseSeatRequest,
    CreateGameRequest,
    CreateGameResponse,
    GameBootstrapResponse,
    GameCardsResponse,
    GameStatusPlayer,
    GameStatusResponse,
    JoinGameRequest,
    JoinGameResponse,
    LobbyStateResponse,
    RejoinGameRequest,
    ResumableRequest,
    ResumableResponse,
    ShareGameResponse,
    SpectateRequestCreate,
    SpectateRequestResponse,
    SpectateRequestStatus,
    StartGameResponse,
)
from server.services.auth import get_optional_user
from server.services.game_manager import (
    LOBBY_STARTING_MESSAGE,
    BattlerReady,
    LobbyStartFailedError,
    LobbyStartRefusedError,
    PendingGame,
    SeatCloseRefusedError,
    game_manager,
)
from server.services.game_serialization import catalog_entries_for_cards
from server.services.ops_manager import ops_manager
from server.services.seat_tokens import SeatClaimRefusal, SeatClaimRefusedError
from server.services.session_manager import session_manager
from server.services.share import build_share_data
from server.services.spectate_requests import SpectateRequest, TooManySpectateRequestsError

logger = logging.getLogger(__name__)

IDEMPOTENCY_KEY_HEADER = "x-mtb-idempotency-key"
IDEMPOTENCY_TTL_MINUTES = 10
IDEMPOTENCY_CACHE_MAX = 10_000
DEFAULT_UPDATE_RETRY_AFTER_SECONDS = 600


@dataclass
class _CreateIdempotencyEntry:
    request_fingerprint: str
    response: CreateGameResponse
    created_at: datetime


@dataclass
class _CreateIdempotencyClaim:
    cache_key: str | None
    request_fingerprint: str
    future: asyncio.Future[CreateGameResponse] | None = None
    owns_future: bool = False


_create_idempotency_cache: dict[str, _CreateIdempotencyEntry] = {}
_create_idempotency_inflight: dict[str, asyncio.Future[CreateGameResponse]] = {}
_create_idempotency_lock = asyncio.Lock()


def _request_fingerprint(request: CreateGameRequest) -> str:
    return json.dumps(
        {
            "player_name": request.player_name,
            "cube_id": request.cube_id,
            "use_upgrades": request.use_upgrades,
            "use_vanguards": request.use_vanguards,
            "target_player_count": request.target_player_count,
            "puppet_count": request.puppet_count,
            "auto_approve_spectators": request.auto_approve_spectators,
            "guided_mode_default": request.guided_mode_default,
            "play_mode": request.play_mode,
        },
        sort_keys=True,
    )


def _prune_idempotency_cache() -> None:
    now = datetime.now(UTC)
    expiry = now - timedelta(minutes=IDEMPOTENCY_TTL_MINUTES)
    stale_keys = [key for key, entry in _create_idempotency_cache.items() if entry.created_at < expiry]
    for key in stale_keys:
        _create_idempotency_cache.pop(key, None)

    overflow = len(_create_idempotency_cache) - IDEMPOTENCY_CACHE_MAX
    if overflow <= 0:
        return

    oldest_keys = sorted(
        _create_idempotency_cache.keys(),
        key=lambda key: _create_idempotency_cache[key].created_at,
    )[:overflow]
    for key in oldest_keys:
        _create_idempotency_cache.pop(key, None)


def _normalize_idempotency_key(raw_key: str | None) -> str | None:
    normalized = (raw_key or "").strip()
    return normalized or None


async def _claim_create_idempotency(
    cache_key: str | None,
    request_fingerprint: str,
) -> tuple[CreateGameResponse | None, _CreateIdempotencyClaim]:
    claim = _CreateIdempotencyClaim(cache_key=cache_key, request_fingerprint=request_fingerprint)
    if cache_key is None:
        return None, claim

    async with _create_idempotency_lock:
        _prune_idempotency_cache()
        cached = _create_idempotency_cache.get(cache_key)
        if cached:
            if cached.request_fingerprint != request_fingerprint:
                raise api_error(
                    409,
                    ErrorCode.INVALID_REQUEST,
                    "Idempotency key already used with a different create payload.",
                )
            return cached.response, claim

        existing = _create_idempotency_inflight.get(cache_key)
        if existing is not None:
            claim.future = existing
            return None, claim

        claim.future = asyncio.get_running_loop().create_future()
        claim.owns_future = True
        _create_idempotency_inflight[cache_key] = claim.future
        return None, claim


async def _clear_create_inflight(cache_key: str | None) -> None:
    if cache_key is None:
        return
    async with _create_idempotency_lock:
        _create_idempotency_inflight.pop(cache_key, None)


async def _resolve_claim_success(
    claim: _CreateIdempotencyClaim,
    response_payload: CreateGameResponse,
) -> None:
    if claim.cache_key is None or not claim.owns_future or claim.future is None:
        return

    async with _create_idempotency_lock:
        _create_idempotency_cache[claim.cache_key] = _CreateIdempotencyEntry(
            request_fingerprint=claim.request_fingerprint,
            response=response_payload,
            created_at=datetime.now(UTC),
        )
        _create_idempotency_inflight.pop(claim.cache_key, None)

    if not claim.future.done():
        claim.future.set_result(response_payload)


async def _resolve_claim_error(claim: _CreateIdempotencyClaim, exc: Exception) -> None:
    if claim.cache_key is None or not claim.owns_future or claim.future is None:
        return

    if not claim.future.done():
        claim.future.set_exception(exc)
    await _clear_create_inflight(claim.cache_key)


def _new_game_block_reason() -> str | None:
    if ops_manager.blocks_new_games():
        return "Server is updating. New games are temporarily blocked."

    allowed, reason = game_manager.can_accept_new_pending_game()
    if not allowed:
        return reason or "Server is at capacity"
    return None


def _update_retry_after_seconds() -> str:
    estimate_minutes = ops_manager.estimated_recovery_minutes()
    if estimate_minutes is None:
        return str(DEFAULT_UPDATE_RETRY_AFTER_SECONDS)
    return str(max(60, estimate_minutes * 60))


def _server_update_http_error(detail: str):
    return api_error(
        503,
        ErrorCode.SERVER_UPDATING,
        detail,
        headers={"Retry-After": _update_retry_after_seconds()},
    )


def _create_game_response(request: CreateGameRequest, user_id: str | None = None) -> CreateGameResponse:
    session = session_manager.create_session()
    pending = game_manager.create_game(
        player_name=request.player_name,
        player_id=session.player_id,
        cube_id=request.cube_id,
        use_upgrades=request.use_upgrades,
        use_vanguards=request.use_vanguards,
        target_player_count=request.target_player_count,
        auto_approve_spectators=request.auto_approve_spectators,
        guided_mode_default=request.guided_mode_default,
        play_mode=request.play_mode,
        user_id=user_id,
    )
    pending.puppet_count = request.puppet_count
    session_manager.update_game_id(session.session_id, pending.game_id)

    async def broadcast_lobby():
        await connection_manager.broadcast_lobby_state(pending.game_id)

    if request.play_mode == "limited":
        game_manager.start_battler_preload(pending, on_complete=broadcast_lobby)
    else:
        error = game_manager.start_player_battler_preload(
            pending,
            session.player_id,
            request.cube_id,
            on_complete=broadcast_lobby,
        )
        if error:
            game_manager.record_player_battler_error(pending, session.player_id, request.cube_id, error)
    return CreateGameResponse(
        game_id=pending.game_id,
        join_code=pending.join_code,
        session_id=session.session_id,
        player_id=session.player_id,
        seat_token=game_manager.issue_lobby_seat_token(pending.game_id, request.player_name),
    )


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/games", tags=["games"])


@router.post("", response_model=CreateGameResponse)
async def create_game(
    request: CreateGameRequest,
    x_mtb_idempotency_key: str | None = Header(default=None, alias=IDEMPOTENCY_KEY_HEADER),
    current_user: "User | None" = Depends(get_optional_user),  # noqa: B008
):
    cache_key = _normalize_idempotency_key(x_mtb_idempotency_key)
    fingerprint = _request_fingerprint(request)
    cached_response, claim = await _claim_create_idempotency(cache_key, fingerprint)
    if cached_response is not None:
        return cached_response

    if claim.future is not None and not claim.owns_future:
        return await claim.future

    block_reason = _new_game_block_reason()
    if block_reason:
        error = (
            _server_update_http_error(block_reason)
            if ops_manager.blocks_new_games()
            else api_error(503, ErrorCode.SERVER_CAPACITY, block_reason)
        )
        await _resolve_claim_error(claim, error)
        raise error

    try:
        user_id = str(current_user.id) if current_user else None
        response_payload = _create_game_response(request, user_id=user_id)
    except Exception as exc:
        await _resolve_claim_error(claim, exc)
        raise

    await _resolve_claim_success(claim, response_payload)
    return response_payload


class WarmCubeRequest(BaseModel):
    cube_id: str


@router.post("/resumable", response_model=ResumableResponse)
def find_resumable_games(
    request: ResumableRequest,
    current_user: User | None = Depends(get_optional_user),  # noqa: B008
):
    """List the lobbies and games the caller can return to, by their browser's seat tokens or their login."""
    user_id = str(current_user.id) if current_user else None
    return ResumableResponse(games=game_manager.find_resumable_seats(request.seats, user_id=user_id))


@router.post("/cubes/warm")
async def warm_cube_cache(request: WarmCubeRequest):
    logger.info("warming cube cache: %s", request.cube_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_cube_data, request.cube_id)
    await loop.run_in_executor(None, database.save_cube_metadata, request.cube_id)
    logger.info("warming complete: %s", request.cube_id)
    return {"status": "ok"}


@router.post("/join", response_model=JoinGameResponse)
async def join_game_by_code(request: JoinGameRequest, current_user: User | None = Depends(get_optional_user)):  # noqa: B008
    """Join a game using just the join code (no game_id needed)."""
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. Joining new games is temporarily blocked.")

    game_id = game_manager.get_game_id_by_join_code(request.join_code)
    if not game_id:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    async with game_manager.get_action_lock(game_id):
        if game_manager.get_game(game_id):
            raise api_error(400, ErrorCode.GAME_ALREADY_STARTED, "Game has already started")
        pending = game_manager.get_pending_game(game_id)
        if not pending:
            raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return _join_lobby(pending, request, current_user)


@router.post("/{game_id}/join", response_model=JoinGameResponse)
async def join_game(game_id: str, request: JoinGameRequest, current_user: User | None = Depends(get_optional_user)):  # noqa: B008
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. Joining new games is temporarily blocked.")

    if not game_manager.get_pending_game(game_id):
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    async with game_manager.get_action_lock(game_id):
        pending = game_manager.get_pending_game(game_id)
        if not pending:
            raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")
        if pending.join_code.upper() != request.join_code.upper():
            raise api_error(400, ErrorCode.INVALID_JOIN_CODE, "Invalid join code")
        return _join_lobby(pending, request, current_user)


def _join_lobby(pending: PendingGame, request: JoinGameRequest, current_user: User | None) -> JoinGameResponse:
    if not pending.accepts_changes:
        raise api_error(400, ErrorCode.GAME_ALREADY_STARTED, LOBBY_STARTING_MESSAGE)
    if pending.has_player_named(request.player_name):
        raise api_error(409, ErrorCode.PLAYER_NAME_TAKEN, "Player name already taken")
    if len(pending.player_names) + pending.puppet_count >= pending.target_player_count:
        raise api_error(400, ErrorCode.LOBBY_FULL, "Lobby is full")

    session = session_manager.create_session(pending.game_id)
    user_id = str(current_user.id) if current_user else None
    result = game_manager.join_game(
        join_code=pending.join_code,
        player_name=request.player_name,
        player_id=session.player_id,
        user_id=user_id,
    )
    if not result:
        raise api_error(400, ErrorCode.UNKNOWN, "Failed to join game")

    return JoinGameResponse(
        game_id=pending.game_id,
        session_id=session.session_id,
        player_id=session.player_id,
        seat_token=game_manager.issue_lobby_seat_token(pending.game_id, request.player_name),
    )


_SEAT_REFUSAL_ERRORS: dict[SeatClaimRefusal, tuple[int, ErrorCode, str]] = {
    SeatClaimRefusal.GAME_NOT_FOUND: (404, ErrorCode.GAME_NOT_FOUND, "Game not found"),
    SeatClaimRefusal.SEAT_NOT_FOUND: (404, ErrorCode.PLAYER_NOT_IN_GAME, "Player not found in game"),
    SeatClaimRefusal.LOGIN_REQUIRED: (403, ErrorCode.NOT_AUTHENTICATED, "Log in to reconnect to this player slot"),
    SeatClaimRefusal.TOKEN_REQUIRED: (
        403,
        ErrorCode.SEAT_CLAIM_REQUIRED,
        "This seat can only be reclaimed from the browser that joined with it",
    ),
}


@router.post("/{game_id}/rejoin", response_model=JoinGameResponse)
async def rejoin_game(
    game_id: str,
    request: RejoinGameRequest,
    current_user: User | None = Depends(get_optional_user),  # noqa: B008
):
    """Take a seat back, from a new tab or after the session expired.

    The caller must hold the seat's token or be logged in as the account that took it. The new session's
    socket replaces any socket still open on the seat."""
    if not (
        game_manager.get_pending_game(game_id)
        or game_manager.get_game(game_id)
        or game_manager.restore_game_from_snapshot(game_id)
    ):
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    async with game_manager.get_action_lock(game_id):
        try:
            claim = game_manager.reclaim_seat(
                game_id,
                request.player_name,
                seat_token=request.seat_token,
                user_id=str(current_user.id) if current_user else None,
            )
        except SeatClaimRefusedError as refused:
            status, code, detail = _SEAT_REFUSAL_ERRORS[refused.refusal]
            raise api_error(status, code, detail) from None
        session = session_manager.create_session(game_id, player_id=claim.player_id)
        connection_manager.reserve_connection(game_id, claim.player_id)

    return JoinGameResponse(
        game_id=game_id,
        session_id=session.session_id,
        player_id=session.player_id,
        seat_token=claim.seat_token,
    )


@router.post("/{game_id}/close", status_code=204)
async def close_seat(game_id: str, request: CloseSeatRequest) -> Response:
    """End the caller's seat for good. Only the seat's token proves the caller, so a login alone doesn't."""
    if ops_manager.is_maintenance():
        raise api_error(503, ErrorCode.SERVER_MAINTENANCE, "Server maintenance in progress. Try again shortly.")
    if not (
        game_manager.get_pending_game(game_id)
        or game_manager.get_game(game_id)
        or game_manager.restore_game_from_snapshot(game_id)
    ):
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    async with game_manager.get_action_lock(game_id):
        try:
            player_id = game_manager.close_seat(game_id, request.player_name, seat_token=request.seat_token)
        except SeatClaimRefusedError as refused:
            status, code, detail = _SEAT_REFUSAL_ERRORS[refused.refusal]
            raise api_error(status, code, detail) from None
        except SeatCloseRefusedError as refused:
            raise api_error(409, ErrorCode.INVALID_REQUEST, str(refused)) from None
        if player_id is not None:
            connection_manager.end_seat_connection(game_id, player_id)

    await connection_manager.broadcast_lobby_state(game_id)
    return Response(status_code=204)


@router.get("/{game_id}/lobby", response_model=LobbyStateResponse)
def get_lobby(game_id: str):
    lobby = game_manager.get_lobby_state(game_id)
    if not lobby:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")
    return lobby


@router.get("/{game_id}/cards", response_model=GameCardsResponse)
def get_game_cards(game_id: str, player_name: str | None = None):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)

    battler = None
    if pending and pending.play_mode == "constructed" and player_name:
        player_id = game_manager.get_player_id_by_name(game_id, player_name)
        if player_id:
            player_battler = pending.player_battlers.get(player_id)
            battler = player_battler.battler if isinstance(player_battler, BattlerReady) else None
    elif pending and pending.battler:
        battler = pending.battler
    elif game and game.config.play_mode == "constructed" and player_name:
        player = next((candidate for candidate in game.players if candidate.name == player_name), None)
        battler = player.battler if player else None
    elif game and game.battler:
        battler = game.battler

    if not battler:
        raise api_error(404, ErrorCode.CARD_POOL_NOT_AVAILABLE, "Card pool not available")

    saved_names = game.saved_names if game else None
    return GameCardsResponse(
        cards=catalog_entries_for_cards(battler.original_cards or battler.cards, saved_names),
        upgrades=catalog_entries_for_cards(battler.original_upgrades or battler.upgrades, saved_names),
    )


@router.post("/{game_id}/start", response_model=StartGameResponse)
async def start_game(game_id: str, session_id: str | None = None, db: Session = Depends(get_db)):  # noqa: B008
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. New games are temporarily blocked.")

    pending = game_manager.get_pending_game(game_id)
    if not pending:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    session = session_manager.get_session(session_id) if session_id else None
    if not session:
        raise api_error(401, ErrorCode.INVALID_SESSION, "Starting a game needs the host's session_id")
    if session.player_id != pending.host_player_id:
        raise api_error(403, ErrorCode.INVALID_REQUEST, "Only the host can start the game")

    try:
        await game_manager.start_lobby(
            game_id,
            session.player_id,
            db,
            on_change=lambda: connection_manager.broadcast_lobby_state(game_id),
        )
    except LobbyStartRefusedError as exc:
        raise api_error(400, ErrorCode.INVALID_REQUEST, str(exc)) from exc
    except LobbyStartFailedError as exc:
        raise api_error(500, ErrorCode.UNKNOWN, str(exc)) from exc

    await connection_manager.broadcast_game_state(game_id)
    return StartGameResponse(success=True)


@router.get("/{game_id}", response_model=GameBootstrapResponse)
def get_game_state(game_id: str, session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise api_error(401, ErrorCode.INVALID_SESSION, "Invalid session")

    bootstrap = game_manager.get_game_bootstrap(game_id, session.player_id)
    if not bootstrap:
        raise api_error(404, ErrorCode.PLAYER_NOT_IN_GAME, "Game not found or player not in game")

    return bootstrap


@router.get("/{game_id}/status", response_model=GameStatusResponse)
def get_game_status(game_id: str):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)
    if not pending and not game:
        game_manager.restore_game_from_snapshot(game_id)
        game = game_manager.get_game(game_id)

    if not pending and not game:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    connected_player_ids = connection_manager.get_connected_player_ids(game_id)

    players: list[GameStatusPlayer] = []

    if pending:
        for i, name in enumerate(pending.player_names):
            player_id = pending.player_ids[i]
            players.append(
                GameStatusPlayer(
                    name=name,
                    is_connected=player_id in connected_player_ids,
                    is_puppet=False,
                    phase="lobby",
                )
            )
        return GameStatusResponse(
            game_id=game_id,
            phase="lobby",
            is_started=pending.is_started,
            players=players,
            auto_approve_spectators=pending.auto_approve_spectators,
        )

    if game:
        for player in game.players:
            player_id = game_manager.get_player_id_by_name(game_id, player.name)
            players.append(
                GameStatusPlayer(
                    name=player.name,
                    is_connected=player_id in connected_player_ids if player_id else False,
                    is_puppet=False,
                    phase=player.phase,
                )
            )
        players.extend(
            GameStatusPlayer(
                name=fake.name,
                is_connected=True,
                is_puppet=True,
                phase="battle" if not fake.is_eliminated else "eliminated",
            )
            for fake in game.puppets
        )

        phases = {p.phase for p in game.players if p.phase != "eliminated"}
        phase = phases.pop() if len(phases) == 1 else "mixed"

        return GameStatusResponse(
            game_id=game_id,
            phase=phase,
            is_started=True,
            players=players,
            auto_approve_spectators=game.config.auto_approve_spectators,
        )

    raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")


@router.post("/{game_id}/spectate-request", response_model=SpectateRequestResponse)
async def create_spectate_request(game_id: str, request: SpectateRequestCreate):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)

    if not pending and not game:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    target_name = request.target_player_name
    player_exists = False

    if pending:
        player_exists = target_name in pending.player_names
    elif game:
        player_exists = any(p.name == target_name for p in game.players)
        player_exists = player_exists or any(f.name == target_name for f in game.puppets)

    if not player_exists:
        raise api_error(404, ErrorCode.SPECTATE_TARGET_NOT_FOUND, "Target player not found")

    try:
        spectate_request = game_manager.create_spectate_request(game_id, target_name, request.spectator_name)
    except TooManySpectateRequestsError as exc:
        raise api_error(429, ErrorCode.INVALID_REQUEST, str(exc)) from exc

    return SpectateRequestResponse(request_id=spectate_request.request_id)


def _spectate_status(spectate_request: SpectateRequest | None) -> SpectateRequestStatus:
    if spectate_request is None:
        raise api_error(404, ErrorCode.SPECTATE_REQUEST_NOT_FOUND, "Spectate request not found")
    return SpectateRequestStatus(
        status=spectate_request.status,
        session_id=spectate_request.session_id,
        player_id=spectate_request.player_id,
    )


@router.get("/{game_id}/spectate-request/{request_id}", response_model=SpectateRequestStatus)
def get_spectate_request_status(game_id: str, request_id: str):
    return _spectate_status(game_manager.get_spectate_request(game_id, request_id))


@router.delete("/{game_id}/spectate-request/{request_id}", response_model=SpectateRequestStatus)
async def cancel_spectate_request(game_id: str, request_id: str):
    """Withdraw a request still waiting for an answer. Returns the request's status, which is cancelled unless the
    request was already answered or had expired."""
    return _spectate_status(game_manager.cancel_spectate_request(game_id, request_id))


@router.get("/{game_id}/share/{player_name}", response_model=ShareGameResponse)
def get_share_game(game_id: str, player_name: str, db: Session = Depends(get_db)):  # noqa: B008
    return build_share_data(db, game_id, player_name)

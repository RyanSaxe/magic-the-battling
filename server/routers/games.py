import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from mtb.models.game import restore_snapshot_data
from mtb.utils.cubecobra import get_cube_data
from server.db import database
from server.db.models import GameRecord, PlayerGameHistory
from server.routers.ws import connection_manager
from server.schemas.api import (
    CreateGameRequest,
    CreateGameResponse,
    GameCardsResponse,
    GameStateResponse,
    GameStatusPlayer,
    GameStatusResponse,
    JoinGameRequest,
    JoinGameResponse,
    LobbyStateResponse,
    RejoinGameRequest,
    ShareGameResponse,
    SharePlayerData,
    SharePlayerSnapshot,
    SpectateRequestCreate,
    SpectateRequestResponse,
    SpectateRequestStatus,
    StartGameResponse,
)
from server.services.game_manager import game_manager
from server.services.ops_manager import ops_manager
from server.services.session_manager import session_manager

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
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key already used with a different create payload.",
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


def _server_update_http_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=detail,
        headers={"Retry-After": _update_retry_after_seconds()},
    )


def _create_game_response(request: CreateGameRequest) -> CreateGameResponse:
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
            host_battler = pending.player_battlers.get(session.player_id)
            if host_battler is not None:
                host_battler.battler_error = error
    return CreateGameResponse(
        game_id=pending.game_id,
        join_code=pending.join_code,
        session_id=session.session_id,
        player_id=session.player_id,
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
            else HTTPException(status_code=503, detail=block_reason)
        )
        await _resolve_claim_error(claim, error)
        raise error

    try:
        response_payload = _create_game_response(request)
    except Exception as exc:
        await _resolve_claim_error(claim, exc)
        raise

    await _resolve_claim_success(claim, response_payload)
    return response_payload


class WarmCubeRequest(BaseModel):
    cube_id: str


@router.post("/cubes/warm")
async def warm_cube_cache(request: WarmCubeRequest):
    logger.info("warming cube cache: %s", request.cube_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_cube_data, request.cube_id)
    logger.info("warming complete: %s", request.cube_id)
    return {"status": "ok"}


@router.post("/join", response_model=JoinGameResponse)
def join_game_by_code(request: JoinGameRequest):
    """Join a game using just the join code (no game_id needed)."""
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. Joining new games is temporarily blocked.")

    game_id = game_manager.get_game_id_by_join_code(request.join_code)
    if not game_id:
        raise HTTPException(status_code=404, detail="Game not found")

    if game_manager.get_game(game_id):
        raise HTTPException(status_code=400, detail="Game has already started")

    pending = game_manager.get_pending_game(game_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Game not found")

    if request.player_name in pending.player_names:
        raise HTTPException(status_code=409, detail="Player name already taken")

    session = session_manager.create_session(pending.game_id)
    result = game_manager.join_game(
        join_code=request.join_code,
        player_name=request.player_name,
        player_id=session.player_id,
    )

    if not result:
        raise HTTPException(status_code=400, detail="Failed to join game")

    return JoinGameResponse(
        game_id=pending.game_id,
        session_id=session.session_id,
        player_id=session.player_id,
    )


@router.post("/{game_id}/join", response_model=JoinGameResponse)
def join_game(game_id: str, request: JoinGameRequest):
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. Joining new games is temporarily blocked.")

    pending = game_manager.get_pending_game(game_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Game not found")

    if pending.join_code.upper() != request.join_code.upper():
        raise HTTPException(status_code=400, detail="Invalid join code")

    if pending.is_started:
        raise HTTPException(status_code=400, detail="Game has already started")

    if request.player_name in pending.player_names:
        raise HTTPException(status_code=409, detail="Player name already taken")

    session = session_manager.create_session(game_id)
    result = game_manager.join_game(
        join_code=request.join_code,
        player_name=request.player_name,
        player_id=session.player_id,
    )

    if not result:
        raise HTTPException(status_code=400, detail="Failed to join game")

    return JoinGameResponse(
        game_id=game_id,
        session_id=session.session_id,
        player_id=session.player_id,
    )


@router.post("/{game_id}/rejoin", response_model=JoinGameResponse)
def rejoin_game(game_id: str, request: RejoinGameRequest):
    if not game_manager.get_game(game_id):
        game_manager.restore_game_from_snapshot(game_id)

    game = game_manager.get_game(game_id)
    if not game or not any(p.name == request.player_name for p in game.players):
        raise HTTPException(status_code=404, detail="Player not found in game")

    player_id = game_manager.get_player_id_by_name(game_id, request.player_name)
    if player_id and connection_manager.is_player_connected(game_id, player_id):
        recovered = connection_manager.clear_stale_pending_connection(game_id, player_id)
        if not recovered:
            raise HTTPException(status_code=409, detail="Player is already connected")

    session = session_manager.create_session(game_id)
    success = game_manager.rejoin_game(game_id, request.player_name, session.player_id)

    if not success:
        raise HTTPException(status_code=400, detail="Failed to rejoin game")

    connection_manager.reserve_connection(game_id, session.player_id)

    return JoinGameResponse(
        game_id=game_id,
        session_id=session.session_id,
        player_id=session.player_id,
    )


@router.get("/{game_id}/lobby", response_model=LobbyStateResponse)
def get_lobby(game_id: str):
    lobby = game_manager.get_lobby_state(game_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Game not found")
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
            battler = player_battler.battler if player_battler else None
    elif pending and pending.battler:
        battler = pending.battler
    elif game and game.config.play_mode == "constructed" and player_name:
        player = next((candidate for candidate in game.players if candidate.name == player_name), None)
        battler = player.battler if player else None
    elif game and game.battler:
        battler = game.battler

    if not battler:
        raise HTTPException(status_code=404, detail="Card pool not available")

    return GameCardsResponse(
        cards=battler.original_cards or battler.cards,
        upgrades=battler.original_upgrades or battler.upgrades,
    )


@router.post("/{game_id}/start", response_model=StartGameResponse)
def start_game(game_id: str, db: Session = Depends(get_db)):  # noqa: B008
    if ops_manager.blocks_new_games():
        raise _server_update_http_error("Server is updating. New games are temporarily blocked.")

    pending = game_manager.get_pending_game(game_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Game not found")

    if pending.is_started:
        raise HTTPException(status_code=400, detail="Game has already started")

    if pending.target_player_count < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    game = game_manager.start_game(game_id, db)
    if not game:
        raise HTTPException(status_code=500, detail="Failed to start game")

    return StartGameResponse(success=True)


@router.get("/{game_id}", response_model=GameStateResponse)
def get_game_state(game_id: str, session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    state = game_manager.get_game_state(game_id, session.player_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found or player not in game")

    return state


@router.get("/{game_id}/status", response_model=GameStatusResponse)
def get_game_status(game_id: str):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)
    if not pending and not game:
        game_manager.restore_game_from_snapshot(game_id)
        game = game_manager.get_game(game_id)

    if not pending and not game:
        raise HTTPException(status_code=404, detail="Game not found")

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

    raise HTTPException(status_code=404, detail="Game not found")


@router.post("/{game_id}/spectate-request", response_model=SpectateRequestResponse)
async def create_spectate_request(game_id: str, request: SpectateRequestCreate):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)

    if not pending and not game:
        raise HTTPException(status_code=404, detail="Game not found")

    target_name = request.target_player_name
    player_exists = False

    if pending:
        player_exists = target_name in pending.player_names
    elif game:
        player_exists = any(p.name == target_name for p in game.players)
        player_exists = player_exists or any(f.name == target_name for f in game.puppets)

    if not player_exists:
        raise HTTPException(status_code=404, detail="Target player not found")

    try:
        request_id = game_manager.create_spectate_request(game_id, target_name, request.spectator_name)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    auto_approve = (pending and pending.auto_approve_spectators) or (game and game.config.auto_approve_spectators)
    if not auto_approve:
        target_player_id = game_manager.get_player_id_by_name(game_id, target_name)
        if target_player_id:
            await connection_manager.send_to_player(
                game_id,
                target_player_id,
                {
                    "type": "spectate_request",
                    "payload": {
                        "request_id": request_id,
                        "spectator_name": request.spectator_name,
                    },
                },
            )

    return SpectateRequestResponse(request_id=request_id)


@router.get("/{game_id}/spectate-request/{request_id}", response_model=SpectateRequestStatus)
def get_spectate_request_status(game_id: str, request_id: str):
    req = game_manager.get_spectate_request(request_id)
    if not req or req.game_id != game_id:
        raise HTTPException(status_code=404, detail="Spectate request not found")

    return SpectateRequestStatus(
        status=req.status,
        session_id=req.session_id,
        player_id=req.player_id,
    )


def _build_human_snapshots(history: PlayerGameHistory) -> list[SharePlayerSnapshot]:
    snapshots: list[SharePlayerSnapshot] = []
    sorted_snaps = sorted(history.snapshots, key=lambda s: (s.stage, s.round))
    for snap in sorted_snaps:
        snapshot_data = restore_snapshot_data(snap.full_state_json)
        poison = snap.poison if snap.poison is not None else snapshot_data.poison
        snapshots.append(
            SharePlayerSnapshot(
                stage=snap.stage,
                round=snap.round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
                upgrades=snapshot_data.upgrades,
                basic_lands=snapshot_data.basic_lands,
                treasures=snapshot_data.treasures,
                poison=poison,
                vanguard=snapshot_data.vanguard,
            )
        )
    return snapshots


def _parse_snapshot_key(key: str) -> tuple[int, int]:
    stage_str, round_str = key.split("_", 1)
    return int(stage_str), int(round_str)


def _build_puppet_snapshots(history: PlayerGameHistory, db: Session) -> list[SharePlayerSnapshot]:
    source = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.id == history.source_history_id)
        .first()
    )
    if not source:
        return []

    raw = str(history.poison_history_json) if history.poison_history_json else ""
    poison_map: dict[str, int] = json.loads(raw) if raw else {}

    sorted_snaps = sorted(source.snapshots, key=lambda s: (s.stage, s.round))
    if not sorted_snaps:
        return []

    sorted_poison_keys = sorted(poison_map.keys(), key=_parse_snapshot_key)
    snapshots: list[SharePlayerSnapshot] = []
    source_index = 0
    best_source_snapshot = None
    for key in sorted_poison_keys:
        target_stage, target_round = _parse_snapshot_key(key)

        while source_index < len(sorted_snaps):
            candidate = sorted_snaps[source_index]
            candidate_round = (candidate.stage, candidate.round)
            if candidate_round > (target_stage, target_round):
                break
            best_source_snapshot = candidate
            source_index += 1

        source_snapshot = best_source_snapshot or sorted_snaps[0]
        snapshot_data = restore_snapshot_data(source_snapshot.full_state_json)
        snapshots.append(
            SharePlayerSnapshot(
                stage=target_stage,
                round=target_round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
                upgrades=snapshot_data.upgrades,
                basic_lands=snapshot_data.basic_lands,
                treasures=snapshot_data.treasures,
                poison=poison_map[key],
                vanguard=snapshot_data.vanguard,
            )
        )
    return snapshots


@router.get("/{game_id}/share/{player_name}", response_model=ShareGameResponse)
def get_share_game(game_id: str, player_name: str, db: Session = Depends(get_db)):  # noqa: B008
    game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
    if not game_record:
        raise HTTPException(status_code=404, detail="Game not found")

    config = json.loads(str(game_record.config_json)) if game_record.config_json else {}
    use_upgrades = config.get("use_upgrades", True)

    histories = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.game_id == game_id)
        .all()
    )

    if not histories:
        raise HTTPException(status_code=404, detail="No player data found for this game")

    owner_exists = any(str(h.player_name) == player_name for h in histories)
    if not owner_exists:
        raise HTTPException(status_code=404, detail="Player not found in this game")

    players: list[SharePlayerData] = []
    for history in histories:
        is_puppet = bool(history.is_puppet)
        if is_puppet:
            snapshots = _build_puppet_snapshots(history, db)
        else:
            snapshots = _build_human_snapshots(history)

        final_poison = snapshots[-1].poison if snapshots else 0
        players.append(
            SharePlayerData(
                name=str(history.player_name),
                final_placement=cast(int, history.final_placement) if history.final_placement is not None else None,
                final_poison=final_poison,
                is_puppet=is_puppet,
                snapshots=snapshots,
            )
        )

    created_at = game_record.created_at.isoformat() if game_record.created_at else ""

    return ShareGameResponse(
        game_id=game_id,
        owner_name=player_name,
        created_at=created_at,
        use_upgrades=use_upgrades,
        players=players,
    )

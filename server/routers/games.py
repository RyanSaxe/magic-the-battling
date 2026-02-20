import json
from typing import cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from mtb.models.game import BattleSnapshotData
from server.db import database
from server.db.models import GameRecord, PlayerGameHistory
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
from server.services.session_manager import session_manager


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/games", tags=["games"])


@router.post("", response_model=CreateGameResponse)
async def create_game(request: CreateGameRequest):
    from server.routers.ws import connection_manager  # noqa: PLC0415

    session = session_manager.create_session()
    pending = game_manager.create_game(
        player_name=request.player_name,
        player_id=session.player_id,
        cube_id=request.cube_id,
        use_upgrades=request.use_upgrades,
        use_vanguards=request.use_vanguards,
        target_player_count=request.target_player_count,
        auto_approve_spectators=request.auto_approve_spectators,
    )
    session_manager.update_game_id(session.session_id, pending.game_id)

    async def broadcast_lobby():
        await connection_manager.broadcast_lobby_state(pending.game_id)

    game_manager.start_battler_preload(pending, on_complete=broadcast_lobby)

    return CreateGameResponse(
        game_id=pending.game_id,
        join_code=pending.join_code,
        session_id=session.session_id,
        player_id=session.player_id,
    )


@router.post("/join", response_model=JoinGameResponse)
def join_game_by_code(request: JoinGameRequest):
    """Join a game using just the join code (no game_id needed)."""
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
    from server.routers.ws import connection_manager  # noqa: PLC0415

    game = game_manager.get_game(game_id)
    if not game or not any(p.name == request.player_name for p in game.players):
        raise HTTPException(status_code=404, detail="Player not found in game")

    player_id = game_manager.get_player_id_by_name(game_id, request.player_name)
    if player_id and connection_manager.is_player_connected(game_id, player_id):
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
def get_game_cards(game_id: str):
    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)

    battler = None
    if pending and pending.battler:
        battler = pending.battler
    elif game and game.battler:
        battler = game.battler

    if not battler:
        raise HTTPException(status_code=404, detail="Card pool not available")

    return GameCardsResponse(cards=battler.cards, upgrades=battler.upgrades)


@router.post("/{game_id}/start", response_model=StartGameResponse)
def start_game(game_id: str):
    pending = game_manager.get_pending_game(game_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Game not found")

    if pending.is_started:
        raise HTTPException(status_code=400, detail="Game has already started")

    if pending.target_player_count < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    game = game_manager.start_game(game_id)
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
    from server.routers.ws import connection_manager  # noqa: PLC0415

    pending = game_manager.get_pending_game(game_id)
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
    from server.routers.ws import connection_manager  # noqa: PLC0415

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

    request_id = game_manager.create_spectate_request(game_id, target_name, request.spectator_name)

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
        snapshot_data = BattleSnapshotData.model_validate_json(snap.full_state_json)
        poison = snap.poison if snap.poison is not None else snapshot_data.poison
        snapshots.append(
            SharePlayerSnapshot(
                stage=snap.stage,
                round=snap.round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
                basic_lands=snapshot_data.basic_lands,
                treasures=snapshot_data.treasures,
                poison=poison,
                vanguard=snapshot_data.vanguard,
            )
        )
    return snapshots


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
    snapshots: list[SharePlayerSnapshot] = []
    for snap in sorted_snaps:
        key = f"{snap.stage}_{snap.round}"
        if key not in poison_map:
            continue
        snapshot_data = BattleSnapshotData.model_validate_json(snap.full_state_json)
        snapshots.append(
            SharePlayerSnapshot(
                stage=snap.stage,
                round=snap.round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
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

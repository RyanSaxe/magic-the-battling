from fastapi import APIRouter, HTTPException

from server.schemas.api import (
    CreateGameRequest,
    CreateGameResponse,
    GameStateResponse,
    GameStatusPlayer,
    GameStatusResponse,
    JoinGameRequest,
    JoinGameResponse,
    LobbyStateResponse,
    RejoinGameRequest,
    SpectateRequestCreate,
    SpectateRequestResponse,
    SpectateRequestStatus,
    StartGameResponse,
)
from server.services.game_manager import game_manager
from server.services.session_manager import session_manager

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
    pending = game_manager.get_pending_game_by_code(request.join_code)
    if not pending:
        raise HTTPException(status_code=404, detail="Game not found")

    if pending.is_started:
        raise HTTPException(status_code=400, detail="Game has already started")

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
                    is_bot=False,
                    phase="lobby",
                )
            )
        return GameStatusResponse(
            game_id=game_id,
            phase="lobby",
            is_started=pending.is_started,
            players=players,
        )

    if game:
        for player in game.players:
            player_id = game_manager.get_player_id_by_name(game_id, player.name)
            players.append(
                GameStatusPlayer(
                    name=player.name,
                    is_connected=player_id in connected_player_ids if player_id else False,
                    is_bot=False,
                    phase=player.phase,
                )
            )
        players.extend(
            GameStatusPlayer(
                name=fake.name,
                is_connected=True,
                is_bot=True,
                phase="battle" if not fake.is_eliminated else "eliminated",
            )
            for fake in game.fake_players
        )

        phases = {p.phase for p in game.players if p.phase != "eliminated"}
        phase = phases.pop() if len(phases) == 1 else "mixed"

        return GameStatusResponse(
            game_id=game_id,
            phase=phase,
            is_started=True,
            players=players,
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
        player_exists = player_exists or any(f.name == target_name for f in game.fake_players)

    if not player_exists:
        raise HTTPException(status_code=404, detail="Target player not found")

    request_id = game_manager.create_spectate_request(game_id, target_name, request.spectator_name)

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

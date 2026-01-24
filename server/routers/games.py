from fastapi import APIRouter, HTTPException

from server.schemas.api import (
    CreateGameRequest,
    CreateGameResponse,
    GameStateResponse,
    JoinGameRequest,
    JoinGameResponse,
    LobbyStateResponse,
    RejoinGameRequest,
    StartGameResponse,
)
from server.services.game_manager import game_manager
from server.services.session_manager import session_manager

router = APIRouter(prefix="/api/games", tags=["games"])


@router.post("", response_model=CreateGameResponse)
def create_game(request: CreateGameRequest):
    session = session_manager.create_session()
    pending = game_manager.create_game(
        player_name=request.player_name,
        player_id=session.player_id,
        cube_id=request.cube_id,
    )
    session_manager.update_game_id(session.session_id, pending.game_id)

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
    if not game_manager.can_rejoin(game_id, request.player_name):
        raise HTTPException(status_code=404, detail="Player not found in game")

    session = session_manager.create_session(game_id)
    success = game_manager.rejoin_game(game_id, request.player_name, session.player_id)

    if not success:
        raise HTTPException(status_code=400, detail="Failed to rejoin game")

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

    if len(pending.player_names) < 2:
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

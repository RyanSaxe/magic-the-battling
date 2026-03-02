import logging
import secrets

from fastapi import APIRouter, Header, HTTPException

from server.routers.ws import connection_manager
from server.runtime_config import OPS_API_TOKEN
from server.schemas.api import OpsCapacityResponse, OpsSetModeRequest, OpsStateResponse
from server.services.game_manager import game_manager
from server.services.ops_manager import ops_manager
from server.services.session_manager import session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops", tags=["ops"])


def _authorize(ops_token: str | None) -> None:
    if not OPS_API_TOKEN:
        raise HTTPException(status_code=503, detail="Ops API token is not configured")
    if not ops_token or not secrets.compare_digest(ops_token, OPS_API_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _to_state_response() -> OpsStateResponse:
    snapshot = ops_manager.get_snapshot()
    return OpsStateResponse(
        mode=snapshot.mode,
        message=snapshot.message or "",
        updated_by=snapshot.updated_by,
        updated_at=snapshot.updated_at.isoformat(),
    )


@router.get("/state", response_model=OpsStateResponse)
def get_ops_state(x_ops_token: str | None = Header(default=None)):
    _authorize(x_ops_token)
    return _to_state_response()


@router.post("/mode", response_model=OpsStateResponse)
async def set_ops_mode(request: OpsSetModeRequest, x_ops_token: str | None = Header(default=None)):
    _authorize(x_ops_token)
    snapshot = ops_manager.set_mode(
        request.mode,
        request.message.strip() or None,
        request.updated_by or "ops-api",
    )

    await connection_manager.broadcast_server_notice(
        {
            "mode": snapshot.mode,
            "message": snapshot.message or "",
            "updated_at": snapshot.updated_at.isoformat(),
        }
    )
    return _to_state_response()


@router.get("/capacity", response_model=OpsCapacityResponse)
def get_capacity(x_ops_token: str | None = Header(default=None)):
    _authorize(x_ops_token)
    return OpsCapacityResponse(
        loaded_games=game_manager.loaded_games_count(),
        hot_games=game_manager.hot_games_count(),
        pending_games=len(game_manager._pending_games),
        sessions=session_manager.size(),
    )


@router.post("/runtime-reset")
async def reset_runtime_state(x_ops_token: str | None = Header(default=None)):
    _authorize(x_ops_token)
    connection_stats = await connection_manager.reset_runtime_state()
    game_stats = game_manager.reset_runtime_state()
    removed_sessions = session_manager.reset_all()
    return {
        "ok": True,
        "connections": connection_stats,
        "games": game_stats,
        "sessions_removed": removed_sessions,
    }

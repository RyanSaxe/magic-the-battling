"""HTTP route serving WebRTC ICE server credentials to active players in a game."""

from dataclasses import dataclass
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Header

import server.services.game_manager as game_manager_module
import server.services.session_manager as session_manager_module
from server import runtime_config
from server.errors import ErrorCode, api_error
from server.schemas.api import VoiceIceServersResponse
from server.services.voice_turn import fetch_ice_servers

router = APIRouter(prefix="/api/games", tags=["voice"])


@dataclass(frozen=True)
class VoiceTurnSettings:
    key_id: str
    api_token: str
    ttl_seconds: int
    transport: httpx.AsyncBaseTransport | None = None


def get_voice_turn_settings() -> VoiceTurnSettings:
    return VoiceTurnSettings(
        key_id=runtime_config.CLOUDFLARE_TURN_KEY_ID,
        api_token=runtime_config.CLOUDFLARE_TURN_API_TOKEN,
        ttl_seconds=runtime_config.CLOUDFLARE_TURN_TTL_SECONDS,
    )


@router.get("/{game_id}/voice/ice-servers")
async def get_voice_ice_servers(
    game_id: str,
    *,
    session_id: str | None = None,
    x_session_id: Annotated[str | None, Header(alias="X-Session-Id")] = None,
    settings: Annotated[VoiceTurnSettings, Depends(get_voice_turn_settings)],
) -> VoiceIceServersResponse:
    game_manager = game_manager_module.game_manager
    if not game_manager.is_loaded(game_id):
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, detail="Game not found")

    resolved_session_id = (x_session_id or session_id or "").strip()
    session = session_manager_module.session_manager.get_session(resolved_session_id) if resolved_session_id else None
    if session is None or session.game_id != game_id or not game_manager.holds_seat(game_id, session.player_id):
        raise api_error(403, ErrorCode.INVALID_SESSION, detail="Active player session required")

    ice_servers = await fetch_ice_servers(
        key_id=settings.key_id,
        api_token=settings.api_token,
        ttl_seconds=settings.ttl_seconds,
        transport=settings.transport,
    )
    return VoiceIceServersResponse(ice_servers=ice_servers)

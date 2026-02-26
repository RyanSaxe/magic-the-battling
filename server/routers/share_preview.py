import hashlib
import json
import logging
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session, joinedload

from server.db import database
from server.db.models import GameRecord, PlayerGameHistory
from server.routers.games import _build_human_snapshots, _build_puppet_snapshots
from server.schemas.api import ShareGameResponse, SharePlayerData
from server.services.preview import preview_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["share-preview"])

VALID_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
VALID_NAME_RE = re.compile(r"^[^/]{1,64}$")

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 10
_rate_limits: dict[str, list[float]] = defaultdict(list)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _check_rate_limit(client_ip: str) -> bool:
    now = time.monotonic()
    timestamps = _rate_limits[client_ip]
    _rate_limits[client_ip] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[client_ip]) >= RATE_LIMIT_MAX:
        return False
    _rate_limits[client_ip].append(now)
    return True


def _fetch_share_data(game_id: str, player_name: str, db: Session) -> ShareGameResponse | None:
    game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
    if not game_record:
        return None

    config = json.loads(str(game_record.config_json)) if game_record.config_json else {}
    use_upgrades = config.get("use_upgrades", True)

    histories = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.game_id == game_id)
        .all()
    )

    if not histories:
        return None

    owner_exists = any(str(h.player_name) == player_name for h in histories)
    if not owner_exists:
        return None

    if not game_record.shared:
        game_record.shared = True
        db.commit()

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


def _build_og_html(
    index_html: str, game_id: str, player_name: str, share_data: ShareGameResponse, base_url: str
) -> str:
    owner = next((p for p in share_data.players if p.name == share_data.owner_name), None)
    placement = ""
    if owner and owner.final_placement:
        ordinals = {1: "1st", 2: "2nd", 3: "3rd"}
        placement = f"{ordinals.get(owner.final_placement, f'{owner.final_placement}th')} Place - "

    title = f"{placement}{player_name}'s Game | Magic: The Battling"
    description = f"Check out {player_name}'s game with {len(share_data.players)} players"
    image_url = f"{base_url}/game/{game_id}/share/{player_name}/preview.png"

    og_tags = f"""
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:width" content="2400" />
    <meta property="og:image:height" content="1260" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{image_url}" />"""

    return index_html.replace("</head>", f"{og_tags}\n  </head>", 1)


@router.get("/game/{game_id}/share/{player_name}")
async def share_page_with_og(
    game_id: str,
    player_name: str,
    request: Request,
    db: Session = Depends(_get_db),  # noqa: B008
) -> Response:
    if not VALID_ID_RE.match(game_id) or not VALID_NAME_RE.match(player_name):
        return _serve_plain_index()

    share_data = _fetch_share_data(game_id, player_name, db)

    static_dir = Path(__file__).parent.parent.parent / "web" / "dist"
    index_path = static_dir / "index.html"
    if not index_path.exists():
        return Response(status_code=404)

    index_html = index_path.read_text()

    if not share_data:
        return HTMLResponse(content=index_html, headers={"Cache-Control": "no-cache"})

    data_json = share_data.model_dump_json()
    etag = hashlib.sha256(data_json.encode()).hexdigest()[:16]

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    base_url = str(request.base_url).rstrip("/")
    html = _build_og_html(index_html, game_id, player_name, share_data, base_url)
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "public, max-age=3600",
            "ETag": f'"{etag}"',
        },
    )


@router.get("/game/{game_id}/share/{player_name}/preview.png")
async def preview_image(
    game_id: str,
    player_name: str,
    request: Request,
    db: Session = Depends(_get_db),  # noqa: B008
) -> Response:
    if not VALID_ID_RE.match(game_id) or not VALID_NAME_RE.match(player_name):
        return Response(status_code=400)

    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        return Response(status_code=429, headers={"Retry-After": "60"})

    share_data = _fetch_share_data(game_id, player_name, db)
    if not share_data:
        return Response(status_code=404)

    data_json = share_data.model_dump_json()
    cache_key = preview_service.cache.cache_key(data_json)
    etag = cache_key[:16]

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    base_url = str(request.base_url).rstrip("/")
    embed_url = f"{base_url}/game/{game_id}/share/{player_name}/embed"

    try:
        png = await preview_service.screenshot(embed_url, cache_key)
    except Exception:
        logger.exception("Failed to generate preview for %s/%s", game_id, player_name)
        return Response(status_code=500)

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": f'"{etag}"',
        },
    )


def _serve_plain_index() -> Response:
    static_dir = Path(__file__).parent.parent.parent / "web" / "dist"
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text())
    return Response(status_code=404)

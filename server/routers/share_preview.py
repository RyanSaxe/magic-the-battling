import hashlib
import logging
import re
import time
from collections import OrderedDict
from collections.abc import Callable
from html import escape
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import GameRecord
from server.errors import AppHTTPException
from server.runtime_config import BEHIND_FLY_PROXY
from server.schemas.api import ShareGameResponse
from server.services.preview import cache_key as preview_cache_key
from server.services.preview import preview_service
from server.services.share import build_share_data

logger = logging.getLogger(__name__)

router = APIRouter(tags=["share-preview"])

VALID_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
VALID_NAME_RE = re.compile(r"^[^/]{1,64}$")

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 10
PREVIEW_RENDER_VERSION = "preview-v4"
INDEX_HTML = Path(__file__).parent.parent.parent / "web" / "dist" / "index.html"


class SlidingWindowRateLimiter:
    def __init__(self, *, window_seconds: float, max_requests: int, clock: Callable[[], float] = time.monotonic):
        self._window_seconds = window_seconds
        self._max_requests = max_requests
        self._clock = clock
        # Ordered by each client's latest allowed request, so clients idle for a whole window sit at the front.
        self._requests: OrderedDict[str, list[float]] = OrderedDict()

    def allow(self, client: str) -> bool:
        now = self._clock()
        while self._requests:
            oldest_client, oldest_times = next(iter(self._requests.items()))
            if now - oldest_times[-1] < self._window_seconds:
                break
            del self._requests[oldest_client]

        recent = [t for t in self._requests.get(client, []) if now - t < self._window_seconds]
        if len(recent) >= self._max_requests:
            self._requests[client] = recent
            return False
        recent.append(now)
        self._requests[client] = recent
        self._requests.move_to_end(client)
        return True

    def tracked_clients(self) -> int:
        return len(self._requests)


_preview_rate_limiter = SlidingWindowRateLimiter(window_seconds=RATE_LIMIT_WINDOW, max_requests=RATE_LIMIT_MAX)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _client_ip(request: Request) -> str:
    # uvicorn trusts every X-Forwarded-For entry, and a client can send its own, so behind
    # Fly use the address Fly's proxy saw instead.
    if BEHIND_FLY_PROXY and (fly_client_ip := request.headers.get("fly-client-ip")):
        return fly_client_ip
    return request.client.host if request.client else "unknown"


def _fetch_share_data(game_id: str, player_name: str, db: Session) -> ShareGameResponse | None:
    try:
        share_data = build_share_data(db, game_id, player_name)
    except AppHTTPException:
        return None
    # Mid-game the preview would show the sharer's last build without its hand, so previews wait for the game to end.
    if share_data.in_progress:
        return None

    # Share pages are public for finished games; this flag is bookkeeping for
    # "someone actively shared this game", not an authorization gate.
    db.query(GameRecord).filter(GameRecord.id == game_id, GameRecord.shared.isnot(True)).update(
        {GameRecord.shared: True}
    )
    db.commit()
    return share_data


_STATIC_OG_RE = re.compile(r"\s*<meta\s+(?:property=\"og:|name=\"twitter:)[^>]*/?\s*>\s*")


def _build_og_html(
    index_html: str, game_id: str, player_name: str, share_data: ShareGameResponse, base_url: str
) -> str:
    owner = next((p for p in share_data.players if p.name == share_data.owner_name), None)
    placement = ""
    if owner and owner.final_placement:
        ordinals = {1: "1st", 2: "2nd", 3: "3rd"}
        placement = f"{ordinals.get(owner.final_placement, f'{owner.final_placement}th')} Place - "

    title = escape(f"{placement}{player_name}'s Game | Pitfight", quote=True)
    description = escape(f"Check out {player_name}'s game with {len(share_data.players)} players", quote=True)
    encoded_name = quote(player_name, safe="")
    share_url = escape(f"{base_url}/game/{game_id}/share/{encoded_name}", quote=True)
    image_url = escape(f"{base_url}/game/{game_id}/share/{encoded_name}/preview.png", quote=True)

    html = _STATIC_OG_RE.sub("", index_html)

    og_tags = f"""
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:url" content="{share_url}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{image_url}" />"""

    return html.replace("</head>", f"{og_tags}\n  </head>", 1)


@router.get("/game/{game_id}/share/{player_name}")
async def share_page_with_og(
    game_id: str,
    player_name: str,
    request: Request,
    db: Session = Depends(_get_db),  # noqa: B008
) -> Response:
    if not VALID_ID_RE.match(game_id) or not VALID_NAME_RE.match(player_name):
        return serve_index(request)

    share_data = _fetch_share_data(game_id, player_name, db)
    if not share_data:
        return serve_index(request)

    if not INDEX_HTML.exists():
        return Response(status_code=404)

    index_html = INDEX_HTML.read_text()
    index_hash = hashlib.sha256(index_html.encode()).hexdigest()[:16]

    data_json = share_data.model_dump_json()
    etag_basis = f"{PREVIEW_RENDER_VERSION}:{index_hash}:{data_json}"
    etag = hashlib.sha256(etag_basis.encode()).hexdigest()[:16]

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    base_url = str(request.base_url).rstrip("/")
    html = _build_og_html(index_html, game_id, player_name, share_data, base_url)
    return HTMLResponse(
        content=html,
        headers={
            # HTML should always revalidate so hashed asset references do not go stale after deploys.
            "Cache-Control": "public, max-age=0, must-revalidate",
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

    if not _preview_rate_limiter.allow(_client_ip(request)):
        return Response(status_code=429, headers={"Retry-After": "60"})

    share_data = _fetch_share_data(game_id, player_name, db)
    if not share_data:
        return Response(status_code=404)

    data_json = share_data.model_dump_json()
    cache_basis = f"{PREVIEW_RENDER_VERSION}:{data_json}"
    ck = preview_cache_key(cache_basis)
    etag = ck[:16]

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    base_url = str(request.base_url).rstrip("/")
    embed_url = f"{base_url}/game/{game_id}/share/{player_name}/embed"

    try:
        png = await preview_service.screenshot(embed_url, ck)
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


def serve_index(request: Request) -> Response:
    """The app's page, whose link preview tags name the site and page it was requested at."""
    if not INDEX_HTML.exists():
        return Response(status_code=404)
    site_url = escape(str(request.base_url).rstrip("/"), quote=True)
    # request.url holds the decoded path, and a link needs it encoded.
    page_url = escape(str(request.url.replace(path=quote(request.scope["path"]))), quote=True)
    html = INDEX_HTML.read_text().replace("__SITE_URL__", site_url).replace("__PAGE_URL__", page_url)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache"})

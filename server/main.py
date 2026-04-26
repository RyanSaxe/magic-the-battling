import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request

from server.db.database import init_db
from server.errors import AppHTTPException, ErrorCode
from server.monitoring import start_monitoring, stop_monitoring
from server.observability import OBSERVABILITY_LOGGER_NAME, configure_logging, record_http_latency
from server.routers import auth, battlers, discover, games, ops, share_preview, ws
from server.runtime_config import MAX_SESSIONS_TOTAL, RESTORE_ACTIVE_GAME_SNAPSHOTS, SESSION_TTL_MINUTES
from server.schemas.api import ServerStatusResponse
from server.services.game_manager import game_manager
from server.services.ops_manager import ops_manager
from server.services.preview import preview_service
from server.services.session_manager import session_manager

configure_logging()
logger = logging.getLogger(OBSERVABILITY_LOGGER_NAME)


def _preview_disabled() -> bool:
    raw = os.getenv("MTB_DISABLE_PREVIEW", "")
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    if isinstance(route, APIRoute):
        return route.path
    return request.url.path


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ops_manager.load()
    if RESTORE_ACTIVE_GAME_SNAPSHOTS:
        game_manager.restore_all_snapshots()
    else:
        logging.getLogger(__name__).info("Active game snapshot restore disabled by MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS")
    if _preview_disabled():
        logging.getLogger(__name__).info("Preview service disabled by MTB_DISABLE_PREVIEW")
    start_monitoring()
    await game_manager.start_background_tasks()
    yield
    removed_sessions = session_manager.cleanup(SESSION_TTL_MINUTES, MAX_SESSIONS_TOTAL)
    if removed_sessions:
        logging.getLogger(__name__).info("Session cleanup before shutdown removed=%d", removed_sessions)
    await game_manager.stop_background_tasks()
    stop_monitoring()
    await preview_service.stop()


app = FastAPI(
    lifespan=lifespan,
    title="Crucible",
    description="Real-time multiplayer Magic: The Gathering draft format",
    version="0.1.0",
)


def _http_error_payload(exc: HTTPException) -> dict[str, str]:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code = getattr(exc, "code", None)
    if isinstance(exc, AppHTTPException):
        code = exc.code
    return {
        "detail": detail,
        "code": str(code or ErrorCode.UNKNOWN),
    }


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_http_error_payload(exc),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_exception(request: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0].get("msg") if exc.errors() else "Request validation failed"
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(first_error),
            "code": str(ErrorCode.INVALID_REQUEST),
        },
    )


_CANONICAL_HOST = os.getenv("MTB_CANONICAL_HOST", "")
_REDIRECT_EXEMPT_PATHS = {"/health", "/api/ops/mode"}


@app.middleware("http")
async def redirect_to_canonical_host(request: Request, call_next):
    if not _CANONICAL_HOST:
        return await call_next(request)
    host = (request.headers.get("host") or "").split(":")[0]
    if host != _CANONICAL_HOST and request.url.path not in _REDIRECT_EXEMPT_PATHS:
        target = request.url.replace(scheme="https", netloc=_CANONICAL_HOST)
        return RedirectResponse(url=str(target), status_code=301)
    return await call_next(request)


@app.middleware("http")
async def observe_http_requests(request: Request, call_next):
    start = perf_counter()
    request_id = request.headers.get("x-request-id", uuid4().hex[:12])
    method = request.method
    path = _route_template(request)

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (perf_counter() - start) * 1000
        record_http_latency(method, path, 500, duration_ms)
        logger.exception(
            "HTTP latency: request_id=%s method=%s path=%s status=%d duration_ms=%.2f",
            request_id,
            method,
            path,
            500,
            duration_ms,
        )
        raise

    duration_ms = (perf_counter() - start) * 1000
    status = response.status_code
    response.headers.setdefault("x-request-id", request_id)
    record_http_latency(method, path, status, duration_ms)
    logger.info(
        "HTTP latency: request_id=%s method=%s path=%s status=%d duration_ms=%.2f",
        request_id,
        method,
        path,
        status,
        duration_ms,
    )
    return response


app.add_middleware(GZipMiddleware, minimum_size=500)  # type: ignore[arg-type]
app.add_middleware(
    CORSMiddleware,  # type: ignore[arg-type]
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(battlers.router)
app.include_router(discover.router)
app.include_router(games.router)
app.include_router(ws.router)
app.include_router(share_preview.router)
app.include_router(ops.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/server/status", response_model=ServerStatusResponse)
def server_status():
    snapshot = ops_manager.get_snapshot()
    return ServerStatusResponse(
        mode=snapshot.mode,
        message=snapshot.message or "",
        updated_at=snapshot.updated_at.isoformat(),
        new_games_blocked=ops_manager.blocks_new_games(),
        scheduled_for_utc=ops_manager.scheduled_for_utc_iso(),
        estimated_recovery_minutes=ops_manager.estimated_recovery_minutes(),
    )


static_dir = Path(__file__).parent.parent / "web" / "dist"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.svg")
    async def favicon():
        return FileResponse(static_dir / "favicon.svg")

    @app.get("/og-image.png")
    async def og_image():
        return FileResponse(static_dir / "og-image.png", media_type="image/png")

    @app.get("/icon-192.png")
    async def icon_192():
        return FileResponse(static_dir / "icon-192.png", media_type="image/png")

    @app.get("/icon-512.png")
    async def icon_512():
        return FileResponse(static_dir / "icon-512.png", media_type="image/png")

    @app.get("/apple-touch-icon.png")
    async def apple_touch_icon():
        return FileResponse(static_dir / "apple-touch-icon.png", media_type="image/png")

    @app.get("/site.webmanifest")
    async def webmanifest():
        return FileResponse(static_dir / "site.webmanifest", media_type="application/manifest+json")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        return FileResponse(static_dir / "index.html")

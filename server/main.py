import logging
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request

from server.db.database import init_db
from server.monitoring import start_monitoring, stop_monitoring
from server.observability import OBSERVABILITY_LOGGER_NAME, configure_logging, record_http_latency
from server.routers import games, share_preview, ws
from server.services.preview import preview_service

configure_logging()
logger = logging.getLogger(OBSERVABILITY_LOGGER_NAME)


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    if isinstance(route, APIRoute):
        return route.path
    return request.url.path


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await preview_service.start()
    start_monitoring()
    yield
    stop_monitoring()
    await preview_service.stop()


app = FastAPI(
    lifespan=lifespan,
    title="Magic: The Battling",
    description="Real-time multiplayer Magic: The Gathering draft game",
    version="0.1.0",
)


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

app.include_router(games.router)
app.include_router(ws.router)
app.include_router(share_preview.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


static_dir = Path(__file__).parent.parent / "web" / "dist"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.svg")
    async def favicon():
        return FileResponse(static_dir / "favicon.svg")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        return FileResponse(static_dir / "index.html")

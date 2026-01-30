from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.db.database import init_db
from server.routers import games, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Magic: The Battling",
    description="Real-time multiplayer Magic: The Gathering draft game",
    version="0.1.0",
)

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


@app.get("/health")
def health_check():
    return {"status": "ok"}


static_dir = Path(__file__).parent.parent / "web" / "dist"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/vite.svg")
    async def vite_svg():
        return FileResponse(static_dir / "vite.svg")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        return FileResponse(static_dir / "index.html")

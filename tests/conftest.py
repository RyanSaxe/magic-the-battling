import asyncio
import json
from collections.abc import Callable
from queue import Empty
from time import monotonic
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import close_all_sessions, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import WebSocketTestSession

import server.db.database as db_module
import server.main as main_module
import server.monitoring as monitoring_module
import server.routers.games as games_module
import server.routers.ops as ops_module
import server.routers.ws as ws_module
import server.services.game_manager as gm_module
import server.services.session_manager as sm_module
from mtb.models.card_registry import clear_registry
from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID, Card
from mtb.models.game import Player
from server.db.models import Base
from server.main import app
from server.routers.ws import ConnectionManager
from server.services.game_manager import GameManager
from server.services.session_manager import SessionManager

WS_MESSAGE_TIMEOUT_SECONDS = 1.0


@pytest.fixture(autouse=True)
def _disable_ws_compression(monkeypatch):
    monkeypatch.setattr("server.compression.WS_COMPRESSION_ENABLED", False)


def _unique_objects[T](objects: list[T]) -> list[T]:
    seen: set[int] = set()
    unique: list[T] = []
    for obj in objects:
        obj_id = id(obj)
        if obj_id in seen:
            continue
        seen.add(obj_id)
        unique.append(obj)
    return unique


def _cancel_task(task: asyncio.Task | None) -> None:
    if task is not None and not task.done():
        task.cancel()


def _cleanup_game_manager(game_manager: GameManager) -> None:
    _cancel_task(game_manager._snapshot_task)
    game_manager._snapshot_task = None

    for pending in list(game_manager._pending_games.values()):
        _cancel_task(pending._loading_task)
        pending._loading_task = None
        for player_battler in pending.player_battlers.values():
            _cancel_task(player_battler._loading_task)
            player_battler._loading_task = None

    for task in list(game_manager._cleanup_tasks.values()):
        _cancel_task(task)
    for task in list(game_manager._pending_disconnect_tasks.values()):
        _cancel_task(task)

    game_manager._pending_games.clear()
    game_manager._active_games.clear()
    game_manager._player_to_game.clear()
    game_manager._player_id_to_name.clear()
    game_manager._join_code_to_game.clear()
    game_manager._cleanup_tasks.clear()
    game_manager._pending_disconnect_tasks.clear()
    game_manager._spectate_requests.clear()
    game_manager._dirty_games.clear()
    game_manager._last_human_activity.clear()
    game_manager._connected_humans.clear()
    game_manager._action_locks.clear()
    game_manager._game_starts_in_flight = 0
    game_manager._game_start_waiters = 0


def _cleanup_connection_manager(connection_manager: ConnectionManager) -> None:
    connection_manager._connections.clear()
    connection_manager._pending_connections.clear()
    connection_manager._spectators.clear()


def _cleanup_runtime_state() -> None:
    game_managers = _unique_objects(
        [
            gm_module.game_manager,
            ws_module.game_manager,
            games_module.game_manager,
            ops_module.game_manager,
            main_module.game_manager,
            monitoring_module.game_manager,
        ]
    )
    for game_manager in game_managers:
        _cleanup_game_manager(game_manager)

    session_managers = _unique_objects(
        [
            sm_module.session_manager,
            gm_module.session_manager,
            ws_module.session_manager,
            games_module.session_manager,
            ops_module.session_manager,
            main_module.session_manager,
            monitoring_module.session_manager,
        ]
    )
    for session_manager in session_managers:
        session_manager.reset_all()

    connection_managers = _unique_objects(
        [
            ws_module.connection_manager,
            games_module.connection_manager,
            ops_module.connection_manager,
            monitoring_module.connection_manager,
        ]
    )
    for connection_manager in connection_managers:
        _cleanup_connection_manager(connection_manager)

    games_module._create_idempotency_cache.clear()
    games_module._create_idempotency_inflight.clear()
    games_module._create_idempotency_lock = asyncio.Lock()

    monitoring_module.stop_monitoring()


def _install_runtime_state(
    game_manager: GameManager,
    session_manager: SessionManager,
    connection_manager: ConnectionManager,
) -> None:
    sm_module.session_manager = session_manager
    gm_module.session_manager = session_manager
    ws_module.session_manager = session_manager
    games_module.session_manager = session_manager
    ops_module.session_manager = session_manager
    main_module.session_manager = session_manager
    monitoring_module.session_manager = session_manager

    gm_module.game_manager = game_manager
    ws_module.game_manager = game_manager
    games_module.game_manager = game_manager
    ops_module.game_manager = game_manager
    main_module.game_manager = game_manager
    monitoring_module.game_manager = game_manager

    ws_module.connection_manager = connection_manager
    games_module.connection_manager = connection_manager
    ops_module.connection_manager = connection_manager
    monitoring_module.connection_manager = connection_manager


def _reset_runtime_state() -> None:
    _cleanup_runtime_state()

    session_manager = SessionManager()
    gm_module.session_manager = session_manager
    game_manager = GameManager()
    connection_manager = ConnectionManager()
    _install_runtime_state(game_manager, session_manager, connection_manager)


def setup_battle_ready(player: Player, basics: list[str] | None = None) -> None:
    """Set up a player as ready for battle phase."""
    player.phase = "battle"
    player.chosen_basics = basics or ["Plains", "Island", "Mountain"]


@pytest.fixture
def card_factory():
    def _card(name: str, type_line: str = "Creature", **kwargs) -> Card:
        return Card(name=name, image_url="image", id=name, type_line=type_line, **kwargs)

    return _card


@pytest.fixture
def upgrade_factory(card_factory):
    def _upgrade(name: str) -> Card:
        return card_factory(name, type_line="Conspiracy")

    return _upgrade


@pytest.fixture(autouse=True)
def reset_singletons():
    """Install fresh runtime singletons everywhere the app imported them."""
    _reset_runtime_state()
    clear_registry()
    yield
    _reset_runtime_state()
    clear_registry()


@pytest.fixture
def mock_cube_data(card_factory, upgrade_factory, monkeypatch):
    """Mock cubecobra to avoid network calls."""

    def _mock(cube_id: str):
        if cube_id == DEFAULT_UPGRADES_ID:
            return [upgrade_factory(f"upgrade{i}") for i in range(8)]
        if cube_id == DEFAULT_VANGUARD_ID:
            return []
        return [card_factory(f"card{i}") for i in range(120)]

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", _mock)


@pytest.fixture
def test_db():
    """Create an in-memory SQLite database for testing."""
    original_engine = db_module.engine
    original_session_local = db_module.SessionLocal
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db_module.engine = engine
    db_module.SessionLocal = testing_session_local

    Base.metadata.create_all(bind=engine)
    try:
        yield
    finally:
        _cleanup_runtime_state()
        close_all_sessions()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        db_module.engine = original_engine
        db_module.SessionLocal = original_session_local


@pytest.fixture
def client(mock_cube_data, test_db):
    with TestClient(app) as client:
        yield client


def _receive_ws_message(websocket: WebSocketTestSession, timeout: float) -> dict[str, Any]:
    try:
        message = websocket._send_queue.get(timeout=timeout)
    except Empty as exc:
        raise AssertionError(f"Timed out waiting {timeout:.2f}s for websocket message") from exc
    if isinstance(message, BaseException):
        raise message
    return dict(message)


@pytest.fixture
def ws_receive_json():
    def _receive(websocket: WebSocketTestSession, *, timeout: float = WS_MESSAGE_TIMEOUT_SECONDS) -> Any:
        message = _receive_ws_message(websocket, timeout)
        websocket._raise_on_close(message)
        return json.loads(message["text"])

    return _receive


@pytest.fixture
def ws_receive_json_until(ws_receive_json):
    def _receive_until(
        websocket: WebSocketTestSession,
        predicate: Callable[[Any], bool],
        *,
        timeout: float = WS_MESSAGE_TIMEOUT_SECONDS,
        description: str = "matching websocket message",
    ) -> Any:
        deadline = monotonic() + timeout
        seen: list[Any] = []

        while True:
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise AssertionError(f"Timed out waiting for {description}; saw {seen!r}")

            message = ws_receive_json(websocket, timeout=remaining)
            seen.append(message)
            if predicate(message):
                return message

    return _receive_until


@pytest.fixture
def game_with_players(client):
    """Create game with 2 players, return credentials."""
    r1 = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2},
    )
    d1 = r1.json()
    r2 = client.post("/api/games/join", json={"join_code": d1["join_code"], "player_name": "Bob"})
    d2 = r2.json()
    return {
        "game_id": d1["game_id"],
        "join_code": d1["join_code"],
        "alice": {"session_id": d1["session_id"], "player_id": d1["player_id"]},
        "bob": {"session_id": d2["session_id"], "player_id": d2["player_id"]},
    }

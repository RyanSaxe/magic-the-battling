import asyncio
import json
from collections.abc import Callable, Generator
from time import monotonic
from typing import Any, Never

import anyio
import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, close_all_sessions, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import WebSocketTestSession

import server.db.database as db_module
import server.main as main_module
import server.monitoring as monitoring_module
import server.routers.games as games_module
import server.routers.ops as ops_module
import server.routers.ws as ws_module
import server.services.game.state as game_state_module
import server.services.game_manager as gm_module
import server.services.session_manager as sm_module
from mtb.models.card_registry import clear_registry
from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID, Card
from mtb.models.game import Game, Player
from server.db.models import Base
from server.main import app
from server.services.connection_manager import ConnectionManager
from server.services.game.models import CancellableTask
from server.services.game_manager import GameManager
from server.services.session_manager import SessionManager

WS_MESSAGE_TIMEOUT_SECONDS = 1.0


@pytest.fixture(autouse=True)
def _disable_ws_compression(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("server.compression.WS_COMPRESSION_ENABLED", False)


@pytest.fixture(autouse=True)
def _no_default_cube_fetch_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main_module, "start_loading_default_cube", lambda: None)


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


def _cancel_task(task: CancellableTask | None) -> None:
    if task is not None and not task.done():
        task.cancel()


def _cleanup_game_manager(game_manager: GameManager) -> None:
    game_manager.clear_all_state()


def _cleanup_connection_manager(connection_manager: ConnectionManager) -> None:
    connection_manager.clear_all_connections()


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
            game_state_module.session_manager,
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

    games_module._create_idempotency_cache.clear()  # noqa: SLF001 -- internal state inspected by test
    games_module._create_idempotency_inflight.clear()  # noqa: SLF001 -- internal state inspected by test
    games_module._create_idempotency_lock = asyncio.Lock()  # noqa: SLF001 -- internal state inspected by test

    monitoring_module.stop_monitoring()


def _install_runtime_state(
    game_manager: GameManager,
    session_manager: SessionManager,
    *,
    connection_manager: ConnectionManager,
) -> None:
    sm_module.session_manager = session_manager
    game_state_module.session_manager = session_manager
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
    game_manager.attach_connected_player_ids(connection_manager.get_connected_player_ids)
    game_manager.attach_spectate_listener(connection_manager)
    games_module.connection_manager = connection_manager
    ops_module.connection_manager = connection_manager
    monitoring_module.connection_manager = connection_manager


def _reset_runtime_state() -> None:
    _cleanup_runtime_state()

    session_manager = SessionManager()
    game_state_module.session_manager = session_manager
    game_manager = GameManager()
    connection_manager = ConnectionManager(game_manager)
    _install_runtime_state(game_manager, session_manager, connection_manager=connection_manager)


def setup_battle_ready(player: Player, basics: list[str] | None = None) -> None:
    """Set up a player as ready for battle phase."""
    player.phase = "battle"
    player.chosen_basics = basics or ["Plains", "Island", "Mountain"]


@pytest.fixture
def card_factory() -> Callable[..., Card]:
    def _card(name: str, type_line: str = "Creature", **kwargs: Any) -> Card:  # noqa: ANN401 -- forwards Card kwargs
        return Card(name=name, image_url="image", id=name, type_line=type_line, **kwargs)

    return _card


@pytest.fixture
def upgrade_factory(card_factory: Callable[..., Card]) -> Callable[[str], Card]:
    def _upgrade(name: str) -> Card:
        return card_factory(name, type_line="Conspiracy")

    return _upgrade


@pytest.fixture(autouse=True)
def reset_singletons() -> Generator[None]:
    """Install fresh runtime singletons everywhere the app imported them."""
    _reset_runtime_state()
    clear_registry()
    yield
    _reset_runtime_state()
    clear_registry()


@pytest.fixture(autouse=True)
def offline_cubecobra(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail every cached JSON fetch, such as CubeCobra's cube JSON, unless a test answers it."""

    def _no_network(url: str) -> Never:
        raise LookupError(url)

    monkeypatch.setattr("mtb.utils.json_helpers.get_json", _no_network)


@pytest.fixture
def mock_cube_data(
    card_factory: Callable[..., Card], upgrade_factory: Callable[[str], Card], *, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mock cubecobra to avoid network calls."""

    def _mock(cube_id: str) -> list[Card]:
        if cube_id == DEFAULT_UPGRADES_ID:
            return [upgrade_factory(f"upgrade{i}") for i in range(8)]
        if cube_id == DEFAULT_VANGUARD_ID:
            return []
        return [card_factory(f"card{i}") for i in range(120)]

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", _mock)


@pytest.fixture
def test_db() -> Generator[None]:
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
def client(mock_cube_data: None, test_db: None) -> Generator[TestClient]:
    _ = (mock_cube_data, test_db)
    with TestClient(app) as client:
        yield client


async def _receive_ws_with_timeout(websocket: WebSocketTestSession, wait_seconds: float) -> dict[str, Any]:
    with anyio.fail_after(wait_seconds):
        return dict(await websocket._send_rx.receive())  # noqa: SLF001 -- Starlette test WS queue


def _receive_ws_message(websocket: WebSocketTestSession, timeout: float) -> dict[str, Any]:
    try:
        message = websocket.portal.call(_receive_ws_with_timeout, websocket, timeout)
    except TimeoutError as exc:
        msg = f"Timed out waiting {timeout:.2f}s for websocket message"
        raise AssertionError(msg) from exc
    return dict(message)


@pytest.fixture
def ws_receive_json() -> Callable[..., dict[str, Any]]:
    def _receive(websocket: WebSocketTestSession, *, timeout: float = WS_MESSAGE_TIMEOUT_SECONDS) -> dict[str, Any]:
        message = _receive_ws_message(websocket, timeout)
        websocket._raise_on_close(message)  # noqa: SLF001 -- internal state inspected by test
        return json.loads(message["text"])

    return _receive


@pytest.fixture
def ws_receive_json_until(ws_receive_json: Callable[..., dict[str, Any]]) -> Callable[..., dict[str, Any]]:
    def _receive_until(
        websocket: WebSocketTestSession,
        predicate: Callable[[Any], bool],
        *,
        timeout: float = WS_MESSAGE_TIMEOUT_SECONDS,
        description: str = "matching websocket message",
    ) -> dict[str, Any]:
        deadline = monotonic() + timeout
        seen: list[Any] = []

        while True:
            remaining = deadline - monotonic()
            if remaining <= 0:
                msg = f"Timed out waiting for {description}; saw {seen!r}"
                raise AssertionError(msg)

            message = ws_receive_json(websocket, timeout=remaining)
            seen.append(message)
            if predicate(message):
                return message

    return _receive_until


@pytest.fixture
def game_with_players(client: TestClient) -> dict[str, Any]:
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
        "alice": {"session_id": d1["session_id"], "player_id": d1["player_id"], "seat_token": d1["seat_token"]},
        "bob": {"session_id": d2["session_id"], "player_id": d2["player_id"], "seat_token": d2["seat_token"]},
    }


async def _no_broadcast() -> None:
    pass


@pytest.fixture
def start_game_now() -> Callable[..., Game]:
    """Ready every player in a lobby, then start it through GameManager as its host."""

    def _start(manager: GameManager, game_id: str, *, db: Session | None = None) -> Game:
        pending = manager.get_pending_game(game_id)
        assert pending is not None
        for player_id in pending.player_ids:
            ready, error = manager.set_player_ready(game_id, player_id, is_ready=True)
            assert ready, error
        return asyncio.run(manager.start_lobby(game_id, pending.host_player_id, db=db, on_change=_no_broadcast))

    return _start


@pytest.fixture
def start_lobby(client: TestClient) -> Callable[[str, str], Response]:
    """Ready every player in a lobby, then start it through the HTTP route as its host."""

    def _start(game_id: str, host_session_id: str) -> Response:
        pending = games_module.game_manager.get_pending_game(game_id)
        assert pending is not None
        for player_id in pending.player_ids:
            games_module.game_manager.set_player_ready(game_id, player_id, is_ready=True)
        return client.post(f"/api/games/{game_id}/start", params={"session_id": host_session_id})

    return _start

import asyncio
import threading
from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, close_all_sessions, sessionmaker

import server.db.database as db_module
from pitfight.models.cards import Battler, Card
from pitfight.models.game import create_game, set_battler
from server.db.models import ActiveGameSnapshot, GameRecord, QuarantinedGameSnapshot
from server.services.game_manager import GameManager


async def _no_broadcast() -> None:
    pass


def _make_battler() -> Battler:
    cards = [Card(name=f"card-{i}", image_url="img", id=f"card-{i}", type_line="Creature") for i in range(120)]
    return Battler(cards=cards, upgrades=[], vanguards=[])


@pytest.fixture
def file_sqlite_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Engine]:
    db_file = tmp_path / "concurrency.db"
    file_engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    db_module.configure_sqlite_pragmas(file_engine)
    file_session_local = sessionmaker(autocommit=False, autoflush=False, bind=file_engine)

    # ast-grep-ignore: python.question-monkeypatch -- services read module-level database.engine/SessionLocal
    monkeypatch.setattr(db_module, "engine", file_engine)
    # ast-grep-ignore: python.question-monkeypatch -- services read module-level database.engine/SessionLocal
    monkeypatch.setattr(db_module, "SessionLocal", file_session_local)
    db_module.init_db()
    try:
        yield file_engine
    finally:
        close_all_sessions()
        file_engine.dispose()


def _read_pragmas(engine: Engine) -> dict[str, int | str]:
    with engine.connect() as conn:
        return {
            "journal_mode": str(conn.execute(text("PRAGMA journal_mode")).scalar_one()).lower(),
            "busy_timeout": int(conn.execute(text("PRAGMA busy_timeout")).scalar_one()),
            "synchronous": int(conn.execute(text("PRAGMA synchronous")).scalar_one()),
            "temp_store": int(conn.execute(text("PRAGMA temp_store")).scalar_one()),
            "cache_size": int(conn.execute(text("PRAGMA cache_size")).scalar_one()),
        }


async def _start_lobby_game(manager: GameManager, idx: int) -> str:
    pending = manager.create_game(f"Host{idx}", f"host-pid-{idx}", cube_id="test", target_player_count=2)
    manager.join_game(pending.join_code, f"Guest{idx}", player_id=f"guest-pid-{idx}")
    for pid in pending.player_ids:
        manager.set_player_ready(pending.game_id, pid, is_ready=True)
    await manager.start_lobby(pending.game_id, f"host-pid-{idx}", persist=True, on_change=_no_broadcast)
    return pending.game_id


async def _write_snapshot_rounds(manager: GameManager, game_ids: list[str], *, rounds: int) -> None:
    for _ in range(rounds):
        for gid in game_ids:
            manager.mark_game_dirty(gid)
        await manager.persist_dirty_games_async()


async def _read_snapshot_rounds(manager: GameManager, game_ids: list[str], *, rounds: int) -> None:
    for i in range(rounds):
        gid = game_ids[i % len(game_ids)]
        assert await manager.has_game_async(gid) is True


async def _write_records_off_loop(worker: int, *, count: int) -> None:
    def _write_rows() -> None:
        for step in range(count):
            with db_module.SessionLocal() as session:
                session.add(GameRecord(id=f"concurrent-{worker}-{step}", cube_id="test"))
                session.commit()

    await asyncio.to_thread(_write_rows)


def test_default_engine_registers_sqlite_connect_listener() -> None:
    assert db_module.engine.url.get_backend_name() == "sqlite"
    assert event.contains(db_module.engine, "connect", db_module.apply_sqlite_pragmas)


def test_every_fresh_sqlite_connection_receives_pragmas(file_sqlite_db: Engine) -> None:
    expected = {
        "journal_mode": "wal",
        "busy_timeout": 5000,
        "synchronous": 1,
        "temp_store": 2,
        "cache_size": -16000,
    }
    assert _read_pragmas(file_sqlite_db) == expected

    # Hold two pooled connections open at once so SQLAlchemy must open a brand-new DBAPI connection.
    with file_sqlite_db.connect() as first_conn, file_sqlite_db.connect() as second_conn:
        for conn in (first_conn, second_conn):
            assert int(conn.execute(text("PRAGMA busy_timeout")).scalar_one()) == 5000
            assert int(conn.execute(text("PRAGMA synchronous")).scalar_one()) == 1
            assert int(conn.execute(text("PRAGMA temp_store")).scalar_one()) == 2
            assert int(conn.execute(text("PRAGMA cache_size")).scalar_one()) == -16000


def test_concurrent_async_reads_and_writes_succeed_without_lock_errors(
    file_sqlite_db: Engine,
    mock_cube_data: None,
) -> None:
    _ = (file_sqlite_db, mock_cube_data)
    manager = GameManager()
    battler = _make_battler()

    seed_ids = [f"seed-game-{i}" for i in range(8)]
    for game_id in seed_ids:
        game = create_game(["Alice", "Bob"], num_players=2)
        set_battler(game, battler.model_copy(update={"cards": list(battler.cards)}))
        manager.active_games[game_id] = game
        manager.mark_game_dirty(game_id)

    async def scenario() -> None:
        started_tasks = [_start_lobby_game(manager, i) for i in range(4)]
        await asyncio.gather(
            *started_tasks,
            *(_write_snapshot_rounds(manager, seed_ids, rounds=6) for _ in range(3)),
            *(_read_snapshot_rounds(manager, seed_ids, rounds=15) for _ in range(3)),
            *(_write_records_off_loop(w, count=10) for w in range(4)),
            manager.cleanup_stale_game_records_async(),
        )
        await manager.persist_all_games_async()

    asyncio.run(scenario())

    with db_module.SessionLocal() as session:
        assert session.query(ActiveGameSnapshot).count() == len(seed_ids) + 4
        assert session.query(GameRecord).count() == 4 + 40


def test_async_snapshot_flush_does_not_block_event_loop(
    file_sqlite_db: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = file_sqlite_db
    manager = GameManager()
    game = create_game(["Alice", "Bob"], num_players=2)
    set_battler(game, _make_battler())
    manager.active_games["slow-write"] = game
    manager.mark_game_dirty("slow-write")

    entered_worker = threading.Event()
    release_worker = threading.Event()
    real_session_local = db_module.SessionLocal

    def gated_session_local() -> Session:
        entered_worker.set()
        assert release_worker.wait(timeout=5.0)
        return real_session_local()

    # ast-grep-ignore: python.question-monkeypatch -- parks the worker thread to observe event-loop progress
    monkeypatch.setattr(db_module, "SessionLocal", gated_session_local)

    async def scenario() -> int:
        ticks = 0
        try:
            flush_task = asyncio.create_task(manager.persist_dirty_games_async())
            while not entered_worker.is_set():  # noqa: ASYNC110 -- waits for worker thread entry
                await asyncio.sleep(0.005)
            # While the DB worker thread is parked on release_worker, the event loop keeps ticking freely.
            for _ in range(5):
                await asyncio.sleep(0.005)
                ticks += 1
            release_worker.set()
            wrote = await flush_task
            assert wrote == 1
            return ticks
        finally:
            release_worker.set()

    assert asyncio.run(scenario()) == 5


def test_restore_all_snapshots_quarantines_corrupt_rows_off_event_loop(file_sqlite_db: Engine) -> None:
    _ = file_sqlite_db
    game = create_game(["Alice"], num_players=1)
    set_battler(game, _make_battler())
    now = datetime.now(UTC)

    with db_module.SessionLocal() as session:
        session.add(
            ActiveGameSnapshot(
                game_id="valid-game",
                state_json=game.snapshot_dump_json(),
                last_human_activity_at=now,
                updated_at=now,
            )
        )
        session.add(
            ActiveGameSnapshot(
                game_id="corrupt-game",
                state_json="{not valid json",
                last_human_activity_at=now,
                updated_at=now,
            )
        )
        session.commit()

    manager = GameManager()
    restored = asyncio.run(manager.restore_all_snapshots())

    assert restored == 1
    assert manager.get_game("valid-game") is not None
    assert manager.get_game("corrupt-game") is None
    with db_module.SessionLocal() as session:
        assert session.get(ActiveGameSnapshot, "corrupt-game") is None
        quarantined = session.query(QuarantinedGameSnapshot).filter_by(game_id="corrupt-game").first()
        assert quarantined is not None

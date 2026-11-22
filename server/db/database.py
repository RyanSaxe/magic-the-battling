# ruff: noqa: PLC0415
import json
import logging
import os
from pathlib import Path
from typing import Any, cast

from sqlalchemy import ColumnElement, Index, create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

from server.db.models import LOWERCASE_UNIQUE_USER_INDEXES, Base

if db_path := os.getenv("DATABASE_PATH"):
    DATA_DIR = Path(db_path).parent
    DATA_DIR.mkdir(exist_ok=True)
    DATABASE_URL = f"sqlite:///{db_path}"
else:
    DATA_DIR = Path(__file__).parent.parent.parent / "data"
    DATA_DIR.mkdir(exist_ok=True)
    DATABASE_URL = f"sqlite:///{DATA_DIR}/mtb.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _get_columns(conn, table: str) -> set[str]:
    result = conn.execute(text(f"PRAGMA table_info({table})"))
    return {row[1] for row in result}


def _migrate(conn, table: str, column: str, col_type: str, default: str | None = None) -> None:
    columns = _get_columns(conn, table)
    if column not in columns:
        ddl = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
        if default is not None:
            ddl += f" DEFAULT {default}"
        conn.execute(text(ddl))
        conn.commit()


def _migrate_rename_column(conn, table: str, old_col: str, new_col: str) -> None:
    columns = _get_columns(conn, table)
    if old_col in columns and new_col not in columns:
        conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN {old_col} TO {new_col}"))
        conn.commit()


def init_db():
    _migrate_rename_column_pre_create()
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.execute(text("PRAGMA busy_timeout=5000"))
        conn.commit()

    with engine.connect() as conn:
        _migrate(conn, "battle_snapshots", "poison", "INTEGER")
        _migrate(conn, "player_game_history", "is_puppet", "BOOLEAN", "0")
        _migrate(conn, "player_game_history", "source_history_id", "INTEGER")
        _migrate(conn, "player_game_history", "poison_history_json", "TEXT")
        _migrate(conn, "battle_snapshots", "play_draw_preference", "TEXT")
        _migrate(conn, "games", "shared", "BOOLEAN", "0")

        _migrate(conn, "games", "cube_id", "TEXT")
        _migrate(conn, "game_players", "user_id", "TEXT")
        _migrate(conn, "game_players", "seat_token_hash", "TEXT")
        _migrate(conn, "player_game_history", "user_id", "TEXT")
        _migrate(conn, "player_game_history", "final_poison", "INTEGER")
        _migrate(conn, "player_game_history", "final_treasures", "INTEGER")
        _migrate(conn, "battle_snapshots", "opponent_name", "TEXT")
        _migrate(conn, "battle_snapshots", "sudden_death_build", "INTEGER")

    _add_lowercase_user_indexes()
    _backfill_game_cube_ids()
    _backfill_cube_metadata()


def _add_lowercase_user_indexes() -> None:
    """Add every index in LOWERCASE_UNIQUE_USER_INDEXES that's missing, or none if some accounts break one of them."""
    with engine.connect() as conn:
        existing = set(conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'index'")).scalars())
        missing = [index for index in LOWERCASE_UNIQUE_USER_INDEXES if index.name not in existing]
        if not missing:
            return
        # pysqlite opens a transaction only before INSERT, UPDATE or DELETE, so without this the check and each
        # CREATE INDEX would commit on their own.
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        clashes = {index.name: _count_case_clashes(conn, index) for index in missing}
        if any(clashes.values()):
            conn.rollback()
            logging.getLogger(__name__).error(
                "Did not create %s: some accounts differ only by case (%s). Sign-up and login still ignore case.",
                " or ".join(str(name) for name in clashes),
                ", ".join(f"{name}: {count} group(s)" for name, count in clashes.items()),
            )
            return
        for index in missing:
            index.create(conn)
        conn.commit()


def _count_case_clashes(conn, index: Index) -> int:
    lowered = cast(ColumnElement[Any], index.expressions[0])
    clashing = select(lowered).group_by(lowered).having(func.count(lowered) > 1).subquery()
    return conn.execute(select(func.count()).select_from(clashing)).scalar_one()


def _backfill_game_cube_ids() -> None:
    logger = logging.getLogger(__name__)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, config_json FROM games WHERE cube_id IS NULL AND config_json IS NOT NULL")
        ).fetchall()
        if not rows:
            return
        count = 0
        for row in rows:
            try:
                config = json.loads(row[1])
                cube_id = config.get("cube_id")
                if cube_id:
                    conn.execute(
                        text("UPDATE games SET cube_id = :cube_id WHERE id = :id"), {"cube_id": cube_id, "id": row[0]}
                    )
                    count += 1
            except (json.JSONDecodeError, KeyError):
                pass
        conn.commit()
        if count:
            logger.info("Backfilled cube_id on %d game records", count)


def save_cube_metadata(cube_id: str) -> None:
    """Persist cube name and image from the CubeCobra JSON cache (no extra fetch if already cached)."""
    logger = logging.getLogger(__name__)
    try:
        from mtb.utils.json_helpers import get_json

        url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"
        data = get_json(url)
        name = data.get("name")
        image = data.get("image", {})
        image_uri = image.get("uri") if isinstance(image, dict) else None
        with engine.connect() as conn:
            conn.execute(
                text(
                    "INSERT OR REPLACE INTO cube_metadata (cube_id, name, image_uri, updated_at) "
                    "VALUES (:cube_id, :name, :image_uri, datetime('now'))"
                ),
                {"cube_id": cube_id, "name": name, "image_uri": image_uri},
            )
            conn.commit()
    except Exception:
        logger.debug("Could not save cube metadata for %s", cube_id)


def _backfill_cube_metadata() -> None:
    logger = logging.getLogger(__name__)
    with engine.connect() as conn:
        existing = {row[0] for row in conn.execute(text("SELECT cube_id FROM cube_metadata")).fetchall()}
        game_cubes = {
            row[0]
            for row in conn.execute(text("SELECT DISTINCT cube_id FROM games WHERE cube_id IS NOT NULL")).fetchall()
        }
        follow_cubes = {
            row[0]
            for row in conn.execute(
                text("SELECT DISTINCT cube_id FROM battler_follows WHERE cube_id IS NOT NULL")
            ).fetchall()
        }
        battler_cubes = {
            row[0]
            for row in conn.execute(
                text("SELECT DISTINCT cube_id FROM user_battlers WHERE cube_id IS NOT NULL")
            ).fetchall()
        }
        missing = (game_cubes | follow_cubes | battler_cubes) - existing
        if not missing:
            return

        logger.info("Backfilling cube metadata for %d cube(s)", len(missing))
        from mtb.utils.json_helpers import get_json

        count = 0
        for cube_id in missing:
            try:
                url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"
                data = get_json(url)
                name = data.get("name")
                image = data.get("image", {})
                image_uri = image.get("uri") if isinstance(image, dict) else None
                conn.execute(
                    text(
                        "INSERT INTO cube_metadata (cube_id, name, image_uri, updated_at) "
                        "VALUES (:cube_id, :name, :image_uri, datetime('now'))"
                    ),
                    {"cube_id": cube_id, "name": name, "image_uri": image_uri},
                )
                count += 1
            except Exception:
                logger.warning("Failed to fetch metadata for cube %s", cube_id)
        conn.commit()
        if count:
            logger.info("Backfilled metadata for %d cube(s)", count)


def _migrate_rename_column_pre_create() -> None:
    """Run column renames before SQLAlchemy creates tables, so existing DBs are migrated."""
    with engine.connect() as conn:
        _migrate_rename_column(conn, "player_game_history", "is_bot", "is_puppet")
        _migrate_rename_column(conn, "game_players", "is_bot", "is_puppet")

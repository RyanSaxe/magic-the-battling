"""Legacy preset cube ID migration helpers."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from typing import TYPE_CHECKING

from sqlalchemy import MetaData, Table
from sqlalchemy.dialects import sqlite
from sqlalchemy.schema import CreateIndex, CreateTable

from server.db.models import User, UserBattler

if TYPE_CHECKING:
    from pathlib import Path


def presets_reuse_ids(db_path: Path) -> bool:
    with closing(sqlite3.connect(str(db_path))) as conn:
        row = conn.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_battlers'").fetchone()
    return row is not None and "AUTOINCREMENT" not in row[0].upper()


def rebuild_presets_table(db_path: Path) -> None:
    """Rebuild user_battlers with AUTOINCREMENT, which SQLite can't add to an existing table, keeping every row."""
    presets = UserBattler.__table__
    if not isinstance(presets, Table):
        msg = "UserBattler table is not a SQLAlchemy Table"
        raise TypeError(msg)
    metadata = MetaData()
    user_table = User.__table__
    if not isinstance(user_table, Table):
        msg = "User table is not a SQLAlchemy Table"
        raise TypeError(msg)
    user_table.to_metadata(metadata)
    rebuilt = presets.to_metadata(metadata, name="user_battlers_rebuilt")
    dialect = sqlite.dialect()

    # Autocommit, so the BEGIN below is the one transaction. Closing without its COMMIT rolls all of it back.
    with closing(sqlite3.connect(str(db_path), isolation_level=None)) as conn:
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("BEGIN IMMEDIATE")
        # The old table's own column list, so a column the model lacks fails the copy instead of being dropped.
        columns = ", ".join(f'"{row[1]}"' for row in conn.execute("PRAGMA table_info(user_battlers)"))
        conn.execute(str(CreateTable(rebuilt).compile(dialect=dialect)))
        conn.execute(f"INSERT INTO {rebuilt.name} ({columns}) SELECT {columns} FROM user_battlers")  # noqa: S608 -- validated static table name
        conn.execute("DROP TABLE user_battlers")
        conn.execute(f"ALTER TABLE {rebuilt.name} RENAME TO user_battlers")
        for index in presets.indexes:
            conn.execute(str(CreateIndex(index).compile(dialect=dialect)))
        conn.execute("COMMIT")

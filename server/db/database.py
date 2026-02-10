import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from server.db.models import Base

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


def init_db():
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        _migrate(conn, "battle_snapshots", "poison", "INTEGER")
        _migrate(conn, "player_game_history", "is_bot", "BOOLEAN", "0")
        _migrate(conn, "player_game_history", "source_history_id", "INTEGER")
        _migrate(conn, "player_game_history", "poison_history_json", "TEXT")

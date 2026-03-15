from __future__ import annotations

import json
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from mtb.models.game import restore_game_from_snapshot, restore_snapshot_data, slim_snapshot_dump


@dataclass(slots=True)
class TableMigrationResult:
    scanned: int = 0
    migrated: int = 0
    already_current: int = 0
    failed: int = 0


@dataclass(slots=True)
class SnapshotMigrationResult:
    active_game_snapshots: TableMigrationResult
    battle_snapshots: TableMigrationResult

    @property
    def total_scanned(self) -> int:
        return self.active_game_snapshots.scanned + self.battle_snapshots.scanned

    @property
    def total_migrated(self) -> int:
        return self.active_game_snapshots.migrated + self.battle_snapshots.migrated

    @property
    def total_already_current(self) -> int:
        return self.active_game_snapshots.already_current + self.battle_snapshots.already_current

    @property
    def total_failed(self) -> int:
        return self.active_game_snapshots.failed + self.battle_snapshots.failed


def default_db_path() -> Path:
    return (Path(__file__).resolve().parents[2] / "data" / "mtb.db").resolve()


def backup_db(source: Path, destination: Path | None = None) -> Path:
    destination = destination or source.with_suffix(source.suffix + ".bak")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()
    source.replace(destination)
    shutil.copy2(destination, source)
    return destination


def migrate_snapshot_storage(db_path: Path, *, apply: bool) -> SnapshotMigrationResult:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA busy_timeout=5000")
        active = _migrate_active_game_snapshots(conn, apply=apply)
        battle = _migrate_battle_snapshots(conn, apply=apply)
        if apply:
            conn.commit()
        else:
            conn.rollback()
        return SnapshotMigrationResult(active_game_snapshots=active, battle_snapshots=battle)
    finally:
        conn.close()


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _is_current_wrapped_payload(raw_json: str) -> bool:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and "data" in payload and "card_registry" in payload


def _migrate_active_game_snapshots(conn: sqlite3.Connection, *, apply: bool) -> TableMigrationResult:
    result = TableMigrationResult()
    if not _table_exists(conn, "active_game_snapshots"):
        return result

    rows = conn.execute("SELECT game_id, state_json FROM active_game_snapshots").fetchall()
    result.scanned = len(rows)

    for row in rows:
        raw_json = str(row["state_json"])
        if _is_current_wrapped_payload(raw_json):
            result.already_current += 1
            continue

        try:
            game = restore_game_from_snapshot(raw_json)
            new_json = game.snapshot_dump_json()
        except Exception:
            result.failed += 1
            continue

        if new_json == raw_json:
            result.already_current += 1
            continue

        if apply:
            conn.execute(
                "UPDATE active_game_snapshots SET state_json = ? WHERE game_id = ?",
                (new_json, str(row["game_id"])),
            )
        result.migrated += 1

    return result


def _migrate_battle_snapshots(conn: sqlite3.Connection, *, apply: bool) -> TableMigrationResult:
    result = TableMigrationResult()
    if not _table_exists(conn, "battle_snapshots"):
        return result

    rows = conn.execute("SELECT id, full_state_json FROM battle_snapshots").fetchall()
    result.scanned = len(rows)

    for row in rows:
        raw_json = str(row["full_state_json"])
        if _is_current_wrapped_payload(raw_json):
            result.already_current += 1
            continue

        try:
            snapshot_data = restore_snapshot_data(raw_json)
            new_json = slim_snapshot_dump(snapshot_data)
        except Exception:
            result.failed += 1
            continue

        if new_json == raw_json:
            result.already_current += 1
            continue

        if apply:
            conn.execute(
                "UPDATE battle_snapshots SET full_state_json = ? WHERE id = ?",
                (new_json, int(row["id"])),
            )
        result.migrated += 1

    return result

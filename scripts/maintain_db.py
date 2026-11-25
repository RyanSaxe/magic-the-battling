#!/usr/bin/env python3
"""Run deploy-safe SQLite DB maintenance from the command line."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from server.db.maintenance import DatabaseMaintenanceResult, apply_db_maintenance, inspect_db_maintenance
from server.db.snapshot_migration import default_db_path

logger = logging.getLogger(__name__)


def _resolve_db_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return default_db_path()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run deploy-safe SQLite DB maintenance: snapshot storage migrations and the presets table rebuild.",
    )
    parser.add_argument("--db-path", default=None, help="SQLite DB path (defaults to DATABASE_PATH or ./data/mtb.db)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply pending maintenance. Without this flag, the script runs in inspection mode.",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip creating a .bak backup before applying changes.",
    )
    parser.add_argument(
        "--backup-path",
        default=None,
        help="Optional explicit backup path. Only used when applying with backups enabled.",
    )
    return parser.parse_args(argv)


def _format_result(db_path: Path, result: DatabaseMaintenanceResult, *, mode: str) -> str:
    lines = [
        f"mode: {mode}",
        f"db: {db_path}",
    ]
    if result.backup_path is not None:
        lines.append(f"backup: {result.backup_path}")
    lines.extend(
        [
            "",
            "snapshot_storage:",
            f"  active_game_snapshots.scanned: {result.snapshot_storage.active_game_snapshots.scanned}",
            f"  active_game_snapshots.migrated: {result.snapshot_storage.active_game_snapshots.migrated}",
            f"  active_game_snapshots.already_current: {result.snapshot_storage.active_game_snapshots.already_current}",
            f"  active_game_snapshots.failed: {result.snapshot_storage.active_game_snapshots.failed}",
            f"  battle_snapshots.scanned: {result.snapshot_storage.battle_snapshots.scanned}",
            f"  battle_snapshots.migrated: {result.snapshot_storage.battle_snapshots.migrated}",
            f"  battle_snapshots.already_current: {result.snapshot_storage.battle_snapshots.already_current}",
            f"  battle_snapshots.failed: {result.snapshot_storage.battle_snapshots.failed}",
            "",
            "presets:",
            f"  user_battlers.rebuild: {int(result.presets_rebuild)}",
            "",
            f"total pending changes: {result.total_pending}",
            f"total failed: {result.total_failed}",
        ],
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    args = parse_args(argv)
    db_path = _resolve_db_path(args.db_path)
    if args.backup_path and args.no_backup:
        logger.error("error: --backup-path cannot be used with --no-backup")
        return 1

    if not db_path.exists():
        # A fresh volume has no database yet; the server creates it in the current format.
        logger.info("no database at %s; nothing to maintain", db_path)
        return 0

    if args.apply:
        backup_path = Path(args.backup_path).expanduser().resolve() if args.backup_path else None
        result = apply_db_maintenance(
            db_path,
            backup=not args.no_backup,
            backup_path=backup_path,
        )
        sys.stdout.write(_format_result(db_path, result, mode="apply"))
    else:
        result = inspect_db_maintenance(db_path)
        sys.stdout.write(_format_result(db_path, result, mode="inspect"))

    return 0 if result.total_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

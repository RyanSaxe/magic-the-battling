#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from server.db.maintenance import apply_db_maintenance, inspect_db_maintenance
from server.db.snapshot_migration import default_db_path


def _resolve_db_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return default_db_path()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run deploy-safe SQLite DB maintenance tasks, including snapshot storage migrations."
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


def _print_result(db_path: Path, result, *, mode: str) -> None:
    print(f"mode: {mode}")
    print(f"db: {db_path}")
    if result.backup_path is not None:
        print(f"backup: {result.backup_path}")
    print()
    print("snapshot_storage:")
    print(f"  active_game_snapshots.scanned: {result.snapshot_storage.active_game_snapshots.scanned}")
    print(f"  active_game_snapshots.migrated: {result.snapshot_storage.active_game_snapshots.migrated}")
    print(f"  active_game_snapshots.already_current: {result.snapshot_storage.active_game_snapshots.already_current}")
    print(f"  active_game_snapshots.failed: {result.snapshot_storage.active_game_snapshots.failed}")
    print(f"  battle_snapshots.scanned: {result.snapshot_storage.battle_snapshots.scanned}")
    print(f"  battle_snapshots.migrated: {result.snapshot_storage.battle_snapshots.migrated}")
    print(f"  battle_snapshots.already_current: {result.snapshot_storage.battle_snapshots.already_current}")
    print(f"  battle_snapshots.failed: {result.snapshot_storage.battle_snapshots.failed}")
    print()
    print(f"total pending changes: {result.total_pending}")
    print(f"total failed: {result.total_failed}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    db_path = _resolve_db_path(args.db_path)
    if not db_path.exists():
        print(f"error: database not found at {db_path}", file=sys.stderr)
        return 1

    if args.backup_path and args.no_backup:
        print("error: --backup-path cannot be used with --no-backup", file=sys.stderr)
        return 1

    if args.apply:
        result = apply_db_maintenance(
            db_path,
            backup=not args.no_backup,
            backup_path=Path(args.backup_path).expanduser().resolve() if args.backup_path else None,
        )
        _print_result(db_path, result, mode="apply")
    else:
        result = inspect_db_maintenance(db_path)
        _print_result(db_path, result, mode="inspect")

    return 0 if result.total_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from server.db.snapshot_migration import backup_db, default_db_path, migrate_snapshot_storage


def _resolve_db_path(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return default_db_path()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Rewrite old snapshot JSON into the current compact storage format. "
            "For deploy-safe backup + maintenance, use scripts/maintain_db.py."
        )
    )
    parser.add_argument("--db-path", default=None, help="SQLite DB path (defaults to DATABASE_PATH or ./data/mtb.db)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes in place. Without this flag, the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a .bak copy of the DB before applying changes.",
    )
    parser.add_argument(
        "--backup-path",
        default=None,
        help="Optional explicit backup path. Only used with --backup.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    db_path = _resolve_db_path(args.db_path)

    if not db_path.exists():
        print(f"error: database not found at {db_path}", file=sys.stderr)
        return 1

    if args.backup and not args.apply:
        print("error: --backup only makes sense with --apply", file=sys.stderr)
        return 1

    if args.backup:
        backup_path = Path(args.backup_path).expanduser().resolve() if args.backup_path else None
        created = backup_db(db_path, backup_path)
        print(f"backup created: {created}")

    result = migrate_snapshot_storage(db_path, apply=args.apply)
    mode = "apply" if args.apply else "dry-run"
    print(f"mode: {mode}")
    print(f"db: {db_path}")
    print()
    print("active_game_snapshots:")
    print(f"  scanned: {result.active_game_snapshots.scanned}")
    print(f"  migrated: {result.active_game_snapshots.migrated}")
    print(f"  already_current: {result.active_game_snapshots.already_current}")
    print(f"  failed: {result.active_game_snapshots.failed}")
    print("battle_snapshots:")
    print(f"  scanned: {result.battle_snapshots.scanned}")
    print(f"  migrated: {result.battle_snapshots.migrated}")
    print(f"  already_current: {result.battle_snapshots.already_current}")
    print(f"  failed: {result.battle_snapshots.failed}")
    print()
    print(f"total scanned: {result.total_scanned}")
    print(f"total migrated: {result.total_migrated}")
    print(f"total already_current: {result.total_already_current}")
    print(f"total failed: {result.total_failed}")

    return 0 if result.total_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Rewrite old snapshot JSON into the current compact storage format."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from server.db.snapshot_migration import SnapshotMigrationResult, backup_db, default_db_path, migrate_snapshot_storage

logger = logging.getLogger(__name__)


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
        ),
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


def _format_result(db_path: Path, result: SnapshotMigrationResult, *, mode: str) -> str:
    lines = [
        f"mode: {mode}",
        f"db: {db_path}",
        "",
        "active_game_snapshots:",
        f"  scanned: {result.active_game_snapshots.scanned}",
        f"  migrated: {result.active_game_snapshots.migrated}",
        f"  already_current: {result.active_game_snapshots.already_current}",
        f"  failed: {result.active_game_snapshots.failed}",
        "battle_snapshots:",
        f"  scanned: {result.battle_snapshots.scanned}",
        f"  migrated: {result.battle_snapshots.migrated}",
        f"  already_current: {result.battle_snapshots.already_current}",
        f"  failed: {result.battle_snapshots.failed}",
        "",
        f"total scanned: {result.total_scanned}",
        f"total migrated: {result.total_migrated}",
        f"total already_current: {result.total_already_current}",
        f"total failed: {result.total_failed}",
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    args = parse_args(argv)
    db_path = _resolve_db_path(args.db_path)

    if not db_path.exists():
        logger.error("error: database not found at %s", db_path)
        return 1

    if args.backup and not args.apply:
        logger.error("error: --backup only makes sense with --apply")
        return 1

    if args.backup:
        backup_path = Path(args.backup_path).expanduser().resolve() if args.backup_path else None
        created = backup_db(db_path, backup_path)
        logger.info("backup created: %s", created)

    result = migrate_snapshot_storage(db_path, apply=args.apply)
    sys.stdout.write(_format_result(db_path, result, mode="apply" if args.apply else "dry-run"))

    return 0 if result.total_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

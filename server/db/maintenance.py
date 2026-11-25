"""Idempotent database maintenance and schema migration steps run on deploy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from server.db.preset_id_migration import presets_reuse_ids, rebuild_presets_table
from server.db.snapshot_migration import SnapshotMigrationResult, backup_db, migrate_snapshot_storage

if TYPE_CHECKING:
    from pathlib import Path


@dataclass(slots=True)
class DatabaseMaintenanceResult:
    snapshot_storage: SnapshotMigrationResult
    presets_rebuild: bool
    backup_path: Path | None = None

    @property
    def total_pending(self) -> int:
        return self.snapshot_storage.total_migrated + int(self.presets_rebuild)

    @property
    def total_failed(self) -> int:
        return self.snapshot_storage.total_failed

    @property
    def changes_required(self) -> bool:
        return self.total_pending > 0


def inspect_db_maintenance(db_path: Path) -> DatabaseMaintenanceResult:
    return DatabaseMaintenanceResult(
        snapshot_storage=migrate_snapshot_storage(db_path, apply=False),
        presets_rebuild=presets_reuse_ids(db_path),
    )


def apply_db_maintenance(
    db_path: Path,
    *,
    backup: bool = True,
    backup_path: Path | None = None,
) -> DatabaseMaintenanceResult:
    inspection = inspect_db_maintenance(db_path)
    if inspection.total_failed > 0:
        return inspection
    if not inspection.changes_required:
        return inspection

    created_backup = backup_db(db_path, backup_path) if backup else None
    applied = migrate_snapshot_storage(db_path, apply=True)
    if inspection.presets_rebuild:
        rebuild_presets_table(db_path)
    return DatabaseMaintenanceResult(
        snapshot_storage=applied,
        presets_rebuild=inspection.presets_rebuild,
        backup_path=created_backup,
    )

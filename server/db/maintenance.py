from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from server.db.snapshot_migration import SnapshotMigrationResult, backup_db, migrate_snapshot_storage


@dataclass(slots=True)
class DatabaseMaintenanceResult:
    snapshot_storage: SnapshotMigrationResult
    backup_path: Path | None = None

    @property
    def total_pending(self) -> int:
        return self.snapshot_storage.total_migrated

    @property
    def total_failed(self) -> int:
        return self.snapshot_storage.total_failed

    @property
    def changes_required(self) -> bool:
        return self.total_pending > 0


def inspect_db_maintenance(db_path: Path) -> DatabaseMaintenanceResult:
    return DatabaseMaintenanceResult(snapshot_storage=migrate_snapshot_storage(db_path, apply=False))


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
    return DatabaseMaintenanceResult(snapshot_storage=applied, backup_path=created_backup)

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from math import ceil
from typing import Literal, cast

from server.db import database
from server.db.models import OpsState

logger = logging.getLogger(__name__)

OpsMode = Literal["normal", "draining", "maintenance"]
VALID_MODES = {"normal", "draining", "maintenance"}
_SCHEDULED_UTC_RE = re.compile(r"scheduled for (\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)", re.IGNORECASE)


@dataclass
class OpsSnapshot:
    mode: OpsMode
    message: str | None
    updated_by: str | None
    updated_at: datetime


class OpsManager:
    def __init__(self) -> None:
        self._mode: OpsMode = "normal"
        self._message: str | None = None
        self._updated_by: str | None = "bootstrap"
        self._updated_at: datetime = datetime.now(UTC)

    def load(self) -> None:
        session = database.SessionLocal()
        try:
            row = session.get(OpsState, 1)
            if row is None:
                row = OpsState(id=1, mode="normal", message=None, updated_by="bootstrap")
                session.add(row)
                session.commit()
                session.refresh(row)

            mode_raw = cast(str | None, row.mode) or "normal"
            if mode_raw in VALID_MODES:
                self._mode = cast(OpsMode, mode_raw)
            else:
                self._mode = "normal"
            self._message = cast(str | None, row.message) or None
            self._updated_by = cast(str | None, row.updated_by) or None
            self._updated_at = cast(datetime | None, row.updated_at) or datetime.now(UTC)
        finally:
            session.close()

        logger.info(
            "Loaded ops mode: mode=%s message=%s updated_by=%s updated_at=%s",
            self._mode,
            self._message,
            self._updated_by,
            self._updated_at.isoformat(),
        )

    def get_snapshot(self) -> OpsSnapshot:
        return OpsSnapshot(
            mode=self._mode,
            message=self._message,
            updated_by=self._updated_by,
            updated_at=self._updated_at,
        )

    def set_mode(self, mode: OpsMode, message: str | None, updated_by: str | None) -> OpsSnapshot:
        if mode not in VALID_MODES:
            msg = f"Invalid mode: {mode}"
            raise ValueError(msg)

        now = datetime.now(UTC)
        session = database.SessionLocal()
        try:
            row = session.get(OpsState, 1)
            if row is None:
                row = OpsState(id=1)
                session.add(row)

            row.mode = mode  # ty: ignore[invalid-assignment]
            row.message = message  # ty: ignore[invalid-assignment]
            row.updated_by = updated_by  # ty: ignore[invalid-assignment]
            row.updated_at = now  # ty: ignore[invalid-assignment]
            session.commit()
        finally:
            session.close()

        self._mode = mode
        self._message = message
        self._updated_by = updated_by
        self._updated_at = now

        logger.info(
            "Ops mode changed: mode=%s message=%s updated_by=%s",
            self._mode,
            self._message,
            self._updated_by,
        )
        return self.get_snapshot()

    def is_draining(self) -> bool:
        return self._mode == "draining"

    def is_maintenance(self) -> bool:
        return self._mode == "maintenance"

    def blocks_new_games(self) -> bool:
        return self._mode in {"draining", "maintenance"}

    def _scheduled_time_utc(self) -> datetime | None:
        if not self._message:
            return None

        match = _SCHEDULED_UTC_RE.search(self._message)
        if not match:
            return None

        try:
            return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M UTC").replace(tzinfo=UTC)
        except ValueError:
            return None

    def scheduled_for_utc_iso(self) -> str | None:
        scheduled = self._scheduled_time_utc()
        return scheduled.isoformat() if scheduled else None

    def estimated_recovery_minutes(self) -> int | None:
        if self._mode == "normal":
            return None

        if self._mode == "maintenance":
            return 5

        scheduled = self._scheduled_time_utc()
        if scheduled:
            minutes_until_rollout = max(0, ceil((scheduled - datetime.now(UTC)).total_seconds() / 60))
            # Include a small buffer for rollout + health checks.
            return minutes_until_rollout + 5

        return 10

    def notice_payload(self) -> dict[str, str]:
        return {
            "mode": self._mode,
            "message": self._message or "",
            "updated_at": self._updated_at.isoformat(),
        }

    def public_status_payload(self) -> dict[str, str | bool | int | None]:
        return {
            "mode": self._mode,
            "message": self._message or "",
            "updated_at": self._updated_at.isoformat(),
            "new_games_blocked": self.blocks_new_games(),
            "scheduled_for_utc": self.scheduled_for_utc_iso(),
            "estimated_recovery_minutes": self.estimated_recovery_minutes(),
        }


ops_manager = OpsManager()

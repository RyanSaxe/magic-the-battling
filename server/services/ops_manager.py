import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, cast

from server.db import database
from server.db.models import OpsState

logger = logging.getLogger(__name__)

OpsMode = Literal["normal", "draining", "maintenance"]
VALID_MODES = {"normal", "draining", "maintenance"}


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

            row.mode = mode
            row.message = message
            row.updated_by = updated_by
            row.updated_at = now
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

    def notice_payload(self) -> dict[str, str]:
        return {
            "mode": self._mode,
            "message": self._message or "",
            "updated_at": self._updated_at.isoformat(),
        }


ops_manager = OpsManager()

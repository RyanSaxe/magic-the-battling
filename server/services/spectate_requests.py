"""Pending spectate request queue, approval flow, and expiration tracking."""

import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal

SpectateStatus = Literal["pending", "approved", "watching", "denied", "cancelled", "expired"]


@dataclass
class SpectateRequest:
    request_id: str
    game_id: str
    target_player_name: str
    spectator_name: str
    status: SpectateStatus = "pending"
    session_id: str | None = None
    player_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    closed_at: datetime | None = None


@dataclass(frozen=True)
class SpectatorSession:
    session_id: str
    player_id: str


class TooManySpectateRequestsError(RuntimeError):
    pass


class SpectateRequests:
    """Every request to watch a player, and the only place a request's status changes.

    pending -> approved | denied | cancelled | expired, and approved -> watching when the spectator connects.
    Approved and watching requests last until their game is dropped. A pending request expires after `ttl`, and
    a closed one is forgotten `ttl` after it closed, so the spectator still reads why it ended.
    """

    def __init__(self, *, ttl: timedelta, max_total: int, start_session: Callable[[str], SpectatorSession]) -> None:
        self._ttl = ttl
        self._max_total = max_total
        self._start_session = start_session
        self._requests: dict[str, SpectateRequest] = {}

    def __len__(self) -> int:
        return len(self._requests)

    def get(self, request_id: str) -> SpectateRequest | None:
        return self._requests.get(request_id)

    def create(self, game_id: str, target_player_name: str, *, spectator_name: str, approve: bool) -> SpectateRequest:
        if len(self._requests) >= self._max_total:
            msg = "Too many spectate requests queued"
            raise TooManySpectateRequestsError(msg)
        request = SpectateRequest(
            request_id=secrets.token_urlsafe(8),
            game_id=game_id,
            target_player_name=target_player_name,
            spectator_name=spectator_name,
        )
        self._requests[request.request_id] = request
        if approve:
            self._approve(request)
        return request

    def answer(self, request: SpectateRequest, *, allowed: bool) -> bool:
        if request.status != "pending":
            return False
        if allowed:
            self._approve(request)
        else:
            self._close(request, "denied", at=datetime.now(UTC))
        return True

    def cancel(self, request: SpectateRequest) -> bool:
        if request.status != "pending":
            return False
        self._close(request, "cancelled", at=datetime.now(UTC))
        return True

    def admit(self, request_id: str, *, session_id: str, game_id: str, target_player_name: str) -> bool:
        """Let an approved spectator's socket in, for the one game and player the request names."""
        request = self._requests.get(request_id)
        if (
            request is None
            or request.status not in ("approved", "watching")
            or request.session_id != session_id
            or request.game_id != game_id
            or request.target_player_name != target_player_name
        ):
            return False
        request.status = "watching"
        return True

    def pending_for(self, game_id: str, target_player_name: str) -> list[SpectateRequest]:
        """Return requests waiting on one player's answer, oldest first."""
        return [
            request
            for request in self._requests.values()
            if request.status == "pending"
            and request.game_id == game_id
            and request.target_player_name == target_player_name
        ]

    def expire(self, now: datetime) -> list[SpectateRequest]:
        """Expire requests left pending too long and forget closed ones; returns the ones that just expired."""
        cutoff = now - self._ttl
        expired = [r for r in self._requests.values() if r.status == "pending" and r.created_at < cutoff]
        for request in expired:
            self._close(request, "expired", at=now)
        forgotten = [
            request_id
            for request_id, request in self._requests.items()
            if request.closed_at is not None and request.closed_at < cutoff
        ]
        for request_id in forgotten:
            del self._requests[request_id]
        return expired

    def drop_game(self, game_id: str) -> None:
        for request_id, request in list(self._requests.items()):
            if request.game_id == game_id:
                del self._requests[request_id]

    def clear(self) -> None:
        self._requests.clear()

    def _approve(self, request: SpectateRequest) -> None:
        session = self._start_session(request.game_id)
        request.status = "approved"
        request.session_id = session.session_id
        request.player_id = session.player_id

    @staticmethod
    def _close(request: SpectateRequest, status: SpectateStatus, *, at: datetime) -> None:
        request.status = status
        request.closed_at = at

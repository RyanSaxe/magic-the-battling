"""Who may reclaim a seat: the browser holding its seat token, or the account that took it."""

import hashlib
import hmac
import secrets
from enum import StrEnum


class SeatClaimRefusal(StrEnum):
    GAME_NOT_FOUND = "game_not_found"
    SEAT_NOT_FOUND = "seat_not_found"
    LOGIN_REQUIRED = "login_required"
    TOKEN_REQUIRED = "token_required"  # noqa: S105 -- non-secret constant name


class SeatClaimRefusedError(Exception):
    def __init__(self, refusal: SeatClaimRefusal) -> None:
        super().__init__(refusal.value)
        self.refusal = refusal


def new_seat_token() -> str:
    return secrets.token_urlsafe(32)


def hash_seat_token(seat_token: str) -> str:
    return hashlib.sha256(seat_token.encode()).hexdigest()


def seat_token_matches(seat_token: str | None, stored_hash: str | None) -> bool:
    if not seat_token or not stored_hash:
        return False
    return hmac.compare_digest(hash_seat_token(seat_token), stored_hash)


def token_after_claim(seat_token: str | None, stored_hash: str | None) -> str:
    """Return the token handed back after a successful seat claim.

    A browser that proved the seat with its token keeps it; an account claim issues a fresh token.
    """
    if seat_token is not None and seat_token_matches(seat_token, stored_hash):
        return seat_token
    return new_seat_token()


def holds_seat(
    *, stored_hash: str | None, owner_user_id: str | None, seat_token: str | None, user_id: str | None
) -> bool:
    """Whether the caller has the seat's token or is logged in as the account that took it."""
    if owner_user_id is not None and user_id == owner_user_id:
        return True
    return seat_token_matches(seat_token, stored_hash)


def seat_claim_refusal(
    *,
    stored_hash: str | None,
    owner_user_id: str | None,
    seat_token: str | None,
    user_id: str | None,
) -> SeatClaimRefusal | None:
    if holds_seat(stored_hash=stored_hash, owner_user_id=owner_user_id, seat_token=seat_token, user_id=user_id):
        return None
    # Seats taken before seat tokens existed have no hash. Their first claim issues one, so this closes over time.
    if stored_hash is None and owner_user_id is None:
        return None
    return SeatClaimRefusal.LOGIN_REQUIRED if owner_user_id is not None else SeatClaimRefusal.TOKEN_REQUIRED

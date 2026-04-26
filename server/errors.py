from __future__ import annotations

from enum import StrEnum

from fastapi import HTTPException


class ErrorCode(StrEnum):
    UNKNOWN = "UNKNOWN"
    USER_MESSAGE = "USER_MESSAGE"
    INVALID_REQUEST = "INVALID_REQUEST"
    NOT_AUTHENTICATED = "NOT_AUTHENTICATED"
    INVALID_SESSION = "INVALID_SESSION"
    GAME_NOT_FOUND = "GAME_NOT_FOUND"
    SPECTATE_TARGET_NOT_FOUND = "SPECTATE_TARGET_NOT_FOUND"
    SPECTATE_REQUEST_NOT_FOUND = "SPECTATE_REQUEST_NOT_FOUND"
    PLAYER_NOT_IN_GAME = "PLAYER_NOT_IN_GAME"
    PLAYER_ALREADY_CONNECTED = "PLAYER_ALREADY_CONNECTED"
    PLAYER_NAME_TAKEN = "PLAYER_NAME_TAKEN"
    INVALID_JOIN_CODE = "INVALID_JOIN_CODE"
    LOBBY_FULL = "LOBBY_FULL"
    GAME_ALREADY_STARTED = "GAME_ALREADY_STARTED"
    SERVER_UPDATING = "SERVER_UPDATING"
    SERVER_CAPACITY = "SERVER_CAPACITY"
    WS_CAPACITY = "WS_CAPACITY"
    RUNTIME_RESET = "RUNTIME_RESET"
    KICKED = "KICKED"
    BATTLER_NOT_FOUND = "BATTLER_NOT_FOUND"
    FOLLOW_NOT_FOUND = "FOLLOW_NOT_FOUND"
    ALREADY_FOLLOWING = "ALREADY_FOLLOWING"
    USERNAME_TAKEN = "USERNAME_TAKEN"
    EMAIL_IN_USE = "EMAIL_IN_USE"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    CARD_POOL_NOT_AVAILABLE = "CARD_POOL_NOT_AVAILABLE"
    SHARE_DATA_NOT_FOUND = "SHARE_DATA_NOT_FOUND"
    UNKNOWN_ACTION = "UNKNOWN_ACTION"
    SERVER_MAINTENANCE = "SERVER_MAINTENANCE"


class AppHTTPException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: ErrorCode | str,
        detail: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = str(code)


def api_error(
    status_code: int,
    code: ErrorCode | str,
    detail: str,
    headers: dict[str, str] | None = None,
) -> AppHTTPException:
    return AppHTTPException(status_code=status_code, code=code, detail=detail, headers=headers)


def ws_error_payload(code: ErrorCode | str, detail: str) -> dict[str, str]:
    message = detail
    return {
        "code": str(code),
        "detail": detail,
        "message": message,
    }

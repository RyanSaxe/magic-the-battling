"""Pydantic models for authentication requests and user responses."""

import re

from pydantic import BaseModel, field_validator
from pydantic_core import PydanticCustomError

from mtb.models.types import PlayMode, normalize_play_mode
from mtb.utils.cubecobra import cube_id_from_input

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        v = v.strip()
        if not USERNAME_RE.match(v):
            msg = "Username must be 3-30 characters: letters, numbers, underscores only"
            raise ValueError(msg)
        return v

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        min_password_length = 8
        if len(v) < min_password_length:
            msg = "Password must be at least 8 characters"
            raise ValueError(msg)
        return v

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = v.strip()
        if not v or "@" not in v:
            msg = "A valid email address is required"
            raise ValueError(msg)
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str | None = None


class UserBattlerCreate(BaseModel):
    cube_id: str
    display_name: str | None = None
    use_upgrades: bool = True
    use_vanguards: bool = False
    play_mode: PlayMode = "limited"
    puppet_count: int = 0
    target_player_count: int = 4
    auto_approve_spectators: bool = False
    guided_mode_default: bool = False

    @field_validator("cube_id")
    @classmethod
    def _cube_id_from_link(cls, value: str) -> str:
        try:
            return cube_id_from_input(value)
        except ValueError as error:
            # A custom error keeps pydantic's "Value error, " prefix out of the message the player sees.
            msg = "cube_link"
            raise PydanticCustomError(
                msg, "Enter a CubeCobra cube ID, or paste a link to the cube on CubeCobra."
            ) from error

    @field_validator("play_mode", mode="before")
    @classmethod
    def _normalize_play_mode(cls, value: str | None) -> PlayMode:
        return normalize_play_mode(value)


class UserBattlerUpdate(BaseModel):
    display_name: str | None = None
    use_upgrades: bool | None = None
    use_vanguards: bool | None = None
    play_mode: PlayMode | None = None
    puppet_count: int | None = None
    target_player_count: int | None = None
    auto_approve_spectators: bool | None = None
    guided_mode_default: bool | None = None
    position: int | None = None

    @field_validator("play_mode", mode="before")
    @classmethod
    def _normalize_play_mode(cls, value: str | None) -> PlayMode | None:
        if value is None:
            return None
        return normalize_play_mode(value)


class UserBattlerResponse(BaseModel):
    """A saved preset. The game counts cover its cube; the my_ stats cover the player's games with its settings."""

    id: int
    cube_id: str
    display_name: str | None
    cube_name: str | None = None
    cube_image_uri: str | None = None
    use_upgrades: bool
    use_vanguards: bool
    play_mode: str
    puppet_count: int
    target_player_count: int
    auto_approve_spectators: bool
    guided_mode_default: bool
    position: int
    created_at: str
    game_count: int = 0
    human_player_count: int = 0
    last_played: str | None = None
    my_game_count: int = 0
    my_win_count: int = 0
    my_average_placement: float | None = None
    my_last_played: str | None = None


class GameSummaryResponse(BaseModel):
    game_id: str
    created_at: str
    player_count: int
    human_count: int = 0
    best_human_name: str
    best_human_placement: int | None
    cube_id: str
    cube_name: str | None = None
    cube_image_uri: str | None = None
    play_mode: str | None = None
    use_upgrades: bool | None = None
    hand_scryfall_ids: list[str] = []


class CubeSetup(BaseModel):
    play_mode: PlayMode
    use_upgrades: bool


class CubeSummaryResponse(BaseModel):
    cube_id: str
    cube_name: str | None = None
    cube_image_uri: str | None = None
    game_count: int = 0
    human_player_count: int = 0
    last_played: str | None = None
    popular_setup: CubeSetup | None = None
    is_following: bool = False
    follow_id: int | None = None


class FollowedBattlerResponse(BaseModel):
    id: int
    cube_id: str
    display_name: str | None
    cube_name: str | None = None
    cube_image_uri: str | None = None
    created_at: str
    game_count: int = 0
    human_player_count: int = 0
    last_played: str | None = None

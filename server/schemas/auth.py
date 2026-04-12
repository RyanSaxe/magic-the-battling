import re

from pydantic import BaseModel, field_validator

from mtb.models.types import PlayMode, normalize_play_mode

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise ValueError("Username must be 3-30 characters: letters, numbers, underscores only")
        return v

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
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
    id: int
    cube_id: str
    display_name: str | None
    use_upgrades: bool
    use_vanguards: bool
    play_mode: str
    puppet_count: int
    target_player_count: int
    auto_approve_spectators: bool
    guided_mode_default: bool
    position: int
    created_at: str


class GameSummaryResponse(BaseModel):
    game_id: str
    created_at: str
    player_count: int
    best_human_name: str
    best_human_placement: int | None
    cube_id: str
    play_mode: str | None = None
    use_upgrades: bool | None = None
    hand_scryfall_ids: list[str] = []


class FollowedBattlerResponse(BaseModel):
    id: int
    cube_id: str
    display_name: str | None
    created_at: str

"""Lobby and seat types the game manager hands out: pending lobbies, constructed decks while they load,
and the errors a lobby start or seat change can raise."""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import ClassVar

from mtb.models.cards import (
    Battler,
)
from mtb.models.types import PlayMode
from server.schemas.api import (
    BattlerLoadingStatus,
)

LOBBY_STARTING_MESSAGE = "The game is starting"


@dataclass(frozen=True)
class BattlerMissing:
    status: ClassVar[BattlerLoadingStatus] = "missing"


@dataclass(frozen=True)
class BattlerLoading:
    battler_id: str
    task: asyncio.Task = field(repr=False, compare=False)
    status: ClassVar[BattlerLoadingStatus] = "loading"


@dataclass(frozen=True)
class BattlerReady:
    battler_id: str
    battler: Battler
    status: ClassVar[BattlerLoadingStatus] = "ready"


@dataclass(frozen=True)
class BattlerFailed:
    battler_id: str
    error: str
    status: ClassVar[BattlerLoadingStatus] = "error"


type PlayerBattler = BattlerMissing | BattlerLoading | BattlerReady | BattlerFailed
"""A constructed player's deck in a lobby. GameManager._set_player_battler is the one place it changes."""


class LobbyStage(StrEnum):
    """Where a lobby is in starting. GameManager.start_lobby is the one place it changes.

    A failed lobby is open again and keeps the reason its last start failed.
    """

    OPEN = "open"
    STARTING = "starting"
    STARTED = "started"
    FAILED = "failed"


@dataclass
class PendingGame:
    game_id: str
    join_code: str
    cube_id: str
    host_player_id: str
    player_names: list[str] = field(default_factory=list)
    player_ids: list[str] = field(default_factory=list)
    stage: LobbyStage = LobbyStage.OPEN
    start_error: str | None = None
    use_upgrades: bool = True
    use_vanguards: bool = False
    target_player_count: int = 4
    auto_approve_spectators: bool = False
    guided_mode_default: bool = False
    voice_chat_enabled: bool = False
    play_mode: PlayMode = "limited"
    player_ready: dict[str, bool] = field(default_factory=dict)
    player_battlers: dict[str, PlayerBattler] = field(default_factory=dict)
    puppet_count: int = 0
    battler: Battler | None = None
    battler_loading: bool = False
    battler_error: str | None = None
    player_user_ids: dict[str, str] = field(default_factory=dict)
    seat_token_hashes: dict[str, str] = field(default_factory=dict)
    host_away_since: datetime | None = None
    previous_host_id: str | None = None
    _loading_task: asyncio.Task | None = field(default=None, repr=False)

    def has_player_named(self, name: str) -> bool:
        """Whether a player in this lobby already has the name, ignoring case."""
        folded = name.casefold()
        return any(existing.casefold() == folded for existing in self.player_names)

    @property
    def is_started(self) -> bool:
        return self.stage is LobbyStage.STARTED

    @property
    def accepts_changes(self) -> bool:
        """Whether players can join, leave, ready up or change decks, and the host can change the table."""
        return self.stage in {LobbyStage.OPEN, LobbyStage.FAILED}


class GameStartQueueFullError(RuntimeError):
    pass


class LobbyStartRefusedError(Exception):
    """The lobby can't start yet. Nothing about it changed."""


class SeatCloseRefusedError(Exception):
    """The seat can't end now. Nothing about the game changed."""


class LobbyStartFailedError(Exception):
    """The lobby began starting and couldn't finish. It is open again, with this reason."""


@dataclass(frozen=True)
class SeatClaim:
    player_id: str
    seat_token: str

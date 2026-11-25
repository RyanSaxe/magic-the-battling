"""The server's game manager and the lobby types and errors its callers handle.

The manager is built from the services in ``server.services.game``. This module keeps the import path the
routers and tests use, and holds the one ``game_manager`` the server runs.
"""

from server.services.game.manager import GameManager
from server.services.game.models import (
    LOBBY_STARTING_MESSAGE,
    BattlerFailed,
    BattlerLoading,
    BattlerMissing,
    BattlerReady,
    GameStartQueueFullError,
    LobbyStage,
    LobbyStartFailedError,
    LobbyStartRefusedError,
    PendingGame,
    PlayerBattler,
    SeatClaim,
    SeatCloseRefusedError,
)
from server.services.game.state import SpectateListener

game_manager = GameManager()

__all__ = [
    "LOBBY_STARTING_MESSAGE",
    "BattlerFailed",
    "BattlerLoading",
    "BattlerMissing",
    "BattlerReady",
    "GameManager",
    "GameStartQueueFullError",
    "LobbyStage",
    "LobbyStartFailedError",
    "LobbyStartRefusedError",
    "PendingGame",
    "PlayerBattler",
    "SeatClaim",
    "SeatCloseRefusedError",
    "SpectateListener",
    "game_manager",
]

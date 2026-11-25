"""The game manager's in-memory registry: live games, lobbies, player mappings, per-game action locks."""

import asyncio
from collections.abc import AsyncGenerator, Callable, Collection
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Protocol

from pitfight.models.game import (
    Game,
    Player,
)
from server.runtime_config import (
    HOT_ACTION_WINDOW_MINUTES,
    MAX_BATTLER_PRELOADS_IN_FLIGHT,
    MAX_GAME_START_QUEUE,
    MAX_GAME_STARTS_IN_FLIGHT,
    MAX_HOT_GAMES,
    MAX_PENDING_GAMES,
    MAX_SPECTATE_REQUESTS_TOTAL,
    MAX_TOTAL_LOADED_GAMES_HARD,
    SNAPSHOT_INTERVAL_SEC,
    SPECTATE_REQUEST_TTL_MINUTES,
)
from server.services.game.models import (
    BattlerLoading,
    BattlerReady,
    GameStartQueueFullError,
    PendingGame,
    PlayerBattler,
)
from server.services.session_manager import session_manager
from server.services.spectate_requests import SpectateRequests, SpectatorSession


def _current_task() -> asyncio.Task | None:
    try:
        return asyncio.current_task()
    except RuntimeError:
        return None


def _utc_or_default(value: datetime | None, default: datetime) -> datetime:
    if value is None:
        return default
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class SpectateListener(Protocol):
    """Hears when a player's spectate requests change, and when a game's spectators lose their game."""

    def spectate_requests_changed(self, game_id: str, target_player_name: str) -> None: ...

    def game_dropped(self, game_id: str) -> None: ...


class _NoSpectateListener:
    def spectate_requests_changed(self, game_id: str, target_player_name: str) -> None:
        pass

    def game_dropped(self, game_id: str) -> None:
        pass


def _start_spectator_session(game_id: str) -> SpectatorSession:
    session = session_manager.create_session(game_id)
    return SpectatorSession(session_id=session.session_id, player_id=session.player_id)


class GameManagerState:
    def __init__(self) -> None:
        self._pending_games: dict[str, PendingGame] = {}
        self._active_games: dict[str, Game] = {}
        self._player_to_game: dict[str, str] = {}
        self._player_id_to_name: dict[str, str] = {}
        self._join_code_to_game: dict[str, str] = {}
        self._post_game_cleanup_tasks: dict[str, asyncio.Task] = {}
        self._abandoned_cleanup_tasks: dict[str, asyncio.Task] = {}
        self._pending_disconnect_tasks: dict[str, asyncio.Task] = {}
        self._host_handoff_tasks: dict[str, asyncio.Task] = {}
        self._spectate_requests = SpectateRequests(
            ttl=timedelta(minutes=SPECTATE_REQUEST_TTL_MINUTES),
            max_total=MAX_SPECTATE_REQUESTS_TOTAL,
            start_session=_start_spectator_session,
        )
        self._dirty_games: set[str] = set()
        self._finished_games: set[str] = set()
        self._last_human_activity: dict[str, datetime] = {}
        # The server attaches ConnectionManager's view; a manager used on its own (rules tests) has no sockets.
        self._connected_player_ids: Callable[[str], Collection[str]] = lambda _game_id: ()
        self._spectate_listener: SpectateListener = _NoSpectateListener()
        self._snapshot_task: asyncio.Task | None = None
        self._action_locks: dict[str, asyncio.Lock] = {}
        self._game_start_slots = asyncio.Semaphore(MAX_GAME_STARTS_IN_FLIGHT)
        self._game_starts_in_flight = 0
        self._game_start_waiters = 0
        self._battler_preload_slots = asyncio.Semaphore(MAX_BATTLER_PRELOADS_IN_FLIGHT)
        self._snapshot_interval_sec = SNAPSHOT_INTERVAL_SEC

    def get_action_lock(self, game_id: str) -> asyncio.Lock:
        lock = self._action_locks.get(game_id)
        if lock is None:
            lock = asyncio.Lock()
            self._action_locks[game_id] = lock
        return lock

    def mark_game_dirty(self, game_id: str, *, human_activity: bool = True) -> None:
        if game_id in self._active_games:
            self._dirty_games.add(game_id)
            if human_activity:
                self._last_human_activity[game_id] = datetime.now(UTC)

    def attach_connected_player_ids(self, connected_player_ids: Callable[[str], Collection[str]]) -> None:
        self._connected_player_ids = connected_player_ids

    def attach_spectate_listener(self, listener: SpectateListener) -> None:
        self._spectate_listener = listener

    def note_human_activity(self, game_id: str) -> None:
        self._last_human_activity[game_id] = datetime.now(UTC)

    def loaded_games_count(self) -> int:
        return len(self._active_games)

    def pending_games_count(self) -> int:
        return len(self._pending_games)

    def hot_games_count(self) -> int:
        hot_cutoff = datetime.now(UTC) - timedelta(minutes=HOT_ACTION_WINDOW_MINUTES)
        hot = 0
        for game_id in self._active_games:
            connected = bool(self._connected_player_ids(game_id))
            last_human = _utc_or_default(
                self._last_human_activity.get(game_id),
                datetime.min.replace(tzinfo=UTC),
            )
            recently_active = last_human >= hot_cutoff
            if connected or recently_active:
                hot += 1
        return hot

    def game_start_waiters_count(self) -> int:
        return self._game_start_waiters

    def game_starts_in_flight_count(self) -> int:
        return self._game_starts_in_flight

    def game_start_capacity(self) -> dict[str, int]:
        return {
            "in_flight": self._game_starts_in_flight,
            "waiters": self._game_start_waiters,
            "max_in_flight": MAX_GAME_STARTS_IN_FLIGHT,
            "max_waiters": MAX_GAME_START_QUEUE,
        }

    @asynccontextmanager
    async def _acquire_game_start_slot(self) -> AsyncGenerator[None]:
        if self._game_start_waiters >= MAX_GAME_START_QUEUE:
            msg = "Server is starting many games. Please try again shortly."
            raise GameStartQueueFullError(msg)

        self._game_start_waiters += 1
        acquired = False
        try:
            await self._game_start_slots.acquire()
            acquired = True
            self._game_start_waiters -= 1
            self._game_starts_in_flight += 1
            yield
        finally:
            if acquired:
                self._game_starts_in_flight = max(0, self._game_starts_in_flight - 1)
                self._game_start_slots.release()
            else:
                self._game_start_waiters = max(0, self._game_start_waiters - 1)

    def can_accept_new_pending_game(self) -> tuple[bool, str | None]:
        if len(self._pending_games) >= MAX_PENDING_GAMES:
            return False, "Too many pending games. Please try again shortly."
        if self._game_start_waiters >= MAX_GAME_START_QUEUE:
            return False, "Server is starting many games. Please try again shortly."
        if self.loaded_games_count() >= MAX_TOTAL_LOADED_GAMES_HARD:
            return False, "Server is at game capacity. Please try again shortly."
        if self.hot_games_count() >= MAX_HOT_GAMES:
            return False, "Server is handling many active games. Please try again shortly."
        return True, None

    def can_accept_loaded_game(self) -> tuple[bool, str | None]:
        if self.loaded_games_count() >= MAX_TOTAL_LOADED_GAMES_HARD:
            return False, "Server is at game capacity. Please try again shortly."
        return True, None

    def _clear_runtime_player_mappings_for_game(self, game_id: str) -> None:
        players_to_remove = [pid for pid, gid in self._player_to_game.items() if gid == game_id]
        for pid in players_to_remove:
            self._player_to_game.pop(pid, None)
            self._player_id_to_name.pop(pid, None)

    def get_pending_game(self, game_id: str) -> PendingGame | None:
        return self._pending_games.get(game_id)

    def get_game_id_by_join_code(self, join_code: str) -> str | None:
        return self._join_code_to_game.get(join_code.upper())

    def get_pending_game_by_code(self, join_code: str) -> PendingGame | None:
        game_id = self.get_game_id_by_join_code(join_code)
        return self._pending_games.get(game_id) if game_id else None

    def is_loaded(self, game_id: str) -> bool:
        return game_id in self._pending_games or game_id in self._active_games

    def get_game(self, game_id: str) -> Game | None:
        return self._active_games.get(game_id)

    def get_game_for_player(self, player_id: str) -> tuple[str, Game] | None:
        game_id = self._player_to_game.get(player_id)
        if not game_id:
            return None
        game = self._active_games.get(game_id)
        if not game:
            return None
        return game_id, game

    def get_player(self, game: Game, player_id: str) -> Player | None:
        player_name = self._player_id_to_name.get(player_id)
        if not player_name:
            return None
        if self._active_games.get(self._player_to_game.get(player_id, "")) is not game:
            return None
        for player in game.players:
            if player.name == player_name:
                return player
        return None

    def holds_seat(self, game_id: str, player_id: str) -> bool:
        return self._player_to_game.get(player_id) == game_id

    def get_player_id_by_name(self, game_id: str, player_name: str) -> str | None:
        for player_id, name in self._player_id_to_name.items():
            if name == player_name and self._player_to_game.get(player_id) == game_id:
                return player_id
        return None

    def get_player_name(self, player_id: str) -> str | None:
        return self._player_id_to_name.get(player_id)

    def _set_player_battler(self, pending: PendingGame, player_id: str, *, slot: PlayerBattler) -> None:
        """Replace a constructed player's deck state, cancelling any superseded load task."""
        previous = pending.player_battlers.get(player_id)
        if isinstance(previous, BattlerLoading) and previous.task is not _current_task():
            previous.task.cancel()
        pending.player_battlers[player_id] = slot
        if not isinstance(slot, BattlerReady):
            pending.player_ready[player_id] = False

    def _cancel_host_handoff(self, game_id: str) -> None:
        if task := self._host_handoff_tasks.pop(game_id, None):
            task.cancel()

    def _get_game_target_elo(self, game: Game) -> float:
        elos = [player.battler.elo for player in game.players if player.battler is not None and player.battler.elo]
        if not elos:
            return 1200.0
        return sum(elos) / len(elos)

    @property
    def active_games(self) -> dict[str, Game]:
        return self._active_games

    @property
    def pending_games(self) -> dict[str, PendingGame]:
        return self._pending_games

    @property
    def player_to_game(self) -> dict[str, str]:
        return self._player_to_game

    @property
    def player_id_to_name(self) -> dict[str, str]:
        return self._player_id_to_name

    @property
    def dirty_games(self) -> set[str]:
        return self._dirty_games

    @property
    def last_human_activity(self) -> dict[str, datetime]:
        return self._last_human_activity

    def _cancel_pending_loading_tasks(self) -> None:
        for pending in list(self._pending_games.values()):
            if pending.loading_task is not None and not pending.loading_task.done():
                pending.loading_task.cancel()
            pending.loading_task = None
            for player_battler in pending.player_battlers.values():
                if isinstance(player_battler, BattlerLoading) and not player_battler.task.done():
                    player_battler.task.cancel()

    def clear_all_state(self) -> None:
        if self._snapshot_task is not None and not self._snapshot_task.done():
            self._snapshot_task.cancel()
        self._snapshot_task = None
        self._cancel_pending_loading_tasks()
        for task_map in (
            self._post_game_cleanup_tasks,
            self._abandoned_cleanup_tasks,
            self._pending_disconnect_tasks,
            self._host_handoff_tasks,
        ):
            for task in list(task_map.values()):
                if not task.done():
                    task.cancel()
            task_map.clear()
        self._pending_games.clear()
        self._active_games.clear()
        self._player_to_game.clear()
        self._player_id_to_name.clear()
        self._join_code_to_game.clear()
        self._spectate_requests.clear()
        self._dirty_games.clear()
        self._finished_games.clear()
        self._last_human_activity.clear()
        self._action_locks.clear()
        self._game_starts_in_flight = 0
        self._game_start_waiters = 0

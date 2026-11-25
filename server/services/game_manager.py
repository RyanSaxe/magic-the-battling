import asyncio
import json
import logging
import random
import secrets
import string
from collections.abc import Awaitable, Callable, Collection, Coroutine
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, ClassVar, Protocol, cast
from uuid import uuid4

from httpx import HTTPStatusError, RequestError
from sqlalchemy import func
from sqlalchemy import true as sql_true
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, joinedload

import server.db.database as db
from mtb.models.cards import (
    DEFAULT_UPGRADES_ID,
    DEFAULT_VANGUARD_ID,
    Battler,
    IllegalBattlerError,
    build_battler,
    validate_battler,
)
from mtb.models.game import (
    Battle,
    BattleSnapshotData,
    Config,
    Game,
    PendingRevealAnimation,
    Player,
    Puppet,
    ReturnedBuild,
    StaticOpponent,
    Zones,
    create_game,
    restore_game_from_snapshot,
    restore_snapshot_data,
    set_battler,
    set_player_battlers,
    slim_snapshot_dump,
)
from mtb.models.types import BuildSource, CardDestination, PlayMode, ZoneName, normalize_play_mode
from mtb.phases import battle, build, draft, reward
from mtb.phases.elimination import (
    get_live_players,
    get_live_puppets,
    get_same_round_exits,
)
from mtb.phases.round_resolution import (
    RoundResolutionOutcome,
    finalize_game_over,
    resolve_battle,
    resolve_end_of_round,
    resolve_reward_done,
    transition_phase,
)
from server.db.models import (
    ActiveGameSnapshot,
    BattleSnapshot,
    CubeMetadata,
    GamePlayerRecord,
    GameRecord,
    PlayerGameHistory,
    QuarantinedGameSnapshot,
)
from server.runtime_config import (
    HOT_ACTION_WINDOW_MINUTES,
    IDLE_EVICT_MINUTES,
    MAX_BATTLER_PRELOADS_IN_FLIGHT,
    MAX_GAME_START_QUEUE,
    MAX_GAME_STARTS_IN_FLIGHT,
    MAX_HOT_GAMES,
    MAX_PENDING_GAMES,
    MAX_SPECTATE_REQUESTS_TOTAL,
    MAX_TOTAL_LOADED_GAMES_HARD,
    SNAPSHOT_INTERVAL_SEC,
    SPECTATE_REQUEST_TTL_MINUTES,
    STALE_GAME_CLEANUP_HOURS,
)
from server.schemas.api import (
    BattlerLoadingStatus,
    CubeLoadingStatus,
    GameBootstrapResponse,
    GameStateResponse,
    GameStatusResponse,
    LobbyPlayer,
    LobbyStateResponse,
    ResumableGame,
    ResumableSeat,
)
from server.services.game.view_builder import (
    build_active_game_status,
    build_game_bootstrap,
    build_game_state,
    build_pending_game_status,
    build_snapshot_game_status,
    hidden_card_opaque_ids,
)
from server.services.game_serialization import (
    card_to_ref,
    cards_to_refs,
)
from server.services.seat_tokens import (
    SeatClaimRefusal,
    SeatClaimRefusedError,
    hash_seat_token,
    holds_seat,
    new_seat_token,
    seat_claim_refusal,
    seat_token_matches,
    token_after_claim,
)
from server.services.session_manager import session_manager
from server.services.spectate_requests import SpectateRequest, SpectateRequests, SpectatorSession

logger = logging.getLogger(__name__)

HOST_HANDOFF_GRACE_SECONDS = 60.0
POST_GAME_CLEANUP_SECONDS = 300.0
ABANDONED_CLEANUP_SECONDS = 86400.0
# No symbols: players read codes out and type them, and an underscore reads as a blank.
JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits
JOIN_CODE_LENGTH = 6
FINISHED_PLAYER_PHASES = frozenset({"eliminated", "winner", "game_over"})
LOBBY_STARTING_MESSAGE = "The game is starting"
SEAT_SHARED_MESSAGE = "Other players are still in this game, so it can't be closed yet."


def _current_task() -> asyncio.Task | None:
    try:
        return asyncio.current_task()
    except RuntimeError:
        return None


def _copy_for_dealing(battler: Battler) -> Battler:
    return battler.model_copy(update={"cards": list(battler.cards)})


def _utc_or_default(value: datetime | None, default: datetime) -> datetime:
    if value is None:
        return default
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _extract_snapshot_status(
    session: Session, game_id: str
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]] | None:
    row = (
        session.query(
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.config"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.config"),
            ).label("config_json"),
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.players"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.players"),
            ).label("players_json"),
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.puppets"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.fake_players"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.puppets"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.fake_players"),
                "[]",
            ).label("puppets_json"),
        )
        .filter(ActiveGameSnapshot.game_id == game_id)
        .first()
    )
    if row is None or row.players_json is None:
        return None
    config = json.loads(row.config_json) if row.config_json else {}
    players = json.loads(row.players_json)
    puppets = json.loads(row.puppets_json) if row.puppets_json else []
    return config, players, puppets


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


@dataclass(frozen=True)
class _RunningSeat:
    """Where a seat stands in a started game, read from the live game or from its snapshot."""

    config: Config
    player_count: int
    can_close: bool
    stage: int
    round: int
    poison: int
    phase: str


def _game_can_close(human_count: int) -> bool:
    return human_count == 1


def _running_seat_in_game(game: Game, player_name: str) -> _RunningSeat | None:
    player = next((p for p in game.players if p.name == player_name), None)
    if player is None:
        return None
    return _RunningSeat(
        config=game.config,
        player_count=len(game.players) + len(game.puppets),
        can_close=_game_can_close(len(game.players)),
        stage=player.stage,
        round=player.round,
        poison=player.poison,
        phase=player.phase,
    )


def _running_seat_in_snapshot(
    config: dict[str, Any], players: list[dict[str, Any]], puppet_count: int, player_name: str
) -> _RunningSeat | None:
    player = next((p for p in players if p.get("name") == player_name), None)
    if player is None:
        return None
    return _RunningSeat(
        config=Config.model_validate(config),
        player_count=len(players) + puppet_count,
        can_close=_game_can_close(len(players)),
        stage=player["stage"],
        round=player["round"],
        poison=player["poison"],
        phase=player["phase"],
    )


def _resumable_lobby_seat(seat: ResumableSeat, pending: PendingGame) -> ResumableGame:
    return ResumableGame(
        game_id=seat.game_id,
        player_name=seat.player_name,
        kind="lobby",
        cube_id=pending.cube_id,
        play_mode=pending.play_mode,
        use_upgrades=pending.use_upgrades,
        player_count=len(pending.player_names) + pending.puppet_count,
        can_close=pending.accepts_changes,
    )


def _resumable_game_seat(seat: ResumableSeat, running: _RunningSeat, last_active_at: datetime | None) -> ResumableGame:
    return ResumableGame(
        game_id=seat.game_id,
        player_name=seat.player_name,
        kind="game",
        last_active_at=last_active_at,
        cube_id=running.config.cube_id,
        play_mode=running.config.play_mode,
        use_upgrades=running.config.use_upgrades,
        player_count=running.player_count,
        can_close=running.can_close,
        stage=running.stage,
        round=running.round,
        poison=running.poison,
    )


def _lobbies_then_latest_game(game: ResumableGame) -> tuple[bool, datetime]:
    return game.kind == "lobby", _utc_or_default(game.last_active_at, datetime.min.replace(tzinfo=UTC))


def _with_cube_metadata(session: Session, games: list[ResumableGame]) -> list[ResumableGame]:
    cube_ids = {game.cube_id for game in games}
    metadata = {
        cast(str, row.cube_id): row for row in session.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_ids))
    }
    return [
        game.model_copy(
            update={
                "cube_name": cast(str | None, meta.name) if (meta := metadata.get(game.cube_id)) else None,
                "cube_image_uri": cast(str | None, meta.image_uri) if meta else None,
            }
        )
        for game in games
    ]


def _transfer_card_state(card_id: str, from_zones: Zones, to_zones: Zones) -> None:
    if card_id in from_zones.face_down_card_ids:
        from_zones.face_down_card_ids.remove(card_id)
        to_zones.face_down_card_ids.append(card_id)
    if card_id in from_zones.tapped_card_ids:
        from_zones.tapped_card_ids.remove(card_id)
        to_zones.tapped_card_ids.append(card_id)
    if card_id in from_zones.flipped_card_ids:
        from_zones.flipped_card_ids.remove(card_id)
        to_zones.flipped_card_ids.append(card_id)
    if card_id in from_zones.counters:
        to_zones.counters[card_id] = from_zones.counters.pop(card_id)
    if card_id in from_zones.attachments:
        del from_zones.attachments[card_id]


class GameManager:
    def __init__(self):
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
    async def _acquire_game_start_slot(self):
        if self._game_start_waiters >= MAX_GAME_START_QUEUE:
            raise GameStartQueueFullError("Server is starting many games. Please try again shortly.")

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

    async def start_background_tasks(self) -> None:
        if self._snapshot_task and not self._snapshot_task.done():
            return

        stale_cleanup_interval = int(3600 / self._snapshot_interval_sec)
        self.cleanup_stale_game_records()

        async def _loop() -> None:
            tick = 0
            while True:
                await asyncio.sleep(self._snapshot_interval_sec)
                tick += 1
                self.persist_dirty_games()
                self.evict_cold_games()
                self.cleanup_expired_spectate_requests()
                if tick % stale_cleanup_interval == 0:
                    self.cleanup_stale_game_records()

        self._snapshot_task = asyncio.create_task(_loop())
        logger.info("Started snapshot/eviction loop (every %.1fs)", self._snapshot_interval_sec)

    async def stop_background_tasks(self) -> None:
        if self._snapshot_task is None:
            return
        self._snapshot_task.cancel()
        self._snapshot_task = None
        self.persist_all_games()

    def persist_all_games(self) -> int:
        self._dirty_games.update(self._active_games.keys())
        return self.persist_dirty_games()

    def persist_dirty_games(self) -> int:
        # complete_game deleted their snapshots, so a write would restore a finished game on the next boot.
        self._dirty_games -= self._finished_games
        target_ids = [gid for gid in list(self._dirty_games) if gid in self._active_games]
        if not target_ids:
            return 0

        now = datetime.now(UTC)
        session = db.SessionLocal()
        wrote = 0
        try:
            for game_id in target_ids:
                game = self._active_games.get(game_id)
                if game is None:
                    self._dirty_games.discard(game_id)
                    continue

                state_json = game.snapshot_dump_json()
                activity_at = self._last_human_activity.get(game_id, now)
                stmt = sqlite_insert(ActiveGameSnapshot).values(
                    game_id=game_id,
                    state_json=state_json,
                    last_human_activity_at=activity_at,
                    updated_at=now,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=[ActiveGameSnapshot.game_id],
                    set_={
                        "state_json": state_json,
                        "last_human_activity_at": activity_at,
                        "updated_at": now,
                    },
                )
                session.execute(stmt)
                self._dirty_games.discard(game_id)
                wrote += 1
            session.commit()
        finally:
            session.close()

        if wrote:
            logger.info(
                "Snapshot flush: wrote=%d loaded_games=%d dirty_remaining=%d",
                wrote,
                len(self._active_games),
                len(self._dirty_games),
            )
        return wrote

    def _player_in_active_battle(self, game: Game, player_name: str) -> bool:
        return any(player_name in (b.player.name, b.opponent.name) for b in game.active_battles)

    def _canonicalize_active_battles(self, game: Game) -> bool:
        changed = False
        players_by_name = {p.name: p for p in game.players}
        canonical_battles: list[Battle] = []

        for active_battle in game.active_battles:
            canonical_player = players_by_name.get(active_battle.player.name)
            if canonical_player is None:
                logger.warning(
                    "Dropping restored battle with unknown player: %s",
                    active_battle.player.name,
                )
                changed = True
                continue
            if active_battle.player is not canonical_player:
                active_battle.player = canonical_player
                changed = True

            if isinstance(active_battle.opponent, Player):
                canonical_opponent = players_by_name.get(active_battle.opponent.name)
                if canonical_opponent is None:
                    logger.warning(
                        "Dropping restored battle with unknown opponent: %s",
                        active_battle.opponent.name,
                    )
                    changed = True
                    continue
                if active_battle.opponent is not canonical_opponent:
                    active_battle.opponent = canonical_opponent
                    changed = True

            canonical_battles.append(active_battle)

        if len(canonical_battles) != len(game.active_battles):
            changed = True
        game.active_battles = canonical_battles
        return changed

    def _recover_missing_active_battles(self, game: Game) -> int:
        recovered = 0
        candidates = sorted(
            (p for p in game.players if p.phase == "battle"),
            key=lambda p: p.name,
        )

        for player in candidates:
            if self._player_in_active_battle(game, player.name):
                continue
            if player.in_sudden_death:
                # Sudden death resumes through build-ready logic, not normal pairing.
                continue

            opponent = battle.find_opponent(game, player)
            if opponent is None:
                continue
            try:
                battle.start(game, player, opponent)
                recovered += 1
            except Exception:
                logger.exception("Failed recovering battle for player=%s", player.name)

        return recovered

    def _normalize_restored_game(self, game: Game) -> bool:
        before_battlers = [id(player.battler) if player.battler is not None else None for player in game.players]
        game.normalize_player_battlers()
        changed = self._canonicalize_active_battles(game)
        after_battlers = [id(player.battler) if player.battler is not None else None for player in game.players]
        if before_battlers != after_battlers:
            changed = True
        recovered = self._recover_missing_active_battles(game)
        if recovered > 0:
            changed = True
            logger.warning("Recovered %d missing active battle(s) after restore", recovered)
        return changed

    def _clear_runtime_player_mappings_for_game(self, game_id: str) -> None:
        players_to_remove = [pid for pid, gid in self._player_to_game.items() if gid == game_id]
        for pid in players_to_remove:
            self._player_to_game.pop(pid, None)
            self._player_id_to_name.pop(pid, None)

    def _persist_human_player_mappings(
        self,
        db_session: Session,
        game_id: str,
        player_pairs: list[tuple[str, str]],
        player_user_ids: dict[str, str] | None = None,
        seat_token_hashes: dict[str, str] | None = None,
    ) -> None:
        # Keep one active player_id mapping per human name for deterministic reconnect behavior.
        user_ids = player_user_ids or {}
        token_hashes = seat_token_hashes or {}
        for player_id, player_name in player_pairs:
            existing_rows = (
                db_session.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player_name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .all()
            )
            existing_user_id = next((cast(str, row.user_id) for row in existing_rows if row.user_id), None)
            resolved_user_id = user_ids.get(player_id) or existing_user_id
            existing_hash = next((cast(str, row.seat_token_hash) for row in existing_rows if row.seat_token_hash), None)

            for row in existing_rows:
                db_session.delete(row)

            db_session.add(
                GamePlayerRecord(
                    game_id=game_id,
                    player_id=player_id,
                    player_name=player_name,
                    is_puppet=False,
                    user_id=resolved_user_id,
                    seat_token_hash=token_hashes.get(player_name) or existing_hash,
                )
            )

    def _restore_human_player_mappings(self, db_session: Session, game_id: str, game: Game) -> int:
        self._clear_runtime_player_mappings_for_game(game_id)

        valid_names = {p.name for p in game.players}
        rows = (
            db_session.query(GamePlayerRecord)
            .filter(
                GamePlayerRecord.game_id == game_id,
                GamePlayerRecord.is_puppet.is_(False),
            )
            .all()
        )

        restored = 0
        for row in rows:
            player_id = cast(str, row.player_id)
            player_name = cast(str, row.player_name)
            if player_name not in valid_names:
                continue
            self._player_to_game[player_id] = game_id
            self._player_id_to_name[player_id] = player_name
            restored += 1
        return restored

    def _restore_snapshot_row(self, session: Session, row: ActiveGameSnapshot) -> bool:
        snapshot_game_id = cast(str, row.game_id)
        try:
            game = restore_game_from_snapshot(cast(str, row.state_json))
        except Exception as exc:
            logger.exception("Snapshot does not restore; quarantining game_id=%s", snapshot_game_id)
            session.add(
                QuarantinedGameSnapshot(
                    game_id=snapshot_game_id,
                    state_json=row.state_json,
                    last_human_activity_at=row.last_human_activity_at,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
            session.delete(row)
            return False
        last_activity = cast(datetime | None, row.last_human_activity_at)
        self._active_games[snapshot_game_id] = game
        self._dirty_games.discard(snapshot_game_id)
        if self._normalize_restored_game(game):
            self.mark_game_dirty(snapshot_game_id, human_activity=False)
        self._restore_human_player_mappings(session, snapshot_game_id, game)
        self._last_human_activity[snapshot_game_id] = _utc_or_default(last_activity, datetime.now(UTC))
        return True

    def restore_game_from_snapshot(self, game_id: str) -> bool:
        if game_id in self._active_games:
            return True

        session = db.SessionLocal()
        try:
            row = session.get(ActiveGameSnapshot, game_id)
            if row is None:
                return False
            game = restore_game_from_snapshot(cast(str, row.state_json))
            self._active_games[game_id] = game
            self._dirty_games.discard(game_id)
            if self._normalize_restored_game(game):
                self.mark_game_dirty(game_id, human_activity=False)
            restored_mappings = self._restore_human_player_mappings(session, game_id, game)
            if restored_mappings == 0:
                logger.warning("No human player mappings restored for game_id=%s", game_id)
            last_activity = cast(datetime | None, row.last_human_activity_at)
            self._last_human_activity[game_id] = _utc_or_default(last_activity, datetime.now(UTC))
            logger.info("Restored active game from snapshot: game_id=%s", game_id)
            return True
        except Exception:
            logger.exception("Failed restoring snapshot for game_id=%s", game_id)
            return False
        finally:
            session.close()

    async def restore_all_snapshots(self) -> int:
        restored = 0
        session = db.SessionLocal()
        try:
            rows = session.query(ActiveGameSnapshot).all()
            for row in rows:
                snapshot_game_id = cast(str, row.game_id)
                async with self.get_action_lock(snapshot_game_id):
                    if self._restore_snapshot_row(session, row):
                        restored += 1
            session.commit()
        finally:
            session.close()

        if restored:
            logger.info("Restored %d active games from snapshots", restored)
        return restored

    def delete_snapshot(self, game_id: str) -> None:
        session = db.SessionLocal()
        try:
            row = session.get(ActiveGameSnapshot, game_id)
            if row is not None:
                session.delete(row)
                session.commit()
        except Exception:
            # Some tests construct GameManager without initializing DB schema.
            # Snapshot deletion should be best-effort and never break game cleanup.
            logger.debug("Skipping snapshot delete for game_id=%s", game_id, exc_info=True)
        finally:
            session.close()
        self._dirty_games.discard(game_id)

    def _close_game_record(self, game_id: str) -> None:
        session = db.SessionLocal()
        try:
            record = session.query(GameRecord).filter(GameRecord.id == game_id).first()
            if record and record.ended_at is None:
                record.ended_at = datetime.now(UTC)
                session.commit()
        except Exception:
            logger.debug("Skipping ended_at update for game_id=%s", game_id, exc_info=True)
        finally:
            session.close()

    def cleanup_stale_game_records(self, max_age_hours: int = STALE_GAME_CLEANUP_HOURS) -> int:
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
        session = db.SessionLocal()
        loaded_ids = list(self._active_games)
        try:
            stale = (
                session.query(GameRecord)
                .outerjoin(ActiveGameSnapshot, ActiveGameSnapshot.game_id == GameRecord.id)
                .filter(
                    GameRecord.ended_at.is_(None),
                    GameRecord.id.not_in(loaded_ids),
                    func.coalesce(ActiveGameSnapshot.last_human_activity_at, GameRecord.created_at) < cutoff,
                )
                .all()
            )
            # A paused game expires by its last human activity, even when an older eviction stamped ended_at.
            stale_snapshot_ids = [
                game_id
                for (game_id,) in session.query(ActiveGameSnapshot.game_id).filter(
                    ActiveGameSnapshot.last_human_activity_at < cutoff,
                    ActiveGameSnapshot.game_id.not_in(loaded_ids),
                )
            ]
            stale_ids = {cast(str, record.id) for record in stale} | set(stale_snapshot_ids)
            if not stale_ids:
                return 0

            self._retire_games(session, stale_ids)
            logger.info("Retired %d stale games older than %dh", len(stale_ids), max_age_hours)
            return len(stale_ids)
        except Exception:
            logger.exception("Error cleaning up stale game records")
            session.rollback()
            return 0
        finally:
            session.close()

    def _retire_games(self, session: Session, game_ids: set[str]) -> None:
        """End games nobody will finish. They can't be resumed, and no one in them gets a placement."""
        session.query(GameRecord).filter(GameRecord.id.in_(game_ids), GameRecord.ended_at.is_(None)).update(
            {GameRecord.ended_at: datetime.now(UTC)}, synchronize_session=False
        )
        session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id.in_(game_ids)).delete(
            synchronize_session=False
        )
        session.commit()

    def evict_cold_games(self) -> int:
        cutoff = datetime.now(UTC) - timedelta(minutes=IDLE_EVICT_MINUTES)
        candidates: list[str] = []
        for game_id in self._active_games:
            if self._connected_player_ids(game_id):
                continue
            last_human = _utc_or_default(
                self._last_human_activity.get(game_id),
                datetime.min.replace(tzinfo=UTC),
            )
            if last_human < cutoff:
                candidates.append(game_id)

        if not candidates:
            return 0

        evicted = 0
        for game_id in candidates:
            self.mark_game_dirty(game_id, human_activity=False)
            self.persist_dirty_games()
            self._cleanup_game(game_id, preserve_snapshot=True)
            evicted += 1

        if evicted:
            logger.info("Evicted cold games from memory: count=%d", evicted)
        return evicted

    def reset_runtime_state(self) -> dict[str, int]:
        active_before = len(self._active_games)
        pending_before = len(self._pending_games)
        spectate_before = len(self._spectate_requests)
        cleanup_before = len(self._post_game_cleanup_tasks) + len(self._abandoned_cleanup_tasks)
        pending_disconnect_before = len(self._pending_disconnect_tasks)

        for tasks in (self._post_game_cleanup_tasks, self._abandoned_cleanup_tasks):
            for task in list(tasks.values()):
                task.cancel()
            tasks.clear()

        for task in list(self._pending_disconnect_tasks.values()):
            task.cancel()
        self._pending_disconnect_tasks.clear()

        for task in list(self._host_handoff_tasks.values()):
            task.cancel()
        self._host_handoff_tasks.clear()

        game_ids = list(set(self._active_games.keys()) | set(self._pending_games.keys()))
        for game_id in game_ids:
            self._cleanup_game(game_id)

        self._spectate_requests.clear()
        self._dirty_games.clear()

        return {
            "active_before": active_before,
            "pending_before": pending_before,
            "games_cleared": len(game_ids),
            "spectate_requests_cleared": spectate_before,
            "cleanup_tasks_cancelled": cleanup_before,
            "pending_disconnect_tasks_cancelled": pending_disconnect_before,
            "active_after": len(self._active_games),
            "pending_after": len(self._pending_games),
        }

    def create_game(
        self,
        player_name: str,
        player_id: str,
        *,
        cube_id: str = "auto",
        use_upgrades: bool = True,
        use_vanguards: bool = False,
        target_player_count: int = 4,
        auto_approve_spectators: bool = False,
        guided_mode_default: bool = False,
        play_mode: PlayMode = "limited",
        user_id: str | None = None,
    ) -> PendingGame:
        play_mode = normalize_play_mode(play_mode)
        game_id = secrets.token_urlsafe(8)
        join_code = "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))

        player_user_ids: dict[str, str] = {}
        if user_id:
            player_user_ids[player_id] = user_id

        pending = PendingGame(
            game_id=game_id,
            join_code=join_code,
            cube_id=cube_id,
            host_player_id=player_id,
            player_names=[player_name],
            player_ids=[player_id],
            use_upgrades=use_upgrades,
            use_vanguards=use_vanguards,
            target_player_count=target_player_count,
            auto_approve_spectators=auto_approve_spectators,
            guided_mode_default=guided_mode_default,
            play_mode=play_mode,
            player_ready={player_id: False},
            player_battlers={player_id: BattlerMissing()},
            player_user_ids=player_user_ids,
        )
        self._pending_games[game_id] = pending
        self._join_code_to_game[join_code] = game_id
        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def get_pending_game(self, game_id: str) -> PendingGame | None:
        return self._pending_games.get(game_id)

    def get_game_id_by_join_code(self, join_code: str) -> str | None:
        return self._join_code_to_game.get(join_code.upper())

    def get_pending_game_by_code(self, join_code: str) -> PendingGame | None:
        game_id = self.get_game_id_by_join_code(join_code)
        return self._pending_games.get(game_id) if game_id else None

    def join_game(
        self, join_code: str, player_name: str, player_id: str, user_id: str | None = None
    ) -> PendingGame | None:
        pending = self.get_pending_game_by_code(join_code)
        if not pending or not pending.accepts_changes:
            return None

        if pending.has_player_named(player_name):
            return None

        total = len(pending.player_names) + pending.puppet_count
        if total >= pending.target_player_count:
            return None
        if total >= 8:
            return None

        pending.player_names.append(player_name)
        pending.player_ids.append(player_id)
        pending.player_ready[player_id] = False
        pending.player_battlers[player_id] = BattlerMissing()
        if user_id:
            pending.player_user_ids[player_id] = user_id
        self._player_to_game[player_id] = pending.game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def _can_player_ready(self, pending: PendingGame, player_id: str, is_ready: bool) -> tuple[bool, str | None]:
        if player_id not in pending.player_ids:
            return False, "Player not found"

        if not is_ready or pending.play_mode != "constructed":
            return True, None

        match pending.player_battlers.get(player_id, BattlerMissing()):
            case BattlerReady():
                return True, None
            case BattlerLoading():
                return False, "Your deck is still loading"
            case BattlerFailed(error=error):
                return False, error
            case BattlerMissing():
                return False, "Submit a valid deck before readying up"

    def set_player_ready(self, game_id: str, player_id: str, is_ready: bool) -> tuple[bool, str | None]:
        pending = self._pending_games.get(game_id)
        if not pending:
            return False, "Game not found"
        if not pending.accepts_changes:
            return False, LOBBY_STARTING_MESSAGE

        can_ready, error = self._can_player_ready(pending, player_id, is_ready)
        if not can_ready:
            return False, error

        pending.player_ready[player_id] = is_ready
        return True, None

    def clear_player_battler(self, game_id: str, player_id: str) -> tuple[bool, str | None]:
        pending = self._pending_games.get(game_id)
        if not pending:
            return False, "Game not found"
        if not pending.accepts_changes:
            return False, LOBBY_STARTING_MESSAGE

        if pending.play_mode != "constructed":
            return False, "Deck submission is only available in constructed mode"

        if player_id not in pending.player_ids:
            return False, "Player not found"

        self._set_player_battler(pending, player_id, BattlerMissing())
        return True, None

    def start_rules(self, pending: PendingGame, by: str) -> str | None:
        """Why the player `by` can't start this lobby now, or None when they can.

        The lobby view, the websocket and the HTTP route all ask this. Whether the server has room for
        another game is checked when the start runs, since that changes without the lobby changing.
        """
        return self._start_refusal(pending, by, lambda: self._count_available_bots(pending))

    def _start_refusal(self, pending: PendingGame, by: str, available_bots: Callable[[], int | None]) -> str | None:
        if pending.stage is LobbyStage.STARTING:
            return "The game is already starting"
        if pending.stage is LobbyStage.STARTED:
            return "Game has already started"
        if by != pending.host_player_id:
            return "Only the host can start the game"
        if pending.target_player_count < 2:
            return "Need at least 2 players to start"

        total = len(pending.player_names) + pending.puppet_count
        if total != pending.target_player_count:
            return f"Need exactly {pending.target_player_count} players"

        if not all(pending.player_ready.get(pid, False) for pid in pending.player_ids):
            return "Not all players are ready"

        if pending.play_mode == "constructed":
            if not all(isinstance(pending.player_battlers.get(pid), BattlerReady) for pid in pending.player_ids):
                return "All players must submit a valid deck"
        elif pending.battler_error:
            return pending.battler_error

        if pending.puppet_count > 0:
            available = available_bots()
            if available is None or available < pending.puppet_count:
                return "Not enough puppets are available for this table"

        return None

    async def start_lobby(
        self,
        game_id: str,
        by: str,
        db: Session | None,
        on_change: Callable[[], Awaitable[None]],
    ) -> Game:
        """Start a lobby for its host and return the running game.

        Raises LobbyStartRefusedError when start_rules or the server's capacity refuses, and
        LobbyStartFailedError when the start began but couldn't finish. `on_change` runs when the lobby
        moves to starting and when a failed start returns it to open, so the caller can show every player.
        """
        async with self.get_action_lock(game_id):
            pending = self._pending_games.get(game_id)
            if pending is None:
                raise LobbyStartRefusedError("Game not found")
            refusal = self.start_rules(pending, by) or self._server_start_refusal()
            if refusal:
                raise LobbyStartRefusedError(refusal)
            pending.stage = LobbyStage.STARTING
            pending.start_error = None

        failure = "Failed to start game"
        game: Game | None = None
        try:
            await on_change()
            game = await self._run_lobby_start(pending, db)
        except LobbyStartFailedError as exc:
            failure = str(exc)
        except Exception:
            logger.exception("Lobby start failed: game_id=%s", game_id)
        finally:
            if game is None:
                if self._pending_games.get(game_id) is pending:
                    async with self.get_action_lock(game_id):
                        if self._pending_games.get(game_id) is pending:
                            self._return_lobby_to_open(pending, failure)
                else:
                    self._return_lobby_to_open(pending, failure)

        if game is None:
            await on_change()
            raise LobbyStartFailedError(failure)
        return game

    def _server_start_refusal(self) -> str | None:
        allowed, reason = self.can_accept_loaded_game()
        if not allowed:
            return reason
        if self._game_start_waiters >= MAX_GAME_START_QUEUE:
            return "Server is starting many games. Please try again shortly."
        return None

    def _return_lobby_to_open(self, pending: PendingGame, reason: str) -> None:
        pending.stage = LobbyStage.FAILED
        pending.start_error = reason
        # Readiness was frozen while the lobby started, so anyone who left meanwhile is still ready.
        connected = self._connected_player_ids(pending.game_id)
        for player_id in pending.player_ids:
            if player_id not in connected:
                pending.player_ready[player_id] = False

    async def _run_lobby_start(self, pending: PendingGame, db: Session | None) -> Game:
        try:
            async with self._acquire_game_start_slot():
                if pending.play_mode == "limited":
                    await self._finish_loading_cube(pending)
                if self._pending_games.get(pending.game_id) is not pending:
                    raise LobbyStartFailedError("The lobby closed while it was starting")
                async with self.get_action_lock(pending.game_id):
                    if self._pending_games.get(pending.game_id) is not pending:
                        raise LobbyStartFailedError("The lobby closed while it was starting")
                    allowed, reason = self.can_accept_loaded_game()
                    if not allowed:
                        raise LobbyStartFailedError(reason)
                    return self._create_started_game(pending, db)
        except GameStartQueueFullError as exc:
            raise LobbyStartFailedError(str(exc)) from exc

    async def _finish_loading_cube(self, pending: PendingGame) -> None:
        if pending._loading_task and not pending._loading_task.done():
            try:
                await asyncio.wait_for(pending._loading_task, timeout=30.0)
            except TimeoutError:
                pass

        if pending.battler_error:
            raise LobbyStartFailedError(pending.battler_error)
        if pending.battler is not None:
            return

        loop = asyncio.get_running_loop()
        try:
            pending.battler = await loop.run_in_executor(
                None,
                self._load_battler,
                pending.cube_id,
                pending.use_upgrades,
                pending.use_vanguards,
                pending.play_mode,
            )
        except Exception as e:
            logger.warning("Failed to load cube %s for start: %s", pending.cube_id, e)
            raise LobbyStartFailedError(self._normalize_battler_error(pending.cube_id, pending.play_mode, e)) from e

    def _create_started_game(self, pending: PendingGame, db: Session | None) -> Game:
        config = Config(
            use_upgrades=pending.use_upgrades,
            use_vanguards=pending.use_vanguards,
            auto_approve_spectators=pending.auto_approve_spectators,
            voice_chat_enabled=pending.voice_chat_enabled,
            cube_id=pending.cube_id,
            play_mode=pending.play_mode,
        )
        game = create_game(pending.player_names, len(pending.player_names), config)
        # Dealing shuffles and slices a battler's cards, so the game deals from its own copies and a start that
        # fails after this leaves the lobby's cube and decks whole for the next attempt.
        if pending.play_mode == "limited":
            battler = pending.battler
            if battler is None:
                raise LobbyStartFailedError("The cube isn't loaded")
            needed = draft.cards_needed_for_first_draft(config, len(pending.player_names))
            if len(battler.cards) < needed:
                raise LobbyStartFailedError(
                    f"This cube has {len(battler.cards)} playable cards and needs at least {needed} "
                    "to give everyone a pack."
                )
            set_battler(game, _copy_for_dealing(battler))
            target_elo = battler.elo or 1200.0
        else:
            battlers = self._build_constructed_battlers_by_player(pending)
            set_player_battlers(game, {name: _copy_for_dealing(b) for name, b in battlers.items()})
            target_elo = self._get_game_target_elo(game)

        if db is not None:
            if pending.puppet_count > 0:
                self.load_fake_players_for_game(
                    db,
                    game,
                    count=pending.puppet_count,
                    target_elo=target_elo,
                    use_upgrades=pending.use_upgrades,
                    use_vanguards=pending.use_vanguards,
                    cube_id=pending.cube_id if pending.play_mode == "limited" else None,
                    play_mode=pending.play_mode,
                )

            # Written last, so a start that fails before here leaves nothing behind for the next attempt.
            config_data = {
                "use_upgrades": pending.use_upgrades,
                "use_vanguards": pending.use_vanguards,
                "cube_id": pending.cube_id,
                "play_mode": pending.play_mode,
            }
            db.add(GameRecord(id=pending.game_id, config_json=json.dumps(config_data), cube_id=pending.cube_id))
            self._persist_human_player_mappings(
                db,
                pending.game_id,
                list(zip(pending.player_ids, pending.player_names, strict=False)),
                player_user_ids=pending.player_user_ids,
                seat_token_hashes=pending.seat_token_hashes,
            )
            db.commit()

        logger.info(
            "Game started: game_id=%s cube=%s players=%s",
            pending.game_id,
            pending.cube_id,
            pending.player_names,
        )
        pending.stage = LobbyStage.STARTED
        self._active_games[pending.game_id] = game
        self._pending_games.pop(pending.game_id, None)
        self._last_human_activity[pending.game_id] = datetime.now(UTC)
        self.mark_game_dirty(pending.game_id)
        return game

    def complete_game(self, game_id: str, winner: Player | None, db: Session | None = None) -> None:
        """Complete a game - set phases, persist final state, schedule cleanup."""
        game = self._active_games.get(game_id)
        if not game:
            return
        self._finished_games.add(game_id)

        finalize_game_over(game, winner)
        if winner:
            logger.info("Game won: game_id=%s winner=%s", game_id, winner.name)
        else:
            logger.info("Game over with no winner: game_id=%s", game_id)

        if db is not None:
            game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
            if game_record:
                game_record.ended_at = datetime.now(UTC)  # ty: ignore[invalid-assignment]
                if winner:
                    game_record.winner_player_id = winner.name  # ty: ignore[invalid-assignment]
                db.commit()

            self._persist_final_placements(db, game_id, game)

        self.delete_snapshot(game_id)
        self._schedule_cleanup(self._post_game_cleanup_tasks, game_id, POST_GAME_CLEANUP_SECONDS)

    def _persist_player_placement(self, db: Session | None, game_id: str | None, participant: Player | Puppet) -> None:
        if not db or not game_id:
            return
        if self._write_final_state(db, game_id, participant):
            db.commit()

    def _persist_final_placements(self, db: Session, game_id: str, game: Game) -> None:
        participants: list[Player | Puppet] = [p for p in game.players if p.placement > 0]
        participants.extend(fp for fp in game.puppets if fp.placement > 0)

        for participant in participants:
            self._write_final_state(db, game_id, participant)
        db.commit()

    def _persist_exit(self, db: Session | None, game_id: str | None, game: Game, participant: Player | Puppet) -> None:
        # Going out can move the places of everyone out in the same round.
        for out in get_same_round_exits(game, participant):
            self._persist_player_placement(db, game_id, out)

    def _apply_resolution_outcome(
        self,
        game: Game,
        outcome: RoundResolutionOutcome,
        *,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        for participant in outcome.eliminated:
            self._persist_exit(db, game_id, game, participant)
        if outcome.status == "game_over":
            self.complete_game(game_id or "", outcome.winner, db)
            return "game_over"
        if outcome.check_round_start and outcome.status is None:
            self._start_round_if_ready(game, game_id, db)
        return outcome.status

    def _write_final_state(self, db: Session, game_id: str, participant: Player | Puppet) -> bool:
        history = (
            db.query(PlayerGameHistory)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name == participant.name,
            )
            .first()
        )
        if history:
            history.final_placement = participant.placement  # ty: ignore[invalid-assignment]
            history.final_poison = participant.poison  # ty: ignore[invalid-assignment]
            # Puppets replay builds from a past game, so they have no treasures of their own.
            history.final_treasures = participant.treasures if isinstance(participant, Player) else None  # ty: ignore[invalid-assignment]
        return history is not None

    def _schedule_cleanup(self, tasks: dict[str, asyncio.Task], game_id: str, delay: float) -> None:
        if existing := tasks.pop(game_id, None):
            existing.cancel()

        async def cleanup_after_delay():
            await asyncio.sleep(delay)
            async with self.get_action_lock(game_id):
                self._cleanup_game(game_id)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        tasks[game_id] = loop.create_task(cleanup_after_delay())

    def schedule_abandoned_cleanup(self, game_id: str, delay: float = ABANDONED_CLEANUP_SECONDS) -> None:
        """Schedule cleanup for abandoned game (default 24 hours)."""
        logger.info("Scheduling abandoned game cleanup for game_id=%s in %.0f seconds", game_id, delay)
        self._schedule_cleanup(self._abandoned_cleanup_tasks, game_id, delay)

    def cancel_abandoned_cleanup(self, game_id: str) -> None:
        """Cancel the abandoned-game cleanup when a player reconnects. A finished game's cleanup still runs."""
        if task := self._abandoned_cleanup_tasks.pop(game_id, None):
            task.cancel()
            logger.info("Cancelled abandoned game cleanup for game_id=%s", game_id)

    def _cleanup_game(self, game_id: str, *, preserve_snapshot: bool = False) -> None:
        """Remove game from memory."""
        logger.info("Executing cleanup for game_id=%s", game_id)
        pending = self._pending_games.get(game_id)
        if pending:
            if pending._loading_task and not pending._loading_task.done():
                pending._loading_task.cancel()
            for player_id in list(pending.player_battlers):
                self._set_player_battler(pending, player_id, BattlerMissing())
            self._join_code_to_game.pop(pending.join_code, None)

        self._active_games.pop(game_id, None)
        self._pending_games.pop(game_id, None)
        self._clear_runtime_player_mappings_for_game(game_id)
        self._spectate_requests.drop_game(game_id)
        self._spectate_listener.game_dropped(game_id)

        self._cancel_host_handoff(game_id)
        abandoned_cleanup = self._abandoned_cleanup_tasks.pop(game_id, None)
        # Unloading only frees memory, so a finished game's post-game cleanup stays scheduled and still retires it.
        post_game_cleanup = None if preserve_snapshot else self._post_game_cleanup_tasks.pop(game_id, None)
        running = _current_task()
        for cleanup_task in (abandoned_cleanup, post_game_cleanup):
            # The scheduled cleanup itself ends up here, and must not cancel itself mid-run.
            if cleanup_task is not None and cleanup_task is not running:
                cleanup_task.cancel()
        self._last_human_activity.pop(game_id, None)
        self._action_locks.pop(game_id, None)
        self._finished_games.discard(game_id)
        if not preserve_snapshot:
            self.delete_snapshot(game_id)
            self._close_game_record(game_id)

    def _load_battler(self, cube_id: str, use_upgrades: bool, use_vanguards: bool, play_mode: PlayMode) -> Battler:
        upgrades_id = DEFAULT_UPGRADES_ID if use_upgrades else None
        vanguards_id = DEFAULT_VANGUARD_ID if use_vanguards else None
        battler = build_battler(cube_id, upgrades_id, vanguards_id)
        validate_battler(battler, play_mode=play_mode)
        return battler

    def _load_constructed_battler(self, battler_id: str, use_upgrades: bool, use_vanguards: bool) -> Battler:
        return self._load_battler(battler_id, use_upgrades, use_vanguards, play_mode="constructed")

    def _normalize_battler_error(self, battler_id: str, play_mode: PlayMode, error: Exception) -> str:
        noun = "deck" if play_mode == "constructed" else "cube"
        if isinstance(error, IllegalBattlerError):
            return f"{noun.capitalize()} '{battler_id}' is illegal: {error.problem}"
        # CubeCobra answers an ID with a slash in it, such as a pasted link, with a web page and status 200.
        if isinstance(error, json.JSONDecodeError) or (
            isinstance(error, HTTPStatusError) and error.response.status_code in {403, 404}
        ):
            return (
                f"Couldn't load {noun} '{battler_id}'. Check that the CubeCobra ID is correct and the {noun} is public."
            )
        if isinstance(error, HTTPStatusError | RequestError):
            return f"Couldn't load {noun} '{battler_id}' right now. Please try again."
        return f"Couldn't load {noun} '{battler_id}'. Please try again."

    async def _preload_battler(
        self, pending: PendingGame, on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None
    ) -> None:
        pending.battler_loading = True
        pending.battler_error = None
        battler: Battler | None = None
        error_message: str | None = None
        try:
            async with self._battler_preload_slots:
                loop = asyncio.get_running_loop()
                battler = await loop.run_in_executor(
                    None,
                    self._load_battler,
                    pending.cube_id,
                    pending.use_upgrades,
                    pending.use_vanguards,
                    pending.play_mode,
                )
        except Exception as e:
            logger.warning("Failed to preload battler %s: %s", pending.cube_id, e)
            error_message = self._normalize_battler_error(pending.cube_id, pending.play_mode, e)
        finally:
            if self._pending_games.get(pending.game_id) is pending:
                async with self.get_action_lock(pending.game_id):
                    if battler is not None:
                        pending.battler = battler
                    if error_message is not None:
                        pending.battler_error = error_message
                    pending.battler_loading = False
            else:
                pending.battler_loading = False
            if on_complete:
                await on_complete()

    def start_battler_preload(
        self, pending: PendingGame, on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None
    ) -> None:
        try:
            loop = asyncio.get_running_loop()
            task = loop.create_task(self._preload_battler(pending, on_complete))
            pending._loading_task = task
        except RuntimeError:
            pending.battler_loading = False

    def _set_player_battler(self, pending: PendingGame, player_id: str, slot: PlayerBattler) -> None:
        """The one way a constructed player's deck changes. A load it replaces is cancelled."""
        previous = pending.player_battlers.get(player_id)
        if isinstance(previous, BattlerLoading) and previous.task is not _current_task():
            previous.task.cancel()
        pending.player_battlers[player_id] = slot
        if not isinstance(slot, BattlerReady):
            pending.player_ready[player_id] = False

    async def _preload_player_battler(
        self,
        pending: PendingGame,
        player_id: str,
        battler_id: str,
        on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None,
    ) -> None:
        loaded: PlayerBattler
        try:
            async with self._battler_preload_slots:
                loop = asyncio.get_running_loop()
                battler = await loop.run_in_executor(
                    None,
                    self._load_constructed_battler,
                    battler_id,
                    pending.use_upgrades,
                    pending.use_vanguards,
                )
            loaded = BattlerReady(battler_id, battler)
        except Exception as e:
            logger.warning("Failed to preload player battler %s: %s", battler_id, e)
            loaded = BattlerFailed(battler_id, self._normalize_battler_error(battler_id, "constructed", e))

        if self._pending_games.get(pending.game_id) is pending:
            async with self.get_action_lock(pending.game_id):
                slot = pending.player_battlers.get(player_id)
                if isinstance(slot, BattlerLoading) and slot.task is _current_task():
                    self._set_player_battler(pending, player_id, loaded)
        if on_complete:
            await on_complete()

    def start_player_battler_preload(
        self,
        pending: PendingGame,
        player_id: str,
        battler_id: str,
        on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None,
    ) -> str | None:
        battler_id = battler_id.strip()
        if not pending.accepts_changes:
            return LOBBY_STARTING_MESSAGE
        if pending.play_mode != "constructed":
            return "Deck submission is only available in constructed mode"
        if player_id not in pending.player_ids:
            return "Player not found"
        if not battler_id:
            return "Please enter your deck's CubeCobra ID"

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return "Unable to load your deck right now"
        task = loop.create_task(self._preload_player_battler(pending, player_id, battler_id, on_complete))
        self._set_player_battler(pending, player_id, BattlerLoading(battler_id, task))
        return None

    def record_player_battler_error(self, pending: PendingGame, player_id: str, battler_id: str, error: str) -> None:
        self._set_player_battler(pending, player_id, BattlerFailed(battler_id, error))

    def _ensure_unique_name(self, name: str, existing_names: set[str]) -> str:
        """Return a unique version of the name, adding suffix if needed."""
        if name not in existing_names:
            return name
        counter = 2
        while f"{name} ({counter})" in existing_names:
            counter += 1
        return f"{name} ({counter})"

    def _is_suspicious_name(self, name: str) -> bool:
        if not name or len(name) <= 1:
            return True
        if name.isdigit():
            return True
        lower = name.lower()
        if lower in ("test", "testing", "asdf", "qwerty"):
            return True
        return len(set(lower)) == 1

    def _has_triple_same_basic(self, history: PlayerGameHistory) -> bool:
        first_snapshot = next((s for s in history.snapshots if s.stage == 3 and s.round == 1), None)
        # Can't verify without the first snapshot, skip to be safe
        if not first_snapshot:
            return True
        basics = json.loads(first_snapshot.basic_lands_json)
        return len(set(basics)) == 1

    def _find_historical_players(
        self,
        db: Session,
        target_elo: float,
        *,
        count: int,
        exclude_ids: list[int],
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
        play_mode: PlayMode = "limited",
    ) -> list[PlayerGameHistory]:
        play_mode = normalize_play_mode(play_mode)
        query = (
            db.query(PlayerGameHistory)
            .options(joinedload(PlayerGameHistory.snapshots))
            .filter(
                PlayerGameHistory.id.notin_(exclude_ids) if exclude_ids else sql_true(),
                PlayerGameHistory.max_stage >= 6,
                PlayerGameHistory.is_puppet.is_(False),
            )
        )

        all_histories = query.all()
        same_cube: list[PlayerGameHistory] = []
        other_cube: list[PlayerGameHistory] = []

        for history in all_histories:
            has_starting_stage = any(s.stage == 3 for s in history.snapshots)
            if not has_starting_stage:
                continue

            if self._is_suspicious_name(str(history.player_name or "")):
                continue

            if self._has_triple_same_basic(history):
                continue

            game_record = db.query(GameRecord).filter(GameRecord.id == history.game_id).first()
            if not game_record or not game_record.config_json:
                continue
            config = json.loads(str(game_record.config_json))
            saved_play_mode = normalize_play_mode(cast(str | None, config.get("play_mode")))
            if saved_play_mode != play_mode:
                continue
            if use_upgrades is not None and config.get("use_upgrades") != use_upgrades:
                continue
            if use_vanguards is not None and config.get("use_vanguards") != use_vanguards:
                continue

            if play_mode == "limited" and cube_id and config.get("cube_id") == cube_id:
                same_cube.append(history)
            else:
                other_cube.append(history)

        elo_range = 200

        if target_elo:
            same_cube = [h for h in same_cube if abs(cast(float, h.battler_elo) - target_elo) <= elo_range]
            other_cube = [h for h in other_cube if abs(cast(float, h.battler_elo) - target_elo) <= elo_range]

        random.shuffle(same_cube)
        random.shuffle(other_cube)

        result = same_cube[:count]
        if len(result) < count:
            result.extend(other_cube[: count - len(result)])

        return result

    def _load_fake_player(self, db: Session, history: PlayerGameHistory, existing_names: set[str]) -> Puppet:
        snapshots_dict: dict[str, StaticOpponent] = {}
        player_name = cast(str, history.player_name)
        history_id = cast(int, history.id)

        bot_name = self._ensure_unique_name(player_name, existing_names)

        for snapshot in history.snapshots:
            # A puppet replays a past run one round at a time, so it keeps each round's ordinary build.
            if snapshot.sudden_death_build is not None:
                continue
            key = f"{snapshot.stage}_{snapshot.round}"
            snapshot_data = restore_snapshot_data(snapshot.full_state_json)
            static_opp = StaticOpponent.from_snapshot(snapshot_data, bot_name, history_id)
            snapshots_dict[key] = static_opp

        return Puppet(
            name=bot_name,
            player_history_id=history_id,
            snapshots=snapshots_dict,
        )

    def _build_constructed_battlers_by_player(self, pending: PendingGame) -> dict[str, Battler]:
        battlers_by_player: dict[str, Battler] = {}
        for player_id, player_name in zip(pending.player_ids, pending.player_names, strict=False):
            player_battler = pending.player_battlers.get(player_id)
            if not isinstance(player_battler, BattlerReady):
                raise LobbyStartFailedError("All players must submit a valid deck")
            battlers_by_player[player_name] = player_battler.battler
        return battlers_by_player

    def _get_game_target_elo(self, game: Game) -> float:
        elos = [player.battler.elo for player in game.players if player.battler is not None and player.battler.elo]
        if not elos:
            return 1200.0
        return sum(elos) / len(elos)

    def _record_snapshot(
        self,
        db: Session,
        game_id: str,
        player: Player,
        battler_elo: float,
        *,
        opponent_name: str | None = None,
        sudden_death_build: int | None = None,
    ) -> BattleSnapshot:
        history = (
            db.query(PlayerGameHistory)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name == player.name,
            )
            .first()
        )

        stage = player.stage

        if not history:
            gpr = (
                db.query(GamePlayerRecord.user_id)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player.name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .first()
            )
            history = PlayerGameHistory(
                game_id=game_id,
                player_name=player.name,
                battler_elo=battler_elo,
                max_stage=stage,
                max_round=player.round,
                user_id=str(gpr[0]) if gpr and gpr[0] else None,
            )
            db.add(history)
            db.flush()
        elif stage > history.max_stage or (stage == history.max_stage and player.round > history.max_round):
            history.max_stage = stage  # ty: ignore[invalid-assignment]
            history.max_round = player.round  # ty: ignore[invalid-assignment]

        snapshot_data = BattleSnapshotData(
            hand=[c.model_copy() for c in player.hand],
            vanguard=player.vanguard.model_copy() if player.vanguard else None,
            basic_lands=player.chosen_basics.copy(),
            applied_upgrades=[
                u.model_copy(update={"is_revealed": True}) for u in player.upgrades if reward.is_applied_upgrade(u)
            ],
            upgrades=[
                u.model_copy(update={"is_revealed": True}) if reward.is_applied_upgrade(u) else u.model_copy()
                for u in player.upgrades
            ],
            treasures=player.treasures,
            sideboard=[c.model_copy() for c in player.sideboard],
            command_zone=[c.model_copy() for c in player.command_zone],
            poison=player.poison,
            play_draw_preference=player.play_draw_preference,
        )

        snapshot = BattleSnapshot(
            player_history_id=history.id,
            stage=stage,
            round=player.round,
            hand_json=json.dumps([ref.model_dump() for ref in cards_to_refs(player.hand)]),
            vanguard_json=(ref.model_dump_json() if (ref := card_to_ref(player.vanguard)) is not None else None),
            basic_lands_json=json.dumps(player.chosen_basics),
            applied_upgrades_json=json.dumps(
                [
                    ref.model_dump()
                    for ref in cards_to_refs(
                        [
                            u.model_copy(update={"is_revealed": True})
                            for u in player.upgrades
                            if reward.is_applied_upgrade(u)
                        ]
                    )
                ]
            ),
            treasures=player.treasures,
            poison=player.poison,
            play_draw_preference=player.play_draw_preference,
            opponent_name=opponent_name,
            sudden_death_build=sudden_death_build,
            full_state_json=slim_snapshot_dump(snapshot_data),
        )
        db.add(snapshot)
        db.commit()
        return snapshot

    def _record_bot_poison(
        self, db: Session, game_id: str, fp: Puppet, *, battler_elo: float, stage: int, round_num: int
    ) -> None:
        history = (
            db.query(PlayerGameHistory)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name == fp.name,
                PlayerGameHistory.is_puppet.is_(True),
            )
            .first()
        )

        if not history:
            history = PlayerGameHistory(
                game_id=game_id,
                player_name=fp.name,
                battler_elo=battler_elo,
                max_stage=stage,
                max_round=round_num,
                is_puppet=True,
                source_history_id=fp.player_history_id,
            )
            db.add(history)
            db.flush()
        elif stage > history.max_stage or (stage == history.max_stage and round_num > history.max_round):
            history.max_stage = stage  # ty: ignore[invalid-assignment]
            history.max_round = round_num  # ty: ignore[invalid-assignment]

        raw = cast(str, history.poison_history_json) if history.poison_history_json else ""
        poison_map: dict[str, int] = json.loads(raw) if raw else {}
        poison_map[f"{stage}_{round_num}"] = fp.poison
        history.poison_history_json = json.dumps(poison_map)  # ty: ignore[invalid-assignment]
        db.commit()

    def load_fake_players_for_game(
        self,
        db: Session,
        game: Game,
        *,
        count: int,
        target_elo: float,
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
        play_mode: PlayMode = "limited",
    ) -> None:
        if count <= 0:
            return

        existing_names = {p.name for p in game.players}
        existing_names.update(fp.name for fp in game.puppets)

        histories = self._find_historical_players(
            db,
            target_elo,
            count=count,
            exclude_ids=[],
            use_upgrades=use_upgrades,
            use_vanguards=use_vanguards,
            cube_id=cube_id,
            play_mode=play_mode,
        )
        for history in histories:
            fake_player = self._load_fake_player(db, history, existing_names)
            existing_names.add(fake_player.name)
            game.puppets.append(fake_player)

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

    def has_game(self, game_id: str) -> bool:
        if game_id in self._pending_games or game_id in self._active_games:
            return True
        session = db.SessionLocal()
        try:
            return (
                session.query(ActiveGameSnapshot.game_id).filter(ActiveGameSnapshot.game_id == game_id).first()
                is not None
            )
        except Exception:
            return False
        finally:
            session.close()

    def get_game_status(
        self,
        game_id: str,
        *,
        connected_player_ids: Collection[str] = (),
    ) -> GameStatusResponse | None:
        pending = self._pending_games.get(game_id)
        if pending is not None:
            return build_pending_game_status(
                game_id,
                player_names=pending.player_names,
                player_ids=pending.player_ids,
                is_started=pending.is_started,
                auto_approve_spectators=pending.auto_approve_spectators,
                connected_player_ids=connected_player_ids,
            )

        game = self._active_games.get(game_id)
        if game is not None:
            connected_names = {
                player.name
                for player in game.players
                if (pid := self.get_player_id_by_name(game_id, player.name)) is not None and pid in connected_player_ids
            }
            return build_active_game_status(game_id, game, connected_player_names=connected_names)

        session = db.SessionLocal()
        try:
            snapshot = _extract_snapshot_status(session, game_id)
        except Exception:
            return None
        finally:
            session.close()
        if snapshot is None:
            return None
        config, players, puppets = snapshot
        return build_snapshot_game_status(game_id, config=config, players=players, puppets=puppets)

    def can_rejoin(
        self,
        game_id: str,
        player_name: str,
        is_player_connected: Callable[[str, str], bool] | None = None,
    ) -> bool:
        game = self._active_games.get(game_id)
        if game is not None:
            if not any(p.name == player_name for p in game.players):
                return False
            player_id = self.get_player_id_by_name(game_id, player_name)
            if player_id and is_player_connected:
                return not is_player_connected(game_id, player_id)
            return True

        session = db.SessionLocal()
        try:
            snapshot = _extract_snapshot_status(session, game_id)
        except Exception:
            return False
        finally:
            session.close()
        if snapshot is None:
            return False
        _, players, _ = snapshot
        return any(player.get("name") == player_name for player in players)

    def find_resumable_seats(self, seats: list[ResumableSeat], *, user_id: str | None = None) -> list[ResumableGame]:
        """The seats a caller can still return to: those its browser holds tokens for, and those its account took.

        One seat per game, the browser's first. Either proof closes a seat, so can_close follows the game's own rule.
        Never restores a snapshot."""
        session = db.SessionLocal()
        try:
            account_seats = self._account_seats(session, user_id) if user_id else set()
            seats = [
                *seats,
                *(
                    ResumableSeat(game_id=game_id, player_name=name, seat_token="")
                    for game_id, name in sorted(account_seats)
                ),
            ]
            stored_game_ids = [seat.game_id for seat in seats if seat.game_id not in self._pending_games]
            stored_hashes = {
                (cast(str, row.game_id), cast(str, row.player_name)): cast(str | None, row.seat_token_hash)
                for row in session.query(GamePlayerRecord).filter(
                    GamePlayerRecord.game_id.in_(stored_game_ids),
                    GamePlayerRecord.is_puppet.is_(False),
                )
            }
            # json_extract keeps the snapshot's card registry out of Python; only the seats are parsed.
            snapshots = {
                cast(str, row.game_id): row
                for row in session.query(
                    ActiveGameSnapshot.game_id,
                    ActiveGameSnapshot.last_human_activity_at,
                    func.json_extract(ActiveGameSnapshot.state_json, "$.data.config").label("config_json"),
                    func.json_extract(ActiveGameSnapshot.state_json, "$.data.players").label("players_json"),
                    func.coalesce(
                        func.json_array_length(ActiveGameSnapshot.state_json, "$.data.puppets"),
                        func.json_array_length(ActiveGameSnapshot.state_json, "$.data.fake_players"),
                        0,
                    ).label("puppet_count"),
                ).filter(ActiveGameSnapshot.game_id.in_(stored_game_ids))
            }

            resumable: list[ResumableGame] = []
            listed_game_ids: set[str] = set()
            for seat in seats:
                if seat.game_id in listed_game_ids:
                    continue
                key = (seat.game_id, seat.player_name)
                pending = self._pending_games.get(seat.game_id)
                if pending is not None and not pending.is_started:
                    holds_token = seat_token_matches(seat.seat_token, pending.seat_token_hashes.get(seat.player_name))
                    if holds_token or key in account_seats:
                        resumable.append(_resumable_lobby_seat(seat, pending))
                        listed_game_ids.add(seat.game_id)
                    continue

                holds_token = seat_token_matches(seat.seat_token, stored_hashes.get(key))
                if not holds_token and key not in account_seats:
                    continue
                game = self._active_games.get(seat.game_id)
                if game is not None:
                    running = _running_seat_in_game(game, seat.player_name)
                    last_active_at = self._last_human_activity.get(seat.game_id)
                elif (snapshot := snapshots.get(seat.game_id)) is not None:
                    running = _running_seat_in_snapshot(
                        json.loads(snapshot.config_json),
                        json.loads(snapshot.players_json),
                        snapshot.puppet_count,
                        seat.player_name,
                    )
                    last_active_at = _utc_or_default(snapshot.last_human_activity_at, datetime.now(UTC))
                else:
                    continue
                if running is None or running.phase in FINISHED_PLAYER_PHASES:
                    continue
                resumable.append(_resumable_game_seat(seat, running, last_active_at))
                listed_game_ids.add(seat.game_id)

            if user_id:
                # Each device saw different seats last, so an account's list goes by the games' own activity.
                resumable.sort(key=_lobbies_then_latest_game, reverse=True)
            return _with_cube_metadata(session, resumable)
        finally:
            session.close()

    def _account_seats(self, session: Session, user_id: str) -> set[tuple[str, str]]:
        # This runs off the event loop, so it reads copies of the dicts that games are added to and removed from.
        lobby_seats = {
            (game_id, name)
            for game_id, pending in list(self._pending_games.items())
            if not pending.is_started
            for player_id, name in zip(pending.player_ids, pending.player_names, strict=False)
            if pending.player_user_ids.get(player_id) == user_id
        }
        # game_players has no index on user_id, so only games still in play are searched, by their id.
        game_ids = set(self._active_games.copy())
        game_ids.update(cast(str, row.game_id) for row in session.query(ActiveGameSnapshot.game_id))
        game_seats = {
            (cast(str, row.game_id), cast(str, row.player_name))
            for row in session.query(GamePlayerRecord.game_id, GamePlayerRecord.player_name).filter(
                GamePlayerRecord.game_id.in_(game_ids),
                GamePlayerRecord.user_id == user_id,
                GamePlayerRecord.is_puppet.is_(False),
            )
        }
        return lobby_seats | game_seats

    def issue_lobby_seat_token(self, game_id: str, player_name: str) -> str:
        """Give the named lobby seat a fresh token, replacing any earlier one."""
        pending = self._pending_games[game_id]
        seat_token = new_seat_token()
        pending.seat_token_hashes[player_name] = hash_seat_token(seat_token)
        return seat_token

    def reclaim_seat(
        self,
        game_id: str,
        player_name: str,
        *,
        seat_token: str | None,
        user_id: str | None,
    ) -> SeatClaim:
        """Give the named seat back to a caller who owns it: its player id, and the seat token to keep.

        The player id stays the same, so spectators and lobby state keep following the seat; the newest socket
        for it replaces the older one. Raises SeatClaimRefusedError when the game or seat is gone, or the caller
        does not own the seat."""
        pending = self._pending_games.get(game_id)
        if pending is not None and not pending.is_started:
            return self._reclaim_lobby_seat(pending, player_name, seat_token=seat_token, user_id=user_id)

        if game_id not in self._active_games:
            self.restore_game_from_snapshot(game_id)
        game = self._active_games.get(game_id)
        if game is None:
            raise SeatClaimRefusedError(SeatClaimRefusal.GAME_NOT_FOUND)
        if not any(p.name == player_name for p in game.players):
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)

        session = db.SessionLocal()
        try:
            record = (
                session.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player_name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .first()
            )
            stored_hash = cast(str | None, record.seat_token_hash) if record else None
            refusal = seat_claim_refusal(
                stored_hash=stored_hash,
                owner_user_id=cast(str | None, record.user_id) if record else None,
                seat_token=seat_token,
                user_id=user_id,
            )
            if refusal is not None:
                raise SeatClaimRefusedError(refusal)

            player_id = self.get_player_id_by_name(game_id, player_name) or secrets.token_urlsafe(8)
            self._player_to_game[player_id] = game_id
            self._player_id_to_name[player_id] = player_name
            claimed_token = token_after_claim(seat_token, stored_hash)
            self._persist_human_player_mappings(
                session,
                game_id,
                [(player_id, player_name)],
                seat_token_hashes={player_name: hash_seat_token(claimed_token)},
            )
            session.commit()
        finally:
            session.close()
        return SeatClaim(player_id=player_id, seat_token=claimed_token)

    def _reclaim_lobby_seat(
        self,
        pending: PendingGame,
        player_name: str,
        *,
        seat_token: str | None,
        user_id: str | None,
    ) -> SeatClaim:
        if player_name not in pending.player_names:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)
        player_id = pending.player_ids[pending.player_names.index(player_name)]
        stored_hash = pending.seat_token_hashes.get(player_name)
        refusal = seat_claim_refusal(
            stored_hash=stored_hash,
            owner_user_id=pending.player_user_ids.get(player_id),
            seat_token=seat_token,
            user_id=user_id,
        )
        if refusal is not None:
            raise SeatClaimRefusedError(refusal)
        claimed_token = token_after_claim(seat_token, stored_hash)
        pending.seat_token_hashes[player_name] = hash_seat_token(claimed_token)
        return SeatClaim(player_id=player_id, seat_token=claimed_token)

    def close_seat(self, game_id: str, player_name: str, *, seat_token: str, user_id: str | None) -> str | None:
        """End the named seat for good, for a caller with its token or its account. Returns the player id it had.

        A lobby seat leaves the lobby. A started game is retired, so only a game with no other human can close:
        with others in it, every round would wait on the seat that left. Raises SeatClaimRefusedError when the
        caller doesn't hold such a seat, and SeatCloseRefusedError when it can't end now."""
        pending = self._pending_games.get(game_id)
        if pending is not None and not pending.is_started:
            return self._close_lobby_seat(pending, player_name, seat_token=seat_token, user_id=user_id)

        if game_id not in self._active_games:
            self.restore_game_from_snapshot(game_id)
        game = self._active_games.get(game_id)
        if game is None:
            raise SeatClaimRefusedError(SeatClaimRefusal.GAME_NOT_FOUND)
        player = next((p for p in game.players if p.name == player_name), None)
        if player is None or player.phase in FINISHED_PLAYER_PHASES:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)

        session = db.SessionLocal()
        try:
            record = (
                session.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player_name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .first()
            )
            if not holds_seat(
                stored_hash=cast(str | None, record.seat_token_hash) if record else None,
                owner_user_id=cast(str | None, record.user_id) if record else None,
                seat_token=seat_token,
                user_id=user_id,
            ):
                raise SeatClaimRefusedError(SeatClaimRefusal.TOKEN_REQUIRED)
            if not _game_can_close(len(game.players)):
                raise SeatCloseRefusedError(SEAT_SHARED_MESSAGE)

            player_id = self.get_player_id_by_name(game_id, player_name)
            self._retire_games(session, {game_id})
        finally:
            session.close()
        self._cleanup_game(game_id)
        return player_id

    def _close_lobby_seat(self, pending: PendingGame, player_name: str, *, seat_token: str, user_id: str | None) -> str:
        if player_name not in pending.player_names:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)
        player_id = pending.player_ids[pending.player_names.index(player_name)]
        if not holds_seat(
            stored_hash=pending.seat_token_hashes.get(player_name),
            owner_user_id=pending.player_user_ids.get(player_id),
            seat_token=seat_token,
            user_id=user_id,
        ):
            raise SeatClaimRefusedError(SeatClaimRefusal.TOKEN_REQUIRED)
        if not pending.accepts_changes:
            raise SeatCloseRefusedError(LOBBY_STARTING_MESSAGE)
        self._remove_lobby_seat(pending, player_id)
        return player_id

    def remove_player_from_pending(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or not pending.accepts_changes or player_id not in pending.player_ids:
            return False
        self._remove_lobby_seat(pending, player_id)
        return True

    def _remove_lobby_seat(self, pending: PendingGame, player_id: str) -> None:
        """The one way a seat leaves a lobby, whether the host removed it or its player stayed away."""
        self._set_player_battler(pending, player_id, BattlerMissing())
        pending.player_battlers.pop(player_id)
        index = pending.player_ids.index(player_id)
        pending.seat_token_hashes.pop(pending.player_names.pop(index), None)
        pending.player_ids.pop(index)
        pending.player_ready.pop(player_id, None)
        pending.player_user_ids.pop(player_id, None)
        self._player_to_game.pop(player_id, None)
        self._player_id_to_name.pop(player_id, None)

        if not pending.player_ids:
            self._cleanup_game(pending.game_id)
        elif player_id == pending.host_player_id:
            self._pass_host_after_removal(pending)

    def schedule_pending_disconnect(
        self,
        game_id: str,
        player_id: str,
        on_removed: Callable[[], Coroutine[Any, Any, None]] | None = None,
        delay: float = 600.0,
    ) -> None:
        key = f"{game_id}:{player_id}"
        if existing := self._pending_disconnect_tasks.get(key):
            existing.cancel()

        pending = self._pending_games.get(game_id)
        if pending and pending.accepts_changes and player_id in pending.player_ids:
            pending.player_ready[player_id] = False

        async def remove_after_delay():
            await asyncio.sleep(delay)
            removed = False
            if game_id in self._pending_games:
                async with self.get_action_lock(game_id):
                    removed = self.remove_player_from_pending(game_id, player_id)
            self._pending_disconnect_tasks.pop(key, None)
            if removed and on_removed:
                await on_removed()

        try:
            loop = asyncio.get_running_loop()
            self._pending_disconnect_tasks[key] = loop.create_task(remove_after_delay())
        except RuntimeError:
            pass

    def cancel_pending_disconnect(self, game_id: str, player_id: str) -> None:
        key = f"{game_id}:{player_id}"
        if task := self._pending_disconnect_tasks.pop(key, None):
            task.cancel()

    # The lobby host is the one piece of lobby state that changes on its own. These methods are the only place
    # host_player_id changes after creation: the creator hosts while present and for a grace period after
    # leaving, then the role passes for good to the earliest-joined player who is connected.

    def note_lobby_player_present(self, game_id: str, player_id: str) -> None:
        pending = self._pending_games.get(game_id)
        if pending is None or pending.is_started:
            return
        if player_id == pending.host_player_id:
            pending.host_away_since = None
            self._cancel_host_handoff(game_id)
            return
        away_since = pending.host_away_since
        if away_since is not None and datetime.now(UTC) - away_since >= timedelta(seconds=HOST_HANDOFF_GRACE_SECONDS):
            self._hand_off_host(pending)

    def note_lobby_player_away(
        self,
        game_id: str,
        player_id: str,
        on_host_change: Callable[[], Coroutine[Any, Any, None]],
    ) -> None:
        pending = self._pending_games.get(game_id)
        if pending is None or pending.is_started or player_id != pending.host_player_id:
            return
        pending.host_away_since = datetime.now(UTC)
        self._cancel_host_handoff(game_id)

        async def hand_off_after_grace() -> None:
            await asyncio.sleep(HOST_HANDOFF_GRACE_SECONDS)
            self._host_handoff_tasks.pop(game_id, None)
            changed = False
            if self._pending_games.get(game_id) is pending:
                async with self.get_action_lock(game_id):
                    if pending.host_away_since is not None and self._hand_off_host(pending):
                        changed = True
            if changed:
                await on_host_change()

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._host_handoff_tasks[game_id] = loop.create_task(hand_off_after_grace())

    def _hand_off_host(self, pending: PendingGame) -> bool:
        connected = self._connected_player_ids(pending.game_id)
        successor = next(
            (pid for pid in pending.player_ids if pid in connected and pid != pending.host_player_id),
            None,
        )
        if successor is None:
            return False
        self._pass_host(pending, successor)
        pending.host_away_since = None
        self._cancel_host_handoff(pending.game_id)
        return True

    def _pass_host_after_removal(self, pending: PendingGame) -> None:
        connected = self._connected_player_ids(pending.game_id)
        successor = next((pid for pid in pending.player_ids if pid in connected), None)
        if successor is not None:
            self._pass_host(pending, successor)
            pending.host_away_since = None
            self._cancel_host_handoff(pending.game_id)
            return
        # Nobody is here to take over: the next in line holds the role while away, and the first player to
        # connect can take it at once, since the removed host has been gone longer than the grace period.
        self._pass_host(pending, pending.player_ids[0])
        pending.host_away_since = datetime.now(UTC) - timedelta(seconds=HOST_HANDOFF_GRACE_SECONDS)

    def _pass_host(self, pending: PendingGame, successor: str) -> None:
        pending.previous_host_id = pending.host_player_id
        pending.host_player_id = successor

    def _cancel_host_handoff(self, game_id: str) -> None:
        if task := self._host_handoff_tasks.pop(game_id, None):
            task.cancel()

    def add_puppet(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or not pending.accepts_changes:
            return False
        if player_id != pending.host_player_id:
            return False
        total = len(pending.player_names) + pending.puppet_count
        if total >= pending.target_player_count:
            return False
        if total >= 8:
            return False
        available = self._count_available_bots(pending)
        if available is None or available <= pending.puppet_count:
            return False
        pending.puppet_count += 1
        return True

    def set_target_player_count(
        self, game_id: str, player_id: str, target_player_count: int
    ) -> tuple[bool, str | None]:
        pending = self._pending_games.get(game_id)
        if not pending:
            return False, "Game not found"
        if not pending.accepts_changes:
            return False, LOBBY_STARTING_MESSAGE
        if player_id != pending.host_player_id:
            return False, "Only the host can change the player cap"
        if target_player_count < 2 or target_player_count > 8:
            return False, "Player cap must be between 2 and 8"
        if target_player_count % 2 != 0:
            return False, "Player cap must be an even number"

        occupied_slots = len(pending.player_names) + pending.puppet_count
        if target_player_count < occupied_slots:
            return False, "Player cap cannot be lower than occupied slots"

        pending.target_player_count = target_player_count
        return True, None

    def set_voice_chat_enabled(self, game_id: str, player_id: str, enabled: bool) -> tuple[bool, str | None]:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started:
            return False, "Game not found"
        if player_id != pending.host_player_id:
            return False, "Only the host can toggle voice chat"
        pending.voice_chat_enabled = enabled
        return True, None

    def remove_puppet(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or not pending.accepts_changes:
            return False
        if player_id != pending.host_player_id:
            return False
        if pending.puppet_count <= 0:
            return False
        pending.puppet_count -= 1
        return True

    def kick_player(self, game_id: str, host_player_id: str, target_player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or not pending.accepts_changes:
            return False
        if host_player_id != pending.host_player_id:
            return False
        if target_player_id == pending.host_player_id:
            return False
        if target_player_id not in pending.player_ids:
            return False
        self._remove_lobby_seat(pending, target_player_id)
        return True

    def holds_seat(self, game_id: str, player_id: str) -> bool:
        return self._player_to_game.get(player_id) == game_id

    def get_player_id_by_name(self, game_id: str, player_name: str) -> str | None:
        for player_id, name in self._player_id_to_name.items():
            if name == player_name and self._player_to_game.get(player_id) == game_id:
                return player_id
        return None

    def get_player_name(self, player_id: str) -> str | None:
        return self._player_id_to_name.get(player_id)

    def create_spectate_request(self, game_id: str, target_player_name: str, spectator_name: str) -> SpectateRequest:
        """Ask to watch a player. Open Spectating approves it at once; otherwise it waits for the player's answer.

        Raises TooManySpectateRequestsError when the server holds too many requests."""
        self.cleanup_expired_spectate_requests()
        request = self._spectate_requests.create(
            game_id,
            target_player_name,
            spectator_name,
            approve=self._auto_approves_spectators(game_id),
        )
        if request.status == "pending":
            self._spectate_listener.spectate_requests_changed(game_id, target_player_name)
        return request

    def _auto_approves_spectators(self, game_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if pending is not None:
            return pending.auto_approve_spectators
        game = self._active_games.get(game_id)
        return game is not None and game.config.auto_approve_spectators

    def get_spectate_request(self, game_id: str, request_id: str) -> SpectateRequest | None:
        request = self._spectate_requests.get(request_id)
        return request if request is not None and request.game_id == game_id else None

    def pending_spectate_requests(self, game_id: str, target_player_name: str) -> list[SpectateRequest]:
        return self._spectate_requests.pending_for(game_id, target_player_name)

    def respond_to_spectate_request(self, request_id: str, *, game_id: str, responder_id: str, allowed: bool) -> bool:
        """Approve or deny a pending request; only the player it asks to watch may answer it.

        The responder's requests are sent again either way, since they answered from what their screen showed."""
        responder_name = self.get_player_name(responder_id)
        request = self.get_spectate_request(game_id, request_id)
        answered = (
            request is not None
            and self.get_player_id_by_name(game_id, request.target_player_name) == responder_id
            and self._spectate_requests.answer(request, allowed=allowed)
        )
        if responder_name is not None:
            self._spectate_listener.spectate_requests_changed(game_id, responder_name)
        return answered

    def cancel_spectate_request(self, game_id: str, request_id: str) -> SpectateRequest | None:
        """Withdraw a request that is still pending. Returns the request, in whatever status it has now."""
        request = self.get_spectate_request(game_id, request_id)
        if request is not None and self._spectate_requests.cancel(request):
            self._spectate_listener.spectate_requests_changed(game_id, request.target_player_name)
        return request

    def admit_spectator(self, request_id: str, *, session_id: str, game_id: str, target_player_name: str) -> bool:
        return self._spectate_requests.admit(
            request_id, session_id=session_id, game_id=game_id, target_player_name=target_player_name
        )

    def cleanup_expired_spectate_requests(self, now: datetime | None = None) -> None:
        expired = self._spectate_requests.expire(now or datetime.now(UTC))
        for game_id, target_player_name in {(r.game_id, r.target_player_name) for r in expired}:
            self._spectate_listener.spectate_requests_changed(game_id, target_player_name)

    def _get_pending_target_elo(self, pending: PendingGame) -> float | None:
        if pending.play_mode == "limited":
            if pending.battler is None:
                return None
            return pending.battler.elo or 1200.0

        elos = [
            entry.battler.elo
            for entry in pending.player_battlers.values()
            if isinstance(entry, BattlerReady) and entry.battler.elo
        ]
        if not elos:
            return None
        return sum(elos) / len(elos)

    def _get_cube_loading_status(self, pending: PendingGame) -> CubeLoadingStatus:
        if pending.play_mode == "constructed":
            slots = pending.player_battlers.values()
            if any(isinstance(entry, BattlerFailed) for entry in slots):
                return "error"
            if all(isinstance(entry, BattlerReady) for entry in slots):
                return "ready"
            return "loading"
        if pending.battler_error:
            return "error"
        if pending.battler is not None:
            return "ready"
        return "loading"

    def _count_available_bots(self, pending: PendingGame) -> int | None:
        target_elo = self._get_pending_target_elo(pending)
        if target_elo is None:
            return None

        max_puppets = 8 - len(pending.player_names)
        if max_puppets <= 0:
            return 0

        db_session = db.SessionLocal()
        try:
            histories = self._find_historical_players(
                db_session,
                target_elo,
                count=max_puppets,
                exclude_ids=[],
                use_upgrades=pending.use_upgrades,
                use_vanguards=pending.use_vanguards,
                cube_id=pending.cube_id if pending.play_mode == "limited" else None,
                play_mode=pending.play_mode,
            )
            return len(histories)
        finally:
            db_session.close()

    def get_lobby_state(self, game_id: str) -> LobbyStateResponse | None:
        pending = self._pending_games.get(game_id)
        if not pending:
            return None

        connected = self._connected_player_ids(game_id)
        players = []
        for i, name in enumerate(pending.player_names):
            player_id = pending.player_ids[i]
            player_battler = pending.player_battlers.get(player_id, BattlerMissing())
            players.append(
                LobbyPlayer(
                    player_id=player_id,
                    name=name,
                    is_ready=pending.player_ready.get(player_id, False),
                    is_host=player_id == pending.host_player_id,
                    is_connected=player_id in connected,
                    battler_id=None if isinstance(player_battler, BattlerMissing) else player_battler.battler_id,
                    battler_status=player_battler.status if pending.play_mode == "constructed" else None,
                    battler_error=player_battler.error if isinstance(player_battler, BattlerFailed) else None,
                )
            )

        available = self._count_available_bots(pending)
        loading_error = pending.battler_error
        if pending.play_mode == "constructed":
            loading_error = next(
                (slot.error for slot in pending.player_battlers.values() if isinstance(slot, BattlerFailed)),
                None,
            )

        return LobbyStateResponse(
            game_id=game_id,
            join_code=pending.join_code,
            players=players,
            can_start=self._start_refusal(pending, pending.host_player_id, lambda: available) is None,
            is_started=pending.is_started,
            start_status=pending.stage.value,
            start_error=pending.start_error,
            target_player_count=pending.target_player_count,
            puppet_count=pending.puppet_count,
            cube_loading_status=self._get_cube_loading_status(pending),
            cube_loading_error=loading_error,
            available_puppet_count=available,
            cube_id=pending.cube_id,
            use_upgrades=pending.use_upgrades,
            guided_mode_default=pending.guided_mode_default,
            voice_chat_enabled=pending.voice_chat_enabled,
            auto_approve_spectators=pending.auto_approve_spectators,
            previous_host_id=pending.previous_host_id,
            play_mode=pending.play_mode,
        )

    def get_game_state(self, game_id: str, player_id: str) -> GameStateResponse | None:
        game = self._active_games.get(game_id)
        if not game:
            return None

        player = self.get_player(game, player_id)
        if not player:
            return None

        return build_game_state(game, player, game_id=game_id)

    def get_game_bootstrap(self, game_id: str, player_id: str) -> GameBootstrapResponse | None:
        game = self._active_games.get(game_id)
        if game is None:
            return None

        player = self.get_player(game, player_id)
        if player is None:
            return None

        return build_game_bootstrap(game, player, game_id=game_id)

    def handle_draft_swap(
        self, game: Game, player: Player, pack_card_id: str, player_card_id: str, destination: CardDestination
    ) -> bool:
        current_pack = game.get_draft_state().current_packs.get(player.name)
        if not current_pack:
            return False

        pack_card = next((c for c in current_pack if c.id == pack_card_id), None)
        if not pack_card:
            return False

        collection = player.hand if destination == "hand" else player.sideboard
        if destination == "upgrades":
            collection = player.upgrades

        player_card = next((c for c in collection if c.id == player_card_id), None)
        if not player_card:
            return False

        draft.swap(game, player, pack_card, player_card, destination)
        return True

    def handle_draft_roll(self, game: Game, player: Player) -> bool:
        if player.treasures <= 0:
            return False
        draft.roll(game, player)
        return True

    def handle_draft_done(self, game: Game, player: Player) -> bool:
        if player.phase != "draft":
            return False
        draft.end_for_player(game, player)
        return True

    def handle_build_move(
        self, player: Player, card_id: str, source: BuildSource, destination: BuildSource, slot: int | None = None
    ) -> bool | str:
        source_list = player.hand if source == "hand" else player.sideboard
        card = next((c for c in source_list if c.id == card_id), None)
        if not card:
            return f"Card not found in {source}"

        try:
            build.move_card(player, card, source, destination, slot)
            return True
        except ValueError as e:
            return str(e)

    def handle_build_swap(
        self,
        player: Player,
        card_a_id: str,
        source_a: BuildSource,
        card_b_id: str,
        source_b: BuildSource,
    ) -> bool:
        list_a = player.hand if source_a == "hand" else player.sideboard
        list_b = player.hand if source_b == "hand" else player.sideboard

        card_a = next((c for c in list_a if c.id == card_a_id), None)
        card_b = next((c for c in list_b if c.id == card_b_id), None)

        if not card_a or not card_b:
            return False

        build.swap_card(player, card_a, source_a, card_b, source_b)
        return True

    def handle_build_set_basics(self, game: Game, player: Player, basics: list[str]) -> bool | str:
        try:
            build.set_basics(game, player, basics)
            return True
        except ValueError as e:
            return str(e)

    def handle_build_ready(
        self,
        game: Game,
        player: Player,
        basics: list[str],
        game_id: str | None = None,
        db: Session | None = None,
        *,
        play_draw_preference: str = "play",
        hand_order: list[str] | None = None,
    ) -> str | None:
        try:
            build.set_ready(game, player, basics, play_draw_preference, hand_order=hand_order)

            # Handle sudden death players specially
            if player.in_sudden_death:
                return self._handle_sudden_death_build_ready(game, player, game_id, db)

            self._start_round_if_ready(game, game_id, db)
            return None
        except ValueError as e:
            return str(e)

    def _handle_sudden_death_build_ready(
        self, game: Game, player: Player, game_id: str | None, db: Session | None
    ) -> str | None:
        """Handle build phase completion for sudden death players."""
        # Find the other sudden death player (human or bot)
        other_sd_player = self._find_sudden_death_opponent(game, player)

        if other_sd_player is None:
            # Bot opponent — find by in_sudden_death flag
            for fp in game.puppets:
                if fp.in_sudden_death and not fp.is_eliminated:
                    static_opp = fp.get_opponent_for_round(player.stage, player.round)
                    if static_opp:
                        self._record_sudden_death_builds(db, game_id, [(player, static_opp.name)])
                        transition_phase(player, "battle")
                        player.build_ready = False
                        battle.start(game, player, static_opp, is_sudden_death=True)
                        return None
            return None

        # Both players must be ready for sudden death PvP
        if not other_sd_player.build_ready:
            return None

        # Both ready - start sudden death battle
        self._record_sudden_death_builds(db, game_id, [(player, other_sd_player.name), (other_sd_player, player.name)])
        transition_phase(player, "battle")
        transition_phase(other_sd_player, "battle")
        player.build_ready = False
        other_sd_player.build_ready = False
        battle.start(game, player, other_sd_player, is_sudden_death=True)
        return None

    def _record_sudden_death_builds(
        self, db: Session | None, game_id: str | None, fighters: list[tuple[Player, str]]
    ) -> None:
        if db is None or game_id is None:
            return
        # The share page is a record of the game, so a build that fails to save must never stop the fight.
        try:
            # Both builds carry the fight's number, so one that failed to save earlier can't put them out of step.
            fight_number = self._next_sudden_death_build(db, game_id, [player for player, _ in fighters])
            for player, opponent_name in fighters:
                battler_elo = player.battler.elo if player.battler is not None else 1200.0
                self._record_snapshot(
                    db, game_id, player, battler_elo, opponent_name=opponent_name, sudden_death_build=fight_number
                )
        except Exception:
            logger.exception("Could not save Sudden Death builds: game_id=%s", game_id)
            db.rollback()

    def _next_sudden_death_build(self, db: Session, game_id: str, fighters: list[Player]) -> int:
        previous = (
            db.query(func.max(BattleSnapshot.sudden_death_build))
            .join(PlayerGameHistory, BattleSnapshot.player_history_id == PlayerGameHistory.id)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name.in_([fighter.name for fighter in fighters]),
                BattleSnapshot.stage == fighters[0].stage,
                BattleSnapshot.round == fighters[0].round,
            )
            .scalar()
        )
        return (previous or 0) + 1

    def _find_sudden_death_opponent(self, game: Game, player: Player) -> Player | None:
        """Find the other player in sudden death mode."""
        for p in game.players:
            if p.name != player.name and p.in_sudden_death and p.phase != "eliminated":
                return p
        return None

    def handle_build_unready(self, player: Player) -> str | None:
        try:
            build.unready(player)
            return None
        except ValueError as e:
            return str(e)

    def _return_eliminated_player_cards(self, game: Game) -> None:
        """Return eliminated human players' hand/sideboard to battler.

        Does NOT return cards from the ghost (they still need their cards for pairing).
        Does NOT return cards from bots (they have their own card pools).
        """
        ghost_name = game.most_recent_ghost.name if game.most_recent_ghost else None

        for player in game.players:
            if player.phase == "eliminated" and player.name != ghost_name and player.battler is not None:
                # Every later round passes here again, with the player's zones already empty.
                if player.hand or player.sideboard:
                    player.returned_build = ReturnedBuild(hand=player.hand, sideboard=player.sideboard)
                player.battler.cards.extend(player.hand)
                player.battler.cards.extend(player.sideboard)
                # Clear to prevent double-returning
                player.hand = []
                player.sideboard = []

    def _start_round_if_ready(self, game: Game, game_id: str | None, db: Session | None) -> None:
        if build.all_ready(game):
            self._start_all_battles(game, game_id, db)

    def _start_all_battles(self, game: Game, game_id: str | None = None, db: Session | None = None) -> None:
        # Clean up draft state before battles
        draft.cleanup_draft(game)

        # Return eliminated players' cards to battler
        self._return_eliminated_player_cards(game)

        live_players = get_live_players(game)
        if not live_players:
            return

        stage = live_players[0].stage
        round_num = live_players[0].round

        for player in live_players:
            transition_phase(player, "battle")
            player.build_ready = False

        live_puppets = get_live_puppets(game)
        for fp in live_puppets:
            fp.last_played_round = (stage, round_num)

        snapshots_by_player: dict[str, BattleSnapshot] = {}
        if db is not None and game_id is not None:
            for player in live_players:
                battler_elo = player.battler.elo if player.battler is not None else 1200.0
                snapshots_by_player[player.name] = self._record_snapshot(db, game_id, player, battler_elo)
            battler_elo = self._get_game_target_elo(game)
            for fp in live_puppets:
                self._record_bot_poison(db, game_id, fp, battler_elo=battler_elo, stage=stage, round_num=round_num)

        paired_bot_names: set[str] = set()
        for player, opponent in battle.get_round_table(game).draw_battles():
            battle.start(game, player, opponent)
            if isinstance(opponent, StaticOpponent) and opponent.source_player_history_id:
                for fp in game.puppets:
                    if fp.player_history_id == opponent.source_player_history_id:
                        paired_bot_names.add(fp.name)
                        break

        battle.resolve_unpaired_bot_battles(game, paired_bot_names, stage, round_num, game.config.num_rounds_per_stage)
        self._record_opponents(db, snapshots_by_player, game.active_battles)

    def _record_opponents(
        self, db: Session | None, snapshots_by_player: dict[str, BattleSnapshot], battles: list[Battle]
    ) -> None:
        if db is None or not snapshots_by_player:
            return
        for b in battles:
            for name, opponent_name in ((b.player.name, b.opponent.name), (b.opponent.name, b.player.name)):
                if name in snapshots_by_player:
                    snapshots_by_player[name].opponent_name = opponent_name  # ty: ignore[invalid-assignment]
        db.commit()

    def handle_build_apply_upgrade(self, player: Player, upgrade_id: str, target_card_id: str) -> bool:
        return self._apply_upgrade(player, upgrade_id, target_card_id)

    def handle_build_set_companion(self, player: Player, card_id: str) -> str | None:
        card = next((c for c in player.sideboard if c.id == card_id), None)
        if not card:
            return "Card not found in sideboard"
        try:
            build.set_companion(player, card)
            return None
        except ValueError as e:
            return str(e)

    def handle_build_remove_companion(self, player: Player) -> str | None:
        try:
            build.remove_companion(player)
            return None
        except ValueError as e:
            return str(e)

    def _get_zones_for_owner(self, b: Battle, player: Player, owner: str) -> Zones:
        is_battle_player = player.name == b.player.name
        if owner == "player":
            return b.player_zones if is_battle_player else b.opponent_zones
        return b.opponent_zones if is_battle_player else b.player_zones

    def _resolve_opaque_card_id(self, b: Battle, player: Player, card_id: str) -> str:
        opponent_zones = self._get_zones_for_owner(b, player, "opponent")
        real_ids = {opaque: real for real, opaque in hidden_card_opaque_ids(b, opponent_zones).items()}
        return real_ids.get(card_id, card_id)

    def _track_revealed_card(self, b: Battle, card, from_zones: Zones, to_zone: ZoneName) -> None:
        if to_zone not in battle.REVEALED_ZONES or not battle._is_revealed_card(card):
            return
        if card.original_owner:
            is_owner_battle_player = card.original_owner == b.player.name
            owner_zones = b.player_zones if is_owner_battle_player else b.opponent_zones
        else:
            owner_zones = from_zones
        if card.id not in owner_zones.revealed_card_ids:
            owner_zones.revealed_card_ids.append(card.id)

    def handle_battle_move(
        self,
        game: Game,
        player: Player,
        card_id: str,
        from_zone: ZoneName,
        to_zone: ZoneName,
        *,
        from_owner: str = "player",
        to_owner: str = "player",
    ) -> bool:
        for b in game.active_battles:
            if player.name not in (b.player.name, b.opponent.name):
                continue

            card_id = self._resolve_opaque_card_id(b, player, card_id)
            from_zones = self._get_zones_for_owner(b, player, from_owner)
            to_zones = self._get_zones_for_owner(b, player, to_owner)

            if from_zone == "sideboard" and from_owner == "player":
                card = next((c for c in player.sideboard if c.id == card_id), None)
                if card:
                    player.sideboard.remove(card)

            from_list = from_zones.get_zone(from_zone)
            card = next((c for c in from_list if c.id == card_id), None)
            if not card:
                return False

            from_list.remove(card)
            to_zones.get_zone(to_zone).append(card)
            if from_zones is not to_zones:
                _transfer_card_state(card_id, from_zones, to_zones)

            is_token = battle._is_token(b.player_zones, card_id) or battle._is_token(b.opponent_zones, card_id)
            if is_token and to_zone != "battlefield":
                to_zones.get_zone(to_zone).remove(card)
                for z in (b.player_zones, b.opponent_zones):
                    battle._remove_token_state(z, card_id)
                return True

            self._track_revealed_card(b, card, from_zones, to_zone)
            return True
        return False

    def handle_battle_submit_result(
        self, game: Game, player: Player, result: str, game_id: str | None = None, db: Session | None = None
    ) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                battle.submit_result(b, player, result)
                if battle.results_agreed(b):
                    self._end_battle(game, b, game_id, db)
                return True
        return False

    def handle_battle_update_life(self, game: Game, player: Player, target: str, life: int) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                is_player_side = player.name == b.player.name
                if target == "you":
                    if is_player_side:
                        b.player_life = life
                    else:
                        b.opponent_life = life
                elif is_player_side:
                    b.opponent_life = life
                else:
                    b.player_life = life
                return True
        return False

    def handle_battle_update_card_state(
        self,
        game: Game,
        player: Player,
        action_type: str,
        card_id: str,
        data: dict | None = None,
    ) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                card_id = self._resolve_opaque_card_id(b, player, card_id)
                updated = battle.update_card_state(b, player, action_type, card_id, data)
                if updated and action_type == "shuffle_library":
                    # With the same hidden ids, the other player could follow each card through the shuffle.
                    b._opaque_id_key = secrets.token_bytes(32)
                return updated
        return False

    def handle_battle_reveal_upgrade(self, game: Game, player: Player, upgrade_id: str) -> bool:
        for b in game.active_battles:
            if player.name not in (b.player.name, b.opponent.name):
                continue

            own_zones = self._get_zones_for_owner(b, player, "player")
            zone_upgrade = next((upgrade for upgrade in own_zones.upgrades if upgrade.id == upgrade_id), None)
            player_upgrade = next((upgrade for upgrade in player.upgrades if upgrade.id == upgrade_id), None)
            target_upgrade = player_upgrade or zone_upgrade
            if target_upgrade is None or not reward.is_applied_upgrade(target_upgrade) or target_upgrade.is_revealed:
                return False

            if player_upgrade is not None:
                reward.reveal_upgrade(player, player_upgrade)
            if zone_upgrade is not None:
                zone_upgrade.is_revealed = True

            assert target_upgrade.upgrade_target is not None
            b.pending_reveal_animations.append(
                PendingRevealAnimation(
                    animation_id=uuid4().hex[:8],
                    upgrade=target_upgrade,
                    target=target_upgrade.upgrade_target,
                    player_name=player.name,
                )
            )
            return True
        return False

    def handle_battle_pass_turn(self, game: Game, player: Player) -> bool | str:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                acting = player
                if isinstance(b.opponent, StaticOpponent) and b.current_turn_name == b.opponent.name:
                    acting = b.opponent
                if battle.pass_turn(b, acting):
                    return True
                return "Not your turn"
        return False

    def _end_battle(self, game: Game, b: Battle, game_id: str | None = None, db: Session | None = None) -> str | None:
        outcome = resolve_battle(game, b)
        return self._apply_resolution_outcome(game, outcome, game_id=game_id, db=db)

    def _check_sudden_death_ready(self, game: Game, game_id: str | None, db: Session | None) -> str | None:
        outcome = resolve_end_of_round(game)
        return self._apply_resolution_outcome(game, outcome, game_id=game_id, db=db)

    def handle_reward_apply_upgrade(self, player: Player, upgrade_id: str, target_card_id: str) -> bool:
        return self._apply_upgrade(player, upgrade_id, target_card_id)

    def _apply_upgrade(self, player: Player, upgrade_id: str, target_card_id: str) -> bool:
        upgrade = next((u for u in player.upgrades if u.id == upgrade_id and u.upgrade_target is None), None)
        if not upgrade:
            return False

        all_cards = player.hand + player.sideboard
        target = next((c for c in all_cards if c.id == target_card_id), None)
        if not target:
            return False

        reward.apply_upgrade_to_card(player, upgrade, target)
        return True

    def handle_reward_done(
        self,
        game: Game,
        player: Player,
        upgrade_id: str | None = None,
        game_id: str | None = None,
        db: Session | None = None,
    ) -> str | None:
        try:
            outcome = resolve_reward_done(game, player, upgrade_id=upgrade_id)
        except ValueError as e:
            return str(e)

        status = self._apply_resolution_outcome(game, outcome, game_id=game_id, db=db)
        if status == "game_over":
            return "game_over"

        if player.phase == "draft":
            if game.draft_state is None:
                draft.start(game)
            draft.deal_pack_to_player(game, player)

        return None


game_manager = GameManager()

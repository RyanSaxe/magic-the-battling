"""Lobbies before their game starts: creating and joining them, readying up, the host and table settings,
players leaving, and starting the game."""

import asyncio
import json
import logging
import secrets
import string
from collections.abc import Awaitable, Callable, Coroutine
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from mtb.models.cards import (
    Battler,
)
from mtb.models.game import (
    Config,
    Game,
    create_game,
    set_battler,
    set_player_battlers,
)
from mtb.models.types import PlayMode, normalize_play_mode
from mtb.phases import draft
from server.db.models import (
    GameRecord,
)
from server.runtime_config import (
    MAX_GAME_START_QUEUE,
)
from server.schemas.api import (
    CubeLoadingStatus,
    LobbyPlayer,
    LobbyStateResponse,
)
from server.services.game.battler_loader import BattlerLoader
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
)
from server.services.game.puppet_loader import PuppetLoader
from server.services.game.snapshot_store import SnapshotStore
from server.services.seat_tokens import (
    hash_seat_token,
    new_seat_token,
)

logger = logging.getLogger(__name__)

HOST_HANDOFF_GRACE_SECONDS = 60.0


# No symbols: players read codes out and type them, and an underscore reads as a blank.
JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits


JOIN_CODE_LENGTH = 6


def _copy_for_dealing(battler: Battler) -> Battler:
    return battler.model_copy(update={"cards": list(battler.cards)})


class LobbyService(BattlerLoader, PuppetLoader, SnapshotStore):
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

    def issue_lobby_seat_token(self, game_id: str, player_name: str) -> str:
        """Give the named lobby seat a fresh token, replacing any earlier one."""
        pending = self._pending_games[game_id]
        seat_token = new_seat_token()
        pending.seat_token_hashes[player_name] = hash_seat_token(seat_token)
        return seat_token

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

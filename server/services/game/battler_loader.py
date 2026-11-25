"""Loading a lobby's cube and each constructed player's deck in the background before the game starts."""

import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from functools import partial
from typing import Any

from httpx import HTTPStatusError, RequestError

from pitfight.models.cards import (
    DEFAULT_UPGRADES_ID,
    DEFAULT_VANGUARD_ID,
    Battler,
    IllegalBattlerError,
    build_battler,
    validate_battler,
)
from pitfight.models.types import PlayMode
from server.services.game.models import (
    LOBBY_STARTING_MESSAGE,
    BattlerFailed,
    BattlerLoading,
    BattlerReady,
    LobbyStartFailedError,
    PendingGame,
    PlayerBattler,
)
from server.services.game.state import GameManagerState, _current_task

logger = logging.getLogger(__name__)


class BattlerLoader(GameManagerState):
    def _load_battler(self, cube_id: str, *, use_upgrades: bool, use_vanguards: bool, play_mode: PlayMode) -> Battler:
        upgrades_id = DEFAULT_UPGRADES_ID if use_upgrades else None
        vanguards_id = DEFAULT_VANGUARD_ID if use_vanguards else None
        battler = build_battler(cube_id, upgrades_id, vanguards_id=vanguards_id)
        validate_battler(battler, play_mode=play_mode)
        return battler

    def _load_constructed_battler(self, battler_id: str, *, use_upgrades: bool, use_vanguards: bool) -> Battler:
        return self._load_battler(
            battler_id, use_upgrades=use_upgrades, use_vanguards=use_vanguards, play_mode="constructed"
        )

    def _normalize_battler_error(self, battler_id: str, play_mode: PlayMode, *, error: Exception) -> str:
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
                    partial(
                        self._load_battler,
                        pending.cube_id,
                        use_upgrades=pending.use_upgrades,
                        use_vanguards=pending.use_vanguards,
                        play_mode=pending.play_mode,
                    ),
                )
        except Exception as e:  # noqa: BLE001 -- broad boundary catch
            logger.warning("Failed to preload battler %s: %s", pending.cube_id, e)
            error_message = self._normalize_battler_error(pending.cube_id, pending.play_mode, error=e)
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
            pending.loading_task = task
        except RuntimeError:
            pending.battler_loading = False

    async def _preload_player_battler(
        self,
        pending: PendingGame,
        player_id: str,
        *,
        battler_id: str,
        on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None,
    ) -> None:
        loaded: PlayerBattler
        try:
            async with self._battler_preload_slots:
                loop = asyncio.get_running_loop()
                battler = await loop.run_in_executor(
                    None,
                    partial(
                        self._load_constructed_battler,
                        battler_id,
                        use_upgrades=pending.use_upgrades,
                        use_vanguards=pending.use_vanguards,
                    ),
                )
            loaded = BattlerReady(battler_id, battler)
        except Exception as e:  # noqa: BLE001 -- broad boundary catch
            logger.warning("Failed to preload player battler %s: %s", battler_id, e)
            loaded = BattlerFailed(battler_id, self._normalize_battler_error(battler_id, "constructed", error=e))

        if self._pending_games.get(pending.game_id) is pending:
            async with self.get_action_lock(pending.game_id):
                slot = pending.player_battlers.get(player_id)
                if isinstance(slot, BattlerLoading) and slot.task is _current_task():
                    self._set_player_battler(pending, player_id, slot=loaded)
        if on_complete:
            await on_complete()

    def start_player_battler_preload(
        self,
        pending: PendingGame,
        player_id: str,
        *,
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
        task = loop.create_task(
            self._preload_player_battler(pending, player_id, battler_id=battler_id, on_complete=on_complete)
        )
        self._set_player_battler(pending, player_id, slot=BattlerLoading(battler_id, task))
        return None

    def record_player_battler_error(self, pending: PendingGame, player_id: str, *, battler_id: str, error: str) -> None:
        self._set_player_battler(pending, player_id, slot=BattlerFailed(battler_id, error))

    def _build_constructed_battlers_by_player(self, pending: PendingGame) -> dict[str, Battler]:
        battlers_by_player: dict[str, Battler] = {}
        for player_id, player_name in zip(pending.player_ids, pending.player_names, strict=False):
            player_battler = pending.player_battlers.get(player_id)
            if not isinstance(player_battler, BattlerReady):
                msg = "All players must submit a valid deck"
                raise LobbyStartFailedError(msg)
            battlers_by_player[player_name] = player_battler.battler
        return battlers_by_player

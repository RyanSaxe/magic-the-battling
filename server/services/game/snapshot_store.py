"""Game snapshots and lifecycle: saving and restoring live games, setting aside snapshots that can't be
restored, evicting idle games, and the background and delayed cleanup that drops finished ones."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

import server.db.database as db
from mtb.models.game import (
    Battle,
    Game,
    Player,
    restore_game_from_snapshot,
)
from mtb.phases import battle
from server.db.models import (
    ActiveGameSnapshot,
    GamePlayerRecord,
    GameRecord,
    QuarantinedGameSnapshot,
)
from server.runtime_config import (
    IDLE_EVICT_MINUTES,
    STALE_GAME_CLEANUP_HOURS,
)
from server.services.game.models import BattlerMissing
from server.services.game.spectator_service import SpectatorService
from server.services.game.state import _current_task, _utc_or_default

logger = logging.getLogger(__name__)

ABANDONED_CLEANUP_SECONDS = 86400.0


class SnapshotStore(SpectatorService):
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

    def _persist_human_player_mappings(
        self,
        db_session: Session,
        game_id: str,
        *,
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

    def _restore_human_player_mappings(self, db_session: Session, game_id: str, *, game: Game) -> int:
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
        self._restore_human_player_mappings(session, snapshot_game_id, game=game)
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
            restored_mappings = self._restore_human_player_mappings(session, game_id, game=game)
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

    def _schedule_cleanup(self, tasks: dict[str, asyncio.Task], game_id: str, *, delay: float) -> None:
        if existing := tasks.pop(game_id, None):
            existing.cancel()

        async def cleanup_after_delay() -> None:
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
        self._schedule_cleanup(self._abandoned_cleanup_tasks, game_id, delay=delay)

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
                self._set_player_battler(pending, player_id, slot=BattlerMissing())
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

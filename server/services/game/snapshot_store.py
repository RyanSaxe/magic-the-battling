"""Game snapshots and lifecycle: saving and restoring live games, setting aside snapshots that can't be."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

import server.db.database as db
from pitfight.models.game import (
    Battle,
    Game,
    Player,
    restore_game_from_snapshot,
)
from pitfight.phases import battle
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


@dataclass(frozen=True)
class _SnapshotWrite:
    game_id: str
    state_json: str
    last_human_activity_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class _SnapshotRead:
    game_id: str
    state_json: str
    last_human_activity_at: datetime | None
    player_mappings: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class _QuarantineWrite:
    game_id: str
    state_json: str
    last_human_activity_at: datetime | None
    error: str


def _upsert_snapshots_db(writes: list[_SnapshotWrite]) -> None:
    session = db.SessionLocal()
    try:
        for item in writes:
            stmt = sqlite_insert(ActiveGameSnapshot).values(
                game_id=item.game_id,
                state_json=item.state_json,
                last_human_activity_at=item.last_human_activity_at,
                updated_at=item.updated_at,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[ActiveGameSnapshot.game_id],
                set_={
                    "state_json": item.state_json,
                    "last_human_activity_at": item.last_human_activity_at,
                    "updated_at": item.updated_at,
                },
            )
            session.execute(stmt)
        session.commit()
    finally:
        session.close()


def _snapshot_exists_db(game_id: str) -> bool:
    session = db.SessionLocal()
    try:
        return (
            session.query(ActiveGameSnapshot.game_id).filter(ActiveGameSnapshot.game_id == game_id).first() is not None
        )
    except Exception:  # noqa: BLE001 -- broad boundary catch
        return False
    finally:
        session.close()


def _delete_snapshot_db(game_id: str) -> None:
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


def _close_game_record_db(game_id: str) -> None:
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


def _delete_snapshot_and_close_game_db(game_id: str) -> None:
    _delete_snapshot_db(game_id)
    _close_game_record_db(game_id)


def _cleanup_stale_game_records_db(loaded_ids: list[str], cutoff: datetime, *, max_age_hours: int) -> int:
    session = db.SessionLocal()
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
        stale_ids = {str(record.id) for record in stale} | set(stale_snapshot_ids)
        if not stale_ids:
            return 0

        session.query(GameRecord).filter(GameRecord.id.in_(stale_ids), GameRecord.ended_at.is_(None)).update(
            {GameRecord.ended_at: datetime.now(UTC)}, synchronize_session=False
        )
        session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id.in_(stale_ids)).delete(
            synchronize_session=False
        )
        session.commit()
        logger.info("Retired %d stale games older than %dh", len(stale_ids), max_age_hours)
        return len(stale_ids)
    except Exception:
        logger.exception("Error cleaning up stale game records")
        session.rollback()
        return 0
    finally:
        session.close()


def _fetch_player_mappings_by_game(session: Session, game_ids: list[str]) -> dict[str, tuple[tuple[str, str], ...]]:
    if not game_ids:
        return {}
    rows = (
        session.query(GamePlayerRecord.game_id, GamePlayerRecord.player_id, GamePlayerRecord.player_name)
        .filter(
            GamePlayerRecord.game_id.in_(game_ids),
            GamePlayerRecord.is_puppet.is_(False),
        )
        .all()
    )
    grouped: dict[str, list[tuple[str, str]]] = {}
    for row_game_id, player_id, player_name in rows:
        grouped.setdefault(str(row_game_id), []).append((str(player_id), str(player_name)))
    return {gid: tuple(pairs) for gid, pairs in grouped.items()}


def _to_snapshot_read(row: ActiveGameSnapshot, mappings: tuple[tuple[str, str], ...]) -> _SnapshotRead:
    last_activity = _v if isinstance(_v := row.last_human_activity_at, datetime) else None
    return _SnapshotRead(
        game_id=str(row.game_id),
        state_json=str(row.state_json),
        last_human_activity_at=last_activity,
        player_mappings=mappings,
    )


def _fetch_snapshot_for_restore_db(game_id: str) -> _SnapshotRead | None:
    session = db.SessionLocal()
    try:
        row = session.get(ActiveGameSnapshot, game_id)
        if row is None:
            return None
        mappings = _fetch_player_mappings_by_game(session, [game_id]).get(game_id, ())
        return _to_snapshot_read(row, mappings)
    finally:
        session.close()


def _fetch_all_snapshots_for_restore_db() -> list[_SnapshotRead]:
    session = db.SessionLocal()
    try:
        rows = session.query(ActiveGameSnapshot).all()
        if not rows:
            return []
        game_ids = [str(row.game_id) for row in rows]
        mappings_by_game = _fetch_player_mappings_by_game(session, game_ids)
        return [_to_snapshot_read(row, mappings_by_game.get(str(row.game_id), ())) for row in rows]
    finally:
        session.close()


def _quarantine_snapshots_db(entries: list[_QuarantineWrite]) -> None:
    session = db.SessionLocal()
    try:
        for entry in entries:
            session.add(
                QuarantinedGameSnapshot(
                    game_id=entry.game_id,
                    state_json=entry.state_json,
                    last_human_activity_at=entry.last_human_activity_at,
                    error=entry.error,
                )
            )
            row = session.get(ActiveGameSnapshot, entry.game_id)
            if row is not None:
                session.delete(row)
        session.commit()
    finally:
        session.close()


class SnapshotStore(SpectatorService):
    async def start_background_tasks(self) -> None:
        if self._snapshot_task and not self._snapshot_task.done():
            return

        stale_cleanup_interval = int(3600 / self._snapshot_interval_sec)
        await self.cleanup_stale_game_records_async()

        async def _loop() -> None:
            tick = 0
            while True:
                await asyncio.sleep(self._snapshot_interval_sec)
                tick += 1
                await self.persist_dirty_games_async()
                await self.evict_cold_games_async()
                self.cleanup_expired_spectate_requests()
                if tick % stale_cleanup_interval == 0:
                    await self.cleanup_stale_game_records_async()

        self._snapshot_task = asyncio.create_task(_loop())
        logger.info("Started snapshot/eviction loop (every %.1fs)", self._snapshot_interval_sec)

    async def stop_background_tasks(self) -> None:
        if self._snapshot_task is None:
            return
        self._snapshot_task.cancel()
        self._snapshot_task = None
        await self.persist_all_games_async()

    def persist_all_games(self) -> int:
        self._dirty_games.update(self._active_games.keys())
        return self.persist_dirty_games()

    async def persist_all_games_async(self) -> int:
        self._dirty_games.update(self._active_games.keys())
        return await self.persist_dirty_games_async()

    def _collect_dirty_snapshot_writes(self) -> list[_SnapshotWrite]:
        # complete_game deleted their snapshots, so a write would restore a finished game on the next boot.
        self._dirty_games -= self._finished_games
        target_ids = [gid for gid in list(self._dirty_games) if gid in self._active_games]
        if not target_ids:
            return []

        now = datetime.now(UTC)
        writes: list[_SnapshotWrite] = []
        for game_id in target_ids:
            game = self._active_games.get(game_id)
            if game is None:
                self._dirty_games.discard(game_id)
                continue
            writes.append(
                _SnapshotWrite(
                    game_id=game_id,
                    state_json=game.snapshot_dump_json(),
                    last_human_activity_at=self._last_human_activity.get(game_id, now),
                    updated_at=now,
                )
            )
            self._dirty_games.discard(game_id)
        return writes

    def _requeue_failed_writes(self, writes: list[_SnapshotWrite]) -> None:
        for item in writes:
            if item.game_id in self._active_games and item.game_id not in self._finished_games:
                self._dirty_games.add(item.game_id)

    def _log_snapshot_flush(self, wrote: int) -> None:
        if wrote:
            logger.info(
                "Snapshot flush: wrote=%d loaded_games=%d dirty_remaining=%d",
                wrote,
                len(self._active_games),
                len(self._dirty_games),
            )

    def persist_dirty_games(self) -> int:
        writes = self._collect_dirty_snapshot_writes()
        if not writes:
            return 0
        try:
            _upsert_snapshots_db(writes)
        except Exception:
            self._requeue_failed_writes(writes)
            raise
        self._log_snapshot_flush(len(writes))
        return len(writes)

    async def persist_dirty_games_async(self) -> int:
        writes = self._collect_dirty_snapshot_writes()
        if not writes:
            return 0
        try:
            await asyncio.to_thread(_upsert_snapshots_db, writes)
        except Exception:
            self._requeue_failed_writes(writes)
            raise
        # If a game finished or was cleaned up while the DB write was in flight, remove the stale snapshot.
        for item in writes:
            if item.game_id in self._finished_games or item.game_id not in self._active_games:
                await asyncio.to_thread(_delete_snapshot_db, item.game_id)
        self._log_snapshot_flush(len(writes))
        return len(writes)

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
                battle.start(game, player, opponent=opponent)
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
            existing_user_id = next((str(row.user_id) for row in existing_rows if row.user_id), None)
            resolved_user_id = user_ids.get(player_id) or existing_user_id
            existing_hash = next((str(row.seat_token_hash) for row in existing_rows if row.seat_token_hash), None)

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

    def _apply_restored_player_mappings(
        self, game_id: str, game: Game, *, player_mappings: tuple[tuple[str, str], ...]
    ) -> int:
        self._clear_runtime_player_mappings_for_game(game_id)

        valid_names = {p.name for p in game.players}
        restored = 0
        for player_id, player_name in player_mappings:
            if player_name not in valid_names:
                continue
            self._player_to_game[player_id] = game_id
            self._player_id_to_name[player_id] = player_name
            restored += 1
        return restored

    def _apply_snapshot_read(
        self, row: _SnapshotRead, *, quarantine_on_error: bool
    ) -> tuple[bool, _QuarantineWrite | None]:
        try:
            game = restore_game_from_snapshot(row.state_json)
        except Exception as exc:
            if quarantine_on_error:
                logger.exception("Snapshot does not restore; quarantining game_id=%s", row.game_id)
                return False, _QuarantineWrite(
                    game_id=row.game_id,
                    state_json=row.state_json,
                    last_human_activity_at=row.last_human_activity_at,
                    error=f"{type(exc).__name__}: {exc}",
                )
            logger.exception("Failed restoring snapshot for game_id=%s", row.game_id)
            return False, None

        self._active_games[row.game_id] = game
        self._dirty_games.discard(row.game_id)
        if self._normalize_restored_game(game):
            self.mark_game_dirty(row.game_id, human_activity=False)
        restored_mappings = self._apply_restored_player_mappings(row.game_id, game, player_mappings=row.player_mappings)
        if not quarantine_on_error and restored_mappings == 0:
            logger.warning("No human player mappings restored for game_id=%s", row.game_id)
        self._last_human_activity[row.game_id] = _utc_or_default(row.last_human_activity_at, datetime.now(UTC))
        if not quarantine_on_error:
            logger.info("Restored active game from snapshot: game_id=%s", row.game_id)
        return True, None

    def restore_game_from_snapshot(self, game_id: str) -> bool:
        if game_id in self._active_games:
            return True
        try:
            row = _fetch_snapshot_for_restore_db(game_id)
        except Exception:
            logger.exception("Failed restoring snapshot for game_id=%s", game_id)
            return False
        if row is None:
            return False
        restored, _ = self._apply_snapshot_read(row, quarantine_on_error=False)
        return restored

    async def restore_game_from_snapshot_async(self, game_id: str) -> bool:
        if game_id in self._active_games:
            return True
        try:
            row = await asyncio.to_thread(_fetch_snapshot_for_restore_db, game_id)
        except Exception:
            logger.exception("Failed restoring snapshot for game_id=%s", game_id)
            return False
        if row is None:
            return False
        if game_id in self._active_games:
            return True
        restored, _ = self._apply_snapshot_read(row, quarantine_on_error=False)
        return restored

    async def restore_all_snapshots(self) -> int:
        rows = await asyncio.to_thread(_fetch_all_snapshots_for_restore_db)
        restored = 0
        quarantined: list[_QuarantineWrite] = []
        for row in rows:
            async with self.get_action_lock(row.game_id):
                ok, quarantine = self._apply_snapshot_read(row, quarantine_on_error=True)
                if ok:
                    restored += 1
                elif quarantine is not None:
                    quarantined.append(quarantine)

        if quarantined:
            await asyncio.to_thread(_quarantine_snapshots_db, quarantined)

        if restored:
            logger.info("Restored %d active games from snapshots", restored)
        return restored

    def has_game(self, game_id: str) -> bool:
        if game_id in self._pending_games or game_id in self._active_games:
            return True
        return _snapshot_exists_db(game_id)

    async def has_game_async(self, game_id: str) -> bool:
        if game_id in self._pending_games or game_id in self._active_games:
            return True
        return await asyncio.to_thread(_snapshot_exists_db, game_id)

    def delete_snapshot(self, game_id: str) -> None:
        _delete_snapshot_db(game_id)
        self._dirty_games.discard(game_id)

    def cleanup_stale_game_records(self, max_age_hours: int = STALE_GAME_CLEANUP_HOURS) -> int:
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
        loaded_ids = list(self._active_games)
        return _cleanup_stale_game_records_db(loaded_ids, cutoff, max_age_hours=max_age_hours)

    async def cleanup_stale_game_records_async(self, max_age_hours: int = STALE_GAME_CLEANUP_HOURS) -> int:
        cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
        loaded_ids = list(self._active_games)
        return await asyncio.to_thread(_cleanup_stale_game_records_db, loaded_ids, cutoff, max_age_hours=max_age_hours)

    @staticmethod
    def _retire_games(session: Session, game_ids: set[str]) -> None:
        session.query(GameRecord).filter(GameRecord.id.in_(game_ids), GameRecord.ended_at.is_(None)).update(
            {GameRecord.ended_at: datetime.now(UTC)}, synchronize_session=False
        )
        session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id.in_(game_ids)).delete(
            synchronize_session=False
        )
        session.commit()

    def _cold_game_candidates(self) -> list[str]:
        cutoff = datetime.now(UTC) - timedelta(minutes=IDLE_EVICT_MINUTES)
        candidates: list[str] = []
        for game_id in list(self._active_games):
            if self._connected_player_ids(game_id):
                continue
            last_human = _utc_or_default(
                self._last_human_activity.get(game_id),
                datetime.min.replace(tzinfo=UTC),
            )
            if last_human < cutoff:
                candidates.append(game_id)
        return candidates

    def evict_cold_games(self) -> int:
        candidates = self._cold_game_candidates()
        if not candidates:
            return 0

        evicted = 0
        for game_id in candidates:
            self.mark_game_dirty(game_id, human_activity=False)
            self.persist_dirty_games()
            self.cleanup_game(game_id, preserve_snapshot=True)
            evicted += 1

        if evicted:
            logger.info("Evicted cold games from memory: count=%d", evicted)
        return evicted

    async def evict_cold_games_async(self) -> int:
        candidates = self._cold_game_candidates()
        if not candidates:
            return 0

        evicted = 0
        for game_id in candidates:
            self.mark_game_dirty(game_id, human_activity=False)
            await self.persist_dirty_games_async()
            if game_id not in self._active_games or self._connected_player_ids(game_id):
                continue
            self.cleanup_game(game_id, preserve_snapshot=True)
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
            self.cleanup_game(game_id)

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
                await self.cleanup_game_async(game_id)

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

    def _cleanup_game_memory(self, game_id: str, *, preserve_snapshot: bool = False) -> None:
        logger.info("Executing cleanup for game_id=%s", game_id)
        pending = self._pending_games.get(game_id)
        if pending:
            if pending.loading_task and not pending.loading_task.done():
                pending.loading_task.cancel()
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

    def cleanup_game(self, game_id: str, *, preserve_snapshot: bool = False) -> None:
        """Remove game from memory."""
        self._cleanup_game_memory(game_id, preserve_snapshot=preserve_snapshot)
        if not preserve_snapshot:
            self.delete_snapshot(game_id)
            _close_game_record_db(game_id)

    async def cleanup_game_async(self, game_id: str, *, preserve_snapshot: bool = False) -> None:
        self._cleanup_game_memory(game_id, preserve_snapshot=preserve_snapshot)
        if not preserve_snapshot:
            self._dirty_games.discard(game_id)
            await asyncio.to_thread(_delete_snapshot_and_close_game_db, game_id)

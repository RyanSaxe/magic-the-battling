import asyncio
import json
import logging
import random
import secrets
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import uuid4

from sqlalchemy import true as sql_true
from sqlalchemy.orm import Session, joinedload

import server.db.database as db
from mtb.models.cards import (
    DEFAULT_UPGRADES_ID,
    DEFAULT_VANGUARD_ID,
    Battler,
    Card,
    build_battler,
)
from mtb.models.game import (
    Battle,
    BattleSnapshotData,
    Config,
    Game,
    LastBattleResult,
    Player,
    Puppet,
    StaticOpponent,
    Zones,
    create_game,
    set_battler,
)
from mtb.models.types import BuildSource, CardDestination, ZoneName
from mtb.phases import battle, build, draft, reward
from mtb.phases.battle import get_pairing_probabilities
from mtb.phases.elimination import (
    check_game_over,
    eliminate_player,
    eliminate_puppet,
    get_live_players,
    get_live_puppets,
    get_sudden_death_fighters,
    get_would_be_dead,
    get_would_be_dead_puppets,
    needs_sudden_death,
    process_puppet_eliminations,
    setup_sudden_death_battle,
    would_be_dead_ready_for_elimination,
)
from server.db.models import BattleSnapshot, GameRecord, PlayerGameHistory
from server.schemas.api import (
    BattleView,
    CubeLoadingStatus,
    GameStateResponse,
    LastResult,
    LobbyPlayer,
    LobbyStateResponse,
    PlayerView,
    SelfPlayerView,
)
from server.services.session_manager import session_manager

logger = logging.getLogger(__name__)


def _scrub_face_down_cards(cards: list[Card], face_down_ids: set[str], id_map: dict[str, str]) -> list[Card]:
    result = []
    for card in cards:
        if card.id in face_down_ids:
            opaque_id = str(uuid4())
            id_map[opaque_id] = card.id
            result.append(Card(id=opaque_id, name="", image_url="", type_line=""))
        else:
            result.append(card)
    return result


def _remap_id_list(ids: list[str], reverse_map: dict[str, str]) -> list[str]:
    return [reverse_map.get(real_id, real_id) for real_id in ids]


def _remap_id_dict[T](d: dict[str, T], reverse_map: dict[str, str]) -> dict[str, T]:
    return {reverse_map.get(k, k): v for k, v in d.items()}


@dataclass
class PendingSpectateRequest:
    request_id: str
    game_id: str
    target_player_name: str
    spectator_name: str
    status: Literal["pending", "approved", "denied"] = "pending"
    session_id: str | None = None
    player_id: str | None = None


@dataclass
class PendingGame:
    game_id: str
    join_code: str
    cube_id: str
    host_player_id: str
    player_names: list[str] = field(default_factory=list)
    player_ids: list[str] = field(default_factory=list)
    is_started: bool = False
    use_upgrades: bool = True
    use_vanguards: bool = False
    target_player_count: int = 4
    auto_approve_spectators: bool = False
    player_ready: dict[str, bool] = field(default_factory=dict)
    puppet_count: int = 0
    battler: Battler | None = None
    battler_loading: bool = False
    battler_error: str | None = None
    _loading_task: asyncio.Task | None = field(default=None, repr=False)


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
        self._cleanup_tasks: dict[str, asyncio.Task] = {}
        self._pending_disconnect_tasks: dict[str, asyncio.Task] = {}
        self._spectate_requests: dict[str, PendingSpectateRequest] = {}

    def create_game(
        self,
        player_name: str,
        player_id: str,
        cube_id: str = "auto",
        use_upgrades: bool = True,
        use_vanguards: bool = False,
        target_player_count: int = 4,
        auto_approve_spectators: bool = False,
    ) -> PendingGame:
        game_id = secrets.token_urlsafe(8)
        join_code = secrets.token_urlsafe(4).upper()[:6]

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
            player_ready={player_id: False},
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

    def join_game(self, join_code: str, player_name: str, player_id: str) -> PendingGame | None:
        pending = self.get_pending_game_by_code(join_code)
        if not pending:
            return None

        if player_name in pending.player_names:
            return None

        total = len(pending.player_names) + pending.puppet_count
        if total >= 8:
            return None

        pending.player_names.append(player_name)
        pending.player_ids.append(player_id)
        pending.player_ready[player_id] = False
        self._player_to_game[player_id] = pending.game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def set_player_ready(self, game_id: str, player_id: str, is_ready: bool) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started:
            return False

        if player_id not in pending.player_ids:
            return False

        pending.player_ready[player_id] = is_ready
        return True

    def can_start_game(self, game_id: str, player_id: str) -> tuple[bool, str | None]:
        pending = self._pending_games.get(game_id)
        if not pending:
            return False, "Game not found"

        if pending.is_started:
            return False, "Game already started"

        if player_id != pending.host_player_id:
            return False, "Only the host can start the game"

        total = len(pending.player_names) + pending.puppet_count
        if total < 2:
            return False, "Need at least 2 players"

        if total % 2 != 0:
            return False, "Need an even number of players"

        all_ready = all(pending.player_ready.get(pid, False) for pid in pending.player_ids)
        if not all_ready:
            return False, "Not all players are ready"

        return True, None

    def start_game(self, game_id: str, db: Session | None = None) -> Game | None:
        pending = self._pending_games.get(game_id)
        total = len(pending.player_names) + pending.puppet_count if pending else 0
        if not pending or total < 2:
            return None

        pending.is_started = True
        pending.target_player_count = total

        config = Config(
            use_upgrades=pending.use_upgrades,
            use_vanguards=pending.use_vanguards,
            auto_approve_spectators=pending.auto_approve_spectators,
            cube_id=pending.cube_id,
        )
        game = create_game(pending.player_names, len(pending.player_names), config)
        battler = self._load_battler(pending.cube_id, pending.use_upgrades, pending.use_vanguards)
        set_battler(game, battler)

        if db is not None:
            config_data = {
                "use_upgrades": pending.use_upgrades,
                "use_vanguards": pending.use_vanguards,
                "cube_id": pending.cube_id,
            }
            game_record = GameRecord(
                id=game_id,
                config_json=json.dumps(config_data),
            )
            db.add(game_record)
            db.commit()

            if pending.puppet_count > 0:
                target_elo = battler.elo or 1200.0
                self.load_fake_players_for_game(
                    db,
                    game,
                    pending.puppet_count,
                    target_elo,
                    pending.use_upgrades,
                    pending.use_vanguards,
                    pending.cube_id,
                )

        self._active_games[game_id] = game
        self._pending_games.pop(game_id, None)

        return game

    async def start_game_async(self, game_id: str, db: Session | None = None) -> Game | None:
        pending = self._pending_games.get(game_id)
        total = len(pending.player_names) + pending.puppet_count if pending else 0
        if not pending or total < 2:
            return None

        if pending._loading_task and not pending._loading_task.done():
            try:
                await asyncio.wait_for(pending._loading_task, timeout=30.0)
            except TimeoutError:
                pass

        if pending.battler_error:
            return None

        if not pending.battler:
            loop = asyncio.get_running_loop()
            try:
                pending.battler = await loop.run_in_executor(
                    None, self._load_battler, pending.cube_id, pending.use_upgrades, pending.use_vanguards
                )
            except Exception:
                return None

        pending.is_started = True
        pending.target_player_count = total

        config = Config(
            use_upgrades=pending.use_upgrades,
            use_vanguards=pending.use_vanguards,
            auto_approve_spectators=pending.auto_approve_spectators,
            cube_id=pending.cube_id,
        )
        game = create_game(pending.player_names, len(pending.player_names), config)
        battler = pending.battler
        set_battler(game, battler)

        if db is not None:
            config_data = {
                "use_upgrades": pending.use_upgrades,
                "use_vanguards": pending.use_vanguards,
                "cube_id": pending.cube_id,
            }
            game_record = GameRecord(
                id=game_id,
                config_json=json.dumps(config_data),
            )
            db.add(game_record)
            db.commit()

            if pending.puppet_count > 0:
                target_elo = battler.elo or 1200.0
                self.load_fake_players_for_game(
                    db,
                    game,
                    pending.puppet_count,
                    target_elo,
                    pending.use_upgrades,
                    pending.use_vanguards,
                    pending.cube_id,
                )

        self._active_games[game_id] = game
        self._pending_games.pop(game_id, None)

        return game

    def complete_game(self, game_id: str, winner: Player | None, db: Session | None = None) -> None:
        """Complete a game - set phases, persist final state, schedule cleanup."""
        game = self._active_games.get(game_id)
        if not game:
            return

        live_players = [p for p in game.players if p.phase != "eliminated"]
        live_bots = [fp for fp in game.puppets if not fp.is_eliminated]

        if winner:
            winner.phase = "winner"
            winner.placement = 1
            logger.info("Game won: game_id=%s winner=%s", game_id, winner.name)
        else:
            logger.info("Game over with no winner: game_id=%s", game_id)

        remaining_no_placement = [
            p for p in live_players if p.placement == 0 and p.name != (winner.name if winner else "")
        ]
        unplaced_bots = [fp for fp in live_bots if fp.placement == 0]

        all_unplaced: list[Player | Puppet] = list(remaining_no_placement) + list(unplaced_bots)
        all_unplaced.sort(key=lambda p: p.poison)

        start = 2 if winner else 1
        for i, participant in enumerate(all_unplaced):
            participant.placement = start + i

        for p in remaining_no_placement:
            p.phase = "game_over"

        for player in game.players:
            if player.phase not in ("winner", "eliminated", "game_over"):
                player.phase = "game_over"

        if db is not None:
            game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
            if game_record:
                game_record.ended_at = datetime.now(UTC)
                if winner:
                    game_record.winner_player_id = winner.name
                db.commit()

            self._persist_final_placements(db, game_id, game)

        self._schedule_cleanup(game_id)

    def _persist_player_placement(self, db: Session | None, game_id: str | None, name: str, placement: int) -> None:
        if not db or not game_id:
            return
        history = (
            db.query(PlayerGameHistory)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name == name,
            )
            .first()
        )
        if history:
            history.final_placement = placement
            db.commit()

    def _persist_final_placements(self, db: Session, game_id: str, game: Game) -> None:
        all_participants = [(p.name, p.placement) for p in game.players if p.placement > 0]
        all_participants.extend((fp.name, fp.placement) for fp in game.puppets if fp.placement > 0)

        for name, placement in all_participants:
            history = (
                db.query(PlayerGameHistory)
                .filter(
                    PlayerGameHistory.game_id == game_id,
                    PlayerGameHistory.player_name == name,
                )
                .first()
            )
            if history:
                history.final_placement = placement
        db.commit()

    def _schedule_cleanup(self, game_id: str, delay: float = 300.0) -> None:
        """Schedule async cleanup after delay seconds (default 5 min)."""
        if game_id in self._cleanup_tasks:
            self._cleanup_tasks[game_id].cancel()

        async def cleanup_after_delay():
            await asyncio.sleep(delay)
            self._cleanup_game(game_id)

        try:
            loop = asyncio.get_event_loop()
            task = loop.create_task(cleanup_after_delay())
            self._cleanup_tasks[game_id] = task
        except RuntimeError:
            pass

    def schedule_abandoned_cleanup(self, game_id: str, delay: float = 86400.0) -> None:
        """Schedule cleanup for abandoned game (default 24 hours)."""
        logger.info("Scheduling abandoned game cleanup for game_id=%s in %.0f seconds", game_id, delay)
        self._schedule_cleanup(game_id, delay)

    def cancel_abandoned_cleanup(self, game_id: str) -> None:
        """Cancel scheduled cleanup when a player reconnects."""
        if task := self._cleanup_tasks.pop(game_id, None):
            task.cancel()

    def _cleanup_game(self, game_id: str) -> None:
        """Remove game from memory."""
        logger.info("Executing cleanup for game_id=%s", game_id)
        pending = self._pending_games.get(game_id)
        if pending:
            if pending._loading_task and not pending._loading_task.done():
                pending._loading_task.cancel()
            self._join_code_to_game.pop(pending.join_code, None)

        self._active_games.pop(game_id, None)
        self._pending_games.pop(game_id, None)

        players_to_remove = [pid for pid, gid in self._player_to_game.items() if gid == game_id]
        for pid in players_to_remove:
            self._player_to_game.pop(pid, None)
            self._player_id_to_name.pop(pid, None)

        self._cleanup_tasks.pop(game_id, None)

    def _load_battler(self, cube_id: str, use_upgrades: bool, use_vanguards: bool) -> Battler:
        upgrades_id = DEFAULT_UPGRADES_ID if use_upgrades else None
        vanguards_id = DEFAULT_VANGUARD_ID if use_vanguards else None
        return build_battler(cube_id, upgrades_id, vanguards_id)

    async def _preload_battler(
        self, pending: PendingGame, on_complete: Callable[[], Coroutine[Any, Any, None]] | None = None
    ) -> None:
        pending.battler_loading = True
        try:
            loop = asyncio.get_running_loop()
            battler = await loop.run_in_executor(
                None, self._load_battler, pending.cube_id, pending.use_upgrades, pending.use_vanguards
            )
            pending.battler = battler
        except Exception as e:
            pending.battler_error = str(e)
        finally:
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
        count: int,
        exclude_ids: list[int],
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
    ) -> list[PlayerGameHistory]:
        query = (
            db.query(PlayerGameHistory)
            .options(joinedload(PlayerGameHistory.snapshots))
            .filter(
                PlayerGameHistory.id.notin_(exclude_ids) if exclude_ids else sql_true(),
                PlayerGameHistory.max_stage >= 6,
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
            if use_upgrades is not None and config.get("use_upgrades") != use_upgrades:
                continue
            if use_vanguards is not None and config.get("use_vanguards") != use_vanguards:
                continue

            if cube_id and config.get("cube_id") == cube_id:
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
            key = f"{snapshot.stage}_{snapshot.round}"
            snapshot_data = BattleSnapshotData.model_validate_json(snapshot.full_state_json)
            static_opp = StaticOpponent.from_snapshot(snapshot_data, bot_name, history_id)
            snapshots_dict[key] = static_opp

        return Puppet(
            name=bot_name,
            player_history_id=history_id,
            snapshots=snapshots_dict,
        )

    def _record_snapshot(self, db: Session, game_id: str, player: Player, battler_elo: float) -> None:
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
            history = PlayerGameHistory(
                game_id=game_id,
                player_name=player.name,
                battler_elo=battler_elo,
                max_stage=stage,
                max_round=player.round,
            )
            db.add(history)
            db.flush()
        elif stage > history.max_stage or (stage == history.max_stage and player.round > history.max_round):
            history.max_stage = stage
            history.max_round = player.round

        snapshot_data = BattleSnapshotData(
            hand=[c.model_copy() for c in player.hand],
            vanguard=player.vanguard.model_copy() if player.vanguard else None,
            basic_lands=player.chosen_basics.copy(),
            applied_upgrades=[u.model_copy() for u in player.upgrades if u.upgrade_target is not None],
            upgrades=[u.model_copy() for u in player.upgrades],
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
            hand_json=json.dumps([c.model_dump() for c in player.hand]),
            vanguard_json=player.vanguard.model_dump_json() if player.vanguard else None,
            basic_lands_json=json.dumps(player.chosen_basics),
            applied_upgrades_json=json.dumps([u.model_dump() for u in player.upgrades if u.upgrade_target]),
            treasures=player.treasures,
            poison=player.poison,
            play_draw_preference=player.play_draw_preference,
            full_state_json=snapshot_data.model_dump_json(),
        )
        db.add(snapshot)
        db.commit()

    def _record_bot_poison(
        self, db: Session, game_id: str, fp: Puppet, battler_elo: float, stage: int, round_num: int
    ) -> None:
        history = (
            db.query(PlayerGameHistory)
            .filter(
                PlayerGameHistory.game_id == game_id,
                PlayerGameHistory.player_name == fp.name,
                PlayerGameHistory.is_puppet == True,  # noqa: E712
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
            history.max_stage = stage
            history.max_round = round_num

        raw = cast(str, history.poison_history_json) if history.poison_history_json else ""
        poison_map: dict[str, int] = json.loads(raw) if raw else {}
        poison_map[f"{stage}_{round_num}"] = fp.poison
        history.poison_history_json = json.dumps(poison_map)
        db.commit()

    def load_fake_players_for_game(
        self,
        db: Session,
        game: Game,
        count: int,
        target_elo: float,
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
    ) -> None:
        if count <= 0:
            return

        existing_names = {p.name for p in game.players}
        existing_names.update(fp.name for fp in game.puppets)

        histories = self._find_historical_players(db, target_elo, count, [], use_upgrades, use_vanguards, cube_id)
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
        for player in game.players:
            if player.name == player_name:
                return player
        return None

    def can_rejoin(self, game_id: str, player_name: str) -> bool:
        from server.routers.ws import connection_manager  # noqa: PLC0415

        game = self._active_games.get(game_id)
        if not game:
            return False

        if not any(p.name == player_name for p in game.players):
            return False

        player_id = self.get_player_id_by_name(game_id, player_name)
        return not (player_id and connection_manager.is_player_connected(game_id, player_id))

    def rejoin_game(self, game_id: str, player_name: str, player_id: str) -> bool:
        game = self._active_games.get(game_id)
        if not game or not any(p.name == player_name for p in game.players):
            return False

        old_player_ids = [
            pid
            for pid, name in self._player_id_to_name.items()
            if name == player_name and self._player_to_game.get(pid) == game_id
        ]
        for old_pid in old_player_ids:
            self._player_id_to_name.pop(old_pid, None)
            self._player_to_game.pop(old_pid, None)

        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name
        return True

    def remove_player_from_pending(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started or player_id not in pending.player_ids:
            return False

        idx = pending.player_ids.index(player_id)
        pending.player_names.pop(idx)
        pending.player_ids.pop(idx)
        pending.player_ready.pop(player_id, None)

        self._player_to_game.pop(player_id, None)
        self._player_id_to_name.pop(player_id, None)

        if not pending.player_ids:
            del self._pending_games[game_id]

        return True

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
        if pending and not pending.is_started and player_id in pending.player_ids:
            pending.player_ready[player_id] = False

        async def remove_after_delay():
            await asyncio.sleep(delay)
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

    def add_puppet(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started:
            return False
        if player_id != pending.host_player_id:
            return False
        total = len(pending.player_names) + pending.puppet_count
        if total >= 8:
            return False
        available = self._count_available_bots(pending)
        if available is None or available <= pending.puppet_count:
            return False
        pending.puppet_count += 1
        return True

    def remove_puppet(self, game_id: str, player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started:
            return False
        if player_id != pending.host_player_id:
            return False
        if pending.puppet_count <= 0:
            return False
        pending.puppet_count -= 1
        return True

    def kick_player(self, game_id: str, host_player_id: str, target_player_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if not pending or pending.is_started:
            return False
        if host_player_id != pending.host_player_id:
            return False
        if target_player_id == pending.host_player_id:
            return False
        if target_player_id not in pending.player_ids:
            return False
        idx = pending.player_ids.index(target_player_id)
        pending.player_names.pop(idx)
        pending.player_ids.pop(idx)
        pending.player_ready.pop(target_player_id, None)
        self._player_to_game.pop(target_player_id, None)
        self._player_id_to_name.pop(target_player_id, None)
        return True

    def get_player_id_by_name(self, game_id: str, player_name: str) -> str | None:
        for player_id, name in self._player_id_to_name.items():
            if name == player_name and self._player_to_game.get(player_id) == game_id:
                return player_id
        return None

    def create_spectate_request(self, game_id: str, target_player_name: str, spectator_name: str) -> str:
        request_id = secrets.token_urlsafe(8)
        req = PendingSpectateRequest(
            request_id=request_id,
            game_id=game_id,
            target_player_name=target_player_name,
            spectator_name=spectator_name,
        )
        self._spectate_requests[request_id] = req

        game = self.get_game(game_id)
        if game and game.config.auto_approve_spectators:
            self.approve_spectate_request(request_id)

        return request_id

    def get_spectate_request(self, request_id: str) -> PendingSpectateRequest | None:
        return self._spectate_requests.get(request_id)

    def approve_spectate_request(self, request_id: str) -> PendingSpectateRequest | None:
        req = self._spectate_requests.get(request_id)
        if req and req.status == "pending":
            req.status = "approved"
            session = session_manager.create_session(req.game_id)
            req.session_id = session.session_id
            req.player_id = session.player_id
        return req

    def deny_spectate_request(self, request_id: str) -> PendingSpectateRequest | None:
        req = self._spectate_requests.get(request_id)
        if req and req.status == "pending":
            req.status = "denied"
        return req

    def _get_cube_loading_status(self, pending: PendingGame) -> CubeLoadingStatus:
        if pending.battler_error:
            return "error"
        if pending.battler is not None:
            return "ready"
        return "loading"

    def _count_available_bots(self, pending: PendingGame) -> int | None:
        if pending.battler is None:
            return None

        max_puppets = 8 - len(pending.player_names)
        if max_puppets <= 0:
            return 0

        db_session = db.SessionLocal()
        try:
            target_elo = pending.battler.elo or 1200.0
            histories = self._find_historical_players(
                db_session, target_elo, max_puppets, [], pending.use_upgrades, pending.use_vanguards, pending.cube_id
            )
            return len(histories)
        finally:
            db_session.close()

    def get_lobby_state(self, game_id: str) -> LobbyStateResponse | None:
        pending = self._pending_games.get(game_id)
        if not pending:
            return None

        players = []
        for i, name in enumerate(pending.player_names):
            player_id = pending.player_ids[i]
            players.append(
                LobbyPlayer(
                    player_id=player_id,
                    name=name,
                    is_ready=pending.player_ready.get(player_id, False),
                    is_host=player_id == pending.host_player_id,
                )
            )

        all_ready = all(pending.player_ready.get(pid, False) for pid in pending.player_ids)
        total = len(pending.player_names) + pending.puppet_count
        available = self._count_available_bots(pending)
        has_enough_bots = pending.puppet_count == 0 or (available is not None and available >= pending.puppet_count)
        can_start = total >= 2 and total % 2 == 0 and all_ready and has_enough_bots

        return LobbyStateResponse(
            game_id=game_id,
            join_code=pending.join_code,
            players=players,
            can_start=can_start,
            is_started=pending.is_started,
            target_player_count=total,
            puppet_count=pending.puppet_count,
            cube_loading_status=self._get_cube_loading_status(pending),
            cube_loading_error=pending.battler_error,
            available_puppet_count=available,
            cube_id=pending.cube_id,
            use_upgrades=pending.use_upgrades,
        )

    def get_game_state(self, game_id: str, player_id: str) -> GameStateResponse | None:
        game = self._active_games.get(game_id)
        if not game:
            return None

        player = self.get_player(game, player_id)
        if not player:
            return None

        phase = self._determine_game_phase(game)

        current_pack = None
        if game.draft_state and player.name in game.draft_state.current_packs:
            current_pack = game.draft_state.current_packs[player.name]

        current_battle = None
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                current_battle = self._make_battle_view(b, player, game)
                break

        probabilities = self._get_pairing_probabilities(game, player)
        most_recent_ghost_name = game.most_recent_ghost.name if game.most_recent_ghost else None
        most_recent_ghost_puppet_name = game.most_recent_ghost_puppet.name if game.most_recent_ghost_puppet else None

        all_players = [self._make_player_view(p, player, probabilities, most_recent_ghost_name) for p in game.players]
        all_players.extend(
            self._make_fake_player_view(fp, player, probabilities, most_recent_ghost_puppet_name) for fp in game.puppets
        )

        return GameStateResponse(
            game_id=game_id,
            phase=phase,
            starting_life=game.config.starting_life,
            use_upgrades=game.config.use_upgrades,
            players=all_players,
            self_player=SelfPlayerView(
                name=player.name,
                treasures=player.treasures,
                poison=player.poison,
                phase=player.phase,
                round=player.round,
                stage=player.stage,
                vanquishers=player.vanquishers,
                is_ghost=(player.phase == "eliminated"),
                time_of_death=None,
                hand_count=len(player.hand),
                sideboard_count=len(player.sideboard),
                hand_size=player.hand_size,
                is_stage_increasing=reward.is_stage_increasing(player),
                upgrades=player.upgrades,
                vanguard=player.vanguard,
                chosen_basics=player.chosen_basics,
                most_recently_revealed_cards=player.most_recently_revealed_cards,
                last_result=self._get_last_result(player),
                hand=player.hand,
                sideboard=player.sideboard,
                command_zone=player.command_zone,
                current_pack=current_pack,
                last_battle_result=player.last_battle_result,
                build_ready=player.build_ready,
                in_sudden_death=player.in_sudden_death,
                placement=player.placement,
            ),
            available_upgrades=game.available_upgrades,
            current_battle=current_battle,
            cube_id=game.config.cube_id,
        )

    def _determine_game_phase(self, game: Game) -> str:
        phases = {p.phase for p in game.players if p.phase != "eliminated"}
        if len(phases) == 1:
            return phases.pop()
        if "battle" in phases:
            return "battle"
        if "reward" in phases:
            return "reward"
        if "awaiting_elimination" in phases:
            return "awaiting_elimination"
        if "build" in phases:
            return "build"
        if "draft" in phases:
            return "draft"
        return "unknown"

    def _get_pairing_probabilities(self, game: Game, player: Player) -> dict[str, float]:
        """Get pairing probabilities, with 100% for sudden death opponents."""
        if player.in_sudden_death:
            other_sd_player = self._find_sudden_death_opponent(game, player)
            if other_sd_player:
                return {other_sd_player.name: 1.0}
            for fp in game.puppets:
                if fp.in_sudden_death and not fp.is_eliminated:
                    return {fp.name: 1.0}
            return {}

        return get_pairing_probabilities(game, player)

    def _get_last_result(self, player: Player) -> LastResult | None:
        result = player.last_battle_result
        if result is None:
            return None
        if result.is_draw:
            return "draw"
        if result.winner_name != player.name:
            return "loss"
        return "win"

    def _get_fake_player_last_result(self, fake: Puppet) -> LastResult | None:
        result = fake.last_battle_result
        if result is None:
            return None
        if result.is_draw:
            return "draw"
        if result.winner_name != fake.name:
            return "loss"
        return "win"

    def _make_player_view(
        self,
        player: Player,
        viewer: Player,
        probabilities: dict[str, float],
        most_recent_ghost_name: str | None = None,
    ) -> PlayerView:
        is_eliminated = player.phase == "eliminated"
        return PlayerView(
            name=player.name,
            treasures=player.treasures,
            poison=player.poison,
            phase=player.phase,
            round=player.round,
            stage=player.stage,
            vanquishers=player.vanquishers,
            is_ghost=is_eliminated,
            is_puppet=False,
            time_of_death=None,
            hand_count=len(player.hand),
            sideboard_count=len(player.sideboard),
            hand_size=player.hand_size,
            is_stage_increasing=reward.is_stage_increasing(player),
            upgrades=player.upgrades,
            vanguard=player.vanguard,
            chosen_basics=player.chosen_basics,
            most_recently_revealed_cards=player.most_recently_revealed_cards,
            last_result=self._get_last_result(player),
            pairing_probability=probabilities.get(player.name, 0.0),
            is_most_recent_ghost=player.name == most_recent_ghost_name,
            full_sideboard=player.sideboard if is_eliminated else [],
            command_zone=player.command_zone,
            placement=player.placement,
            in_sudden_death=player.in_sudden_death,
            build_ready=player.build_ready,
        )

    def _make_fake_player_view(
        self,
        fake: Puppet,
        viewer: Player,
        probabilities: dict[str, float],
        most_recent_ghost_puppet_name: str | None = None,
    ) -> PlayerView:
        snapshot = fake.get_opponent_for_round(viewer.stage, viewer.round)

        if viewer.in_sudden_death:
            revealed_cards = (snapshot.hand + snapshot.command_zone) if snapshot else []
            prior_upgrades = snapshot.upgrades if snapshot else []
        else:
            if viewer.phase == "reward":
                prior_snapshot = fake.get_opponent_for_round(viewer.stage, viewer.round)
            elif viewer.round > 1:
                prior_snapshot = fake.get_opponent_for_round(viewer.stage, viewer.round - 1)
            elif viewer.stage > 3:
                prior_snapshot = fake.get_opponent_for_round(viewer.stage - 1, 3)
            else:
                prior_snapshot = None

            prior_hand = prior_snapshot.hand if prior_snapshot else []
            prior_command_zone = prior_snapshot.command_zone if prior_snapshot else []
            revealed_cards = prior_hand + prior_command_zone
            prior_upgrades = prior_snapshot.upgrades if prior_snapshot else []

        last_result = self._get_fake_player_last_result(fake)

        if snapshot:
            return PlayerView(
                name=fake.name,
                treasures=snapshot.treasures,
                poison=fake.poison,
                phase="battle",
                round=viewer.round,
                stage=viewer.stage,
                vanquishers=0,
                is_ghost=fake.is_eliminated,
                is_puppet=True,
                time_of_death=None,
                hand_count=len(snapshot.hand),
                sideboard_count=len(snapshot.sideboard),
                hand_size=len(snapshot.hand),
                is_stage_increasing=False,
                upgrades=prior_upgrades,
                vanguard=snapshot.vanguard,
                chosen_basics=snapshot.chosen_basics,
                most_recently_revealed_cards=revealed_cards,
                last_result=last_result,
                pairing_probability=probabilities.get(fake.name, 0.0),
                is_most_recent_ghost=fake.name == most_recent_ghost_puppet_name,
                full_sideboard=snapshot.sideboard,
                command_zone=snapshot.command_zone,
                placement=fake.placement,
                in_sudden_death=fake.in_sudden_death,
            )
        return PlayerView(
            name=fake.name,
            treasures=0,
            poison=0,
            phase="battle",
            round=viewer.round,
            stage=viewer.stage,
            vanquishers=0,
            is_ghost=fake.is_eliminated,
            is_puppet=True,
            time_of_death=None,
            hand_count=0,
            sideboard_count=0,
            hand_size=0,
            is_stage_increasing=False,
            upgrades=[],
            vanguard=None,
            chosen_basics=[],
            most_recently_revealed_cards=[],
            last_result=last_result,
            pairing_probability=probabilities.get(fake.name, 0.0),
            is_most_recent_ghost=fake.name == most_recent_ghost_puppet_name,
            full_sideboard=[],
            command_zone=[],
            placement=fake.placement,
            in_sudden_death=fake.in_sudden_death,
        )

    def _get_opponent_poison(self, opponent: StaticOpponent | Player, game: Game) -> int:
        """Get poison for an opponent, looking up Puppet for StaticOpponents."""
        if isinstance(opponent, StaticOpponent) and opponent.source_player_history_id:
            for fp in game.puppets:
                if fp.player_history_id == opponent.source_player_history_id:
                    return fp.poison
        return opponent.poison

    def _make_battle_view(self, b: Battle, player: Player, game: Game) -> BattleView:
        is_player = b.player.name == player.name
        your_zones = b.player_zones if is_player else b.opponent_zones
        opponent_zones = b.opponent_zones if is_player else b.player_zones
        opponent_name = b.opponent.name if is_player else b.player.name

        opponent_obj = b.opponent if is_player else b.player
        hand_revealed = isinstance(opponent_obj, StaticOpponent) and opponent_obj.hand_revealed
        is_pvp = not isinstance(opponent_obj, StaticOpponent)
        face_down_ids = set(opponent_zones.face_down_card_ids)

        if is_pvp and face_down_ids:
            id_map: dict[str, str] = {}
            scrubbed_bf = _scrub_face_down_cards(opponent_zones.battlefield, face_down_ids, id_map)
            scrubbed_gy = _scrub_face_down_cards(opponent_zones.graveyard, face_down_ids, id_map)
            scrubbed_exile = _scrub_face_down_cards(opponent_zones.exile, face_down_ids, id_map)
            scrubbed_cz = _scrub_face_down_cards(opponent_zones.command_zone, face_down_ids, id_map)
            scrubbed_tokens = _scrub_face_down_cards(opponent_zones.spawned_tokens, face_down_ids, id_map)
            reverse_map = {real: opaque for opaque, real in id_map.items()}
            scrubbed_face_down_ids = _remap_id_list(opponent_zones.face_down_card_ids, reverse_map)
            scrubbed_tapped_ids = _remap_id_list(opponent_zones.tapped_card_ids, reverse_map)
            scrubbed_flipped_ids = _remap_id_list(opponent_zones.flipped_card_ids, reverse_map)
            scrubbed_counters = _remap_id_dict(opponent_zones.counters, reverse_map)
            scrubbed_attachments = {
                reverse_map.get(k, k): [reverse_map.get(v, v) for v in vs]
                for k, vs in opponent_zones.attachments.items()
            }
            b._face_down_id_map = id_map
        else:
            scrubbed_bf = opponent_zones.battlefield
            scrubbed_gy = opponent_zones.graveyard
            scrubbed_exile = opponent_zones.exile
            scrubbed_cz = opponent_zones.command_zone
            scrubbed_tokens = opponent_zones.spawned_tokens
            scrubbed_face_down_ids = opponent_zones.face_down_card_ids
            scrubbed_tapped_ids = opponent_zones.tapped_card_ids
            scrubbed_flipped_ids = opponent_zones.flipped_card_ids
            scrubbed_counters = opponent_zones.counters
            scrubbed_attachments = opponent_zones.attachments
            b._face_down_id_map = {}

        hidden_opponent = Zones(
            battlefield=scrubbed_bf,
            graveyard=scrubbed_gy,
            exile=scrubbed_exile,
            hand=opponent_zones.hand if hand_revealed else [],
            sideboard=[],
            upgrades=opponent_zones.upgrades,
            command_zone=scrubbed_cz,
            library=[],
            treasures=opponent_zones.treasures,
            submitted_cards=[],
            tapped_card_ids=scrubbed_tapped_ids,
            flipped_card_ids=scrubbed_flipped_ids,
            face_down_card_ids=scrubbed_face_down_ids,
            counters=scrubbed_counters,
            attachments=scrubbed_attachments,
            spawned_tokens=scrubbed_tokens,
        )

        your_poison = b.player.poison if is_player else self._get_opponent_poison(b.opponent, game)
        opponent_poison = self._get_opponent_poison(b.opponent, game) if is_player else b.player.poison
        your_life = b.player_life if is_player else b.opponent_life
        opponent_life = b.opponent_life if is_player else b.player_life

        full_sideboard = opponent_zones.sideboard if isinstance(opponent_obj, StaticOpponent) else []

        return BattleView(
            opponent_name=opponent_name,
            coin_flip_name=b.coin_flip_name,
            on_the_play_name=b.on_the_play_name,
            current_turn_name=b.current_turn_name,
            your_zones=your_zones,
            opponent_zones=hidden_opponent,
            opponent_hand_count=len(opponent_zones.hand),
            result_submissions=b.result_submissions,
            your_poison=your_poison,
            opponent_poison=opponent_poison,
            opponent_hand_revealed=hand_revealed,
            your_life=your_life,
            opponent_life=opponent_life,
            is_sudden_death=b.is_sudden_death,
            opponent_full_sideboard=full_sideboard,
            can_manipulate_opponent=isinstance(opponent_obj, StaticOpponent),
        )

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

    def handle_build_move(self, player: Player, card_id: str, source: BuildSource, destination: BuildSource) -> bool:
        source_list = player.hand if source == "hand" else player.sideboard
        card = next((c for c in source_list if c.id == card_id), None)
        if not card:
            return False

        build.move_card(player, card, source, destination)
        return True

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

    def handle_build_ready(
        self,
        game: Game,
        player: Player,
        basics: list[str],
        game_id: str | None = None,
        db: Session | None = None,
        play_draw_preference: str = "play",
        hand_order: list[str] | None = None,
    ) -> str | None:
        try:
            build.set_ready(game, player, basics, play_draw_preference, hand_order=hand_order)

            # Handle sudden death players specially
            if player.in_sudden_death:
                return self._handle_sudden_death_build_ready(game, player, game_id, db)

            if build.all_ready(game):
                self._start_all_battles(game, game_id, db)
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
                        player.phase = "battle"
                        player.build_ready = False
                        battle.start(game, player, static_opp, is_sudden_death=True)
                        return None
            return None

        # Both players must be ready for sudden death PvP
        if not other_sd_player.build_ready:
            return None

        # Both ready - start sudden death battle
        player.phase = "battle"
        other_sd_player.phase = "battle"
        player.build_ready = False
        other_sd_player.build_ready = False
        battle.start(game, player, other_sd_player, is_sudden_death=True)
        return None

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
        if game.battler is None:
            return

        ghost_name = game.most_recent_ghost.name if game.most_recent_ghost else None

        for player in game.players:
            if player.phase == "eliminated" and player.name != ghost_name:
                game.battler.cards.extend(player.hand)
                game.battler.cards.extend(player.sideboard)
                # Clear to prevent double-returning
                player.hand = []
                player.sideboard = []

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
            player.phase = "battle"
            player.build_ready = False

        if db is not None and game_id is not None and game.battler is not None:
            battler_elo = game.battler.elo or 1200.0
            for player in live_players:
                self._record_snapshot(db, game_id, player, battler_elo)
            for fp in game.puppets:
                if not fp.is_eliminated:
                    self._record_bot_poison(db, game_id, fp, battler_elo, stage, round_num)

        paired: set[str] = set()
        paired_bot_names: set[str] = set()
        for player in live_players:
            if player.name in paired:
                continue
            opponent = battle.find_opponent(game, player)
            if opponent and opponent.name not in paired:
                battle.start(game, player, opponent)
                paired.add(player.name)
                paired.add(opponent.name)
                if isinstance(opponent, StaticOpponent) and opponent.source_player_history_id:
                    for fp in game.puppets:
                        if fp.player_history_id == opponent.source_player_history_id:
                            paired_bot_names.add(fp.name)
                            break

        battle.resolve_unpaired_bot_battles(game, paired_bot_names, stage, round_num, game.config.num_rounds_per_stage)

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
        from_owner: str = "player",
        to_owner: str = "player",
    ) -> bool:
        for b in game.active_battles:
            if player.name not in (b.player.name, b.opponent.name):
                continue

            card_id = b._face_down_id_map.get(card_id, card_id)
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
                card_id = b._face_down_id_map.get(card_id, card_id)
                return battle.update_card_state(b, player, action_type, card_id, data)
        return False

    def handle_battle_pass_turn(self, game: Game, player: Player) -> bool | str:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                if battle.pass_turn(b, player):
                    return True
                return "Not your turn"
        return False

    def _end_battle(self, game: Game, b: Battle, game_id: str | None = None, db: Session | None = None) -> str | None:
        was_sudden_death = b.is_sudden_death

        result = battle.end(game, b)

        if isinstance(b.opponent, StaticOpponent):
            return self._handle_post_battle_static(game, b.player, b.opponent, result, was_sudden_death, game_id, db)
        else:
            return self._handle_post_battle_pvp(
                game, b.player, cast(Player, b.opponent), result, was_sudden_death, game_id, db
            )

    def _is_finale(self, game: Game) -> bool:
        """Check if we're in the finale (only 2 participants alive)."""
        live_humans = get_live_players(game)
        live_bots = get_live_puppets(game)
        return len(live_humans) + len(live_bots) == 2

    def _get_fake_player_for_opponent(self, game: Game, opponent: StaticOpponent) -> Puppet | None:
        """Get the Puppet corresponding to a StaticOpponent, if any."""
        for fake in game.puppets:
            if fake.player_history_id == opponent.source_player_history_id:
                return fake
        return None

    def _handle_static_sudden_death_outcome(
        self,
        game: Game,
        player: Player,
        opponent: StaticOpponent,
        fake_player: Puppet,
        player_at_lethal: bool,
        bot_at_lethal: bool,
        winner_name: str | None,
        is_draw: bool,
        poison_dealt: int,
        poison_taken: int,
        player_won: bool,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        """Handle sudden death battle outcomes against static opponent."""
        if not player_at_lethal and not bot_at_lethal:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            fake_player.last_battle_result = LastBattleResult(
                opponent_name=player.name,
                winner_name=winner_name,
                is_draw=is_draw,
                poison_dealt=poison_taken,
                poison_taken=poison_dealt,
            )
            player.phase = "build"
            return None

        if player_at_lethal and bot_at_lethal:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            fake_player.last_battle_result = LastBattleResult(
                opponent_name=player.name,
                winner_name=winner_name,
                is_draw=is_draw,
                poison_dealt=poison_taken,
                poison_taken=poison_dealt,
            )
            player.poison = game.config.poison_to_lose - 1
            fake_player.poison = game.config.poison_to_lose - 1
            player.phase = "build"
            return None

        player.in_sudden_death = False
        fake_player.in_sudden_death = False

        if player_at_lethal:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            fake_player.last_battle_result = LastBattleResult(
                opponent_name=player.name,
                winner_name=winner_name,
                is_draw=is_draw,
                poison_dealt=poison_taken,
                poison_taken=poison_dealt,
            )
            eliminate_player(game, player, player.round, player.stage)
            process_puppet_eliminations(game)
            self.complete_game(game_id or "", None, db)
            return "game_over"

        process_puppet_eliminations(game)
        winner, is_game_over = check_game_over(game)
        if is_game_over and winner is not None:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            fake_player.last_battle_result = LastBattleResult(
                opponent_name=player.name,
                winner_name=winner_name,
                is_draw=is_draw,
                poison_dealt=poison_taken,
                poison_taken=poison_dealt,
            )
            winner.phase = "winner"
            winner.placement = 1
            self.complete_game(game_id or "", winner, db)
            return "game_over"

        player.phase = "reward"
        reward.start_vs_static_rewards_only(game, player, opponent, player_won, is_draw, poison_dealt, poison_taken)
        return None

    def _handle_post_battle_static(
        self,
        game: Game,
        player: Player,
        opponent: StaticOpponent,
        result: battle.BattleResult,
        was_sudden_death: bool,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        """Handle phase transition after static opponent battle."""
        player_won = result.winner is not None and result.winner.name == player.name
        is_draw = result.is_draw
        is_finale = self._is_finale(game)

        poison_info = reward.apply_poison_static(game, player, opponent, player_won, is_draw)
        poison_dealt = poison_info["poison_dealt"]
        poison_taken = poison_info["poison_taken"]

        winner_name: str | None
        if player_won:
            winner_name = player.name
        elif is_draw:
            winner_name = None
        else:
            winner_name = opponent.name

        player_at_lethal = player.poison >= game.config.poison_to_lose

        fake_player = self._get_fake_player_for_opponent(game, opponent)
        bot_at_lethal = fake_player is not None and fake_player.poison >= game.config.poison_to_lose

        if was_sudden_death and fake_player is not None:
            return self._handle_static_sudden_death_outcome(
                game,
                player,
                opponent,
                fake_player,
                player_at_lethal,
                bot_at_lethal,
                winner_name,
                is_draw,
                poison_dealt,
                poison_taken,
                player_won,
                game_id,
                db,
            )

        # Handle sudden death for finale mutual lethal (before any eliminations)
        if is_finale and player_at_lethal and bot_at_lethal and fake_player is not None:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            setup_sudden_death_battle(game, player, fake_player)
            player.phase = "build"
            player.in_sudden_death = True
            fake_player.in_sudden_death = True
            return "sudden_death"

        # Non-finale: player at lethal gets no rewards and awaits elimination
        if not is_finale and player_at_lethal:
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
            )
            player.phase = "awaiting_elimination"
            return self._check_sudden_death_ready(game, game_id, db)

        # Non-finale: sudden death needed (2+ bots at lethal) but player is alive — give rewards
        if not is_finale and needs_sudden_death(game):
            player.phase = "reward"
            reward.start_vs_static_rewards_only(game, player, opponent, player_won, is_draw, poison_dealt, poison_taken)
            return self._check_sudden_death_ready(game, game_id, db)

        # All other paths: eliminate bots normally
        process_puppet_eliminations(game)

        if is_finale:
            # Player at lethal = eliminated
            if player_at_lethal:
                reward.set_last_battle_result_no_rewards(
                    player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
                )
                eliminate_player(game, player, player.round, player.stage)
                self.complete_game(game_id or "", None, db)
                return "game_over"

            # Check if game is actually over (bot eliminated)
            winner, is_game_over = check_game_over(game)
            if is_game_over and winner is not None:
                reward.set_last_battle_result_no_rewards(
                    player, opponent.name, winner_name, is_draw, poison_dealt, poison_taken
                )
                winner.phase = "winner"
                winner.placement = 1
                self.complete_game(game_id or "", winner, db)
                return "game_over"

            # Game not over in finale - continue to rewards (fall through)

        player.phase = "reward"
        reward.start_vs_static_rewards_only(game, player, opponent, player_won, is_draw, poison_dealt, poison_taken)

        winner, is_game_over = check_game_over(game)
        if is_game_over:
            self.complete_game(game_id or "", winner, db)
            return "game_over"

        return self._check_sudden_death_ready(game, game_id, db)

    def _set_pvp_battle_results_no_rewards(
        self,
        player: Player,
        opponent: Player,
        is_draw: bool,
        winner_name: str | None,
        p1_poison: int,
        p2_poison: int,
        poison_dealt: int,
    ) -> None:
        """Set last_battle_result for both players when skipping rewards."""
        if is_draw:
            reward.set_last_battle_result_no_rewards(player, opponent.name, None, True, 0, p1_poison)
            reward.set_last_battle_result_no_rewards(opponent, player.name, None, True, 0, p2_poison)
        else:
            p_won = winner_name == player.name
            reward.set_last_battle_result_no_rewards(
                player, opponent.name, winner_name, False, poison_dealt if p_won else 0, 0 if p_won else poison_dealt
            )
            reward.set_last_battle_result_no_rewards(
                opponent, player.name, winner_name, False, 0 if p_won else poison_dealt, poison_dealt if p_won else 0
            )

    def _end_pvp_with_winner(
        self, game: Game, loser: Player, winner: Player, game_id: str | None, db: Session | None
    ) -> str:
        """Eliminate the loser and declare the winner."""
        eliminate_player(game, loser, loser.round, loser.stage)
        winner.phase = "winner"
        winner.placement = 1
        self.complete_game(game_id or "", winner, db)
        return "game_over"

    def _handle_pvp_finale(
        self,
        game: Game,
        player: Player,
        opponent: Player,
        result: battle.BattleResult,
        is_draw: bool,
        winner_name: str | None,
        p1_poison: int,
        p2_poison: int,
        poison_dealt: int,
        player_at_lethal: bool,
        opponent_at_lethal: bool,
        was_sudden_death: bool,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        """Handle finale PvP outcomes."""
        # Handle ongoing sudden death - neither died, loop back to build
        if was_sudden_death and not player_at_lethal and not opponent_at_lethal:
            self._set_pvp_battle_results_no_rewards(
                player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
            )
            player.phase = "build"
            opponent.phase = "build"
            return None

        # Sudden death: check outcomes
        if was_sudden_death:
            if player_at_lethal and opponent_at_lethal:
                # Draw in sudden death — loop back to build with poison reset
                self._set_pvp_battle_results_no_rewards(
                    player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
                )
                setup_sudden_death_battle(game, player, opponent)
                player.phase = "build"
                opponent.phase = "build"
                return None

            # Exactly one died — clear flags and end game
            player.in_sudden_death = False
            opponent.in_sudden_death = False

            if player_at_lethal:
                self._set_pvp_battle_results_no_rewards(
                    player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
                )
                return self._end_pvp_with_winner(game, player, opponent, game_id, db)

            if opponent_at_lethal:
                self._set_pvp_battle_results_no_rewards(
                    player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
                )
                return self._end_pvp_with_winner(game, opponent, player, game_id, db)

        # Not sudden death yet: both at lethal triggers sudden death
        if player_at_lethal and opponent_at_lethal:
            self._set_pvp_battle_results_no_rewards(
                player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
            )
            setup_sudden_death_battle(game, player, opponent)
            player.phase = "build"
            opponent.phase = "build"
            player.in_sudden_death = True
            opponent.in_sudden_death = True
            return "sudden_death"

        if player_at_lethal:
            self._set_pvp_battle_results_no_rewards(
                player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
            )
            return self._end_pvp_with_winner(game, player, opponent, game_id, db)

        if opponent_at_lethal:
            self._set_pvp_battle_results_no_rewards(
                player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
            )
            return self._end_pvp_with_winner(game, opponent, player, game_id, db)

        # Neither at lethal in finale - continue with rewards
        player.phase = "reward"
        opponent.phase = "reward"
        if is_draw:
            reward.start_rewards_draw(game, player, opponent, p1_poison, p2_poison)
        else:
            assert result.winner is not None
            assert result.loser is not None
            reward.start_rewards_only(game, result.winner, result.loser, poison_dealt)
        return None

    def _handle_pvp_non_finale(
        self,
        game: Game,
        player: Player,
        opponent: Player,
        result: battle.BattleResult,
        is_draw: bool,
        winner_name: str | None,
        p1_poison: int,
        p2_poison: int,
        poison_dealt: int,
        player_at_lethal: bool,
        opponent_at_lethal: bool,
        was_sudden_death: bool,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        """Handle non-finale PvP outcomes."""
        if was_sudden_death:
            if not player_at_lethal and not opponent_at_lethal:
                self._set_pvp_battle_results_no_rewards(
                    player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
                )
                player.phase = "build"
                opponent.phase = "build"
                return None

            player.in_sudden_death = False
            opponent.in_sudden_death = False

        if player_at_lethal and opponent_at_lethal:
            self._set_pvp_battle_results_no_rewards(
                player, opponent, is_draw, winner_name, p1_poison, p2_poison, poison_dealt
            )
            player.phase = "awaiting_elimination"
            opponent.phase = "awaiting_elimination"
            return self._check_sudden_death_ready(game, game_id, db)

        if player_at_lethal:
            self._set_player_result_no_rewards(player, opponent.name, is_draw, winner_name, p1_poison, poison_dealt)
            player.phase = "awaiting_elimination"
            opponent.phase = "reward"
            # For draw, survivor dealt p1_poison to eliminated player; for non-draw, winner dealt poison_dealt
            survivor_dealt = p1_poison if is_draw else poison_dealt
            self._start_single_reward(game, opponent, player.name, is_draw, winner_name, p2_poison, survivor_dealt)
            return self._check_sudden_death_ready(game, game_id, db)

        if opponent_at_lethal:
            self._set_player_result_no_rewards(opponent, player.name, is_draw, winner_name, p2_poison, poison_dealt)
            opponent.phase = "awaiting_elimination"
            player.phase = "reward"
            # For draw, survivor dealt p2_poison to eliminated player; for non-draw, winner dealt poison_dealt
            survivor_dealt = p2_poison if is_draw else poison_dealt
            self._start_single_reward(game, player, opponent.name, is_draw, winner_name, p1_poison, survivor_dealt)
            return self._check_sudden_death_ready(game, game_id, db)

        # Neither at lethal - both get rewards
        process_puppet_eliminations(game)
        player.phase = "reward"
        opponent.phase = "reward"
        if is_draw:
            reward.start_rewards_draw(game, player, opponent, p1_poison, p2_poison)
        else:
            assert result.winner is not None
            assert result.loser is not None
            reward.start_rewards_only(game, result.winner, result.loser, poison_dealt)

        return self._check_sudden_death_ready(game, game_id, db)

    def _set_player_result_no_rewards(
        self,
        player: Player,
        opponent_name: str,
        is_draw: bool,
        winner_name: str | None,
        poison_taken: int,
        poison_dealt: int,
    ) -> None:
        """Set last_battle_result for a single player when skipping rewards."""
        if is_draw:
            reward.set_last_battle_result_no_rewards(player, opponent_name, None, True, 0, poison_taken)
        else:
            p_won = winner_name == player.name
            reward.set_last_battle_result_no_rewards(
                player, opponent_name, winner_name, False, poison_dealt if p_won else 0, 0 if p_won else poison_dealt
            )

    def _start_single_reward(
        self,
        game: Game,
        player: Player,
        opponent_name: str,
        is_draw: bool,
        winner_name: str | None,
        poison_taken: int,
        poison_dealt: int,
    ) -> None:
        """Start reward phase for a single player."""
        if is_draw:
            reward.start_rewards_single(game, player, opponent_name, False, poison_dealt, poison_taken, is_draw=True)
        else:
            p_won = winner_name == player.name
            reward.start_rewards_single(
                game, player, opponent_name, p_won, poison_dealt if p_won else 0, 0 if p_won else poison_dealt
            )

    def _handle_post_battle_pvp(
        self,
        game: Game,
        player: Player,
        opponent: Player,
        result: battle.BattleResult,
        was_sudden_death: bool,
        game_id: str | None,
        db: Session | None,
    ) -> str | None:
        """Handle phase transition after PvP battle."""
        is_draw = result.is_draw
        is_finale = self._is_finale(game)

        # Apply poison and determine winner
        p1_poison = 0
        p2_poison = 0
        poison_dealt = 0
        winner_name: str | None = None

        if is_draw:
            poison_info = reward.apply_poison_pvp(game, player, opponent, True, None)
            p1_poison = poison_info["player_poison_taken"]
            p2_poison = poison_info["opponent_poison_taken"]
        else:
            winner = result.winner
            loser = result.loser
            assert winner is not None
            assert loser is not None
            poison_info = reward.apply_poison_pvp(game, player, opponent, False, winner.name)
            poison_dealt = poison_info["poison"]
            winner_name = winner.name

        player_at_lethal = player.poison >= game.config.poison_to_lose
        opponent_at_lethal = opponent.poison >= game.config.poison_to_lose

        if is_finale:
            process_puppet_eliminations(game)
            return self._handle_pvp_finale(
                game,
                player,
                opponent,
                result,
                is_draw,
                winner_name,
                p1_poison,
                p2_poison,
                poison_dealt,
                player_at_lethal,
                opponent_at_lethal,
                was_sudden_death,
                game_id,
                db,
            )

        return self._handle_pvp_non_finale(
            game,
            player,
            opponent,
            result,
            is_draw,
            winner_name,
            p1_poison,
            p2_poison,
            poison_dealt,
            player_at_lethal,
            opponent_at_lethal,
            was_sudden_death,
            game_id,
            db,
        )

    def _resolve_puppet_vs_puppet_sudden_death(
        self, game: Game, bots: list[Puppet], game_id: str | None, db: Session | None
    ) -> str | None:
        """Resolve sudden death between two puppets by randomly eliminating one."""
        loser = random.choice(bots)
        winner_puppet = bots[0] if loser is bots[1] else bots[1]
        eliminate_puppet(game, loser)
        self._persist_player_placement(db, game_id, loser.name, loser.placement)
        winner_puppet.poison = game.config.poison_to_lose - 1
        winner, is_game_over = check_game_over(game)
        if is_game_over:
            self.complete_game(game_id or "", winner, db)
            return "game_over"
        return None

    def _check_sudden_death_ready(self, game: Game, game_id: str | None, db: Session | None) -> str | None:
        """Check if sudden death should trigger and set it up."""
        if not would_be_dead_ready_for_elimination(game):
            return None

        if not needs_sudden_death(game):
            for p in get_would_be_dead(game):
                eliminate_player(game, p, p.round, p.stage)
                self._persist_player_placement(db, game_id, p.name, p.placement)
            for puppet in get_would_be_dead_puppets(game):
                eliminate_puppet(game, puppet)
                self._persist_player_placement(db, game_id, puppet.name, puppet.placement)

            process_puppet_eliminations(game)
            winner, is_game_over = check_game_over(game)
            if is_game_over:
                self.complete_game(game_id or "", winner, db)
                return "game_over"
            return None

        fighters = get_sudden_death_fighters(game)
        if not fighters:
            return None

        f1, f2 = fighters
        fighter_names = {f1.name, f2.name}

        for p in get_would_be_dead(game):
            if p.name not in fighter_names:
                eliminate_player(game, p, p.round, p.stage)
                self._persist_player_placement(db, game_id, p.name, p.placement)
        for puppet in get_would_be_dead_puppets(game):
            if puppet.name not in fighter_names:
                eliminate_puppet(game, puppet)
                self._persist_player_placement(db, game_id, puppet.name, puppet.placement)

        humans = [f for f in (f1, f2) if isinstance(f, Player)]
        puppets = [f for f in (f1, f2) if isinstance(f, Puppet)]

        if len(humans) == 2:
            setup_sudden_death_battle(game, humans[0], humans[1])
            humans[0].phase = "build"
            humans[1].phase = "build"
            humans[0].in_sudden_death = True
            humans[1].in_sudden_death = True
            return "sudden_death"

        if len(puppets) == 2:
            return self._resolve_puppet_vs_puppet_sudden_death(game, puppets, game_id, db)

        # Human vs Puppet
        human = humans[0]
        puppet = puppets[0]
        setup_sudden_death_battle(game, human, puppet)
        human.in_sudden_death = True
        puppet.in_sudden_death = True
        human.phase = "build"
        return "sudden_death"

    def handle_reward_pick_upgrade(self, game: Game, player: Player, upgrade_id: str) -> bool:
        upgrade = next((u for u in game.available_upgrades if u.id == upgrade_id), None)
        if not upgrade:
            return False
        reward.pick_upgrade(game, player, upgrade)
        return True

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
        if player.phase != "reward":
            return "Player is not in reward phase"

        opponent_name = player.last_opponent_name

        upgrade = None
        if upgrade_id:
            upgrade = next((u for u in game.available_upgrades if u.id == upgrade_id), None)

        try:
            reward.end_for_player(game, player, upgrade)
        except ValueError as e:
            return str(e)

        self._advance_puppet_if_needed(game, opponent_name)

        if not get_would_be_dead(game):
            process_puppet_eliminations(game)
        winner, is_game_over = check_game_over(game)
        if is_game_over:
            self.complete_game(game_id or "", winner, db)
            return "game_over"

        if player.phase == "draft":
            if game.draft_state is None:
                draft.start(game)
            draft.deal_pack_to_player(game, player)

        return None

    def _advance_puppet_if_needed(self, game: Game, opponent_name: str | None) -> None:
        """Advance a puppet's round/stage if the opponent was a puppet."""
        if not opponent_name:
            return

        for fp in game.puppets:
            if fp.name == opponent_name and not fp.is_eliminated:
                num_rounds = game.config.num_rounds_per_stage
                if fp.round >= num_rounds:
                    fp.stage += 1
                    fp.round = 1
                else:
                    fp.round += 1
                break


game_manager = GameManager()

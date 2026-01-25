import asyncio
import json
import random
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import cast

from sqlalchemy.orm import Session

import server.db.database as db
from mtb.models.cards import (
    DEFAULT_UPGRADES_ID,
    DEFAULT_VANGUARD_ID,
    Battler,
    build_battler,
)
from mtb.models.game import (
    Battle,
    BattleSnapshotData,
    Config,
    FakePlayer,
    Game,
    Player,
    StaticOpponent,
    Zones,
    create_game,
    set_battler,
)
from mtb.models.types import BuildSource, CardDestination, ZoneName
from mtb.phases import battle, build, draft, reward
from mtb.phases.elimination import (
    check_game_over,
    get_live_players,
    process_bot_eliminations,
    process_eliminations,
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
    player_ready: dict[str, bool] = field(default_factory=dict)
    battler: Battler | None = None
    battler_loading: bool = False
    battler_error: str | None = None
    _loading_task: asyncio.Task | None = field(default=None, repr=False)


class GameManager:
    def __init__(self):
        self._pending_games: dict[str, PendingGame] = {}
        self._active_games: dict[str, Game] = {}
        self._player_to_game: dict[str, str] = {}
        self._player_id_to_name: dict[str, str] = {}
        self._join_code_to_game: dict[str, str] = {}
        self._cleanup_tasks: dict[str, asyncio.Task] = {}

    def create_game(
        self,
        player_name: str,
        player_id: str,
        cube_id: str = "auto",
        use_upgrades: bool = True,
        use_vanguards: bool = False,
        target_player_count: int = 4,
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
            player_ready={player_id: False},
        )
        self._pending_games[game_id] = pending
        self._join_code_to_game[join_code] = game_id
        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def get_pending_game(self, game_id: str) -> PendingGame | None:
        return self._pending_games.get(game_id)

    def get_pending_game_by_code(self, join_code: str) -> PendingGame | None:
        game_id = self._join_code_to_game.get(join_code.upper())
        return self._pending_games.get(game_id) if game_id else None

    def join_game(self, join_code: str, player_name: str, player_id: str) -> PendingGame | None:
        pending = self.get_pending_game_by_code(join_code)
        if not pending or pending.is_started:
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

        if pending.target_player_count < 2:
            return False, "Need at least 2 players"

        all_ready = all(pending.player_ready.get(pid, False) for pid in pending.player_ids)
        if not all_ready:
            return False, "Not all players are ready"

        return True, None

    def start_game(self, game_id: str, db: Session | None = None) -> Game | None:
        pending = self._pending_games.get(game_id)
        if not pending or pending.target_player_count < 2:
            return None

        pending.is_started = True

        config = Config(
            use_upgrades=pending.use_upgrades,
            use_vanguards=pending.use_vanguards,
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

            num_fakes_needed = pending.target_player_count - len(pending.player_names)
            if num_fakes_needed > 0:
                target_elo = battler.elo if battler.elo else 1200.0
                self.load_fake_players_for_game(
                    db, game, num_fakes_needed, target_elo, pending.use_upgrades, pending.use_vanguards, pending.cube_id
                )

        self._active_games[game_id] = game

        return game

    async def start_game_async(self, game_id: str, db: Session | None = None) -> Game | None:
        pending = self._pending_games.get(game_id)
        if not pending or pending.target_player_count < 2:
            return None

        if pending._loading_task and not pending._loading_task.done():
            try:
                await asyncio.wait_for(pending._loading_task, timeout=30.0)
            except TimeoutError:
                pass

        pending.is_started = True

        config = Config(
            use_upgrades=pending.use_upgrades,
            use_vanguards=pending.use_vanguards,
        )
        game = create_game(pending.player_names, len(pending.player_names), config)

        battler = (
            pending.battler
            if pending.battler
            else self._load_battler(pending.cube_id, pending.use_upgrades, pending.use_vanguards)
        )
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

            num_fakes_needed = pending.target_player_count - len(pending.player_names)
            if num_fakes_needed > 0:
                target_elo = battler.elo if battler.elo else 1200.0
                self.load_fake_players_for_game(
                    db, game, num_fakes_needed, target_elo, pending.use_upgrades, pending.use_vanguards, pending.cube_id
                )

        self._active_games[game_id] = game

        return game

    def complete_game(self, game_id: str, winner: Player | None, db: Session | None = None) -> None:
        """Complete a game - set phases, persist final state, schedule cleanup."""
        game = self._active_games.get(game_id)
        if not game:
            return

        for player in game.players:
            if winner and player.name == winner.name:
                player.phase = "winner"
            elif not player.is_ghost:
                player.phase = "game_over"

        if db is not None:
            game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
            if game_record:
                game_record.ended_at = datetime.now(UTC)
                if winner:
                    game_record.winner_player_id = winner.name
                db.commit()

        self._schedule_cleanup(game_id)

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

    def _cleanup_game(self, game_id: str) -> None:
        """Remove game from memory."""
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

    async def _preload_battler(self, pending: PendingGame) -> None:
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

    def start_battler_preload(self, pending: PendingGame) -> None:
        try:
            loop = asyncio.get_running_loop()
            task = loop.create_task(self._preload_battler(pending))
            pending._loading_task = task
        except RuntimeError:
            pending.battler_loading = False

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
        query = db.query(PlayerGameHistory).filter(
            PlayerGameHistory.id.notin_(exclude_ids) if exclude_ids else True,
            PlayerGameHistory.max_stage >= 5,
        )

        all_histories = query.all()
        same_cube: list[PlayerGameHistory] = []
        other_cube: list[PlayerGameHistory] = []

        for history in all_histories:
            game_record = db.query(GameRecord).filter(GameRecord.id == history.game_id).first()
            if not game_record or not game_record.config_json:
                continue
            config = json.loads(game_record.config_json)
            if use_upgrades is not None and config.get("use_upgrades") != use_upgrades:
                continue
            if use_vanguards is not None and config.get("use_vanguards") != use_vanguards:
                continue

            if cube_id and config.get("cube_id") == cube_id:
                same_cube.append(history)
            else:
                other_cube.append(history)

        if target_elo:
            same_cube.sort(key=lambda h: abs(cast(float, h.battler_elo) - target_elo))
            other_cube.sort(key=lambda h: abs(cast(float, h.battler_elo) - target_elo))
        else:
            random.shuffle(same_cube)
            random.shuffle(other_cube)

        result = same_cube[:count]
        if len(result) < count:
            result.extend(other_cube[: count - len(result)])

        return result

    def _load_fake_player(self, db: Session, history: PlayerGameHistory) -> FakePlayer:
        snapshots_dict: dict[str, StaticOpponent] = {}
        player_name = cast(str, history.player_name)
        history_id = cast(int, history.id)

        for snapshot in history.snapshots:
            key = f"{snapshot.stage}_{snapshot.round}"
            snapshot_data = BattleSnapshotData.model_validate_json(snapshot.full_state_json)
            static_opp = StaticOpponent.from_snapshot(snapshot_data, player_name, history_id)
            snapshots_dict[key] = static_opp

        return FakePlayer(
            name=f"{player_name} (Bot)",
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

        stage = player.hand_size

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
            treasures=player.treasures,
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
            full_state_json=snapshot_data.model_dump_json(),
        )
        db.add(snapshot)
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

        histories = self._find_historical_players(db, target_elo, count, [], use_upgrades, use_vanguards, cube_id)
        for history in histories:
            fake_player = self._load_fake_player(db, history)
            game.fake_players.append(fake_player)

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
        pending = self._pending_games.get(game_id)
        if pending:
            return player_name in pending.player_names

        game = self._active_games.get(game_id)
        if game:
            return any(p.name == player_name for p in game.players)

        return False

    def rejoin_game(self, game_id: str, player_name: str, player_id: str) -> bool:
        if not self.can_rejoin(game_id, player_name):
            return False

        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name
        return True

    def _get_cube_loading_status(self, pending: PendingGame) -> CubeLoadingStatus:
        if pending.battler_error:
            return "error"
        if pending.battler is not None:
            return "ready"
        return "loading"

    def _count_available_bots(self, pending: PendingGame) -> int | None:
        if pending.battler is None:
            return None

        db_session = db.SessionLocal()
        try:
            target_elo = pending.battler.elo if pending.battler.elo else 1200.0
            num_needed = pending.target_player_count - len(pending.player_names)
            if num_needed <= 0:
                return 0
            histories = self._find_historical_players(
                db_session, target_elo, num_needed, [], pending.use_upgrades, pending.use_vanguards, pending.cube_id
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
        bot_count = self._count_available_bots(pending)
        num_bots_needed = pending.target_player_count - len(pending.player_names)
        has_enough_bots = bot_count is not None and bot_count >= num_bots_needed
        can_start = pending.target_player_count >= 2 and all_ready and has_enough_bots

        return LobbyStateResponse(
            game_id=game_id,
            join_code=pending.join_code,
            players=players,
            can_start=can_start,
            is_started=pending.is_started,
            target_player_count=pending.target_player_count,
            cube_loading_status=self._get_cube_loading_status(pending),
            cube_loading_error=pending.battler_error,
            available_bot_count=bot_count,
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
                current_battle = self._make_battle_view(b, player)
                break

        all_players = [self._make_player_view(p, player) for p in game.players]
        all_players.extend(self._make_fake_player_view(fp, player) for fp in game.fake_players)

        return GameStateResponse(
            game_id=game_id,
            phase=phase,
            starting_life=game.config.starting_life,
            players=all_players,
            self_player=SelfPlayerView(
                name=player.name,
                treasures=player.treasures,
                poison=player.poison,
                phase=player.phase,
                round=player.round,
                stage=player.stage,
                vanquishers=player.vanquishers,
                is_ghost=player.is_ghost,
                time_of_death=player.time_of_death,
                hand_count=len(player.hand),
                sideboard_count=len(player.sideboard),
                hand_size=player.hand_size,
                is_stage_increasing=reward.is_stage_increasing(player),
                upgrades=player.upgrades,
                vanguard=player.vanguard,
                chosen_basics=player.chosen_basics,
                hand=player.hand,
                sideboard=player.sideboard,
                current_pack=current_pack,
                last_battle_result=player.last_battle_result,
                build_ready=player.build_ready,
            ),
            available_upgrades=game.available_upgrades,
            current_battle=current_battle,
        )

    def _determine_game_phase(self, game: Game) -> str:
        phases = {p.phase for p in game.players if not p.is_ghost}
        if len(phases) == 1:
            return phases.pop()
        if "battle" in phases:
            return "battle"
        if "reward" in phases:
            return "reward"
        if "build" in phases:
            return "build"
        if "draft" in phases:
            return "draft"
        return "unknown"

    def _get_last_result(self, player: Player) -> LastResult | None:
        result = player.last_battle_result
        if result is None:
            return None
        if result.is_draw:
            return "draw"
        if result.winner_name != player.name:
            return "loss"
        return "win"

    def _make_player_view(self, player: Player, viewer: Player) -> PlayerView:
        return PlayerView(
            name=player.name,
            treasures=player.treasures,
            poison=player.poison,
            phase=player.phase,
            round=player.round,
            stage=player.stage,
            vanquishers=player.vanquishers,
            is_ghost=player.is_ghost,
            is_bot=False,
            time_of_death=player.time_of_death,
            hand_count=len(player.hand),
            sideboard_count=len(player.sideboard),
            hand_size=player.hand_size,
            is_stage_increasing=reward.is_stage_increasing(player),
            upgrades=player.upgrades,
            vanguard=player.vanguard,
            chosen_basics=player.chosen_basics,
            most_recently_revealed_cards=player.most_recently_revealed_cards,
            last_result=self._get_last_result(player),
        )

    def _get_prior_snapshot_key(self, stage: int, round_num: int, num_rounds: int = 3) -> str | None:
        """Get the key for the previous stage-round pair."""
        if round_num > 1:
            return f"{stage}_{round_num - 1}"
        elif stage > 3:
            return f"{stage - 1}_{num_rounds}"
        else:
            return None

    def _make_fake_player_view(self, fake: FakePlayer, viewer: Player) -> PlayerView:
        snapshot = fake.get_opponent_for_round(viewer.stage, viewer.round)
        prior_key = self._get_prior_snapshot_key(viewer.stage, viewer.round)
        prior_snapshot = fake.snapshots.get(prior_key) if prior_key else None
        revealed_cards = prior_snapshot.hand if prior_snapshot else []

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
                is_bot=True,
                time_of_death=None,
                hand_count=len(snapshot.hand),
                sideboard_count=len(snapshot.sideboard),
                hand_size=len(snapshot.hand),
                is_stage_increasing=False,
                upgrades=snapshot.upgrades,
                vanguard=snapshot.vanguard,
                chosen_basics=snapshot.chosen_basics,
                most_recently_revealed_cards=revealed_cards,
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
            is_bot=True,
            time_of_death=None,
            hand_count=0,
            sideboard_count=0,
            hand_size=0,
            is_stage_increasing=False,
            upgrades=[],
            vanguard=None,
            chosen_basics=[],
            most_recently_revealed_cards=[],
        )

    def _make_battle_view(self, b: Battle, player: Player) -> BattleView:
        is_player = b.player.name == player.name
        your_zones = b.player_zones if is_player else b.opponent_zones
        opponent_zones = b.opponent_zones if is_player else b.player_zones
        opponent_name = b.opponent.name if is_player else b.player.name

        opponent_obj = b.opponent if is_player else b.player
        hand_revealed = isinstance(opponent_obj, StaticOpponent) and opponent_obj.hand_revealed

        hidden_opponent = Zones(
            battlefield=opponent_zones.battlefield,
            graveyard=opponent_zones.graveyard,
            exile=opponent_zones.exile,
            hand=opponent_zones.hand if hand_revealed else [],
            sideboard=[],
            upgrades=opponent_zones.upgrades,
            command_zone=opponent_zones.command_zone,
            library=[],
            treasures=opponent_zones.treasures,
            submitted_cards=[],
            tapped_card_ids=opponent_zones.tapped_card_ids,
            flipped_card_ids=opponent_zones.flipped_card_ids,
            face_down_card_ids=opponent_zones.face_down_card_ids,
            counters=opponent_zones.counters,
            attachments=opponent_zones.attachments,
            spawned_tokens=opponent_zones.spawned_tokens,
        )

        your_poison = b.player.poison if is_player else b.opponent.poison
        opponent_poison = b.opponent.poison if is_player else b.player.poison
        your_life = b.player_life if is_player else b.opponent_life
        opponent_life = b.opponent_life if is_player else b.player_life

        return BattleView(
            opponent_name=opponent_name,
            coin_flip_name=b.coin_flip_name,
            your_zones=your_zones,
            opponent_zones=hidden_opponent,
            opponent_hand_count=len(opponent_zones.hand),
            result_submissions=b.result_submissions,
            your_poison=your_poison,
            opponent_poison=opponent_poison,
            opponent_hand_revealed=hand_revealed,
            your_life=your_life,
            opponent_life=opponent_life,
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
        self, game: Game, player: Player, basics: list[str], game_id: str | None = None, db: Session | None = None
    ) -> str | None:
        try:
            build.set_ready(game, player, basics)
            if build.all_ready(game):
                self._start_all_battles(game, game_id, db)
            return None
        except ValueError as e:
            return str(e)

    def handle_build_unready(self, player: Player) -> str | None:
        try:
            build.unready(player)
            return None
        except ValueError as e:
            return str(e)

    def _start_all_battles(self, game: Game, game_id: str | None = None, db: Session | None = None) -> None:
        live_players = get_live_players(game)
        if not live_players:
            return

        stage = live_players[0].stage
        round_num = live_players[0].round

        for player in live_players:
            player.phase = "battle"
            player.build_ready = False

        if db is not None and game_id is not None and game.battler is not None:
            battler_elo = game.battler.elo if game.battler.elo else 1200.0
            for player in live_players:
                self._record_snapshot(db, game_id, player, battler_elo)

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
                    for fp in game.fake_players:
                        if fp.player_history_id == opponent.source_player_history_id:
                            paired_bot_names.add(fp.name)
                            break

        battle.resolve_unpaired_bot_battles(game, paired_bot_names, stage, round_num, game.config.num_rounds_per_stage)

    def handle_build_apply_upgrade(self, player: Player, upgrade_id: str, target_card_id: str) -> bool:
        return self._apply_upgrade(player, upgrade_id, target_card_id)

    def handle_battle_move(
        self, game: Game, player: Player, card_id: str, from_zone: ZoneName, to_zone: ZoneName
    ) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                # Handle sideboard -> hand moves (Wish/Companion support)
                if from_zone == "sideboard" and to_zone == "hand":
                    card = next((c for c in player.sideboard if c.id == card_id), None)
                    if not card:
                        return False
                    player.sideboard.remove(card)
                    zones = battle.get_zones_for_player(b, player)
                    zones.hand.append(card)
                    return True

                zones = battle.get_zones_for_player(b, player)
                from_list = zones.get_zone(from_zone)
                card = next((c for c in from_list if c.id == card_id), None)
                if not card:
                    return False
                battle.move_zone(b, player, card, from_zone, to_zone)
                return True
        return False

    def handle_battle_submit_result(self, game: Game, player: Player, result: str) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                battle.submit_result(b, player, result)
                if battle.results_agreed(b):
                    self._end_battle(game, b)
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
                return battle.update_card_state(b, player, action_type, card_id, data)
        return False

    def _end_battle(self, game: Game, b: Battle) -> None:
        result = battle.end(game, b)

        if isinstance(b.opponent, StaticOpponent):
            reward.start_vs_static(game, b.player, b.opponent, result)
        elif result.is_draw:
            reward.start(game, b.player, cast(Player, b.opponent), is_draw=True)
        else:
            reward.start(game, result.winner, result.loser)

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

        self._advance_bot_if_needed(game, opponent_name)

        process_eliminations(game, player.round)
        process_bot_eliminations(game)

        winner, is_game_over = check_game_over(game)
        if is_game_over:
            self.complete_game(game_id or "", winner, db)
            return "game_over"

        if player.phase == "draft" and game.draft_state is None:
            draft.start(game)

        return None

    def _advance_bot_if_needed(self, game: Game, opponent_name: str | None) -> None:
        """Advance a bot's round/stage if the opponent was a bot."""
        if not opponent_name:
            return

        for fp in game.fake_players:
            if fp.name == opponent_name and not fp.is_eliminated:
                num_rounds = game.config.num_rounds_per_stage
                if fp.round >= num_rounds:
                    fp.stage += 1
                    fp.round = 1
                else:
                    fp.round += 1
                break


game_manager = GameManager()

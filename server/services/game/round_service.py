"""Round orchestration: starting each round's fights, applying what mtb.phases.round_resolution decides
after a fight or a round, and recording battle snapshots, exits and final placements."""

import json
import logging
from datetime import UTC, datetime
from typing import cast

from sqlalchemy.orm import Session

from mtb.models.game import (
    Battle,
    BattleSnapshotData,
    Game,
    Player,
    Puppet,
    ReturnedBuild,
    StaticOpponent,
    slim_snapshot_dump,
)
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
    transition_phase,
)
from server.db.models import (
    BattleSnapshot,
    GamePlayerRecord,
    GameRecord,
    PlayerGameHistory,
)
from server.services.game.snapshot_store import SnapshotStore
from server.services.game_serialization import (
    card_to_ref,
    cards_to_refs,
)

logger = logging.getLogger(__name__)

POST_GAME_CLEANUP_SECONDS = 300.0


class RoundService(SnapshotStore):
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

    def _end_battle(self, game: Game, b: Battle, game_id: str | None = None, db: Session | None = None) -> str | None:
        outcome = resolve_battle(game, b)
        return self._apply_resolution_outcome(game, outcome, game_id=game_id, db=db)

    def _check_sudden_death_ready(self, game: Game, game_id: str | None, db: Session | None) -> str | None:
        outcome = resolve_end_of_round(game)
        return self._apply_resolution_outcome(game, outcome, game_id=game_id, db=db)

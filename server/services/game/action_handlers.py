"""The draft, build, fight and reward actions a player sends during a game."""

import logging
import secrets
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from mtb.models.game import (
    Battle,
    Game,
    PendingRevealAnimation,
    Player,
    StaticOpponent,
    Zones,
)
from mtb.models.types import BuildSource, CardDestination, ZoneName
from mtb.phases import battle, build, draft, reward
from mtb.phases.round_resolution import (
    resolve_reward_done,
    transition_phase,
)
from server.db.models import (
    BattleSnapshot,
    PlayerGameHistory,
)
from server.services.game.round_service import RoundService
from server.services.game.view_builder import (
    hidden_card_opaque_ids,
)

logger = logging.getLogger(__name__)


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


class ActionHandlers(RoundService):
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

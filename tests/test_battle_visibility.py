from collections.abc import Callable

import pytest
from conftest import setup_battle_ready

from pitfight.models.cards import Card
from pitfight.models.game import Game, StaticOpponent, create_game
from pitfight.phases import battle, reward
from server.services.game.view_builder import build_battle_view
from server.services.game_manager import GameManager


@pytest.fixture
def game_manager() -> GameManager:
    return GameManager()


def _register_two_player_game(game_manager: GameManager, game: Game) -> None:
    game_manager.active_games["g1"] = game
    game_manager.player_to_game["pid_alice"] = "g1"
    game_manager.player_to_game["pid_bob"] = "g1"
    game_manager.player_id_to_name["pid_alice"] = "Alice"
    game_manager.player_id_to_name["pid_bob"] = "Bob"


class TestUpgradeRevealVisibility:
    def test_battle_reveal_upgrade_updates_public_visibility(
        self, game_manager: GameManager, card_factory: Callable[..., Card], *, upgrade_factory: Callable[[str], Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
        setup_battle_ready(bob, ["Island", "Island", "Island"])

        target = card_factory("alice-card")
        upgrade = upgrade_factory("hidden-upgrade")
        alice.hand = [target]
        alice.upgrades = [upgrade]
        reward.apply_upgrade_to_card(alice, upgrade, target=target)
        battle.start(game, alice, opponent=bob)
        _register_two_player_game(game_manager, game)

        alice_state_before = game_manager.get_game_state("g1", "pid_alice")
        bob_state_before = game_manager.get_game_state("g1", "pid_bob")

        assert alice_state_before is not None
        assert bob_state_before is not None
        assert alice_state_before.self_player.upgrades[0].is_revealed is False
        assert alice_state_before.current_battle is not None
        assert bob_state_before.current_battle is not None
        assert alice_state_before.current_battle.your_zones.upgrades[0].is_revealed is False
        assert bob_state_before.current_battle.opponent_zones.upgrades == []
        assert next(player for player in bob_state_before.players if player.name == "Alice").upgrades == []

        assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade_id=upgrade.id) is True

        bob_state_after = game_manager.get_game_state("g1", "pid_bob")
        assert bob_state_after is not None
        assert bob_state_after.current_battle is not None
        assert len(bob_state_after.current_battle.opponent_zones.upgrades) == 1
        assert bob_state_after.current_battle.opponent_zones.upgrades[0].is_revealed is True
        assert len(next(player for player in bob_state_after.players if player.name == "Alice").upgrades) == 1

    def test_battle_reveal_upgrade_broadcasts_animation_to_both_players(
        self, game_manager: GameManager, card_factory: Callable[..., Card], *, upgrade_factory: Callable[[str], Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
        setup_battle_ready(bob, ["Island", "Island", "Island"])

        target = card_factory("alice-card")
        upgrade = upgrade_factory("hidden-upgrade")
        alice.hand = [target]
        alice.upgrades = [upgrade]
        reward.apply_upgrade_to_card(alice, upgrade, target=target)
        battle.start(game, alice, opponent=bob)
        _register_two_player_game(game_manager, game)

        assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade_id=upgrade.id) is True

        alice_state = game_manager.get_game_state("g1", "pid_alice")
        bob_state = game_manager.get_game_state("g1", "pid_bob")
        assert alice_state is not None
        assert alice_state.current_battle is not None
        assert bob_state is not None
        assert bob_state.current_battle is not None

        alice_anims = alice_state.current_battle.pending_reveal_animations
        bob_anims = bob_state.current_battle.pending_reveal_animations
        assert len(alice_anims) == 1
        assert len(bob_anims) == 1
        assert alice_anims[0].animation_id == bob_anims[0].animation_id
        assert alice_anims[0].player_name == "Alice"
        assert alice_anims[0].upgrade.id == upgrade.id
        assert alice_anims[0].target.id == target.id

    def test_revealed_upgrade_visible_to_opponent_after_battle_ends(
        self, game_manager: GameManager, card_factory: Callable[..., Card], *, upgrade_factory: Callable[[str], Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
        setup_battle_ready(bob, ["Island", "Island", "Island"])

        target = card_factory("alice-card")
        upgrade = upgrade_factory("hidden-upgrade")
        alice.hand = [target]
        alice.upgrades = [upgrade]
        reward.apply_upgrade_to_card(alice, upgrade, target=target)
        b = battle.start(game, alice, opponent=bob)
        _register_two_player_game(game_manager, game)

        assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade_id=upgrade.id) is True

        battle.submit_result(b, alice, winner_name=alice.name)
        battle.submit_result(b, bob, winner_name=alice.name)
        assert battle.results_agreed(b)
        battle.end(game, b)

        bob_state = game_manager.get_game_state("g1", "pid_bob")
        assert bob_state is not None
        alice_in_bob_view = next(p for p in bob_state.players if p.name == "Alice")
        assert len(alice_in_bob_view.upgrades) == 1
        assert alice_in_bob_view.upgrades[0].is_revealed is True

    def test_revealed_upgrade_resolution_events_match_for_both_players(
        self, game_manager: GameManager, card_factory: Callable[..., Card], *, upgrade_factory: Callable[[str], Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
        setup_battle_ready(bob, ["Island", "Island", "Island"])

        target = card_factory("alice-card")
        upgrade = upgrade_factory("hidden-upgrade")
        alice.hand = [target]
        alice.upgrades = [upgrade]
        reward.apply_upgrade_to_card(alice, upgrade, target=target)
        battle.start(game, alice, opponent=bob)
        _register_two_player_game(game_manager, game)

        assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade_id=upgrade.id) is True
        game_manager.handle_battle_submit_result(game, alice, result=alice.name, game_id="g1")
        game_manager.handle_battle_submit_result(game, bob, result=alice.name, game_id="g1")

        alice_state = game_manager.get_game_state("g1", "pid_alice")
        bob_state = game_manager.get_game_state("g1", "pid_bob")
        assert alice_state is not None
        assert bob_state is not None
        assert alice_state.battle_resolution is not None
        assert bob_state.battle_resolution is not None

        alice_opp_events = alice_state.battle_resolution.opponent_side.events
        bob_your_events = bob_state.battle_resolution.your_side.events
        upgrade_beams_alice = [e for e in alice_opp_events if e.event_type == "upgrade_beam"]
        upgrade_beams_bob = [e for e in bob_your_events if e.event_type == "upgrade_beam"]
        assert len(upgrade_beams_alice) == 1
        assert len(upgrade_beams_bob) == 1


class TestFaceDownScrubbing:
    def test_pvp_face_down_cards_scrubbed_in_battle_view(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """In PvP, opponent face-down cards should have scrubbed data and opaque IDs."""
        _ = game_manager
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("SecretCreature", "Creature")
        bob.hand = [creature]

        b = battle.start(game, alice, opponent=bob)
        battle.move_zone(b, bob, card=creature, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, bob, action_type="face_down", card_id=creature.id)

        view = build_battle_view(b, alice, game=game)

        face_down_bf = [c for c in view.opponent_zones.battlefield if c.id in view.opponent_zones.face_down_card_ids]
        assert len(face_down_bf) == 1
        scrubbed = face_down_bf[0]
        assert scrubbed.scryfall_id == "__scrubbed__"
        assert scrubbed.id != creature.id

    def test_pvp_face_down_opaque_id_not_scryfall_uuid(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """Opaque IDs should not be the original Scryfall UUID."""
        _ = game_manager
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("SecretCreature", "Creature")
        bob.hand = [creature]

        b = battle.start(game, alice, opponent=bob)
        battle.move_zone(b, bob, card=creature, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, bob, action_type="face_down", card_id=creature.id)

        view = build_battle_view(b, alice, game=game)

        all_bf_ids = {c.id for c in view.opponent_zones.battlefield}
        assert creature.id not in all_bf_ids

    def test_pvp_face_down_opaque_id_translated_for_card_state(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """Opaque IDs from scrubbed view should resolve via handle_battle_update_card_state."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("SecretCreature", "Creature")
        bob.hand = [creature]

        b = battle.start(game, alice, opponent=bob)
        battle.move_zone(b, bob, card=creature, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, bob, action_type="face_down", card_id=creature.id)

        view = build_battle_view(b, alice, game=game)

        opaque_id = view.opponent_zones.face_down_card_ids[0]
        assert opaque_id != creature.id

        result = game_manager.handle_battle_update_card_state(game, alice, action_type="tap", card_id=opaque_id)
        assert result
        assert creature.id in b.opponent_zones.tapped_card_ids

    def test_pvp_opponent_can_act_on_face_down_card_after_other_views_are_built(
        self, game_manager: GameManager, mock_cube_data: None, *, test_db: None, start_game_now: Callable[..., Game]
    ) -> None:
        _ = (mock_cube_data, test_db)
        pending = game_manager.create_game("Alice", "pid-a", cube_id="test", target_player_count=2)
        game_manager.join_game(pending.join_code, "Bob", player_id="pid-b")
        game_id = pending.game_id
        game = start_game_now(game_manager, game_id)
        assert game is not None
        alice, bob = game.players
        for p in (alice, bob):
            p.hand, p.sideboard = p.sideboard[:3], p.sideboard[3:]
            assert (
                game_manager.handle_build_ready(game, p, basics=["Plains", "Island", "Swamp"], game_id=game_id, db=None)
                is None
            )
        b = game.active_battles[0]
        bob_card = bob.hand[0]
        assert game_manager.handle_battle_move(game, bob, card_id=bob_card.id, from_zone="hand", to_zone="battlefield")
        assert game_manager.handle_battle_update_card_state(game, bob, action_type="face_down", card_id=bob_card.id)

        # broadcast_game_state builds every player's view in turn, then each spectator's
        alice_view = game_manager.get_game_state(game_id, "pid-a")
        game_manager.get_game_state(game_id, "pid-b")
        game_manager.get_game_state(game_id, "pid-a")
        assert alice_view is not None
        assert alice_view.current_battle is not None
        opaque_id = alice_view.current_battle.opponent_zones.face_down_card_ids[0]

        assert game_manager.handle_battle_move(
            game,
            alice,
            card_id=opaque_id,
            from_zone="battlefield",
            to_zone="graveyard",
            from_owner="opponent",
            to_owner="opponent",
        )
        bob_zones = b.player_zones if b.player.name == bob.name else b.opponent_zones
        assert bob_card.id in {c.id for c in bob_zones.graveyard}

    def test_pvp_shuffle_changes_the_ids_shown_for_the_shuffled_library(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        face_down, first, second = card_factory("FaceDown"), card_factory("First"), card_factory("Second")
        bob.hand = [face_down, first, second]

        b = battle.start(game, alice, opponent=bob)
        battle.move_zone(b, bob, card=face_down, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, bob, action_type="face_down", card_id=face_down.id)
        battle.move_zone(b, bob, card=first, from_zone="hand", to_zone="library")
        battle.move_zone(b, bob, card=second, from_zone="hand", to_zone="library")

        ids_before = {c.id for c in build_battle_view(b, alice, game=game).opponent_zones.library}
        assert game_manager.handle_battle_update_card_state(game, bob, action_type="shuffle_library", card_id="")
        ids_after = {c.id for c in build_battle_view(b, alice, game=game).opponent_zones.library}

        assert ids_before.isdisjoint(ids_after)

    def test_static_opponent_face_down_not_scrubbed(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """Against StaticOpponent, face-down cards should preserve real data."""
        _ = game_manager
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        creature = card_factory("SecretCreature", "Creature")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[creature],
            chosen_basics=["Plains", "Island", "Mountain"],
        )

        b = battle.start(game, alice, opponent=static_opp)
        battle.move_zone(b, static_opp, card=creature, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, alice, action_type="face_down", card_id=creature.id)

        view = build_battle_view(b, alice, game=game)

        face_down_bf = [c for c in view.opponent_zones.battlefield if c.id in view.opponent_zones.face_down_card_ids]
        assert len(face_down_bf) == 1
        assert face_down_bf[0].id == creature.id
        assert face_down_bf[0].scryfall_id == creature.scryfall_id

    def test_static_opponent_library_is_in_battle_view(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        _ = game_manager
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        battle_state = battle.start(game, alice, opponent=static_opp)
        battle_state.opponent_zones.library = [card_factory("LibCard")]

        battle_view = build_battle_view(battle_state, alice, game=game)

        assert len(battle_view.opponent_zones.library) == 1

    def test_can_manipulate_opponent_true_for_static(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """BattleView.can_manipulate_opponent should be True against StaticOpponent."""
        _ = game_manager
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        static_opp = StaticOpponent(
            name="Bot",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )

        b = battle.start(game, alice, opponent=static_opp)
        view = build_battle_view(b, alice, game=game)
        assert view.can_manipulate_opponent is True

    def test_can_manipulate_opponent_false_for_pvp(self, game_manager: GameManager) -> None:
        """BattleView.can_manipulate_opponent should be False in PvP."""
        _ = game_manager
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        b = battle.start(game, alice, opponent=bob)
        view = build_battle_view(b, alice, game=game)
        assert view.can_manipulate_opponent is False

    def test_pvp_scrubbing_remaps_tapped_and_counters(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        """Scrubbing should also remap tapped_card_ids and counters for face-down cards."""
        _ = game_manager
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        creature = card_factory("SecretCreature", "Creature")
        bob.hand = [creature]

        b = battle.start(game, alice, opponent=bob)
        battle.move_zone(b, bob, card=creature, from_zone="hand", to_zone="battlefield")
        battle.update_card_state(b, bob, action_type="face_down", card_id=creature.id)
        battle.update_card_state(b, bob, action_type="tap", card_id=creature.id)
        battle.update_card_state(
            b, bob, action_type="counter", card_id=creature.id, data={"counter_type": "+1/+1", "delta": 1}
        )

        view = build_battle_view(b, alice, game=game)

        assert creature.id not in view.opponent_zones.tapped_card_ids
        assert creature.id not in view.opponent_zones.counters
        opaque_id = view.opponent_zones.face_down_card_ids[0]
        assert opaque_id in view.opponent_zones.tapped_card_ids
        assert opaque_id in view.opponent_zones.counters

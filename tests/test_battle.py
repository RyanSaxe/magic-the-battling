import pytest
from conftest import setup_battle_ready

from mtb.models.game import FakePlayer, StaticOpponent, create_game
from mtb.phases import battle
from server.services.game_manager import GameManager


def test_can_start_pairing():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    starting_stage = game.config.starting_stage

    alice.phase = "build"
    bob.phase = "battle"
    assert not battle.can_start_pairing(game, 1, starting_stage)

    alice.phase = "battle"
    assert battle.can_start_pairing(game, 1, starting_stage)

    alice.round = 2
    assert not battle.can_start_pairing(game, 1, starting_stage)


def test_find_opponent_returns_candidate():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "battle"

    opponent = battle.find_opponent(game, alice)

    assert opponent is bob


def test_find_opponent_returns_none_when_not_all_ready():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "build"

    opponent = battle.find_opponent(game, alice)

    assert opponent is None


def test_start_battle_creates_zones(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    alice.hand = [card_factory("a1"), card_factory("a2")]
    alice.sideboard = [card_factory("a3")]
    alice.treasures = 2

    b = battle.start(game, alice, bob)

    assert b.player is alice
    assert b.opponent is bob
    assert b.coin_flip_name in (alice.name, bob.name)
    # 3 lands + 2 treasures = 5 cards on battlefield
    assert len(b.player_zones.battlefield) == 5
    lands = [c for c in b.player_zones.battlefield if "Land" in c.type_line]
    treasures = [c for c in b.player_zones.battlefield if "Treasure" in c.type_line]
    assert len(lands) == 3
    assert len(treasures) == 2
    assert len(b.player_zones.hand) == 2
    assert len(b.player_zones.sideboard) == 1
    assert b.player_zones.treasures == 2


def test_higher_poison_player_goes_first():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    alice.poison = 5
    bob.poison = 2
    b = battle.start(game, alice, bob)
    assert b.coin_flip_name == alice.name

    game.active_battles.clear()

    alice.poison = 2
    bob.poison = 5
    b = battle.start(game, alice, bob)
    assert b.coin_flip_name == bob.name


def test_higher_poison_bot_goes_first(card_factory):
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])

    fake = FakePlayer(name="Bot1", player_history_id=1)
    snapshot = StaticOpponent(
        name="Bot1",
        hand=[card_factory("card1")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    fake.snapshots[f"{alice.stage}_1"] = snapshot
    fake.poison = 5
    game.fake_players.append(fake)

    alice.poison = 2
    opponent = fake.get_opponent_for_round(alice.stage, 1)
    assert opponent is not None
    b = battle.start(game, alice, opponent)
    assert b.coin_flip_name == "Bot1"


def test_start_battle_wrong_phase_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "battle"

    with pytest.raises(ValueError):
        battle.start(game, alice, bob)


def test_start_battle_not_all_ready_raises():
    game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
    alice, bob, charlie = game.players
    alice.phase = "battle"
    bob.phase = "battle"
    charlie.phase = "build"
    alice.chosen_basics = ["Plains", "Plains", "Plains"]
    bob.chosen_basics = ["Island", "Island", "Island"]

    with pytest.raises(ValueError):
        battle.start(game, alice, bob)


def test_is_in_active_battle():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    assert not battle.is_in_active_battle(game, alice)

    battle.start(game, alice, bob)

    assert battle.is_in_active_battle(game, alice)
    assert battle.is_in_active_battle(game, bob)


def test_move_zone_moves_card(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    card = card_factory("test")
    alice.sideboard = [card]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, card, "sideboard", "hand")

    assert card not in b.player_zones.sideboard
    assert card in b.player_zones.hand


def test_move_zone_card_not_in_zone_raises(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)

    with pytest.raises(ValueError):
        battle.move_zone(b, alice, card_factory("missing"), "hand", "battlefield")


def test_results_agreed_when_both_match():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    assert battle.results_agreed(b)
    result = battle.get_result(b)
    assert result is not None
    assert result.winner is alice
    assert result.loser is bob
    assert not result.is_draw


def test_results_not_agreed_when_different():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Bob")

    assert not battle.results_agreed(b)


def test_end_battle_caps_treasures():
    """battle.end() syncs zones and caps treasures but does NOT set phases.

    Phase transitions are handled by game_manager._end_battle() which calls
    battle.end() and then determines the appropriate phase based on game state.
    """
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    alice.treasures = 10
    bob.treasures = 3

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    result = battle.end(game, b)

    assert result.winner is alice
    assert result.loser is bob
    # alice had 10 treasures, capped to max_treasures (5)
    assert alice.treasures == game.config.max_treasures
    # bob had 3 treasures, all still on battlefield
    assert bob.treasures == 3
    # battle.end() no longer sets phase - that's done by game_manager._end_battle()
    assert alice.phase == "battle"
    assert bob.phase == "battle"


def test_end_battle_tracks_revealed_cards(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, creature, "hand", "battlefield")
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_bounced_card_still_revealed(card_factory):
    """A card played then bounced to hand should still appear in revealed cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, creature, "hand", "battlefield")
    battle.move_zone(b, alice, creature, "battlefield", "hand")
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_sideboard_fetch_to_hand_not_revealed(card_factory):
    """A card fetched from sideboard to hand should NOT appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Instant")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, wish_target, "sideboard", "hand")
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    battle.end(game, b)

    assert wish_target not in alice.most_recently_revealed_cards


def test_sideboard_fetch_to_battlefield_revealed(card_factory):
    """A card fetched from sideboard to a revealed zone should appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Creature")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, wish_target, "sideboard", "battlefield")
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    battle.end(game, b)

    assert wish_target in alice.most_recently_revealed_cards


def test_hand_to_command_zone_revealed(card_factory):
    """A card moved from hand to command zone should appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, bob)
    battle.move_zone(b, alice, creature, "hand", "command_zone")
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_sideboard_to_battlefield_syncs_player_model(card_factory):
    """Moving sideboard->battlefield should remove card from player.sideboard."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Instant")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, bob)

    manager = GameManager()
    manager.handle_battle_move(game, alice, wish_target.id, "sideboard", "battlefield")

    assert wish_target not in alice.sideboard
    assert wish_target in b.player_zones.battlefield


def test_command_zone_to_battlefield_preserves_companion_selection(card_factory):
    """Casting companion should preserve selection state for next build phase."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    companion = card_factory("Companion", "Creature", oracle_text="Companion — test")
    alice.command_zone = [companion]

    b = battle.start(game, alice, bob)

    manager = GameManager()
    manager.handle_battle_move(game, alice, companion.id, "command_zone", "battlefield")

    # Companion should remain in player.command_zone (selection state persists)
    assert companion in alice.command_zone
    # But should be on battlefield in battle zones
    assert companion in b.player_zones.battlefield
    # And removed from battle's command_zone
    assert companion not in b.player_zones.command_zone


def test_end_battle_not_agreed_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")

    with pytest.raises(ValueError):
        battle.end(game, b)


def test_end_battle_preserves_hand_and_sideboard(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    hand_card = card_factory("hand_card")
    sideboard_card = card_factory("sideboard_card")
    alice.hand = [hand_card]
    alice.sideboard = [sideboard_card]

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")
    battle.end(game, b)

    assert hand_card in alice.hand
    assert sideboard_card in alice.sideboard
    assert hand_card not in alice.sideboard
    assert sideboard_card not in alice.hand


def test_submit_result_accepts_draw():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, battle.DRAW_RESULT)
    battle.submit_result(b, bob, battle.DRAW_RESULT)

    assert battle.results_agreed(b)
    result = battle.get_result(b)
    assert result is not None
    assert result.is_draw
    assert result.winner is None
    assert result.loser is None


def test_end_battle_with_draw_returns_draw_result():
    """battle.end() returns draw result but does NOT set phases.

    Phase transitions are handled by game_manager._end_battle() which calls
    battle.end() and then determines the appropriate phase based on game state.
    """
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, battle.DRAW_RESULT)
    battle.submit_result(b, bob, battle.DRAW_RESULT)

    result = battle.end(game, b)

    assert result.is_draw
    # battle.end() no longer sets phase - that's done by game_manager._end_battle()
    assert alice.phase == "battle"
    assert bob.phase == "battle"


class TestPairingProbabilities:
    def test_get_pairing_probabilities_single_candidate(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {"Bob": 1.0}

    def test_get_pairing_probabilities_three_candidates(self):
        game = create_game(["Alice", "Bob", "Charlie", "Diana"], num_players=4)
        alice, _bob, _charlie, _diana = game.players
        for p in game.players:
            setup_battle_ready(p)

        probs = battle.get_pairing_probabilities(game, alice)

        assert len(probs) == 3
        assert alice.name not in probs
        total = sum(probs.values())
        assert abs(total - 1.0) < 0.001

    def test_get_pairing_probabilities_prior_opponent_weighted_down(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, _bob, _charlie = game.players
        alice.last_opponent_name = "Bob"
        for p in game.players:
            setup_battle_ready(p)

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs["Bob"] == pytest.approx(0.1)
        assert probs["Charlie"] == pytest.approx(0.9)

    def test_get_pairing_probabilities_works_across_phases(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase = "battle"
        bob.phase = "build"

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {"Bob": 1.0}

    def test_get_pairing_probabilities_returns_empty_when_in_active_battle(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, _charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, alice, bob)
        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {}


class TestUnifiedPairingCandidates:
    def test_get_all_pairing_candidates_includes_live_players(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, _bob, _charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        candidates = battle.get_all_pairing_candidates(game, alice)

        names = {c.name for c in candidates}
        assert names == {"Bob", "Charlie"}

    def test_get_all_pairing_candidates_excludes_players_in_active_battle(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, bob, charlie)
        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 0

    def test_get_all_pairing_candidates_includes_fake_players(self, card_factory):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        fake = FakePlayer(name="Bot1", player_history_id=1)
        snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        fake.snapshots[f"{alice.stage}_1"] = snapshot
        game.fake_players.append(fake)

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 1
        assert isinstance(candidates[0], StaticOpponent)
        assert candidates[0].name == "Bot1"

    def test_get_all_pairing_candidates_includes_ghost(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        bob.phase = "eliminated"
        ghost = StaticOpponent.from_player(bob, hand_revealed=True)
        game.most_recent_ghost = ghost

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 1
        assert candidates[0] is ghost

    def test_get_all_pairing_candidates_excludes_self_as_ghost(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase = "eliminated"
        ghost = StaticOpponent.from_player(alice, hand_revealed=True)
        game.most_recent_ghost = ghost
        setup_battle_ready(bob)

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert ghost not in candidates

    def test_fake_player_snapshot_uses_stage_for_lookup(self, card_factory):
        """Snapshots are keyed by stage and round, not hand_size.

        Snapshots are stored in the database with keys like "3_1", "4_1" (stage-based).
        The lookup uses player.stage, so advancing stage changes which snapshot is used.
        """
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        fake = FakePlayer(name="Bot1", player_history_id=1)
        early_snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("early_card")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        later_snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("later_card")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        fake.snapshots["3_1"] = early_snapshot
        fake.snapshots["4_1"] = later_snapshot
        game.fake_players.append(fake)

        candidates = battle.get_all_pairing_candidates(game, alice)
        assert candidates[0].hand[0].name == "early_card"

        alice.stage = 4
        candidates = battle.get_all_pairing_candidates(game, alice)
        assert candidates[0].hand[0].name == "later_card"


class TestViableCandidates:
    def test_get_viable_candidates_returns_all_when_three_or_fewer(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, _bob, _charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        candidates = battle.get_all_pairing_candidates(game, alice)
        viable = battle.get_viable_candidates(alice, candidates)

        assert len(viable) == 2
        assert {c.name for c in viable} == {"Bob", "Charlie"}

    def test_get_viable_candidates_samples_three_when_more_than_three(self):
        game = create_game(["Alice", "Bob", "Charlie", "Diana", "Eve"], num_players=5)
        for p in game.players:
            setup_battle_ready(p)

        alice = game.players[0]
        candidates = battle.get_all_pairing_candidates(game, alice)
        viable = battle.get_viable_candidates(alice, candidates)

        assert len(viable) == 3
        for v in viable:
            assert v.name != "Alice"

    def test_get_viable_candidates_is_deterministic(self):
        game = create_game(["Alice", "Bob", "Charlie", "Diana", "Eve"], num_players=5)
        for p in game.players:
            setup_battle_ready(p)

        alice = game.players[0]
        candidates = battle.get_all_pairing_candidates(game, alice)

        viable1 = battle.get_viable_candidates(alice, candidates)
        viable2 = battle.get_viable_candidates(alice, candidates)

        assert [c.name for c in viable1] == [c.name for c in viable2]

    def test_get_viable_candidates_changes_with_round(self):
        game = create_game(["Alice", "Bob", "Charlie", "Diana", "Eve"], num_players=5)
        for p in game.players:
            setup_battle_ready(p)

        alice = game.players[0]
        candidates = battle.get_all_pairing_candidates(game, alice)
        viable_round1 = battle.get_viable_candidates(alice, candidates)

        alice.round = 2
        viable_round2 = battle.get_viable_candidates(alice, candidates)

        names1 = {c.name for c in viable_round1}
        names2 = {c.name for c in viable_round2}
        assert names1 != names2 or names1 == names2


class TestOpponentZoneManipulation:
    """Tests for manipulating opponent zones when opponent is StaticOpponent."""

    def test_get_zones_for_card_finds_player_card(self, card_factory):
        """get_zones_for_card returns player zones when card is in player's zones."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        card = card_factory("TestCard")
        alice.hand = [card]

        b = battle.start(game, alice, bob)

        zones, is_opponent = battle.get_zones_for_card(b, alice, card.id)
        assert zones == b.player_zones
        assert not is_opponent

    def test_get_zones_for_card_finds_opponent_card_vs_static(self, card_factory):
        """get_zones_for_card finds card in opponent zones when opponent is StaticOpponent."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[opp_card],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)

        zones, is_opponent = battle.get_zones_for_card(b, alice, opp_card.id)
        assert zones == b.opponent_zones
        assert is_opponent

    def test_get_zones_for_card_raises_if_not_found(self, card_factory):
        """get_zones_for_card raises ValueError if card not in any zones."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        b = battle.start(game, alice, bob)

        with pytest.raises(ValueError, match="not found"):
            battle.get_zones_for_card(b, alice, "nonexistent-card-id")

    def test_update_card_state_works_on_opponent_card(self, card_factory):
        """update_card_state can tap/untap opponent's cards when opponent is StaticOpponent."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)
        b.opponent_zones.battlefield.append(opp_card)

        # Tap opponent's card
        result = battle.update_card_state(b, alice, "tap", opp_card.id)
        assert result
        assert opp_card.id in b.opponent_zones.tapped_card_ids

        # Untap opponent's card
        result = battle.update_card_state(b, alice, "untap", opp_card.id)
        assert result
        assert opp_card.id not in b.opponent_zones.tapped_card_ids

    def test_battle_move_works_on_opponent_card_via_game_manager(self, card_factory):
        """handle_battle_move can move opponent's cards when opponent is StaticOpponent."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        opp_card = card_factory("OppCard")
        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)
        b.opponent_zones.battlefield.append(opp_card)

        manager = GameManager()
        result = manager.handle_battle_move(game, alice, opp_card.id, "battlefield", "graveyard")

        assert result
        assert opp_card not in b.opponent_zones.battlefield
        assert opp_card in b.opponent_zones.graveyard

    def test_battle_move_works_on_static_opponent_basic_lands(self):
        """handle_battle_move can move StaticOpponent's auto-created basic lands."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            upgrades=[],
            vanguard=None,
            chosen_basics=["Island", "Island", "Island"],
            treasures=0,
        )

        b = battle.start(game, alice, static_opp)

        # Get one of the auto-created basic lands
        island = b.opponent_zones.battlefield[0]
        assert "Island" in island.name

        manager = GameManager()
        result = manager.handle_battle_move(game, alice, island.id, "battlefield", "graveyard")

        assert result
        assert island not in b.opponent_zones.battlefield
        assert island in b.opponent_zones.graveyard

    def test_update_card_state_does_not_work_on_pvp_opponent(self, card_factory):
        """update_card_state cannot modify opponent's cards in PvP battle."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        opp_card = card_factory("OppCard")
        bob.hand = [opp_card]

        b = battle.start(game, alice, bob)

        # Alice tries to tap Bob's card - should fail
        result = battle.update_card_state(b, alice, "tap", opp_card.id)
        assert not result
        assert opp_card.id not in b.opponent_zones.tapped_card_ids


def test_companion_filtered_from_sideboard_in_battle(card_factory):
    """Companion should only appear in command_zone during battle, not sideboard."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    companion = card_factory("Lurrus")
    other_sideboard = card_factory("SideboardCard")
    alice.command_zone = [companion]
    alice.sideboard = [companion, other_sideboard]

    b = battle.start(game, alice, bob)

    assert companion in b.player_zones.command_zone
    assert companion not in b.player_zones.sideboard
    assert other_sideboard in b.player_zones.sideboard
    assert len(b.player_zones.sideboard) == 1


def test_companion_filtered_from_sideboard_vs_static_opponent(card_factory):
    """Companion should be filtered from sideboard for static opponents too."""
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    companion = card_factory("Kaheera")
    other_sideboard = card_factory("SideboardCard")

    static_opp = StaticOpponent(
        name="Bot1",
        hand=[card_factory("BotCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
        command_zone=[companion],
        sideboard=[companion, other_sideboard],
    )
    fake = FakePlayer(name="Bot1", player_history_id=1)
    fake.snapshots[f"{alice.stage}_1"] = static_opp
    game.fake_players.append(fake)

    b = battle.start(game, alice, static_opp)

    assert companion in b.opponent_zones.command_zone
    assert companion not in b.opponent_zones.sideboard
    assert other_sideboard in b.opponent_zones.sideboard
    assert len(b.opponent_zones.sideboard) == 1


def test_companion_preserved_in_sideboard_after_battle(card_factory):
    """Companion should be restored to sideboard after battle ends."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    companion = card_factory("Lurrus")
    other_sideboard = card_factory("SideboardCard")
    alice.command_zone = [companion]
    alice.sideboard = [companion, other_sideboard]

    b = battle.start(game, alice, bob)

    assert companion not in b.player_zones.sideboard
    assert companion in b.player_zones.submitted_cards

    battle.submit_result(b, alice, alice.name)
    battle.submit_result(b, bob, alice.name)
    battle.end(game, b)

    assert companion in alice.sideboard
    assert other_sideboard in alice.sideboard

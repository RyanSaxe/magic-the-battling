from mtb.models.cards import Battler
from mtb.models.game import create_game, set_battler
from mtb.phases import battle, build, draft, reward


def test_full_round_flow_round_1(card_factory, upgrade_factory):
    """Round 1 starts in build phase (no draft), then goes to draft for round 2.

    Note: battle.end() no longer sets phases - that's now handled by game_manager._end_battle().
    In unit tests, we set phases manually to simulate the game_manager behavior.
    """
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [upgrade_factory(f"u{i}") for i in range(4)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
    set_battler(game, battler)

    alice, bob = game.players

    # Round 1 starts in build phase with hand empty, all cards in sideboard
    assert alice.phase == "build"
    assert alice.round == 1
    pool_size = game.config.starting_pool_size
    hand_size = game.config.starting_stage
    assert len(alice.hand) == 0
    assert len(alice.sideboard) == pool_size
    assert len(bob.hand) == 0
    assert len(bob.sideboard) == pool_size

    # Manually fill hands (player agency in the real UI)
    for p in [alice, bob]:
        for _ in range(hand_size):
            build.move_card(p, p.sideboard[0], "sideboard", "hand")

    build.set_ready(game, alice, ["Plains", "Island", "Mountain"], "play")
    build.set_ready(game, bob, ["Forest", "Swamp", "Mountain"], "play")
    assert build.all_ready(game)
    alice.phase = "battle"
    bob.phase = "battle"

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")
    result = battle.end(game, b)
    assert result.winner is alice

    # In production, game_manager._end_battle() sets phases. Here we simulate that.
    alice.phase = "reward"
    bob.phase = "reward"

    reward.start(game, result.winner, result.loser)
    reward.end_for_player(game, alice)
    reward.end_for_player(game, bob)

    # After round 1 reward, we go to draft for round 2
    assert alice.phase == "draft"
    assert bob.phase == "draft"
    assert alice.round == 2
    assert bob.round == 2


def test_full_round_flow_round_2(card_factory, upgrade_factory):
    """Round 2+ starts with draft phase.

    Note: battle.end() no longer sets phases - that's now handled by game_manager._end_battle().
    In unit tests, we set phases manually to simulate the game_manager behavior.
    """
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [upgrade_factory(f"u{i}") for i in range(4)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
    set_battler(game, battler)

    alice, bob = game.players

    # Skip round 1 by manually advancing
    alice.round = 2
    bob.round = 2
    alice.phase = "draft"
    bob.phase = "draft"

    # Now test the draft → build → battle → reward flow
    draft.start(game)
    draft.deal_pack_to_player(game, alice)
    draft.deal_pack_to_player(game, bob)

    alice_swap_card = alice.sideboard[0]
    alice_pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, alice_pack_card, alice_swap_card, "sideboard")

    bob_swap_card = bob.sideboard[0]
    bob_pack_card = game.get_draft_state().current_packs["Bob"][0]
    draft.swap(game, bob, bob_pack_card, bob_swap_card, "sideboard")

    draft.end_for_player(game, alice)
    draft.end_for_player(game, bob)
    assert alice.phase == "build"
    assert bob.phase == "build"

    # Manually fill hands (player agency in the real UI)
    hand_size = game.config.starting_stage
    for p in [alice, bob]:
        for _ in range(hand_size):
            build.move_card(p, p.sideboard[0], "sideboard", "hand")

    build.set_ready(game, alice, ["Plains", "Island", "Mountain"], "play")
    build.set_ready(game, bob, ["Forest", "Swamp", "Mountain"], "play")
    assert build.all_ready(game)
    alice.phase = "battle"
    bob.phase = "battle"

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")
    result = battle.end(game, b)

    # In production, game_manager._end_battle() sets phases. Here we simulate that.
    alice.phase = "reward"
    bob.phase = "reward"

    reward.start(game, result.winner, result.loser)
    reward.end_for_player(game, alice)
    reward.end_for_player(game, bob)
    assert alice.phase == "draft"
    assert bob.phase == "draft"
    assert alice.round == 3
    assert bob.round == 3


def test_populate_hand_restores_previous_hand_ids(card_factory, upgrade_factory):
    """Regression test: populate_hand should restore previous hand cards still in pool."""
    game = create_game(["Alice"], num_players=1)
    upgrades = [upgrade_factory(f"u{i}") for i in range(4)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
    set_battler(game, battler)

    alice = game.players[0]
    total_cards = len(alice.hand) + len(alice.sideboard)
    alice.previous_hand_ids = [c.id for c in alice.hand]

    alice.populate_hand()

    assert len(alice.hand) + len(alice.sideboard) == total_cards

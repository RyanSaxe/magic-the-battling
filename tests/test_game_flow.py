from mtb.models.cards import Battler
from mtb.models.game import create_game, set_battler
from mtb.phases import battle, build, draft, reward


def test_full_round_flow_round_1(card_factory, upgrade_factory):
    """Round 1 starts in build phase (no draft), then goes to draft for round 2."""
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [upgrade_factory(f"u{i}") for i in range(4)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
    set_battler(game, battler)

    alice, bob = game.players

    # Round 1 starts in build phase with hand pre-populated by ELO
    assert alice.phase == "build"
    assert alice.round == 1
    hand_size = game.config.starting_stage
    pool_size = game.config.starting_pool_size
    assert len(alice.hand) == hand_size
    assert len(alice.sideboard) == pool_size - hand_size
    assert len(bob.hand) == hand_size
    assert len(bob.sideboard) == pool_size - hand_size

    build.submit(game, alice, ["Plains", "Island", "Mountain"])
    build.submit(game, bob, ["Forest", "Swamp", "Mountain"])
    assert alice.phase == "battle"
    assert bob.phase == "battle"

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")
    result = battle.end(game, b)
    assert alice.phase == "reward"
    assert bob.phase == "reward"
    assert result.winner is alice

    reward.start(game, result.winner, result.loser)
    reward.end_for_player(game, alice)
    reward.end_for_player(game, bob)

    # After round 1 reward, we go to draft for round 2
    assert alice.phase == "draft"
    assert bob.phase == "draft"
    assert alice.round == 2
    assert bob.round == 2


def test_full_round_flow_round_2(card_factory, upgrade_factory):
    """Round 2+ starts with draft phase."""
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

    build.submit(game, alice, ["Plains", "Island", "Mountain"])
    build.submit(game, bob, ["Forest", "Swamp", "Mountain"])
    assert alice.phase == "battle"
    assert bob.phase == "battle"

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")
    battle.submit_result(b, bob, "Alice")
    result = battle.end(game, b)
    assert alice.phase == "reward"
    assert bob.phase == "reward"

    reward.start(game, result.winner, result.loser)
    reward.end_for_player(game, alice)
    reward.end_for_player(game, bob)
    assert alice.phase == "draft"
    assert bob.phase == "draft"
    assert alice.round == 3
    assert bob.round == 3

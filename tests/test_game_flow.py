from mtb.models.cards import Battler
from mtb.models.game import create_game, set_battler
from mtb.phases import (
    end_battle,
    end_draft_for_player,
    end_reward_for_player,
    move_card,
    start_battle,
    start_draft,
    start_reward,
    submit_build,
    submit_result,
    take,
)


def test_full_round_flow_round_1(card_factory, upgrade_factory):
    """Round 1 starts in build phase (no draft), then goes to draft for round 2."""
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [upgrade_factory(f"u{i}") for i in range(4)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
    set_battler(game, battler)

    alice, bob = game.players

    # Round 1 starts in build phase (players already have starting pool)
    assert alice.phase == "build"
    assert alice.round == 1
    assert len(alice.sideboard) == game.config.starting_pool_size
    assert len(bob.sideboard) == game.config.starting_pool_size

    # Move some cards to hand for build
    for _ in range(3):
        move_card(alice, alice.sideboard[0], "sideboard", "hand")
        move_card(bob, bob.sideboard[0], "sideboard", "hand")

    submit_build(game, alice, ["Plains", "Island", "Mountain"])
    submit_build(game, bob, ["Forest", "Swamp", "Mountain"])
    assert alice.phase == "battle"
    assert bob.phase == "battle"

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")
    winner, loser = end_battle(game, battle)
    assert alice.phase == "reward"
    assert bob.phase == "reward"
    assert winner is alice

    start_reward(game, winner, loser)
    end_reward_for_player(game, alice)
    end_reward_for_player(game, bob)

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
    start_draft(game)

    take(game, alice, game.draft_state.current_packs["Alice"][0], "hand")
    take(game, bob, game.draft_state.current_packs["Bob"][0], "hand")

    end_draft_for_player(game, alice)
    end_draft_for_player(game, bob)
    assert alice.phase == "build"
    assert bob.phase == "build"

    submit_build(game, alice, ["Plains", "Island", "Mountain"])
    submit_build(game, bob, ["Forest", "Swamp", "Mountain"])
    assert alice.phase == "battle"
    assert bob.phase == "battle"

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")
    winner, loser = end_battle(game, battle)
    assert alice.phase == "reward"
    assert bob.phase == "reward"

    start_reward(game, winner, loser)
    end_reward_for_player(game, alice)
    end_reward_for_player(game, bob)
    assert alice.phase == "draft"
    assert bob.phase == "draft"
    assert alice.round == 3
    assert bob.round == 3

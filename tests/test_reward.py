import pytest

from mtb.models.cards import Battler
from mtb.models.game import create_game
from mtb.phases import (
    apply_poison,
    apply_upgrade_to_card,
    award_random_card,
    count_applied_upgrades,
    end_reward_for_player,
    is_stage_increasing,
    pick_upgrade,
    start_reward,
)


def test_is_stage_increasing():
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    player = game.players[0]

    player.round = 1
    assert not is_stage_increasing(player)

    player.round = 3
    assert is_stage_increasing(player)

    player.round = 6
    assert is_stage_increasing(player)


def test_count_applied_upgrades(card_factory, upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]

    u1 = upgrade_factory("u1")
    u2 = upgrade_factory("u2")
    u3 = upgrade_factory("u3")
    player.upgrades = [u1, u2, u3]

    assert count_applied_upgrades(player) == 0

    target = card_factory("target")
    u1.upgrade_target = target
    assert count_applied_upgrades(player) == 1

    u2.upgrade_target = card_factory("target2")
    assert count_applied_upgrades(player) == 2


def test_apply_poison(card_factory, upgrade_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players

    u1 = upgrade_factory("u1")
    u1.upgrade_target = card_factory("t1")
    alice.upgrades = [u1]

    poison = apply_poison(alice, bob)

    assert poison == 2
    assert bob.poison == 2


def test_award_random_card(card_factory):
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(5)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    player = game.players[0]

    card = award_random_card(game, player)

    assert card is not None
    assert card in player.sideboard
    assert card not in game.battler.cards
    assert len(game.battler.cards) == 4


def test_pick_upgrade(upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    upgrade = upgrade_factory("power_boost")
    game.available_upgrades = [upgrade]
    player = game.players[0]

    pick_upgrade(game, player, upgrade)

    assert len(player.upgrades) == 1
    assert player.upgrades[0].name == "power_boost"
    assert player.upgrades[0] is not upgrade


def test_pick_upgrade_not_available_raises(upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    game.available_upgrades = [upgrade_factory("u1")]
    player = game.players[0]

    with pytest.raises(ValueError, match="not available"):
        pick_upgrade(game, player, upgrade_factory("u2"))


def test_apply_upgrade_to_card(card_factory, upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = upgrade_factory("power")
    target = card_factory("creature")
    player.upgrades = [upgrade]
    player.hand = [target]

    apply_upgrade_to_card(player, upgrade, target)

    assert upgrade.upgrade_target is target


def test_apply_upgrade_to_card_already_applied_raises(card_factory, upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = upgrade_factory("power")
    upgrade.upgrade_target = card_factory("old_target")
    player.upgrades = [upgrade]

    with pytest.raises(ValueError, match="already been applied"):
        apply_upgrade_to_card(player, upgrade, card_factory("new_target"))


def test_start_reward_standard(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(10)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"
    alice.round = 1
    bob.round = 1
    alice.treasures = 2
    bob.treasures = 1

    start_reward(game, alice, bob)

    assert alice.treasures == 3
    assert bob.treasures == 2
    assert bob.poison == 1
    assert len(alice.sideboard) == 1
    assert len(bob.sideboard) == 1


def test_start_reward_stage_increase_gives_vanquisher(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    game.config.num_rounds_per_stage = 3
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    alice, bob = game.players
    alice.phase = "reward"
    bob.phase = "reward"
    alice.round = 3
    bob.round = 3

    start_reward(game, alice, bob)

    assert alice.vanquishers == 1
    assert bob.vanquishers == 1
    assert len(alice.sideboard) == 0
    assert len(bob.sideboard) == 0


def test_end_reward_for_player_standard():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "reward"
    player.round = 1

    end_reward_for_player(game, player)

    assert player.round == 2
    assert player.phase == "draft"


def test_end_reward_for_player_stage_increase(upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    upgrade = upgrade_factory("power")
    game.available_upgrades = [upgrade]
    player = game.players[0]
    player.phase = "reward"
    player.round = 3
    player.stage = 1

    end_reward_for_player(game, player, upgrade)

    assert player.round == 4
    assert player.stage == 2
    assert len(player.upgrades) == 1


def test_end_reward_for_player_stage_increase_missing_choice_raises():
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    player = game.players[0]
    player.phase = "reward"
    player.round = 3

    with pytest.raises(ValueError, match="Must provide upgrade choice"):
        end_reward_for_player(game, player)

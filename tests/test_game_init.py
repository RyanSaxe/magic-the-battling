import pytest

from mtb.models.cards import Battler
from mtb.models.game import create_game, set_battler


def test_create_game_exact_players(card_factory):
    names = ["Alice", "Bob"]
    game = create_game(names, num_players=2)

    assert [player.name for player in game.players] == names
    assert all(player.treasures == game.config.starting_treasures for player in game.players)
    assert all(player.game is game for player in game.players)


def test_create_game_too_many_names():
    with pytest.raises(ValueError, match="cannot be less than"):
        create_game(["Alice", "Bob"], num_players=1)


def test_create_game_not_enough_players():
    with pytest.raises(NotImplementedError):
        create_game(["Alice"], num_players=2)


def test_set_battler_selects_available_upgrades(card_factory, upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    upgrades = [upgrade_factory(f"upgrade{i}") for i in range(10)]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(20)], upgrades=upgrades, vanguards=[])

    set_battler(game, battler)

    assert game.battler is battler
    assert len(game.available_upgrades) == game.config.max_available_upgrades
    assert all(u in upgrades for u in game.available_upgrades)


def test_set_battler_with_fewer_upgrades_than_max(card_factory, upgrade_factory):
    game = create_game(["Alice"], num_players=1)
    upgrades = [upgrade_factory("u1"), upgrade_factory("u2")]
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(20)], upgrades=upgrades, vanguards=[])

    set_battler(game, battler)

    assert len(game.available_upgrades) == 2


def test_set_battler_deals_starting_pool(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(30)]
    battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    set_battler(game, battler)

    pool_size = game.config.starting_pool_size
    assert len(game.players[0].sideboard) == pool_size
    assert len(game.players[1].sideboard) == pool_size
    assert len(game.battler.cards) == 30 - (2 * pool_size)

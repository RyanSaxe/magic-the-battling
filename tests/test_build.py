import pytest

from mtb.models.game import create_game
from mtb.phases import build


def test_move_card_between_hand_and_sideboard(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")
    player.hand.append(card)

    build.move_card(player, card, "hand", "sideboard")

    assert card not in player.hand
    assert card in player.sideboard


def test_move_card_same_source_destination_noop(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")
    player.hand.append(card)

    build.move_card(player, card, "hand", "hand")

    assert card in player.hand


def test_move_card_not_in_source_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")

    with pytest.raises(ValueError):
        build.move_card(player, card, "hand", "sideboard")

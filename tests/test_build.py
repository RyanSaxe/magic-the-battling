import pytest

from mtb.models.game import create_game
from mtb.phases import move_card, submit_build


def test_move_card_between_hand_and_sideboard(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")
    player.hand.append(card)

    move_card(player, card, "hand", "sideboard")

    assert card not in player.hand
    assert card in player.sideboard


def test_move_card_same_source_destination_noop(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")
    player.hand.append(card)

    move_card(player, card, "hand", "hand")

    assert card in player.hand


def test_move_card_not_in_source_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("test")

    with pytest.raises(ValueError, match="not in player's"):
        move_card(player, card, "hand", "sideboard")


def test_submit_build_transitions_to_battle(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"
    player.hand = [card_factory(f"c{i}") for i in range(3)]

    submit_build(game, player, ["Plains", "Island", "Mountain"])

    assert player.chosen_basics == ["Plains", "Island", "Mountain"]
    assert player.phase == "battle"


def test_submit_build_wrong_phase_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "draft"

    with pytest.raises(ValueError, match="not in build phase"):
        submit_build(game, player, ["Plains", "Island", "Mountain"])


def test_submit_build_wrong_number_of_basics_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"

    with pytest.raises(ValueError, match="exactly 3"):
        submit_build(game, player, ["Plains", "Island"])


def test_submit_build_invalid_basic_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"

    with pytest.raises(ValueError, match="Invalid basic land"):
        submit_build(game, player, ["Plains", "Island", "Tundra"])


def test_submit_build_hand_exceeds_size_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"
    player.hand = [card_factory(f"c{i}") for i in range(10)]

    with pytest.raises(ValueError, match="exceeds maximum"):
        submit_build(game, player, ["Plains", "Island", "Mountain"])

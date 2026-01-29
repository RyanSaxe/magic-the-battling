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


def test_set_companion_copies_card_to_command_zone(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    companion = card_factory("Lurrus", "Creature", oracle_text="Companion — test requirement")
    player.sideboard.append(companion)

    build.set_companion(player, companion)

    assert companion in player.sideboard
    assert len(player.command_zone) == 1
    assert player.command_zone[0].id == companion.id


def test_set_companion_replaces_existing_companion(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    companion1 = card_factory("Lurrus", "Creature", oracle_text="Companion — test requirement")
    companion2 = card_factory("Yorion", "Creature", oracle_text="Companion — test requirement 2")
    player.sideboard.append(companion1)
    player.sideboard.append(companion2)

    build.set_companion(player, companion1)
    build.set_companion(player, companion2)

    assert companion1 in player.sideboard
    assert companion2 in player.sideboard
    assert len(player.command_zone) == 1
    assert player.command_zone[0].id == companion2.id


def test_set_companion_non_companion_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = card_factory("NotCompanion", "Creature")
    player.sideboard.append(card)

    with pytest.raises(ValueError, match="not a companion"):
        build.set_companion(player, card)


def test_remove_companion_clears_command_zone(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    companion = card_factory("Lurrus", "Creature", oracle_text="Companion — test requirement")
    player.sideboard.append(companion)
    player.command_zone.append(companion.model_copy())

    build.remove_companion(player)

    assert companion in player.sideboard
    assert len(player.command_zone) == 0


def test_remove_companion_no_companion_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]

    with pytest.raises(ValueError, match="No companion"):
        build.remove_companion(player)

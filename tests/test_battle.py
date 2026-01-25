import pytest
from conftest import setup_battle_ready

from mtb.models.game import create_game
from mtb.phases import battle


def test_can_start_pairing():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players

    alice.phase = "build"
    bob.phase = "battle"
    assert not battle.can_start_pairing(game, 1, 1)

    alice.phase = "battle"
    assert battle.can_start_pairing(game, 1, 1)

    alice.round = 2
    assert not battle.can_start_pairing(game, 1, 1)


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


def test_end_battle_caps_treasures_and_transitions():
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
    assert alice.phase == "reward"
    assert bob.phase == "reward"


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


def test_end_battle_not_agreed_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, "Alice")

    with pytest.raises(ValueError):
        battle.end(game, b)


def test_end_battle_returns_cards_to_sideboard(card_factory):
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

    assert alice.hand == []
    assert hand_card in alice.sideboard
    assert sideboard_card in alice.sideboard


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


def test_end_battle_with_draw_transitions_to_reward():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, bob)
    battle.submit_result(b, alice, battle.DRAW_RESULT)
    battle.submit_result(b, bob, battle.DRAW_RESULT)

    result = battle.end(game, b)

    assert result.is_draw
    assert alice.phase == "reward"
    assert bob.phase == "reward"

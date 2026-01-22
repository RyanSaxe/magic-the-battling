import pytest

from mtb.models.game import create_game
from mtb.phases import (
    can_start_pairing,
    end_battle,
    find_opponent,
    get_loser,
    get_winner,
    is_in_active_battle,
    move_zone,
    results_agreed,
    start_battle,
    submit_result,
    weighted_random_opponent,
)


def _setup_battle_ready(game, alice, bob):
    """Helper to set up two players ready for battle."""
    alice.phase = "battle"
    bob.phase = "battle"
    alice.chosen_basics = ["Plains", "Plains", "Plains"]
    bob.chosen_basics = ["Island", "Island", "Island"]


def test_can_start_pairing():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players

    alice.phase = "build"
    bob.phase = "battle"
    assert not can_start_pairing(game, 1, 1)

    alice.phase = "battle"
    assert can_start_pairing(game, 1, 1)

    alice.round = 2
    assert not can_start_pairing(game, 1, 1)


def test_find_opponent_returns_candidate():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "battle"

    opponent = find_opponent(game, alice)

    assert opponent is bob


def test_find_opponent_returns_none_when_not_all_ready():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "build"

    opponent = find_opponent(game, alice)

    assert opponent is None


def test_weighted_random_opponent_reduces_last_opponent_weight():
    game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
    alice, bob, charlie = game.players
    alice.last_opponent_name = "Bob"

    counts = {"Bob": 0, "Charlie": 0}
    for _ in range(1000):
        opponent = weighted_random_opponent(alice, [bob, charlie])
        counts[opponent.name] += 1

    assert counts["Charlie"] > counts["Bob"] * 5


def test_start_battle_creates_zones(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)
    alice.hand = [card_factory("a1"), card_factory("a2")]
    alice.sideboard = [card_factory("a3")]
    alice.treasures = 2

    battle = start_battle(game, alice, bob)

    assert battle.player is alice
    assert battle.opponent is bob
    assert battle.coin_flip in (alice, bob)
    assert len(battle.player_zones.battlefield) == 3
    assert len(battle.player_zones.hand) == 2
    assert len(battle.player_zones.sideboard) == 1
    assert battle.player_zones.treasures == 2
    assert battle in game.active_battles
    assert alice.last_opponent_name == "Bob"
    assert bob.last_opponent_name == "Alice"


def test_start_battle_wrong_phase_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "battle"

    with pytest.raises(ValueError, match="not in battle phase"):
        start_battle(game, alice, bob)


def test_start_battle_not_all_ready_raises():
    game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
    alice, bob, charlie = game.players
    alice.phase = "battle"
    bob.phase = "battle"
    charlie.phase = "build"
    alice.chosen_basics = ["Plains", "Plains", "Plains"]
    bob.chosen_basics = ["Island", "Island", "Island"]

    with pytest.raises(ValueError, match="not all players are ready"):
        start_battle(game, alice, bob)


def test_is_in_active_battle():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    assert not is_in_active_battle(game, alice)

    start_battle(game, alice, bob)

    assert is_in_active_battle(game, alice)
    assert is_in_active_battle(game, bob)


def test_move_zone_moves_card(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)
    card = card_factory("test")
    alice.sideboard = [card]

    battle = start_battle(game, alice, bob)
    move_zone(battle, alice, card, "sideboard", "hand")

    assert card not in battle.player_zones.sideboard
    assert card in battle.player_zones.hand


def test_move_zone_card_not_in_zone_raises(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)

    with pytest.raises(ValueError, match="not in"):
        move_zone(battle, alice, card_factory("missing"), "hand", "battlefield")


def test_submit_result_records_winner():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")

    assert battle.result_submissions["Alice"] == "Alice"


def test_results_agreed_when_both_match():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")

    assert results_agreed(battle)
    assert get_winner(battle) is alice
    assert get_loser(battle) is bob


def test_results_not_agreed_when_different():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Bob")

    assert not results_agreed(battle)


def test_end_battle_caps_treasures_and_transitions():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)
    alice.treasures = 10

    battle = start_battle(game, alice, bob)
    battle.player_zones.treasures = 10
    battle.opponent_zones.treasures = 3
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")

    winner, loser = end_battle(game, battle)

    assert winner is alice
    assert loser is bob
    assert alice.treasures == game.config.max_treasures
    assert bob.treasures == 3
    assert alice.phase == "reward"
    assert bob.phase == "reward"
    assert battle not in game.active_battles


def test_end_battle_tracks_revealed_cards(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    battle = start_battle(game, alice, bob)
    move_zone(battle, alice, creature, "hand", "battlefield")
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")

    end_battle(game, battle)

    assert creature in alice.most_recently_revealed_cards


def test_end_battle_not_agreed_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")

    with pytest.raises(ValueError, match="not agreed"):
        end_battle(game, battle)


def test_end_battle_returns_cards_to_sideboard(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    hand_card = card_factory("hand_card")
    sideboard_card = card_factory("sideboard_card")
    alice.hand = [hand_card]
    alice.sideboard = [sideboard_card]

    battle = start_battle(game, alice, bob)
    submit_result(battle, alice, "Alice")
    submit_result(battle, bob, "Alice")
    end_battle(game, battle)

    assert alice.hand == []
    assert hand_card in alice.sideboard
    assert sideboard_card in alice.sideboard

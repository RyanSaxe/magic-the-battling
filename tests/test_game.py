import pytest

from mtb.models.cards import Battler, Card
from mtb.models.game import (
    apply_poison,
    apply_upgrade_to_card,
    award_random_card,
    award_treasure,
    award_vanquisher,
    can_start_pairing,
    count_applied_upgrades,
    create_game,
    deal_pack,
    end_battle,
    end_draft_for_player,
    end_reward_for_player,
    find_opponent,
    get_loser,
    get_winner,
    is_in_active_battle,
    is_stage_increasing,
    move_card,
    move_zone,
    pick_upgrade,
    results_agreed,
    roll,
    set_battler,
    start_battle,
    start_draft,
    start_reward,
    submit_build,
    submit_result,
    swap,
    take,
    weighted_random_opponent,
)


def _card(name: str, type_line: str = "Creature") -> Card:
    return Card(name=name, image_url="image", id=name, type_line=type_line)


def _upgrade(name: str) -> Card:
    return Card(name=name, image_url="image", id=name, type_line="Conspiracy")


# =============================================================================
# create_game tests
# =============================================================================


def test_create_game_exact_players():
    names = ["Alice", "Bob"]
    game = create_game(names, num_players=2)

    assert [player.name for player in game.players] == names
    assert all(player.treasures == game.config.starting_treasures for player in game.players)
    assert all(player.game is game for player in game.players)


def test_create_game_too_many_names():
    with pytest.raises(ValueError):
        create_game(["Alice", "Bob"], num_players=1)


def test_create_game_not_enough_players():
    with pytest.raises(NotImplementedError):
        create_game(["Alice"], num_players=2)


# =============================================================================
# set_battler tests
# =============================================================================


def test_set_battler_selects_available_upgrades():
    game = create_game(["Alice"], num_players=1)
    upgrades = [_upgrade(f"upgrade{i}") for i in range(10)]
    battler = Battler(cards=[_card(f"c{i}") for i in range(20)], upgrades=upgrades, vanguards=[])

    set_battler(game, battler)

    assert game.battler is battler
    assert len(game.available_upgrades) == game.config.max_available_upgrades
    assert all(u in upgrades for u in game.available_upgrades)


def test_set_battler_with_fewer_upgrades_than_max():
    game = create_game(["Alice"], num_players=1)
    upgrades = [_upgrade("u1"), _upgrade("u2")]
    battler = Battler(cards=[_card(f"c{i}") for i in range(20)], upgrades=upgrades, vanguards=[])

    set_battler(game, battler)

    assert len(game.available_upgrades) == 2


def test_set_battler_deals_starting_pool():
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [_card(f"c{i}") for i in range(30)]
    battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    set_battler(game, battler)

    pool_size = game.config.starting_pool_size
    assert len(game.players[0].sideboard) == pool_size
    assert len(game.players[1].sideboard) == pool_size
    assert len(game.battler.cards) == 30 - (2 * pool_size)


# =============================================================================
# Draft tests
# =============================================================================


def test_start_draft_creates_packs_and_deals_to_players():
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [_card(f"c{i}") for i in range(20)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    start_draft(game)

    assert game.draft_state is not None
    assert game.battler.cards == []
    assert "Alice" in game.draft_state.current_packs
    assert "Bob" in game.draft_state.current_packs
    assert len(game.draft_state.current_packs["Alice"]) == game.config.pack_size
    assert len(game.draft_state.current_packs["Bob"]) == game.config.pack_size


def test_start_draft_without_battler_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError, match="no battler"):
        start_draft(game)


def test_start_draft_when_draft_in_progress_raises():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card("c1")], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="already in progress"):
        start_draft(game)


def test_deal_pack_returns_pack_from_pool():
    game = create_game(["Alice"], num_players=1)
    cards = [_card(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    start_draft(game)

    initial_pack_count = len(game.draft_state.packs)
    pack = deal_pack(game, game.players[0])

    assert pack is not None
    assert len(pack) == game.config.pack_size
    assert len(game.draft_state.packs) == initial_pack_count - 1


def test_deal_pack_returns_none_when_no_packs_left():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    start_draft(game)

    game.draft_state.packs = []
    pack = deal_pack(game, game.players[0])

    assert pack is None


def test_deal_pack_without_draft_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError, match="No draft in progress"):
        deal_pack(game, game.players[0])


def test_roll_discards_current_pack_and_deals_new():
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 2
    cards = [_card(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    start_draft(game)

    old_pack = game.draft_state.current_packs["Alice"].copy()
    new_pack = roll(game, game.players[0])

    assert game.players[0].treasures == 1
    assert new_pack is not None
    assert new_pack != old_pack
    assert all(card in game.draft_state.discard for card in old_pack)


def test_roll_without_treasure_raises():
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 0
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="no treasures"):
        roll(game, game.players[0])


def test_roll_returns_none_when_no_packs_left():
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 1
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    start_draft(game)

    game.draft_state.packs = []
    old_pack = game.draft_state.current_packs["Alice"].copy()
    new_pack = roll(game, game.players[0])

    assert new_pack is None
    assert game.players[0].treasures == 0
    assert all(card in game.draft_state.discard for card in old_pack)


def test_swap_exchanges_pack_card_with_player_card():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player_card = _card("player_card")
    player.hand.append(player_card)

    pack_card = game.draft_state.current_packs["Alice"][0]
    swap(game, player, pack_card, player_card, "hand")

    assert pack_card in player.hand
    assert player_card not in player.hand
    assert player_card in game.draft_state.current_packs["Alice"]
    assert pack_card not in game.draft_state.current_packs["Alice"]


def test_swap_works_with_sideboard():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player_card = _card("sideboard_card")
    player.sideboard.append(player_card)

    pack_card = game.draft_state.current_packs["Alice"][0]
    swap(game, player, pack_card, player_card, "sideboard")

    assert pack_card in player.sideboard
    assert player_card in game.draft_state.current_packs["Alice"]


def test_swap_card_not_in_pack_raises():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player.hand.append(_card("player_card"))

    with pytest.raises(ValueError, match="not in player's current pack"):
        swap(game, player, _card("not_in_pack"), _card("player_card"), "hand")


def test_take_moves_card_from_pack_to_player():
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    pack_card = game.draft_state.current_packs["Alice"][0]
    initial_pack_size = len(game.draft_state.current_packs["Alice"])

    take(game, player, pack_card, "hand")

    assert pack_card in player.hand
    assert pack_card not in game.draft_state.current_packs["Alice"]
    assert len(game.draft_state.current_packs["Alice"]) == initial_pack_size - 1


def test_take_to_upgrades():
    game = create_game(["Alice"], num_players=1)
    upgrade_card = _card("upgrade", type_line="Conspiracy")
    game.battler = Battler(cards=[upgrade_card] + [_card(f"c{i}") for i in range(9)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    if upgrade_card in game.draft_state.current_packs["Alice"]:
        take(game, player, upgrade_card, "upgrades")
        assert upgrade_card in player.upgrades


def test_end_draft_for_player_moves_to_build():
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [_card(f"c{i}") for i in range(25)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    start_draft(game)

    taken_card = game.draft_state.current_packs["Alice"][0]
    take(game, alice, taken_card, "hand")

    end_draft_for_player(game, alice)

    assert alice.phase == "build"
    assert "Alice" not in game.draft_state.current_packs
    assert game.draft_state is not None  # Bob still drafting

    end_draft_for_player(game, bob)

    assert bob.phase == "build"
    assert game.draft_state is None  # Draft cleaned up when all done


def test_end_draft_for_player_not_in_draft_raises():
    game = create_game(["Alice"], num_players=1)
    game.players[0].phase = "build"
    game.battler = Battler(cards=[_card("c1")], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="not in draft phase"):
        end_draft_for_player(game, game.players[0])


def test_full_draft_flow():
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [_card(f"c{i}") for i in range(30)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    total_cards = len(cards)

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    start_draft(game)

    alice.treasures = 2
    bob.treasures = 1

    alice_card = game.draft_state.current_packs["Alice"][0]
    take(game, alice, alice_card, "hand")

    roll(game, alice)
    alice_card_2 = game.draft_state.current_packs["Alice"][0]
    take(game, alice, alice_card_2, "sideboard")

    bob_card = game.draft_state.current_packs["Bob"][0]
    take(game, bob, bob_card, "hand")

    end_draft_for_player(game, alice)
    end_draft_for_player(game, bob)

    assert len(alice.hand) == 1
    assert len(alice.sideboard) == 1
    assert len(bob.hand) == 1
    assert alice.treasures == 1
    assert bob.treasures == 1
    assert alice.phase == "build"
    assert bob.phase == "build"

    player_cards = len(alice.hand) + len(alice.sideboard) + len(bob.hand)
    assert len(game.battler.cards) + player_cards == total_cards


# =============================================================================
# Build phase tests
# =============================================================================


def test_move_card_between_hand_and_sideboard():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = _card("test")
    player.hand.append(card)

    move_card(player, card, "hand", "sideboard")

    assert card not in player.hand
    assert card in player.sideboard


def test_move_card_same_source_destination_noop():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = _card("test")
    player.hand.append(card)

    move_card(player, card, "hand", "hand")

    assert card in player.hand


def test_move_card_not_in_source_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    card = _card("test")

    with pytest.raises(ValueError, match="not in player's"):
        move_card(player, card, "hand", "sideboard")


def test_submit_build_transitions_to_battle():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"
    player.hand = [_card(f"c{i}") for i in range(3)]

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


def test_submit_build_hand_exceeds_size_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.phase = "build"
    player.hand = [_card(f"c{i}") for i in range(10)]

    with pytest.raises(ValueError, match="exceeds maximum"):
        submit_build(game, player, ["Plains", "Island", "Mountain"])


# =============================================================================
# Battle phase tests
# =============================================================================


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


def test_start_battle_creates_zones():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)
    alice.hand = [_card("a1"), _card("a2")]
    alice.sideboard = [_card("a3")]
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


def test_move_zone_moves_card():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)
    card = _card("test")
    alice.sideboard = [card]

    battle = start_battle(game, alice, bob)
    move_zone(battle, alice, card, "sideboard", "hand")

    assert card not in battle.player_zones.sideboard
    assert card in battle.player_zones.hand


def test_move_zone_card_not_in_zone_raises():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    battle = start_battle(game, alice, bob)

    with pytest.raises(ValueError, match="not in"):
        move_zone(battle, alice, _card("missing"), "hand", "battlefield")


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


def test_end_battle_tracks_revealed_cards():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    _setup_battle_ready(game, alice, bob)

    creature = _card("Creature", "Creature")
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


# =============================================================================
# Reward phase tests
# =============================================================================


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


def test_count_applied_upgrades():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]

    u1 = _upgrade("u1")
    u2 = _upgrade("u2")
    u3 = _upgrade("u3")
    player.upgrades = [u1, u2, u3]

    assert count_applied_upgrades(player) == 0

    target = _card("target")
    u1.upgrade_target = target
    assert count_applied_upgrades(player) == 1

    u2.upgrade_target = _card("target2")
    assert count_applied_upgrades(player) == 2


def test_apply_poison():
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players

    u1 = _upgrade("u1")
    u1.upgrade_target = _card("t1")
    alice.upgrades = [u1]

    poison = apply_poison(alice, bob)

    assert poison == 2
    assert bob.poison == 2


def test_award_treasure():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.treasures = 3

    award_treasure(player)

    assert player.treasures == 4


def test_award_random_card():
    game = create_game(["Alice"], num_players=1)
    cards = [_card(f"c{i}") for i in range(5)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    player = game.players[0]

    card = award_random_card(game, player)

    assert card is not None
    assert card in player.sideboard
    assert card not in game.battler.cards
    assert len(game.battler.cards) == 4


def test_award_vanquisher():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.vanquishers = 1

    award_vanquisher(player)

    assert player.vanquishers == 2


def test_pick_upgrade():
    game = create_game(["Alice"], num_players=1)
    upgrade = _upgrade("power_boost")
    game.available_upgrades = [upgrade]
    player = game.players[0]

    pick_upgrade(game, player, upgrade)

    assert len(player.upgrades) == 1
    assert player.upgrades[0].name == "power_boost"
    assert player.upgrades[0] is not upgrade


def test_pick_upgrade_not_available_raises():
    game = create_game(["Alice"], num_players=1)
    game.available_upgrades = [_upgrade("u1")]
    player = game.players[0]

    with pytest.raises(ValueError, match="not available"):
        pick_upgrade(game, player, _upgrade("u2"))


def test_apply_upgrade_to_card():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = _upgrade("power")
    target = _card("creature")
    player.upgrades = [upgrade]
    player.hand = [target]

    apply_upgrade_to_card(player, upgrade, target)

    assert upgrade.upgrade_target is target


def test_apply_upgrade_to_card_already_applied_raises():
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    upgrade = _upgrade("power")
    upgrade.upgrade_target = _card("old_target")
    player.upgrades = [upgrade]

    with pytest.raises(ValueError, match="already been applied"):
        apply_upgrade_to_card(player, upgrade, _card("new_target"))


def test_start_reward_standard():
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [_card(f"c{i}") for i in range(10)]
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


def test_start_reward_stage_increase_gives_vanquisher():
    game = create_game(["Alice", "Bob"], num_players=2)
    game.config.num_rounds_per_stage = 3
    game.battler = Battler(cards=[_card("c1")], upgrades=[], vanguards=[])
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


def test_end_reward_for_player_stage_increase():
    game = create_game(["Alice"], num_players=1)
    game.config.num_rounds_per_stage = 3
    upgrade = _upgrade("power")
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


# =============================================================================
# Full game flow test
# =============================================================================


def test_full_round_flow_round_1():
    """Round 1 starts in build phase (no draft), then goes to draft for round 2."""
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [_upgrade(f"u{i}") for i in range(4)]
    battler = Battler(cards=[_card(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
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


def test_full_round_flow_round_2():
    """Round 2+ starts with draft phase."""
    game = create_game(["Alice", "Bob"], num_players=2)
    upgrades = [_upgrade(f"u{i}") for i in range(4)]
    battler = Battler(cards=[_card(f"c{i}") for i in range(50)], upgrades=upgrades, vanguards=[])
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

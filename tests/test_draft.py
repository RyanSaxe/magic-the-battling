import pytest

from mtb.models.cards import Battler
from mtb.models.game import create_game
from mtb.phases import draft


def test_start_draft_creates_packs_and_deals_to_players(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(20)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)

    assert game.draft_state is not None
    assert game.get_battler().cards == []
    assert "Alice" in game.get_draft_state().current_packs
    assert "Bob" in game.get_draft_state().current_packs
    assert len(game.get_draft_state().current_packs["Alice"]) == game.config.pack_size
    assert len(game.get_draft_state().current_packs["Bob"]) == game.config.pack_size


def test_start_draft_without_battler_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError):
        draft.start(game)


def test_start_draft_when_draft_in_progress_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError):
        draft.start(game)


def test_deal_pack_returns_pack(card_factory):
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    pack = draft.deal_pack(game, game.players[0])

    assert pack is not None
    assert len(pack) == game.config.pack_size


def test_deal_pack_returns_none_when_no_packs_left(card_factory):
    game = create_game(["Alice"], num_players=1)
    # Exactly pack_size cards means 1 pack, dealt on start(), leaving none
    cards = [card_factory(f"c{i}") for i in range(game.config.pack_size)]
    game.battler = Battler(cards=cards, upgrades=[], vanguards=[])
    draft.start(game)

    pack = draft.deal_pack(game, game.players[0])

    assert pack is None


def test_deal_pack_without_draft_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError):
        draft.deal_pack(game, game.players[0])


def test_roll_spends_treasure_and_deals_new_pack(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 2
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    old_pack = game.get_draft_state().current_packs["Alice"].copy()
    new_pack = draft.roll(game, game.players[0])

    assert game.players[0].treasures == 1
    assert new_pack is not None
    assert new_pack != old_pack


def test_roll_without_treasure_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 0
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError):
        draft.roll(game, game.players[0])


def test_roll_returns_none_when_no_packs_left(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 1
    # Exactly pack_size cards means 1 pack, dealt on start(), leaving none for roll
    cards = [card_factory(f"c{i}") for i in range(game.config.pack_size)]
    game.battler = Battler(cards=cards, upgrades=[], vanguards=[])
    draft.start(game)

    new_pack = draft.roll(game, game.players[0])

    assert new_pack is None
    assert game.players[0].treasures == 0


def test_swap_exchanges_pack_card_with_player_card(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    player = game.players[0]
    player_card = card_factory("player_card")
    player.hand.append(player_card)

    pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, player, pack_card, player_card, "hand")

    assert pack_card in player.hand
    assert player_card not in player.hand
    assert player_card in game.get_draft_state().current_packs["Alice"]
    assert pack_card not in game.get_draft_state().current_packs["Alice"]


def test_swap_works_with_sideboard(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    player = game.players[0]
    player_card = card_factory("sideboard_card")
    player.sideboard.append(player_card)

    pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, player, pack_card, player_card, "sideboard")

    assert pack_card in player.sideboard
    assert player_card in game.get_draft_state().current_packs["Alice"]


def test_swap_card_not_in_pack_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    player = game.players[0]
    player.hand.append(card_factory("player_card"))

    with pytest.raises(ValueError):
        draft.swap(game, player, card_factory("not_in_pack"), card_factory("player_card"), "hand")


def test_end_draft_for_player_moves_to_build(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(25)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    draft.start(game)

    alice_card = card_factory("alice_card")
    alice.hand.append(alice_card)
    pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, pack_card, alice_card, "hand")

    draft.end_for_player(game, alice)

    assert alice.phase == "build"
    assert "Alice" not in game.get_draft_state().current_packs
    assert game.draft_state is not None  # Bob still drafting

    draft.end_for_player(game, bob)

    assert bob.phase == "build"
    assert game.draft_state is None  # Draft cleaned up when all done


def test_end_draft_for_player_not_in_draft_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].phase = "build"
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError):
        draft.end_for_player(game, game.players[0])


def test_full_draft_flow(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(30)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    draft.start(game)

    alice.treasures = 2
    bob.treasures = 1

    alice_swap_card_1 = card_factory("alice_swap_1")
    alice.hand.append(alice_swap_card_1)
    alice_pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, alice_pack_card, alice_swap_card_1, "hand")

    draft.roll(game, alice)
    alice_swap_card_2 = card_factory("alice_swap_2")
    alice.sideboard.append(alice_swap_card_2)
    alice_pack_card_2 = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, alice_pack_card_2, alice_swap_card_2, "sideboard")

    bob_swap_card = card_factory("bob_swap")
    bob.hand.append(bob_swap_card)
    bob_pack_card = game.get_draft_state().current_packs["Bob"][0]
    draft.swap(game, bob, bob_pack_card, bob_swap_card, "hand")

    # Add more cards with varying ELO to test hand population
    # hand_size is 3, so top 3 by ELO should end up in hand
    high_elo = card_factory("high_elo")
    high_elo.elo = 100.0
    mid_elo = card_factory("mid_elo")
    mid_elo.elo = 50.0
    low_elo = card_factory("low_elo")
    low_elo.elo = 10.0
    alice_pack_card.elo = 80.0
    alice_pack_card_2.elo = 5.0
    alice.sideboard.extend([high_elo, mid_elo, low_elo])

    draft.end_for_player(game, alice)
    draft.end_for_player(game, bob)

    # Highest ELO cards should be in hand (high_elo=100, alice_pack_card=80, mid_elo=50)
    assert high_elo in alice.hand
    assert alice_pack_card in alice.hand
    assert mid_elo in alice.hand
    # Lower ELO cards should be in sideboard
    assert low_elo in alice.sideboard
    assert alice_pack_card_2 in alice.sideboard
    assert bob_pack_card in bob.hand
    assert alice.treasures == 1
    assert bob.treasures == 1
    assert alice.phase == "build"
    assert bob.phase == "build"


def test_start_draft_discards_remainder_cards(card_factory):
    """All packs must have exactly pack_size cards - remainders are discarded."""
    game = create_game(["Alice", "Bob"], num_players=2)
    pack_size = game.config.pack_size
    # 23 cards with pack_size=5 should create 4 packs (20 cards), discarding 3
    cards = [card_factory(f"c{i}") for i in range(23)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)

    all_packs = [
        *game.get_draft_state().packs,
        game.get_draft_state().current_packs["Alice"],
        game.get_draft_state().current_packs["Bob"],
    ]
    for pack in all_packs:
        assert len(pack) == pack_size


def test_start_draft_all_packs_correct_size(card_factory):
    """Every pack created during draft has exactly config.pack_size cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    pack_size = game.config.pack_size
    # 27 cards: 5 full packs = 25 cards, 2 remainder discarded
    cards = [card_factory(f"c{i}") for i in range(27)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)

    # 2 packs dealt to players, 3 remaining
    assert len(game.get_draft_state().packs) == 3
    for pack in game.get_draft_state().packs:
        assert len(pack) == pack_size
    assert len(game.get_draft_state().current_packs["Alice"]) == pack_size
    assert len(game.get_draft_state().current_packs["Bob"]) == pack_size


def test_start_draft_excludes_eliminated_players(card_factory):
    """Draft should not deal packs to eliminated players (ghosts)."""
    game = create_game(["Alice", "Bob", "Charlie", "Dana"], num_players=4)
    cards = [card_factory(f"c{i}") for i in range(30)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob, charlie, dana = game.players
    alice.phase = "draft"
    bob.phase = "draft"
    charlie.phase = "draft"
    dana.phase = "eliminated"

    draft.start(game)

    assert "Alice" in game.get_draft_state().current_packs
    assert "Bob" in game.get_draft_state().current_packs
    assert "Charlie" in game.get_draft_state().current_packs
    assert "Dana" not in game.get_draft_state().current_packs


def test_draft_cleanup_with_eliminated_player(card_factory):
    """Draft cleanup should run when all live players finish, ignoring eliminated."""
    game = create_game(["Alice", "Bob", "Charlie", "Dana"], num_players=4)
    cards = [card_factory(f"c{i}") for i in range(30)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob, charlie, dana = game.players
    alice.phase = "draft"
    bob.phase = "draft"
    charlie.phase = "draft"
    dana.phase = "eliminated"

    draft.start(game)

    draft.end_for_player(game, alice)
    assert game.draft_state is not None

    draft.end_for_player(game, bob)
    assert game.draft_state is not None

    draft.end_for_player(game, charlie)
    assert game.draft_state is None
    assert game.battler.cards != []

import pytest

from mtb.models.cards import Battler
from mtb.models.game import create_game
from mtb.phases import draft


def test_start_draft_creates_packs_without_dealing(card_factory):
    """draft.start() should create packs but NOT deal them to players."""
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(20)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)

    assert game.draft_state is not None
    assert len(game.get_draft_state().packs) == 4  # 20 cards / 5 pack_size = 4 packs
    assert game.get_draft_state().current_packs == {}  # No packs dealt
    assert game.get_battler().cards == []  # All cards used for packs


def test_start_draft_keeps_leftover_cards_in_battler(card_factory):
    """draft.start() should keep leftover cards (not enough for a full pack) in battler."""
    game = create_game(["Alice"], num_players=1)
    pack_size = game.config.pack_size
    # 23 cards with pack_size=5 should create 4 packs (20 cards), leaving 3 in battler
    cards = [card_factory(f"c{i}") for i in range(23)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)

    assert len(game.get_draft_state().packs) == 4
    assert len(game.get_battler().cards) == 3
    for pack in game.get_draft_state().packs:
        assert len(pack) == pack_size


def test_start_draft_without_battler_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError):
        draft.start(game)


def test_start_draft_when_draft_in_progress_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError):
        draft.start(game)


def test_deal_pack_to_player_deals_from_packs(card_factory):
    """deal_pack_to_player() should deal a pack to the specified player."""
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    pack = draft.deal_pack_to_player(game, game.players[0])

    assert pack is not None
    assert len(pack) == game.config.pack_size
    assert "Alice" in game.get_draft_state().current_packs
    assert game.get_draft_state().current_packs["Alice"] == pack


def test_deal_pack_to_player_creates_packs_when_empty(card_factory):
    """deal_pack_to_player() should create more packs from battler if draft.packs is empty."""
    game = create_game(["Alice", "Bob"], num_players=2)
    pack_size = game.config.pack_size
    # Start with 10 cards (2 packs)
    cards = [card_factory(f"c{i}") for i in range(pack_size * 2)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    # Deal all packs
    draft.deal_pack_to_player(game, game.players[0])
    draft.deal_pack_to_player(game, game.players[1])

    assert len(game.get_draft_state().packs) == 0

    # Add more cards to battler
    more_cards = [card_factory(f"more{i}") for i in range(pack_size * 2)]
    game.battler.cards.extend(more_cards)

    # Now deal_pack_to_player should create packs from battler
    pack = draft.deal_pack_to_player(game, game.players[0])

    assert pack is not None
    assert len(pack) == pack_size


def test_deal_pack_to_player_without_draft_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError):
        draft.deal_pack_to_player(game, game.players[0])


def test_deal_pack_legacy_returns_none_when_no_packs(card_factory):
    """Legacy deal_pack() should return None when no packs are left."""
    game = create_game(["Alice"], num_players=1)
    pack_size = game.config.pack_size
    cards = [card_factory(f"c{i}") for i in range(pack_size)]
    game.battler = Battler(cards=cards, upgrades=[], vanguards=[])
    draft.start(game)

    # Deal the only pack
    pack1 = draft.deal_pack(game, game.players[0])
    assert pack1 is not None

    # No more packs available
    pack2 = draft.deal_pack(game, game.players[0])
    assert pack2 is None


def test_roll_returns_pack_to_battler_and_deals_new(card_factory):
    """roll() should return the old pack to battler.cards and deal a new pack."""
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 2
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    draft.deal_pack_to_player(game, game.players[0])
    old_pack = game.get_draft_state().current_packs["Alice"].copy()
    battler_cards_before = len(game.battler.cards)

    new_pack = draft.roll(game, game.players[0])

    assert game.players[0].treasures == 1
    assert new_pack != old_pack
    # Old pack should be in battler.cards now (5 cards added)
    assert len(game.battler.cards) == battler_cards_before + 5


def test_roll_always_succeeds_by_creating_packs(card_factory):
    """roll() should always succeed by creating packs from battler if needed."""
    game = create_game(["Alice"], num_players=1)
    player = game.players[0]
    player.treasures = 3
    pack_size = game.config.pack_size
    # Start with exactly one pack worth of cards
    cards = [card_factory(f"c{i}") for i in range(pack_size)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    draft.start(game)

    # Deal the only pack
    draft.deal_pack_to_player(game, player)
    assert len(game.get_draft_state().packs) == 0

    # Roll should return pack to battler and create new packs
    new_pack = draft.roll(game, player)

    assert new_pack is not None
    assert len(new_pack) == pack_size
    assert player.treasures == 2


def test_roll_without_treasure_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 0
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)
    draft.deal_pack_to_player(game, game.players[0])

    with pytest.raises(ValueError):
        draft.roll(game, game.players[0])


def test_roll_without_current_pack_raises(card_factory):
    """roll() should raise if player has no current pack."""
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 1
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)
    # Don't deal a pack

    with pytest.raises(ValueError, match="no current pack"):
        draft.roll(game, game.players[0])


def test_swap_exchanges_pack_card_with_player_card(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)
    draft.deal_pack_to_player(game, game.players[0])

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
    draft.deal_pack_to_player(game, game.players[0])

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
    draft.deal_pack_to_player(game, game.players[0])

    player = game.players[0]
    player.hand.append(card_factory("player_card"))

    with pytest.raises(ValueError):
        draft.swap(game, player, card_factory("not_in_pack"), card_factory("player_card"), "hand")


def test_end_for_player_returns_pack_to_battler(card_factory):
    """end_for_player() should return player's pack to battler.cards."""
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(10)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice = game.players[0]
    alice.phase = "draft"

    draft.start(game)
    draft.deal_pack_to_player(game, alice)

    # Add a card to hand so populate_hand has something to work with
    alice.hand.append(card_factory("alice_card"))

    battler_cards_before = len(game.battler.cards)
    draft.end_for_player(game, alice)

    assert alice.phase == "build"
    assert "Alice" not in game.get_draft_state().current_packs
    # Pack (5 cards) should be returned to battler
    assert len(game.battler.cards) == battler_cards_before + 5


def test_end_for_player_does_not_cleanup_draft(card_factory):
    """end_for_player() should NOT cleanup draft state - cleanup happens at pairing time."""
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(25)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    draft.start(game)
    draft.deal_pack_to_player(game, alice)
    draft.deal_pack_to_player(game, bob)

    draft.end_for_player(game, alice)
    assert game.draft_state is not None  # Still not cleaned up

    draft.end_for_player(game, bob)
    assert game.draft_state is not None  # Still not cleaned up - cleanup is explicit now


def test_end_draft_for_player_not_in_draft_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].phase = "build"
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError):
        draft.end_for_player(game, game.players[0])


def test_cleanup_draft_returns_all_cards_to_battler(card_factory):
    """cleanup_draft() should return all undrafted packs and orphan current_packs to battler."""
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(25)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    draft.start(game)
    draft.deal_pack_to_player(game, game.players[0])
    # Don't deal to Bob - leave an orphan current_pack for Alice

    total_cards_in_draft = len(game.get_draft_state().packs) * game.config.pack_size + sum(
        len(p) for p in game.get_draft_state().current_packs.values()
    )
    battler_cards_before = len(game.battler.cards)

    draft.cleanup_draft(game)

    assert game.draft_state is None
    assert len(game.battler.cards) == battler_cards_before + total_cards_in_draft


def test_cleanup_draft_with_no_draft_is_safe(card_factory):
    """cleanup_draft() should be safe to call when there's no draft."""
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])

    # No draft started
    draft.cleanup_draft(game)  # Should not raise


def test_full_draft_flow(card_factory):
    """Test complete draft flow with the new architecture."""
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(30)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"
    alice.treasures = 2
    bob.treasures = 1

    # Start draft (creates packs but doesn't deal)
    draft.start(game)

    # Deal packs to players when they enter draft
    draft.deal_pack_to_player(game, alice)
    draft.deal_pack_to_player(game, bob)

    # Alice swaps a card
    alice_swap_card_1 = card_factory("alice_swap_1")
    alice.hand.append(alice_swap_card_1)
    alice_pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, alice_pack_card, alice_swap_card_1, "hand")

    # Alice rolls
    draft.roll(game, alice)
    alice_swap_card_2 = card_factory("alice_swap_2")
    alice.sideboard.append(alice_swap_card_2)
    alice_pack_card_2 = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, alice, alice_pack_card_2, alice_swap_card_2, "sideboard")

    # Bob swaps
    bob_swap_card = card_factory("bob_swap")
    bob.hand.append(bob_swap_card)
    bob_pack_card = game.get_draft_state().current_packs["Bob"][0]
    draft.swap(game, bob, bob_pack_card, bob_swap_card, "hand")

    # Add cards with ELO for hand population testing
    high_elo = card_factory("high_elo")
    high_elo.elo = 100.0
    mid_elo = card_factory("mid_elo")
    mid_elo.elo = 50.0
    low_elo = card_factory("low_elo")
    low_elo.elo = 10.0
    alice_pack_card.elo = 80.0
    alice_pack_card_2.elo = 5.0
    alice.sideboard.extend([high_elo, mid_elo, low_elo])

    # End draft for both
    draft.end_for_player(game, alice)
    draft.end_for_player(game, bob)

    # Hand starts empty; all cards in sideboard
    assert len(alice.hand) == 0
    assert all(c in alice.sideboard for c in [high_elo, alice_pack_card, mid_elo, low_elo, alice_pack_card_2])
    assert bob_pack_card in bob.sideboard
    assert alice.treasures == 1
    assert bob.treasures == 1
    assert alice.phase == "build"
    assert bob.phase == "build"

    # Cleanup (normally done at pairing time)
    draft.cleanup_draft(game)
    assert game.draft_state is None
    # Battler should have cards back
    assert len(game.battler.cards) > 0


def test_battler_elo_is_static(card_factory):
    """Battler.elo should be static and not change when cards are removed."""
    cards = [card_factory(f"c{i}") for i in range(10)]
    for i, card in enumerate(cards):
        card.elo = float(i * 10)  # 0, 10, 20, ... 90

    expected_elo = sum(c.elo for c in cards) / len(cards)  # 45.0
    battler = Battler(cards=cards, upgrades=[], vanguards=[], elo=expected_elo)

    assert battler.elo == expected_elo

    # Remove all cards
    battler.cards = []

    # ELO should remain unchanged (no ZeroDivisionError)
    assert battler.elo == expected_elo


def test_swap_clears_command_zone_when_companion_swapped_back(card_factory):
    """Swapping a companion back to pack should clear command_zone."""
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)
    draft.deal_pack_to_player(game, game.players[0])

    player = game.players[0]
    companion = card_factory("companion_card")
    player.sideboard.append(companion)
    player.command_zone.append(companion)

    pack_card = game.get_draft_state().current_packs["Alice"][0]
    draft.swap(game, player, pack_card, companion, "sideboard")

    assert pack_card in player.sideboard
    assert companion in game.get_draft_state().current_packs["Alice"]
    assert player.command_zone == []

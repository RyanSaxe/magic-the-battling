import pytest

from mtb.models.cards import Battler
from mtb.models.game import create_game
from mtb.phases import deal_pack, end_draft_for_player, roll, start_draft, swap, take


def test_start_draft_creates_packs_and_deals_to_players(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(20)]
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


def test_start_draft_when_draft_in_progress_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="already in progress"):
        start_draft(game)


def test_deal_pack_returns_pack_from_pool(card_factory):
    game = create_game(["Alice"], num_players=1)
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    start_draft(game)

    initial_pack_count = len(game.draft_state.packs)
    pack = deal_pack(game, game.players[0])

    assert pack is not None
    assert len(pack) == game.config.pack_size
    assert len(game.draft_state.packs) == initial_pack_count - 1


def test_deal_pack_returns_none_when_no_packs_left(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    start_draft(game)

    game.draft_state.packs = []
    pack = deal_pack(game, game.players[0])

    assert pack is None


def test_deal_pack_without_draft_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError, match="No draft in progress"):
        deal_pack(game, game.players[0])


def test_roll_discards_current_pack_and_deals_new(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 2
    cards = [card_factory(f"c{i}") for i in range(15)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])
    start_draft(game)

    old_pack = game.draft_state.current_packs["Alice"].copy()
    new_pack = roll(game, game.players[0])

    assert game.players[0].treasures == 1
    assert new_pack is not None
    assert new_pack != old_pack
    assert all(card in game.draft_state.discard for card in old_pack)


def test_roll_without_treasure_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 0
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="no treasures"):
        roll(game, game.players[0])


def test_roll_returns_none_when_no_packs_left(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 1
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    start_draft(game)

    game.draft_state.packs = []
    old_pack = game.draft_state.current_packs["Alice"].copy()
    new_pack = roll(game, game.players[0])

    assert new_pack is None
    assert game.players[0].treasures == 0
    assert all(card in game.draft_state.discard for card in old_pack)


def test_swap_exchanges_pack_card_with_player_card(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player_card = card_factory("player_card")
    player.hand.append(player_card)

    pack_card = game.draft_state.current_packs["Alice"][0]
    swap(game, player, pack_card, player_card, "hand")

    assert pack_card in player.hand
    assert player_card not in player.hand
    assert player_card in game.draft_state.current_packs["Alice"]
    assert pack_card not in game.draft_state.current_packs["Alice"]


def test_swap_works_with_sideboard(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player_card = card_factory("sideboard_card")
    player.sideboard.append(player_card)

    pack_card = game.draft_state.current_packs["Alice"][0]
    swap(game, player, pack_card, player_card, "sideboard")

    assert pack_card in player.sideboard
    assert player_card in game.draft_state.current_packs["Alice"]


def test_swap_card_not_in_pack_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    player.hand.append(card_factory("player_card"))

    with pytest.raises(ValueError, match="not in player's current pack"):
        swap(game, player, card_factory("not_in_pack"), card_factory("player_card"), "hand")


def test_take_moves_card_from_pack_to_player(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    pack_card = game.draft_state.current_packs["Alice"][0]
    initial_pack_size = len(game.draft_state.current_packs["Alice"])

    take(game, player, pack_card, "hand")

    assert pack_card in player.hand
    assert pack_card not in game.draft_state.current_packs["Alice"]
    assert len(game.draft_state.current_packs["Alice"]) == initial_pack_size - 1


def test_take_to_upgrades(card_factory):
    game = create_game(["Alice"], num_players=1)
    upgrade_card = card_factory("upgrade", type_line="Conspiracy")
    game.battler = Battler(cards=[upgrade_card] + [card_factory(f"c{i}") for i in range(9)], upgrades=[], vanguards=[])
    start_draft(game)

    player = game.players[0]
    if upgrade_card in game.draft_state.current_packs["Alice"]:
        take(game, player, upgrade_card, "upgrades")
        assert upgrade_card in player.upgrades


def test_end_draft_for_player_moves_to_build(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(25)]
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


def test_end_draft_for_player_not_in_draft_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].phase = "build"
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    start_draft(game)

    with pytest.raises(ValueError, match="not in draft phase"):
        end_draft_for_player(game, game.players[0])


def test_full_draft_flow(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(30)]
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

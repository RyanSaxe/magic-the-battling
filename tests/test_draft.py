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

    with pytest.raises(ValueError, match="no battler"):
        draft.start(game)


def test_start_draft_when_draft_in_progress_raises(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory("c1")], upgrades=[], vanguards=[])
    draft.start(game)

    with pytest.raises(ValueError, match="already in progress"):
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
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    draft.start(game)

    game.get_draft_state().packs = []
    pack = draft.deal_pack(game, game.players[0])

    assert pack is None


def test_deal_pack_without_draft_raises():
    game = create_game(["Alice"], num_players=1)

    with pytest.raises(ValueError, match="No draft in progress"):
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

    with pytest.raises(ValueError, match="no treasures"):
        draft.roll(game, game.players[0])


def test_roll_returns_none_when_no_packs_left(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.players[0].treasures = 1
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(5)], upgrades=[], vanguards=[])
    draft.start(game)

    game.get_draft_state().packs = []
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

    with pytest.raises(ValueError, match="not in player's current pack"):
        draft.swap(game, player, card_factory("not_in_pack"), card_factory("player_card"), "hand")


def test_take_moves_card_from_pack_to_player(card_factory):
    game = create_game(["Alice"], num_players=1)
    game.battler = Battler(cards=[card_factory(f"c{i}") for i in range(10)], upgrades=[], vanguards=[])
    draft.start(game)

    player = game.players[0]
    pack_card = game.get_draft_state().current_packs["Alice"][0]

    draft.take(game, player, pack_card, "hand")

    assert pack_card in player.hand


def test_end_draft_for_player_moves_to_build(card_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    cards = [card_factory(f"c{i}") for i in range(25)]
    game.battler = Battler(cards=cards.copy(), upgrades=[], vanguards=[])

    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "draft"

    draft.start(game)

    taken_card = game.get_draft_state().current_packs["Alice"][0]
    draft.take(game, alice, taken_card, "hand")

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

    with pytest.raises(ValueError, match="not in draft phase"):
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

    alice_card = game.get_draft_state().current_packs["Alice"][0]
    draft.take(game, alice, alice_card, "hand")

    draft.roll(game, alice)
    alice_card_2 = game.get_draft_state().current_packs["Alice"][0]
    draft.take(game, alice, alice_card_2, "sideboard")

    bob_card = game.get_draft_state().current_packs["Bob"][0]
    draft.take(game, bob, bob_card, "hand")

    draft.end_for_player(game, alice)
    draft.end_for_player(game, bob)

    assert alice_card in alice.hand
    assert alice_card_2 in alice.sideboard
    assert bob_card in bob.hand
    assert alice.treasures == 1
    assert bob.treasures == 1
    assert alice.phase == "build"
    assert bob.phase == "build"

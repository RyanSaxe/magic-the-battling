import pytest

from mtb.models.cards import Battler, Card
from mtb.models.game import Draft, Game, RealPlayer, create_game, deal


def _card(name: str) -> Card:
    return Card(name=name, image_url="image", id=name, type_line="creature")


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


def test_deal_without_battler_raises():
    game = create_game(["Alice"], num_players=1)
    player = RealPlayer(**game.players[0].model_dump(), battler=Battler(cards=[], upgrades=[], vanguards=[]))
    draft = Draft(player=player, pack=[_card("c1")])

    with pytest.raises(ValueError):
        deal(game, draft)


def test_deal_with_roll_consumes_treasure_and_replaces_pack():
    game = create_game(["Alice"], num_players=1)
    battler_cards = [_card(f"c{i}") for i in range(1, 11)]
    game.battler = Battler(cards=battler_cards.copy(), upgrades=[], vanguards=[])
    player = RealPlayer(**game.players[0].model_dump(), battler=game.battler)
    draft = Draft(player=player, pack=[_card("old")])

    original_treasures = player.treasures

    result = deal(game, draft, roll=True)

    assert result.player.treasures == original_treasures - 1
    assert len(result.pack) == game.config.pack_size
    assert all(card.id != "old" for card in result.pack)
    expected_remaining = len(battler_cards) + 1 - game.config.pack_size
    assert len(game.battler.cards) == expected_remaining


def test_deal_roll_without_treasure_no_change():
    game = create_game(["Alice"], num_players=1)
    base_player = game.players[0]
    base_player.treasures = 0
    game.battler = Battler(cards=[_card(f"c{i}") for i in range(1, 6)], upgrades=[], vanguards=[])
    player = RealPlayer(**base_player.model_dump(), battler=game.battler)
    draft = Draft(player=player, pack=[_card("only")])

    result = deal(game, draft, roll=True)

    assert result.player.treasures == 0
    assert len(result.pack) == 1
    assert result.pack[0].id == "only"

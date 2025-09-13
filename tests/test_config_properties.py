import pytest
from mtb.models.game import create_game, Config, Game, Player
from mtb.models.cards import Card


def test_default_config_game_creation():
    game = create_game(["Alice", "Bob"], 2)
    
    assert game.config.starting_life == 10
    assert game.config.starting_treasures == 1
    
    alice, bob = game.players
    assert alice.starting_life == 10
    assert bob.starting_life == 10
    assert alice.treasures == 1
    assert bob.treasures == 1


def test_custom_config_properties():
    custom_config = Config(starting_life=15, starting_treasures=3)
    players = [Player(name="Charlie", treasures=custom_config.starting_treasures)]
    game = Game(players=players, config=custom_config)
    
    charlie = game.players[0]
    assert game.config.starting_life == 15
    assert game.config.starting_treasures == 3
    assert charlie.starting_life == 15
    assert charlie.treasures == 3


def test_vanguard_modifier_with_config():
    vanguard_card = Card(
        id="test", name="Test Vanguard", image_url="", type_line="Vanguard", 
        elo=1000
    )
    custom_config = Config(starting_life=12)
    players = [Player(name="Dave", treasures=1, vanguard=vanguard_card)]
    game = Game(players=players, config=custom_config)
    
    dave = game.players[0]
    assert game.config.starting_life == 12
    assert dave.vanguard.name == "Test Vanguard"
    # Since Card doesn't have ability_value, vanguard won't modify starting_life
    assert dave.starting_life == 12  # just the config value


def test_game_reference_is_set():
    game = create_game(["Player1"], 1)
    player = game.players[0]
    
    assert player.game_ref is not None
    assert player.game is game
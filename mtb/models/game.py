from pydantic import BaseModel, Field

from mtb.models.cards import Battler, Card


# TODO: think if the abstraction should have Battler on player to adapt to the
#       constructed variant of the game!
class Player(BaseModel):
    name: str
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None
    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0

class RealPlayer(Player):
    battler: Battler

# Fake Class for being able to play single player
class FakePlayer(BaseModel):
    historic_game_id: str

# TODO: abstract to let players have their own battlers
# NOTE: possible commanders in the above TODO require extra refactoring later
class Game(BaseModel):
    players: list[Player]
    battler: Battler
    round: int = 1
    stage: int = 3

class Draft(BaseModel):
    player: RealPlayer
    pack: list[Card]

class Zones(BaseModel):
    battlefield: list[Card]
    graveyard: list[Card]
    exile: list[Card]
    # these aren't directly used in the code probably?
    command_zone: list[Card]
    library: list[Card]

class Battle(BaseModel):
    player: Player
    opponent: Player
    coin_flip: Player
    player_zones: Zones
    opponent_zones: Zones
    
def create_game(player_names: list[str], num_players: int) -> Game:
    if num_players < player_names:
        raise ValueError()
    if num_players > player_names:
        # TODO: add fake players from the DB
        raise NotImplementedError()

    return Game(players=[Player(name=name) for name in player_names])

PACKSIZE = 5

def deal(game: Game, draft: Draft, roll: bool = False) -> Draft:

    if roll and draft.player.treasures == 0:
        # TODO: log/return something to tell player they cant roll
        return draft
    if roll:
        draft.player.treasures -= 1

    game.battler.cards += draft.pack
    game.battler.shuffle()
    draft.pack = game.battler.cards[:PACKSIZE]
    game.battler.cards = game.battler.cards[PACKSIZE:]
    return draft

# TODO: figure out if a battle is represented as the same instance of the URL
#       with two players or two diff URLs mirroring with you/opponent
# def cleanup(battle: Battle) -> 


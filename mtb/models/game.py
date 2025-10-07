import weakref
from pydantic import BaseModel, Field

from mtb.models.cards import Battler, Card


class Player(BaseModel):
    name: str
    most_recently_revealed_cards: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)

    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0

    # optional card variants
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None

    # NOTE: commander is not implemented yet
    commander: Card | None = None

    # weak reference to parent game (not serialized)
    # model_config is required to allow weakref types
    model_config = {"arbitrary_types_allowed": True}
    game_ref: weakref.ref["Game"] | None = Field(default=None, exclude=True)

    @property
    def game(self) -> "Game":
        if self.game_ref is None:
            raise ValueError("Player is not associated with a game")
        game = self.game_ref()
        if game is None:
            raise ValueError("Game reference is no longer valid")
        return game

    @property
    def starting_life(self) -> int:
        return self.game.config.starting_life


class RealPlayer(Player):
    battler: Battler


# Fake Class for being able to play single player
class FakePlayer(BaseModel):
    historic_game_id: str


class Config(BaseModel):
    pack_size: int = 5
    starting_treasures: int = 1
    starting_pool_size: int = 7
    max_treasures: int = 5
    num_rounds_per_stage: int = 3
    poison_to_lose: int = 10
    starting_life: int = 10


class Game(BaseModel):
    players: list[Player]
    round: int = 1
    stage: int = 3
    config: Config = Field(default_factory=Config)
    battler: Battler | None = None

    # set a safe circular reference between players and game
    def model_post_init(self, __context):
        for player in self.players:
            player.game_ref = weakref.ref(self)


class Draft(BaseModel):
    player: RealPlayer
    pack: list[Card]


class Zones(BaseModel):
    battlefield: list[Card]
    graveyard: list[Card]
    exile: list[Card]
    hand: list[Card]
    sideboard: list[Card]
    upgrades: list[Card]
    # these aren't directly used in the code yet?
    command_zone: list[Card]
    library: list[Card]


class Battle(BaseModel):
    player: Player
    opponent: Player
    coin_flip: Player
    player_zones: Zones
    opponent_zones: Zones


def create_game(player_names: list[str], num_players: int) -> Game:
    if num_players < len(player_names):
        raise ValueError()
    if num_players > len(player_names):
        # TODO: add fake players from the DB
        raise NotImplementedError()

    config = Config()
    players = [Player(name=name, treasures=config.starting_treasures) for name in player_names]
    return Game(players=players, config=config)


def deal(game: Game, draft: Draft, roll: bool = False) -> Draft:
    if game.battler is None:
        raise ValueError("Game has no battler; cannot deal packs")
    if roll and draft.player.treasures == 0:
        # TODO: log/return something to tell player they cant roll
        return draft
    if roll:
        draft.player.treasures -= 1

    game.battler.cards += draft.pack
    game.battler.shuffle()
    size = game.config.pack_size
    draft.pack = game.battler.cards[:size]
    game.battler.cards = game.battler.cards[size:]
    return draft


# TODO: figure out if a battle is represented as the same instance of the URL
#       with two players or two diff URLs mirroring with you/opponent
# def cleanup(battle: Battle) ->

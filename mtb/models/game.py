import random
import weakref

from pydantic import BaseModel, Field

from mtb.models.cards import Battler, Card
from mtb.models.types import Phase, ZoneName


class DraftState(BaseModel):
    packs: list[list[Card]]
    discard: list[Card] = Field(default_factory=list)
    current_packs: dict[str, list[Card]] = Field(default_factory=dict)


class Player(BaseModel):
    name: str
    most_recently_revealed_cards: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)

    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0

    # per-player progression
    phase: Phase = "build"
    round: int = 1
    stage: int = 1
    last_opponent_name: str | None = None

    # optional card variants
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None

    # NOTE: commander is not implemented yet
    commander: Card | None = None

    # basics chosen during build phase (e.g., ["Plains", "Island", "Mountain"])
    chosen_basics: list[str] = Field(default_factory=list)

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

    @property
    def hand_size(self) -> int:
        return self.game.config.starting_stage + self.vanquishers


class Config(BaseModel):
    pack_size: int = 5
    starting_treasures: int = 1
    starting_stage: int = 3
    starting_pool_size: int = 7
    max_treasures: int = 5
    num_rounds_per_stage: int = 3
    num_basics: int = 3
    max_available_upgrades: int = 4
    poison_to_lose: int = 10
    starting_life: int = 10


class Game(BaseModel):
    players: list[Player]
    config: Config = Field(default_factory=Config)
    battler: Battler | None = None
    available_upgrades: list[Card] = Field(default_factory=list)
    draft_state: DraftState | None = None
    active_battles: list["Battle"] = Field(default_factory=list)

    # set a safe circular reference between players and game
    def model_post_init(self, __context):
        for player in self.players:
            player.game_ref = weakref.ref(self)

    def get_draft_state(self) -> DraftState:
        if self.draft_state is None:
            raise RuntimeError("Draft state not initialized - call draft.start() first")
        return self.draft_state

    def get_battler(self) -> Battler:
        if self.battler is None:
            raise RuntimeError("Battler not initialized - call set_battler() first")
        return self.battler


class Zones(BaseModel):
    battlefield: list[Card] = Field(default_factory=list)
    graveyard: list[Card] = Field(default_factory=list)
    exile: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)
    upgrades: list[Card] = Field(default_factory=list)
    command_zone: list[Card] = Field(default_factory=list)
    library: list[Card] = Field(default_factory=list)
    treasures: int = 0
    submitted_cards: list[Card] = Field(default_factory=list)

    def get_zone(self, zone_name: ZoneName) -> list[Card]:
        match zone_name:
            case "battlefield":
                return self.battlefield
            case "graveyard":
                return self.graveyard
            case "exile":
                return self.exile
            case "hand":
                return self.hand
            case "sideboard":
                return self.sideboard
            case "upgrades":
                return self.upgrades
            case "command_zone":
                return self.command_zone
            case "library":
                return self.library


class Battle(BaseModel):
    player: Player
    opponent: Player
    coin_flip: Player
    player_zones: Zones
    opponent_zones: Zones
    result_submissions: dict[str, str] = Field(default_factory=dict)


def create_game(player_names: list[str], num_players: int, config: Config | None = None) -> Game:
    if num_players < len(player_names):
        raise ValueError("Number of players cannot be less than the number of provided player names")
    if num_players > len(player_names):
        # TODO: add fake players from the DB
        raise NotImplementedError("Filling in with fake players is not implemented yet")

    if config is None:
        config = Config()
    players = [Player(name=name, treasures=config.starting_treasures) for name in player_names]
    return Game(players=players, config=config)


def set_battler(game: Game, battler: Battler) -> None:
    game.battler = battler

    upgrades = battler.upgrades.copy()
    random.shuffle(upgrades)
    max_upgrades = game.config.max_available_upgrades
    game.available_upgrades = upgrades[:max_upgrades]

    _deal_starting_pool(game)


def _deal_starting_pool(game: Game) -> None:
    """Deal initial cards to all players for round 1 (which starts in build phase)."""
    if game.battler is None:
        return

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pool_size = game.config.starting_pool_size
    for player in game.players:
        player_cards = cards[:pool_size]
        cards = cards[pool_size:]
        player.sideboard.extend(player_cards)

    game.battler.cards = cards

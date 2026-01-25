import random
import weakref
from typing import Any

from pydantic import BaseModel, Field

from mtb.models.cards import Battler, Card
from mtb.models.types import Phase, ZoneName


class StaticOpponent(BaseModel):
    """Frozen opponent state representing either a ghost or historical player."""

    name: str
    hand: list[Card]
    sideboard: list[Card] = Field(default_factory=list)
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None
    chosen_basics: list[str] = Field(default_factory=list)
    treasures: int = 0
    poison: int = 0
    hand_revealed: bool = False
    is_ghost: bool = True
    source_player_history_id: int | None = None

    @classmethod
    def from_player(cls, player: "Player", hand_revealed: bool = False) -> "StaticOpponent":
        return cls(
            name=player.name,
            hand=player.hand.copy(),
            sideboard=player.sideboard.copy(),
            upgrades=player.upgrades.copy(),
            vanguard=player.vanguard,
            chosen_basics=player.chosen_basics.copy(),
            treasures=player.treasures,
            poison=player.poison,
            hand_revealed=hand_revealed,
            is_ghost=True,
        )

    @classmethod
    def from_snapshot(cls, snapshot: "BattleSnapshotData", player_name: str, history_id: int) -> "StaticOpponent":
        return cls(
            name=player_name,
            hand=snapshot.hand,
            sideboard=[],
            upgrades=snapshot.applied_upgrades,
            vanguard=snapshot.vanguard,
            chosen_basics=snapshot.basic_lands,
            treasures=snapshot.treasures,
            poison=0,
            hand_revealed=True,
            is_ghost=False,
            source_player_history_id=history_id,
        )


class BattleSnapshotData(BaseModel):
    """Data structure for snapshot serialization/deserialization."""

    hand: list[Card]
    vanguard: Card | None
    basic_lands: list[str]
    applied_upgrades: list[Card]
    treasures: int


class FakePlayer(BaseModel):
    """Tracks a historical player across rounds in the current game."""

    name: str
    player_history_id: int
    snapshots: dict[str, StaticOpponent] = Field(default_factory=dict)
    is_eliminated: bool = False
    poison: int = 0

    def get_opponent_for_round(self, stage: int, round_num: int) -> StaticOpponent | None:
        key = f"{stage}_{round_num}"
        if key in self.snapshots:
            return self.snapshots[key]

        available_keys = sorted(self.snapshots.keys())
        target = (stage, round_num)
        best_key = None
        for k in available_keys:
            s, r = map(int, k.split("_"))
            if (s, r) <= target:
                best_key = k
            else:
                break

        if best_key:
            return self.snapshots[best_key]
        return None


class DraftState(BaseModel):
    packs: list[list[Card]]
    discard: list[Card] = Field(default_factory=list)
    current_packs: dict[str, list[Card]] = Field(default_factory=dict)


class LastBattleResult(BaseModel):
    opponent_name: str
    winner_name: str | None
    is_draw: bool = False
    poison_dealt: int = 0
    poison_taken: int = 0
    treasures_gained: int = 0
    card_gained: Card | None = None
    vanquisher_gained: bool = False


class Player(BaseModel):
    name: str
    most_recently_revealed_cards: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)

    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0

    phase: Phase = "build"
    round: int = 1
    stage: int = 1
    last_opponent_name: str | None = None
    last_battle_result: "LastBattleResult | None" = None

    is_ghost: bool = False
    time_of_death: int | None = None

    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None

    commander: Card | None = None
    chosen_basics: list[str] = Field(default_factory=list)
    previous_hand_ids: list[str] = Field(default_factory=list)
    previous_basics: list[str] = Field(default_factory=list)
    build_ready: bool = False

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

    def populate_hand(self) -> None:
        """Populate hand with previous battle cards, then fill remaining slots by ELO."""
        for card_id in self.previous_hand_ids:
            card = next((c for c in self.sideboard if c.id == card_id), None)
            if card:
                self.sideboard.remove(card)
                self.hand.append(card)

        slots_to_fill = self.hand_size - len(self.hand)
        if slots_to_fill > 0 and self.sideboard:
            by_elo = sorted(self.sideboard, key=lambda c: c.elo, reverse=True)
            for card in by_elo[:slots_to_fill]:
                self.sideboard.remove(card)
                self.hand.append(card)

        self.chosen_basics = self.previous_basics.copy()


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
    use_upgrades: bool = True
    use_vanguards: bool = False


class Game(BaseModel):
    players: list[Player]
    config: Config = Field(default_factory=Config)
    battler: Battler | None = None
    available_upgrades: list[Card] = Field(default_factory=list)
    draft_state: DraftState | None = None
    active_battles: list["Battle"] = Field(default_factory=list)
    most_recent_ghost: Player | None = None
    most_recent_ghost_bot: FakePlayer | None = None
    fake_players: list[FakePlayer] = Field(default_factory=list)
    stage: int = 3
    round: int = 1

    def model_post_init(self, _context: Any) -> None:
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

    tapped_card_ids: list[str] = Field(default_factory=list)
    flipped_card_ids: list[str] = Field(default_factory=list)
    face_down_card_ids: list[str] = Field(default_factory=list)
    counters: dict[str, dict[str, int]] = Field(default_factory=dict)
    attachments: dict[str, list[str]] = Field(default_factory=dict)
    spawned_tokens: list[Card] = Field(default_factory=list)

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
    opponent: Player | StaticOpponent
    coin_flip_name: str
    player_zones: Zones
    opponent_zones: Zones
    result_submissions: dict[str, str] = Field(default_factory=dict)
    player_life: int = 20
    opponent_life: int = 20


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
        player.populate_hand()

    game.battler.cards = cards

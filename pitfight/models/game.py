"""Live game state, player, puppet, battle, and snapshot restoration models."""

import json
import random
import secrets
import weakref
from typing import Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    Field,
    PrivateAttr,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
)

from pitfight.models.card_registry import export_registry, import_registry
from pitfight.models.cards import Battler, Card
from pitfight.models.types import Phase, PlayMode, ZoneName, normalize_play_mode


class StaticOpponent(BaseModel):
    """Frozen opponent state representing either a ghost or historical player."""

    name: str
    hand: list[Card]
    sideboard: list[Card] = Field(default_factory=list)
    command_zone: list[Card] = Field(default_factory=list)
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None
    chosen_basics: list[str] = Field(default_factory=list)
    treasures: int = 0
    poison: int = 0
    play_draw_preference: str | None = None
    hand_revealed: bool = False
    is_ghost: bool = True
    source_player_history_id: int | None = None

    @classmethod
    def from_player(cls, player: "Player", *, hand_revealed: bool = False) -> "StaticOpponent":
        upgrades = []
        for upgrade in player.upgrades:
            copy = upgrade.model_copy()
            if copy.upgrade_target is not None:
                copy.is_revealed = True
            upgrades.append(copy)
        return cls(
            name=player.name,
            hand=player.hand.copy(),
            sideboard=player.sideboard.copy(),
            command_zone=player.command_zone.copy(),
            upgrades=upgrades,
            vanguard=player.vanguard,
            chosen_basics=player.chosen_basics.copy(),
            treasures=player.treasures,
            poison=player.poison,
            hand_revealed=hand_revealed,
            is_ghost=True,
        )

    @classmethod
    def from_snapshot(cls, snapshot: "BattleSnapshotData", player_name: str, *, history_id: int) -> "StaticOpponent":
        applied_upgrades = []
        for upgrade in snapshot.applied_upgrades:
            copy = upgrade.model_copy()
            copy.is_revealed = True
            applied_upgrades.append(copy)
        return cls(
            name=player_name,
            hand=snapshot.hand,
            sideboard=snapshot.sideboard,
            command_zone=snapshot.command_zone,
            upgrades=applied_upgrades,
            vanguard=snapshot.vanguard,
            chosen_basics=snapshot.basic_lands,
            treasures=snapshot.treasures,
            poison=0,
            play_draw_preference=snapshot.play_draw_preference,
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
    upgrades: list[Card] = Field(default_factory=list)
    treasures: int
    sideboard: list[Card] = Field(default_factory=list)
    command_zone: list[Card] = Field(default_factory=list)
    poison: int = 0
    play_draw_preference: str | None = None


class Puppet(BaseModel):
    """Tracks a historical/puppet player across rounds in the current game."""

    name: str
    player_history_id: int
    snapshots: dict[str, StaticOpponent] = Field(default_factory=dict)
    is_eliminated: bool = False
    poison: int = 0
    round: int = 1
    stage: int = 3
    placement: int = 0
    last_battle_result: "LastBattleResult | None" = None
    in_sudden_death: bool = False
    last_played_round: tuple[int, int] | None = None

    def get_opponent_for_round(self, stage: int, round_num: int) -> StaticOpponent | None:
        # Like a person's Ghost, a puppet that is out keeps the build it went out with for later rounds.
        if self.is_eliminated and self.last_played_round and (stage, round_num) > self.last_played_round:
            stage, round_num = self.last_played_round
        key = f"{stage}_{round_num}"
        if key in self.snapshots:
            opponent = self.snapshots[key]
            opponent.poison = self.poison
            return opponent

        available_keys = sorted(self.snapshots, key=lambda k: tuple(map(int, k.split("_"))))
        target = (stage, round_num)
        best_key = None
        for k in available_keys:
            s, r = map(int, k.split("_"))
            if (s, r) <= target:
                best_key = k
            else:
                break

        if best_key:
            opponent = self.snapshots[best_key]
            opponent.poison = self.poison
            return opponent
        if available_keys:
            opponent = self.snapshots[available_keys[0]]
            opponent.poison = self.poison
            return opponent
        return None


class DraftState(BaseModel):
    packs: list[list[Card]]
    player_packs: dict[str, list[list[Card]]] = Field(default_factory=dict)
    discard: list[Card] = Field(default_factory=list)
    current_packs: dict[str, list[Card]] = Field(default_factory=dict)

    def undealt_packs(self, player: "Player") -> list[list[Card]]:
        if player.game.config.play_mode == "limited":
            return self.packs
        return self.player_packs.setdefault(player.name, [])


class LastBattleResult(BaseModel):
    opponent_name: str
    winner_name: str | None
    is_draw: bool = False
    poison_dealt: int = 0
    poison_taken: int = 0
    treasures_gained: int = 0
    card_gained: Card | None = None
    vanquisher_gained: bool = False
    pre_battle_treasures: int = 0


class BattleResolutionEvent(BaseModel):
    event_type: Literal["base_increment", "upgrade_beam"]
    source_card_id: str | None = None


class BattleResolutionSide(BaseModel):
    name: str
    starting_poison: int
    ending_poison: int
    poison_delta: int
    took_damage: bool = False
    is_lethal: bool = False
    show_death_animation: bool = False
    events: list[BattleResolutionEvent] = Field(default_factory=list)


class BattleResolution(BaseModel):
    resolution_id: str
    winner_name: str | None
    is_draw: bool = False
    is_sudden_death: bool = False
    continue_sudden_death: bool = False
    your_side: BattleResolutionSide
    opponent_side: BattleResolutionSide


class ReturnedBuild(BaseModel):
    """The last build of an eliminated player whose cards went back to the cube, kept to show on their end screen."""

    hand: list[Card]
    sideboard: list[Card]


class Player(BaseModel):
    name: str
    most_recently_revealed_cards: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    hand_slots: list[str | None] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)
    command_zone: list[Card] = Field(default_factory=list)
    battler: Battler | None = None

    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0
    pre_battle_treasures: int = 0
    placement: int = 0
    elimination_round: int = 0
    elimination_stage: int = 0
    returned_build: ReturnedBuild | None = None

    phase: Phase = "build"
    round: int = 1
    stage: int = 3
    last_opponent_name: str | None = None
    last_battle_result: "LastBattleResult | None" = None
    battle_resolution: "BattleResolution | None" = None

    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None

    commander: Card | None = None
    chosen_basics: list[str] = Field(default_factory=list)
    previous_hand_ids: list[str] = Field(default_factory=list)
    previous_basics: list[str] = Field(default_factory=list)
    build_ready: bool = False
    play_draw_preference: str | None = None
    in_sudden_death: bool = False

    # model_config is required to allow weakref types
    model_config = {"arbitrary_types_allowed": True}
    game_ref: weakref.ref["Game"] | None = Field(default=None, exclude=True)

    @model_serializer(mode="wrap")
    def _serialize(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> dict[str, Any]:
        data = handler(self)
        if info.context and info.context.get("exclude_shared_battler"):
            data.pop("battler", None)
        return data

    @property
    def game(self) -> "Game":
        if self.game_ref is None:
            msg = "Player is not associated with a game"
            raise ValueError(msg)
        game = self.game_ref()
        if game is None:
            msg = "Game reference is no longer valid"
            raise ValueError(msg)
        return game

    @property
    def starting_life(self) -> int:
        return self.game.config.starting_life

    @property
    def hand_size(self) -> int:
        return self.game.config.starting_stage + self.vanquishers

    def slotted_hand(self) -> list[str | None]:
        """Return the hand by slot, placing any card without a saved slot in the first empty one."""
        in_hand = {card.id for card in self.hand}
        slots = [card_id if card_id in in_hand else None for card_id in self.hand_slots[: self.hand_size]]
        slots += [None] * (self.hand_size - len(slots))
        empty = [index for index, card_id in enumerate(slots) if card_id is None]
        unplaced = [card.id for card in self.hand if card.id not in slots]
        for index, card_id in zip(empty, unplaced, strict=False):
            slots[index] = card_id
        return slots

    def populate_hand(self) -> None:
        """Restore previous hand cards that are still in the pool."""
        all_cards = self.hand + self.sideboard
        pool_by_id = {c.id: c for c in all_cards}

        restored_ids = [cid for cid in self.previous_hand_ids if cid in pool_by_id]
        restored_set = set(restored_ids[: self.hand_size])

        self.hand = [pool_by_id[cid] for cid in restored_ids[: self.hand_size]]
        self.hand_slots = []
        self.sideboard = [c for c in all_cards if c.id not in restored_set]
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
    auto_approve_spectators: bool = False
    voice_chat_enabled: bool = False
    cube_id: str = "auto"
    play_mode: PlayMode = "limited"

    @field_validator("play_mode", mode="before")
    @classmethod
    def _normalize_play_mode(cls, value: str | None) -> PlayMode:
        return normalize_play_mode(value)


class Game(BaseModel):
    players: list[Player]
    config: Config = Field(default_factory=Config)
    battler: Battler | None = None
    available_upgrades: list[Card] = Field(default_factory=list)
    draft_state: DraftState | None = None
    active_battles: list["Battle"] = Field(default_factory=list)
    most_recent_ghost: StaticOpponent | None = None
    most_recent_ghost_puppet: Puppet | None = Field(
        default=None,
        validation_alias=AliasChoices("most_recent_ghost_puppet", "most_recent_ghost_bot"),
    )
    puppets: list[Puppet] = Field(
        default_factory=list,
        validation_alias=AliasChoices("puppets", "fake_players"),
    )
    stage: int = 3
    round: int = 1

    def model_post_init(self, context: object, /) -> None:
        _ = context
        for player in self.players:
            player.game_ref = weakref.ref(self)
        self.normalize_player_battlers()

    def snapshot_dump_json(self) -> str:
        context: dict[str, Any] = {"slim_cards": True}
        if self.battler is not None:
            context["exclude_shared_battler"] = True
        game_data = self.model_dump(context=context)
        referenced = _collect_scryfall_ids(game_data)
        registry_data = export_registry(referenced)
        return json.dumps({"data": game_data, "card_registry": registry_data})

    def get_draft_state(self) -> DraftState:
        if self.draft_state is None:
            msg = "Draft state not initialized - call draft.start() first"
            raise RuntimeError(msg)
        return self.draft_state

    def get_battler(self) -> Battler:
        if self.battler is None:
            msg = "Battler not initialized - call set_battler() first"
            raise RuntimeError(msg)
        return self.battler

    def _normalize_limited_battler(self) -> None:
        canonical = self.battler or next(
            (player.battler for player in self.players if player.battler is not None), None
        )
        if canonical is None:
            return
        self.battler = canonical
        for player in self.players:
            player.battler = canonical

    def normalize_player_battlers(self) -> None:
        if not self.players:
            return
        if self.config.play_mode == "limited":
            self._normalize_limited_battler()
            return
        if self.battler is not None:
            for player in self.players:
                if player.battler is None:
                    player.battler = self.battler
            self.battler = None


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
    original_hand_ids: list[str] = Field(default_factory=list)

    tapped_card_ids: list[str] = Field(default_factory=list)
    flipped_card_ids: list[str] = Field(default_factory=list)
    face_down_card_ids: list[str] = Field(default_factory=list)
    counters: dict[str, dict[str, int]] = Field(default_factory=dict)
    attachments: dict[str, list[str]] = Field(default_factory=dict)
    spawned_tokens: list[Card] = Field(default_factory=list)
    revealed_card_ids: list[str] = Field(default_factory=list)

    def get_zone(self, zone_name: ZoneName) -> list[Card]:
        zone_map: dict[ZoneName, list[Card]] = {
            "battlefield": self.battlefield,
            "graveyard": self.graveyard,
            "exile": self.exile,
            "hand": self.hand,
            "sideboard": self.sideboard,
            "upgrades": self.upgrades,
            "command_zone": self.command_zone,
            "library": self.library,
        }
        return zone_map[zone_name]


class PendingRevealAnimation(BaseModel):
    animation_id: str
    upgrade: Card
    target: Card
    player_name: str


class Battle(BaseModel):
    player: Player
    opponent: Player | StaticOpponent
    coin_flip_name: str
    on_the_play_name: str
    current_turn_name: str
    player_zones: Zones
    opponent_zones: Zones
    result_submissions: dict[str, str] = Field(default_factory=dict)
    player_life: int = 20
    opponent_life: int = 20
    is_sudden_death: bool = False
    pending_reveal_animations: list[PendingRevealAnimation] = Field(default_factory=list)
    _opaque_id_key: bytes = PrivateAttr(default_factory=lambda: secrets.token_bytes(32))

    @property
    def opaque_id_key(self) -> bytes:
        return self._opaque_id_key

    @opaque_id_key.setter
    def opaque_id_key(self, value: bytes) -> None:
        self._opaque_id_key = value


def create_game(player_names: list[str], num_players: int, *, config: Config | None = None) -> Game:
    if num_players < len(player_names):
        msg = "Number of players cannot be less than the number of provided player names"
        raise ValueError(msg)
    if num_players > len(player_names):
        msg = "Filling in with fake players is not implemented yet"
        raise NotImplementedError(msg)

    if config is None:
        config = Config()
    players = [
        Player(name=name, treasures=config.starting_treasures, stage=config.starting_stage) for name in player_names
    ]
    return Game(players=players, config=config)


def set_battler(game: Game, battler: Battler) -> None:
    set_player_battlers(game, {player.name: battler for player in game.players})


def set_player_battlers(game: Game, battlers_by_player: dict[str, Battler]) -> None:
    first_battler = next(iter(battlers_by_player.values()))
    game.battler = first_battler if game.config.play_mode == "limited" else None

    upgrades = sorted(first_battler.upgrades, key=lambda u: u.name)
    max_upgrades = game.config.max_available_upgrades
    game.available_upgrades = upgrades[:max_upgrades]

    for player in game.players:
        battler = battlers_by_player.get(player.name)
        if battler is None:
            msg = f"No battler provided for player {player.name}"
            raise ValueError(msg)
        player.battler = battler

    game.normalize_player_battlers()
    _deal_starting_pool(game)


def _deal_starting_pool(game: Game) -> None:
    """Deal initial cards to all players for round 1 (which starts in build phase)."""
    pool_size = game.config.starting_pool_size
    shuffled_battlers: set[int] = set()
    for player in game.players:
        if player.battler is None:
            msg = f"Player {player.name} has no battler"
            raise ValueError(msg)

        battler_key = id(player.battler)
        if battler_key not in shuffled_battlers:
            random.shuffle(player.battler.cards)
            shuffled_battlers.add(battler_key)
        player_cards = player.battler.cards[:pool_size]
        player.battler.cards = player.battler.cards[pool_size:]
        player.sideboard.extend(player_cards)
        player.populate_hand()


def _collect_scryfall_ids(data: object) -> set[str]:
    ids: set[str] = set()
    stack: list[Any] = [data]

    while stack:
        obj = stack.pop()
        if isinstance(obj, dict):
            sid = obj.get("scryfall_id")
            if isinstance(sid, str) and sid:
                ids.add(sid)
            stack.extend(obj.values())
        elif isinstance(obj, list):
            stack.extend(obj)

    return ids


def restore_game_from_snapshot(json_str: str) -> Game:
    data = json.loads(json_str)
    if "card_registry" in data:
        import_registry(data["card_registry"])
        return Game(**data["data"])
    return Game(**data)


def slim_snapshot_dump(snapshot_data: BattleSnapshotData) -> str:
    slim_data = snapshot_data.model_dump(context={"slim_cards": True})
    referenced = _collect_scryfall_ids(slim_data)
    registry_data = export_registry(referenced)
    return json.dumps({"data": slim_data, "card_registry": registry_data})


def restore_snapshot_data(json_str: str) -> BattleSnapshotData:
    data = json.loads(json_str)
    if "card_registry" in data:
        import_registry(data["card_registry"])
        return BattleSnapshotData(**data["data"])
    return BattleSnapshotData(**data)

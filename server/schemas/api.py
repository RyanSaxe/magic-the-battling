from typing import Literal

from pydantic import BaseModel, Field, field_validator

from mtb.models.cards import Card
from mtb.models.game import BattleResolution
from mtb.models.types import BuildSource, CardDestination, Phase, PlayMode, ZoneName, normalize_play_mode

LastResult = Literal["win", "loss", "draw"]
CubeLoadingStatus = Literal["loading", "ready", "error"]
BattlerLoadingStatus = Literal["missing", "loading", "ready", "error"]


class CreateGameRequest(BaseModel):
    player_name: str
    cube_id: str = "auto"
    use_upgrades: bool = True
    use_vanguards: bool = False
    target_player_count: int = 4
    puppet_count: int = 0
    auto_approve_spectators: bool = False
    guided_mode_default: bool = False
    play_mode: PlayMode = "limited"

    @field_validator("play_mode", mode="before")
    @classmethod
    def _normalize_play_mode(cls, value: str | None) -> PlayMode:
        return normalize_play_mode(value)


class CreateGameResponse(BaseModel):
    game_id: str
    join_code: str
    session_id: str
    player_id: str


class JoinGameRequest(BaseModel):
    join_code: str
    player_name: str


class RejoinGameRequest(BaseModel):
    player_name: str


class JoinGameResponse(BaseModel):
    game_id: str
    session_id: str
    player_id: str


class StartGameResponse(BaseModel):
    success: bool


class CardCatalogEntry(BaseModel):
    scryfall_id: str
    name: str
    image_url: str
    flip_image_url: str | None = None
    png_url: str | None = None
    flip_png_url: str | None = None
    type_line: str
    oracle_text: str | None = None
    colors: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    cmc: float = 0.0
    life_modifier: int | None = None
    hand_modifier: int | None = None
    token_scryfall_ids: list[str] = Field(default_factory=list)
    is_upgrade: bool = False
    is_vanguard: bool = False
    is_companion: bool = False


class CardRef(BaseModel):
    id: str
    scryfall_id: str
    upgrade_target_id: str | None = None
    is_revealed: bool = True
    original_owner: str | None = None


class ZonesView(BaseModel):
    battlefield: list[CardRef] = Field(default_factory=list)
    graveyard: list[CardRef] = Field(default_factory=list)
    exile: list[CardRef] = Field(default_factory=list)
    hand: list[CardRef] = Field(default_factory=list)
    sideboard: list[CardRef] = Field(default_factory=list)
    upgrades: list[CardRef] = Field(default_factory=list)
    command_zone: list[CardRef] = Field(default_factory=list)
    library: list[CardRef] = Field(default_factory=list)
    treasures: int = 0
    submitted_cards: list[CardRef] = Field(default_factory=list)
    original_hand_ids: list[str] = Field(default_factory=list)
    tapped_card_ids: list[str] = Field(default_factory=list)
    flipped_card_ids: list[str] = Field(default_factory=list)
    face_down_card_ids: list[str] = Field(default_factory=list)
    counters: dict[str, dict[str, int]] = Field(default_factory=dict)
    attachments: dict[str, list[str]] = Field(default_factory=dict)
    spawned_tokens: list[CardRef] = Field(default_factory=list)
    revealed_card_ids: list[str] = Field(default_factory=list)


class LastBattleResultView(BaseModel):
    opponent_name: str
    winner_name: str | None
    is_draw: bool = False
    poison_dealt: int = 0
    poison_taken: int = 0
    treasures_gained: int = 0
    card_gained: CardRef | None = None
    vanquisher_gained: bool = False
    pre_battle_treasures: int = 0


class PlayerView(BaseModel):
    name: str
    treasures: int
    poison: int
    phase: Phase
    round: int
    stage: int
    vanquishers: int
    is_ghost: bool
    is_puppet: bool = False
    time_of_death: int | None
    hand_count: int
    sideboard_count: int
    hand_size: int
    is_stage_increasing: bool
    upgrades: list[CardRef]
    vanguard: CardRef | None
    chosen_basics: list[str]
    most_recently_revealed_cards: list[CardRef] = Field(default_factory=list)
    last_result: LastResult | None = None
    pairing_probability: float | None = None
    is_most_recent_ghost: bool = False
    full_sideboard: list[CardRef] = Field(default_factory=list)
    command_zone: list[CardRef] = Field(default_factory=list)
    placement: int = 0
    in_sudden_death: bool = False
    build_ready: bool = False


class SelfPlayerView(PlayerView):
    hand: list[CardRef]
    sideboard: list[CardRef]
    command_zone: list[CardRef] = Field(default_factory=list)
    current_pack: list[CardRef] | None = None
    last_battle_result: LastBattleResultView | None = None
    build_ready: bool = False
    in_sudden_death: bool = False


class RevealAnimationView(BaseModel):
    animation_id: str
    upgrade: CardRef
    target: CardRef
    player_name: str


class BattleView(BaseModel):
    opponent_name: str
    coin_flip_name: str
    on_the_play_name: str
    current_turn_name: str
    your_zones: ZonesView
    opponent_zones: ZonesView
    opponent_hand_count: int
    result_submissions: dict[str, str]
    your_poison: int
    opponent_poison: int
    opponent_hand_revealed: bool = False
    your_life: int = 20
    opponent_life: int = 20
    is_sudden_death: bool = False
    opponent_full_sideboard: list[CardRef] = Field(default_factory=list)
    can_manipulate_opponent: bool = False
    pending_reveal_animations: list[RevealAnimationView] = Field(default_factory=list)


class GameStateResponse(BaseModel):
    game_id: str
    phase: str
    starting_life: int
    players: list[PlayerView]
    self_player: SelfPlayerView
    available_upgrades: list[CardRef]
    current_battle: BattleView | None = None
    battle_resolution: BattleResolution | None = None
    use_upgrades: bool = True
    cube_id: str = "auto"
    play_mode: PlayMode = "limited"
    catalog_delta: dict[str, CardCatalogEntry] = Field(default_factory=dict)


class GameBootstrapResponse(BaseModel):
    catalog: dict[str, CardCatalogEntry]
    state: GameStateResponse


class LobbyPlayer(BaseModel):
    player_id: str
    name: str
    is_ready: bool = False
    is_host: bool = False
    battler_id: str | None = None
    battler_status: BattlerLoadingStatus | None = None
    battler_error: str | None = None


class LobbyStateResponse(BaseModel):
    game_id: str
    join_code: str
    players: list[LobbyPlayer]
    can_start: bool
    is_started: bool
    target_player_count: int = 4
    puppet_count: int = 0
    cube_loading_status: CubeLoadingStatus = "loading"
    cube_loading_error: str | None = None
    available_puppet_count: int | None = None
    cube_id: str = "auto"
    use_upgrades: bool = True
    guided_mode_default: bool = False
    play_mode: PlayMode = "limited"


class DraftSwapAction(BaseModel):
    action: str = "swap"
    pack_card_id: str
    player_card_id: str
    destination: CardDestination


class DraftRollAction(BaseModel):
    action: str = "roll"


class DraftDoneAction(BaseModel):
    action: str = "done"


class BuildMoveAction(BaseModel):
    action: str = "move"
    card_id: str
    source: BuildSource
    destination: BuildSource


class BuildSubmitAction(BaseModel):
    action: str = "submit"
    basics: list[str]


class BattleMoveAction(BaseModel):
    action: str = "move_zone"
    card_id: str
    from_zone: ZoneName
    to_zone: ZoneName


class BattleSubmitResultAction(BaseModel):
    action: str = "submit_result"
    result: str


class BattleUpdateLifeAction(BaseModel):
    action: str = "update_life"
    target: str  # "you" or "opponent"
    life: int


class RewardPickUpgradeAction(BaseModel):
    action: str = "pick_upgrade"
    upgrade_id: str


class RewardApplyUpgradeAction(BaseModel):
    action: str = "apply_upgrade"
    upgrade_id: str
    target_card_id: str


class RewardDoneAction(BaseModel):
    action: str = "done"


class WebSocketMessage(BaseModel):
    type: str
    payload: dict = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None


class GameStatusPlayer(BaseModel):
    name: str
    is_connected: bool
    is_puppet: bool
    phase: str


class GameStatusResponse(BaseModel):
    game_id: str
    phase: str
    is_started: bool
    players: list[GameStatusPlayer]
    auto_approve_spectators: bool = False


class SpectateRequestCreate(BaseModel):
    target_player_name: str
    spectator_name: str


class SpectateRequestResponse(BaseModel):
    request_id: str


class SpectateRequestStatus(BaseModel):
    status: Literal["pending", "approved", "denied"]
    session_id: str | None = None
    player_id: str | None = None


class GameCardsResponse(BaseModel):
    cards: list[CardCatalogEntry]
    upgrades: list[CardCatalogEntry]


class SharePlayerSnapshot(BaseModel):
    stage: int
    round: int
    hand: list[Card]
    sideboard: list[Card]
    command_zone: list[Card]
    applied_upgrades: list[Card]
    upgrades: list[Card] = Field(default_factory=list)
    basic_lands: list[str]
    treasures: int
    poison: int
    vanguard: Card | None = None


class SharePlayerData(BaseModel):
    name: str
    final_placement: int | None
    final_poison: int
    is_puppet: bool
    snapshots: list[SharePlayerSnapshot]


class ShareGameResponse(BaseModel):
    game_id: str
    owner_name: str
    created_at: str
    use_upgrades: bool
    players: list[SharePlayerData]


class OpsStateResponse(BaseModel):
    mode: Literal["normal", "draining", "maintenance"]
    message: str
    updated_by: str | None = None
    updated_at: str


class OpsSetModeRequest(BaseModel):
    mode: Literal["normal", "draining", "maintenance"]
    message: str = ""
    updated_by: str | None = None


class OpsCapacityResponse(BaseModel):
    loaded_games: int
    hot_games: int
    pending_games: int
    sessions: int
    game_starts_in_flight: int
    game_start_waiters: int
    max_game_starts_in_flight: int
    max_game_start_waiters: int


class ServerStatusResponse(BaseModel):
    mode: Literal["normal", "draining", "maintenance"]
    message: str
    updated_at: str
    new_games_blocked: bool
    scheduled_for_utc: str | None = None
    estimated_recovery_minutes: int | None = None

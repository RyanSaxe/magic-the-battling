from typing import Literal

from pydantic import BaseModel, Field

from mtb.models.cards import Card
from mtb.models.game import LastBattleResult, Zones
from mtb.models.types import BuildSource, CardDestination, Phase, ZoneName

LastResult = Literal["win", "loss", "draw"]
CubeLoadingStatus = Literal["loading", "ready", "error"]


class CreateGameRequest(BaseModel):
    player_name: str
    cube_id: str = "auto"
    use_upgrades: bool = True
    use_vanguards: bool = False
    target_player_count: int = 4
    auto_approve_spectators: bool = False


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
    upgrades: list[Card]
    vanguard: Card | None
    chosen_basics: list[str]
    most_recently_revealed_cards: list[Card] = []
    last_result: LastResult | None = None
    pairing_probability: float | None = None
    is_most_recent_ghost: bool = False
    full_sideboard: list[Card] = []
    command_zone: list[Card] = []
    placement: int = 0
    in_sudden_death: bool = False
    build_ready: bool = False


class SelfPlayerView(PlayerView):
    hand: list[Card]
    sideboard: list[Card]
    command_zone: list[Card] = []
    current_pack: list[Card] | None = None
    last_battle_result: LastBattleResult | None = None
    build_ready: bool = False
    in_sudden_death: bool = False


class BattleView(BaseModel):
    opponent_name: str
    coin_flip_name: str
    on_the_play_name: str
    current_turn_name: str
    your_zones: Zones
    opponent_zones: Zones
    opponent_hand_count: int
    result_submissions: dict[str, str]
    your_poison: int
    opponent_poison: int
    opponent_hand_revealed: bool = False
    your_life: int = 20
    opponent_life: int = 20
    is_sudden_death: bool = False
    opponent_full_sideboard: list[Card] = []
    can_manipulate_opponent: bool = False


class GameStateResponse(BaseModel):
    game_id: str
    phase: str
    starting_life: int
    players: list[PlayerView]
    self_player: SelfPlayerView
    available_upgrades: list[Card]
    current_battle: BattleView | None = None
    use_upgrades: bool = True
    cube_id: str = "auto"


class LobbyPlayer(BaseModel):
    player_id: str
    name: str
    is_ready: bool = False
    is_host: bool = False


class LobbyStateResponse(BaseModel):
    game_id: str
    join_code: str
    players: list[LobbyPlayer]
    can_start: bool
    is_started: bool
    target_player_count: int = 4
    cube_loading_status: CubeLoadingStatus = "loading"
    cube_loading_error: str | None = None
    available_puppet_count: int | None = None


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
    cards: list[Card]
    upgrades: list[Card]


class SharePlayerSnapshot(BaseModel):
    stage: int
    round: int
    hand: list[Card]
    sideboard: list[Card]
    command_zone: list[Card]
    applied_upgrades: list[Card]
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

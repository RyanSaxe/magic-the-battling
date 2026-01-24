from pydantic import BaseModel, Field

from mtb.models.cards import Card
from mtb.models.game import Zones
from mtb.models.types import BuildSource, CardDestination, Phase, ZoneName


class CreateGameRequest(BaseModel):
    player_name: str
    cube_id: str = "auto"


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
    time_of_death: int | None
    hand_count: int
    sideboard_count: int
    hand_size: int
    is_stage_increasing: bool
    upgrades: list[Card]
    vanguard: Card | None
    chosen_basics: list[str]


class SelfPlayerView(PlayerView):
    hand: list[Card]
    sideboard: list[Card]
    current_pack: list[Card] | None = None


class BattleView(BaseModel):
    opponent_name: str
    coin_flip_name: str
    your_zones: Zones
    opponent_zones: Zones
    opponent_hand_count: int
    result_submissions: dict[str, str]


class GameStateResponse(BaseModel):
    game_id: str
    phase: str
    players: list[PlayerView]
    self_player: SelfPlayerView
    available_upgrades: list[Card]
    current_battle: BattleView | None = None


class LobbyPlayer(BaseModel):
    name: str
    is_ready: bool = False


class LobbyStateResponse(BaseModel):
    game_id: str
    join_code: str
    players: list[LobbyPlayer]
    can_start: bool
    is_started: bool


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

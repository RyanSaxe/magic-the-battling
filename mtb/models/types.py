from typing import Literal

Phase = Literal["draft", "build", "battle", "reward", "eliminated", "winner", "game_over"]
ZoneName = Literal["battlefield", "graveyard", "exile", "hand", "sideboard", "upgrades", "command_zone", "library"]
CardDestination = Literal["hand", "sideboard", "upgrades"]
BuildSource = Literal["hand", "sideboard"]
CardStateAction = Literal["tap", "untap", "flip", "face_down", "counter", "attach", "detach", "spawn"]

VANGUARD_TYPE = "vanguard"
UPGRADE_TYPE = "conspiracy"

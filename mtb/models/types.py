from typing import Literal

Phase = Literal["draft", "build", "battle", "reward"]
ZoneName = Literal["battlefield", "graveyard", "exile", "hand", "sideboard", "upgrades", "command_zone", "library"]
CardDestination = Literal["hand", "sideboard", "upgrades"]
BuildSource = Literal["hand", "sideboard"]

VANGUARD_TYPE = "vanguard"
UPGRADE_TYPE = "conspiracy"

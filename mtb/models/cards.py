import random
import warnings
from typing import Optional

from pydantic import BaseModel, Field

from mtb.models.types import UPGRADE_TYPE, VANGUARD_TYPE


class Card(BaseModel):
    name: str
    image_url: str
    id: str
    type_line: str
    tokens: tuple["Card", ...] = Field(default_factory=tuple)
    flip_image_url: str | None = None
    png_url: str | None = None
    flip_png_url: str | None = None
    elo: float = 0.0
    upgrade_target: Optional["Card"] = None

    # vanguard specific properties
    life_modifier: int | None = None
    hand_modifier: int | None = None

    @property
    def is_upgrade(self):
        return self.type_line.lower() == UPGRADE_TYPE

    @property
    def is_vanguard(self):
        return self.type_line.lower() == VANGUARD_TYPE

    def upgrade(self, upgrade: "Card"):
        if not upgrade.is_upgrade:
            raise ValueError(f"{upgrade.name} is not a conspiracy and hence cannot be an upgrade")
        if upgrade.upgrade_target is not None and upgrade.upgrade_target is not self:
            raise ValueError(f"{upgrade.name} is already linked to {upgrade.upgrade_target.name}")
        upgrade.upgrade_target = self


class Battler(BaseModel):
    cards: list[Card]
    upgrades: list[Card]
    vanguards: list[Card]

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    @property
    def elo(self) -> float:
        return sum(card.elo for card in self.cards) / len(self.cards)


DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"

# TODO: actually add a lot of vanguards to the default cube
DEFAULT_VANGUARD_ID = "default_mtb_vanguards"


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str | None = None,
    vanguards_id: str | None = None,
) -> Battler:
    # imported here to avoid circular import
    from mtb.utils.cubecobra import get_cube_data

    cards = get_cube_data(battler_id)

    vanguards = [card for card in cards if card.type_line.lower() == VANGUARD_TYPE]
    if vanguards_id is not None:
        if len(vanguards) > 0:
            warnings.warn(
                "Vanguards found in battler. Replacing them with vanguards from the passed vanguard id.",
                stacklevel=2,
            )
        vanguards = get_cube_data(vanguards_id)

    upgrades = [card for card in cards if card.type_line.lower() == UPGRADE_TYPE]
    if upgrades_id is not None:
        if len(upgrades) > 0:
            warnings.warn(
                "Upgrades found in battler. Replacing them with upgrades from the passed upgrades id.",
                stacklevel=2,
            )
        upgrades = get_cube_data(upgrades_id)

    cards = [card for card in cards if card.type_line.lower() not in (VANGUARD_TYPE, UPGRADE_TYPE)]
    if not cards:
        raise ValueError(f"Cube '{battler_id}' contains no playable cards after filtering")

    return Battler(cards=cards, upgrades=upgrades, vanguards=vanguards)

import random
import warnings
from pydantic import BaseModel, Field


class Card(BaseModel):
    name: str
    image_url: str
    id: str
    type_line: str
    tokens: tuple["Card", ...] = Field(default_factory=tuple)
    flip_image_url: str | None = None
    elo: float = 0.0
    upgrades: list["Card"] = Field(default_factory=list)

    @property
    def is_upgrade(self):
        return self.type_line.lower() == "conspiracy"

    @property
    def is_vanguard(self):
        return self.type_line.lower() == "vanguard"

    def upgrade(self, upgrade: "Card"):
        if not upgrade.is_upgrade:
            raise ValueError(f"{upgrade.name} is not a conspiracy and hence cannot be an upgrade")
        self.upgrades.append(upgrade)
        upgrade.upgrades.append(self)


class Battler(BaseModel):
    cards: list[Card]
    upgrades: list[Card]
    vanguards: list[Card]

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    @property
    def elo(self) -> float:
        return sum(card.elo for card in self.cards) / len(self.cards)


DEFAULT_VANGUARD_ID = "default_mtb_vanguards"
DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str | None = None,
    vanguards_id: str | None = None,
) -> Battler:
    try:
        cards = get_cube_data(battler_id)

        vanguards = [card for card in cards if card.type_line.lower() == "vanguard"]
        if vanguards_id is not None:
            if len(vanguards) > 0:
                warnings.warn("Vanguards found in battler. Replacing them with vanguards from the passed vanguard id.")
            vanguards = get_cube_data(vanguards_id)

        upgrades = [card for card in cards if card.type_line.lower() == "conspiracy"]
        if upgrades_id is not None:
            if len(upgrades) > 0:
                warnings.warn("Upgrades found in battler. Replacing them with upgrades from the passed upgrades id.")
            upgrades = get_cube_data(upgrades_id)

        cards = [card for card in cards if card.type_line.lower() not in ("vanguard", "conspiracy")]
    finally:
        stop_worker()

    return Battler(cards=cards, upgrades=upgrades, vanguards=vanguards)

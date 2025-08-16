import random
import warnings
from concurrent.futures import ThreadPoolExecutor

import requests
from pydantic import BaseModel, Field

from mtb.utils import get_json, stop_worker


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


def get_card_from_scryfall(card_id: str) -> Card:
    card_json = get_json(f"https://api.scryfall.com/cards/{card_id}")
    image_url = card_json.get("image_uris", {}).get("normal")
    if image_url is None:
        image_url = card_json["card_faces"][0]["image_uris"]["normal"]
        flip_image_url = card_json["card_faces"][1]["image_uris"]["normal"]
    else:
        flip_image_url = None
    return Card(
        name=card_json["name"],
        image_url=image_url,
        flip_image_url=flip_image_url,
        type_line=card_json["type_line"],
        id=card_json["id"],
    )


def cubecobra_to_card(card_json: dict) -> Card:
    card_json = card_json["details"]
    tokens = tuple(card_json.get("tokens", []))
    if len(tokens) > 0:
        # NOTE: get_json is cached so this shouldn't be an issue for repeated tokens
        tokens = tuple(get_card_from_scryfall(token) for token in tokens)
    return Card(
        name=card_json["name_lower"],
        image_url=card_json["image_normal"],
        elo=card_json["elo"],
        type_line=card_json["type"],
        tokens=tokens,
        flip_image_url=card_json.get("image_flip"),
        id=card_json["scryfall_id"],
    )


DEFAULT_VANGUARD_ID = "default_mtb_vanguards"
DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"


def get_cube_data(cube_id: str) -> list[Card]:
    url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"

    response = requests.get(url)
    data = response.json()
    cube = data["cards"]["mainboard"]

    with ThreadPoolExecutor() as executor:
        results = list(executor.map(cubecobra_to_card, cube))
    return results


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


if __name__ == "__main__":
    # Example usage
    battler = build_battler()
    print(battler)
    print(f"Elo: {battler.elo}")
    battler.shuffle()
    print("Shuffled cards:", battler.cards)

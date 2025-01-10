import random
from concurrent.futures import ThreadPoolExecutor

import requests
from pydantic import BaseModel

from mtb.utils import get_json


class Card(BaseModel):
    name: str
    image_url: str
    id: str
    tokens: list["Card"] | None = None
    flip_image_url: str | None = None
    elo: float = 0.0

    def __hash__(self):
        return hash(
            tuple(
                tuple(self.name, self.image_url, self.flip_image_url, self.elo, self.id),
                tuple(card.__hash__() for card in self.tokens) if self.tokens is not None else None,
            )
        )
    
# NOTE: is this necessary??
class Upgrade(Card):
    upgraded_card: str | None = None

class Battler(BaseModel):
    cards: list[Card]
    upgrades: list[Card]
    vanguards: list[Card]

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    @property
    def elo(self):
        return sum(card.elo for card in self.cards) / len(self.cards)

    @property
    def id(self):
        return hash(self)

    def __hash__(self):
        return hash(
            (
                tuple(card.name for card in self.cards),
                tuple(card.name for card in self.upgrades),
                tuple(card.name for card in self.vanguards),
            )
        )


def scryfall_to_card(card_json: dict) -> Card:
    image_url = card_json.get("image_uris", {}).get("normal")
    if image_url is None:
        image_url = card_json["card_faces"][0]["image_uris"]["normal"]
        flip_image_url = card_json["card_faces"][1]["image_uris"]["normal"]
    else:
        flip_image_url = None
    try:
        return Card(
            name=card_json["name"],
            image_url=image_url,
            flip_image_url=flip_image_url,
            tokens=[],
            id=card_json["id"],
        )
    except Exception as e:
        print(e)
        breakpoint()


def cubecobra_to_card(card_json: dict) -> Card:
    card_json = card_json["details"]
    tokens = card_json.get("tokens")
    if tokens is not None and len(tokens) == 0:
        tokens = None
    if tokens is not None:
        tokens = [scryfall_to_card(get_json(f"https://api.scryfall.com/cards/{token}")) for token in tokens]
    try:
        return Card(
            name=card_json["name_lower"],
            image_url=card_json["image_normal"],
            elo=card_json["elo"],
            tokens=tokens,
            flip_image_url=card_json.get("image_flip"),
            id=card_json["scryfall_id"],
        )
    except Exception as e:
        print(e)
        breakpoint()


DEFAULT_VANGUARD_ID = "default_mtb_vanguards"
DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"


def get_cube_data(cube_id: str) -> list[Card]:
    url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"

    response = requests.get(url)
    data = response.json()
    cube = data["cards"]["mainboard"]

    # NOTE: should make sure this doesnt run into rate limits.
    #       maybe I should create a card DB and only hit this if the card is not in the DB.
    with ThreadPoolExecutor() as executor:
        results = list(executor.map(cubecobra_to_card, cube))
    return results


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str = DEFAULT_UPGRADES_ID,
    vanguards_id: str = DEFAULT_VANGUARD_ID,
) -> Battler:
    battler = Battler(
        cards=get_cube_data(battler_id),
        upgrades=[],  # get_cube_data(upgrades_id),
        vanguards=[],  # =get_cube_data(vanguards_id),
    )

    return battler


if __name__ == "__main__":
    Battler = build_battler()
    print(Battler)

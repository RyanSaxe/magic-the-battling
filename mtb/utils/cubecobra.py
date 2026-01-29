from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from mtb.models.cards import Card
from mtb.utils.json_helpers import get_json
from mtb.utils.scryfall import get_card_from_scryfall


def get_cube_data(cube_id: str) -> list[Card]:
    url = f"https://cubecobra.com/cube/api/cubejson/{cube_id}"
    data = get_json(url)
    cube = data["cards"]["mainboard"]

    with ThreadPoolExecutor() as executor:
        results = list(executor.map(cubecobra_to_card, cube))
    return results


def cubecobra_to_card(card_json: dict) -> Card:
    card_json = card_json["details"]
    tokens = tuple(card_json.get("tokens", []))
    if len(tokens) > 0:
        # NOTE: get_json is cached so this shouldn't be an issue for repeated tokens
        tokens = tuple(get_card_from_scryfall(token) for token in tokens)
    return Card(
        name=card_json["name_lower"],
        image_url=card_json["image_normal"],
        png_url=card_json.get("image_large"),
        elo=card_json["elo"],
        type_line=card_json["type"],
        tokens=tokens,
        flip_image_url=card_json.get("image_flip"),
        id=f"{card_json['scryfall_id']}-{uuid4().hex[:8]}",
    )

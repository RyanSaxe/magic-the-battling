from mtb.models.cards import Card
from mtb.utils.json_helpers import get_json


def get_card_from_scryfall(card_id: str) -> Card:
    card_json = get_json(f"https://api.scryfall.com/cards/{card_id}")
    image_url = card_json.get("image_uris", {}).get("normal")
    if image_url is None:
        image_url = card_json["card_faces"][0]["image_uris"]["normal"]
        flip_image_url = card_json["card_faces"][1]["image_uris"]["normal"]
    else:
        flip_image_url = None
    card = Card(
        name=card_json["name"],
        image_url=image_url,
        flip_image_url=flip_image_url,
        type_line=card_json["type_line"],
        id=card_json["id"],
    )

    if card.type_line == "Vanguard":
        # NOTE: purposefully not using get with default 0 here to raise KeyError if missing
        card.life_modifier = int(card_json["hand_modifier"])
        card.hand_modifier = int(card_json["life_modifier"])

    return card

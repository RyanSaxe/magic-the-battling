from mtb.models.cards import Card
from mtb.utils.json_helpers import get_json


def get_card_from_scryfall(card_id: str) -> Card:
    card_json = get_json(f"https://api.scryfall.com/cards/{card_id}")
    image_uris = card_json.get("image_uris", {})
    image_url = image_uris.get("normal")
    png_url = image_uris.get("png")
    if image_url is None:
        face_0 = card_json["card_faces"][0]["image_uris"]
        face_1 = card_json["card_faces"][1]["image_uris"]
        image_url = face_0["normal"]
        png_url = face_0.get("png")
        flip_image_url = face_1["normal"]
        flip_png_url = face_1.get("png")
    else:
        flip_image_url = None
        flip_png_url = None
    card = Card(
        name=card_json["name"],
        image_url=image_url,
        flip_image_url=flip_image_url,
        png_url=png_url,
        flip_png_url=flip_png_url,
        type_line=card_json["type_line"],
        id=card_json["id"],
    )

    if card.type_line == "Vanguard":
        # Keep field mapping consistent with Scryfall's schema
        # https://scryfall.com/docs/api/cards
        # vanguard has `hand_modifier` and `life_modifier` fields directly on the card
        card.hand_modifier = int(card_json["hand_modifier"])  # number of cards in hand
        card.life_modifier = int(card_json["life_modifier"])  # starting life

    return card

from __future__ import annotations

import re
from dataclasses import dataclass

_HEX8_RE = re.compile(r"^[0-9a-f]{8}$")

CARD_DATA_FIELDS = frozenset(
    {
        "name",
        "image_url",
        "type_line",
        "flip_image_url",
        "png_url",
        "flip_png_url",
        "elo",
        "oracle_text",
        "colors",
        "keywords",
        "cmc",
        "life_modifier",
        "hand_modifier",
        "token_scryfall_ids",
        "tokens",
    }
)


@dataclass(frozen=True, slots=True)
class CardData:
    name: str
    image_url: str
    type_line: str
    flip_image_url: str | None = None
    png_url: str | None = None
    flip_png_url: str | None = None
    elo: float = 0.0
    oracle_text: str | None = None
    colors: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    cmc: float = 0.0
    life_modifier: int | None = None
    hand_modifier: int | None = None
    token_scryfall_ids: tuple[str, ...] = ()


_card_registry: dict[str, CardData] = {}


def derive_scryfall_id(card_id: str) -> str:
    dash_pos = card_id.rfind("-")
    if dash_pos == -1:
        return card_id
    suffix = card_id[dash_pos + 1 :]
    if len(suffix) == 8 and _HEX8_RE.match(suffix):
        return card_id[:dash_pos]
    return card_id


def register_card_data(scryfall_id: str, data: dict) -> None:
    if scryfall_id in _card_registry:
        return

    raw_token_ids = data.get("token_scryfall_ids")
    if raw_token_ids is not None:
        token_scryfall_ids = tuple(raw_token_ids) if isinstance(raw_token_ids, list) else raw_token_ids
    else:
        tokens = data.get("tokens", ())
        ids: list[str] = []
        for t in tokens:
            if isinstance(t, dict):
                t_id = t.get("id", "")
                if t_id:
                    ids.append(derive_scryfall_id(t_id))
            elif isinstance(t, str):
                ids.append(t)
        token_scryfall_ids = tuple(ids)

    colors = data.get("colors", ())
    if isinstance(colors, list):
        colors = tuple(colors)
    keywords = data.get("keywords", ())
    if isinstance(keywords, list):
        keywords = tuple(keywords)

    _card_registry[scryfall_id] = CardData(
        name=data.get("name", ""),
        image_url=data.get("image_url", ""),
        type_line=data.get("type_line", ""),
        flip_image_url=data.get("flip_image_url"),
        png_url=data.get("png_url"),
        flip_png_url=data.get("flip_png_url"),
        elo=data.get("elo", 0.0),
        oracle_text=data.get("oracle_text"),
        colors=colors,
        keywords=keywords,
        cmc=data.get("cmc", 0.0),
        life_modifier=data.get("life_modifier"),
        hand_modifier=data.get("hand_modifier"),
        token_scryfall_ids=token_scryfall_ids,
    )


def get_card_data(scryfall_id: str) -> CardData:
    try:
        return _card_registry[scryfall_id]
    except KeyError:
        raise KeyError(f"No CardData registered for scryfall_id={scryfall_id!r}") from None


def export_registry() -> dict[str, dict]:
    from dataclasses import asdict  # noqa: PLC0415

    return {sid: asdict(cd) for sid, cd in _card_registry.items()}


def import_registry(data: dict[str, dict]) -> None:
    for sid, fields in data.items():
        if sid not in _card_registry:
            colors = fields.get("colors", ())
            if isinstance(colors, list):
                colors = tuple(colors)
            keywords = fields.get("keywords", ())
            if isinstance(keywords, list):
                keywords = tuple(keywords)
            token_ids = fields.get("token_scryfall_ids", ())
            if isinstance(token_ids, list):
                token_ids = tuple(token_ids)
            _card_registry[sid] = CardData(
                name=fields.get("name", ""),
                image_url=fields.get("image_url", ""),
                type_line=fields.get("type_line", ""),
                flip_image_url=fields.get("flip_image_url"),
                png_url=fields.get("png_url"),
                flip_png_url=fields.get("flip_png_url"),
                elo=fields.get("elo", 0.0),
                oracle_text=fields.get("oracle_text"),
                colors=colors,
                keywords=keywords,
                cmc=fields.get("cmc", 0.0),
                life_modifier=fields.get("life_modifier"),
                hand_modifier=fields.get("hand_modifier"),
                token_scryfall_ids=token_ids,
            )


def clear_registry() -> None:
    _card_registry.clear()

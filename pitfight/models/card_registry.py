"""Shared in-memory card metadata registry for slim snapshot serialization."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any, TypedDict

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pitfight.models.cards import Card

_HEX8_RE = re.compile(r"^[0-9a-f]{8}$")


class CardDataInput(TypedDict, total=False):
    name: str
    image_url: str
    type_line: str
    flip_image_url: str | None
    png_url: str | None
    flip_png_url: str | None
    elo: float
    oracle_text: str | None
    colors: Sequence[str]
    keywords: Sequence[str]
    cmc: float
    life_modifier: int | None
    hand_modifier: int | None
    token_scryfall_ids: Sequence[str]
    tokens: Sequence[Card | dict[str, Any] | str]


CARD_DATA_FIELDS = frozenset(CardDataInput.__annotations__)


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
_HEX8_LEN = 8


def derive_scryfall_id(card_id: str) -> str:
    dash_pos = card_id.rfind("-")
    if dash_pos == -1:
        return card_id
    suffix = card_id[dash_pos + 1 :]
    if len(suffix) == _HEX8_LEN and _HEX8_RE.match(suffix):
        return card_id[:dash_pos]
    return card_id


def extract_token_scryfall_ids(tokens: Sequence[object]) -> tuple[str, ...]:
    ids: list[str] = []
    for token in tokens:
        if hasattr(token, "scryfall_id"):
            ids.append(str(token.scryfall_id))
        elif isinstance(token, dict):
            token_id = token.get("id", "")
            token_sid = token.get("scryfall_id", "") or (derive_scryfall_id(token_id) if token_id else "")
            if token_sid:
                ids.append(token_sid)
                if "name" in token:
                    register_card_data(token_sid, token)
        elif isinstance(token, str):
            ids.append(token)
    return tuple(ids)


def register_card_data(scryfall_id: str, data: dict) -> None:
    if scryfall_id in _card_registry:
        return

    raw_token_ids = data.get("token_scryfall_ids")
    if raw_token_ids is not None:
        token_scryfall_ids = tuple(raw_token_ids) if isinstance(raw_token_ids, list) else raw_token_ids
    else:
        token_scryfall_ids = extract_token_scryfall_ids(data.get("tokens", ()))

    colors = tuple(data.get("colors", ()))
    keywords = tuple(data.get("keywords", ()))

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
        msg = f"No CardData registered for scryfall_id={scryfall_id!r}"
        raise KeyError(msg) from None


def _expand_scryfall_ids(scryfall_ids: set[str]) -> set[str]:
    expanded = set(scryfall_ids)
    stack = list(scryfall_ids)

    while stack:
        sid = stack.pop()
        card_data = _card_registry.get(sid)
        if card_data is None:
            continue
        for token_sid in card_data.token_scryfall_ids:
            if token_sid in expanded:
                continue
            expanded.add(token_sid)
            stack.append(token_sid)

    return expanded


def export_registry(scryfall_ids: set[str] | None = None) -> dict[str, dict]:
    if scryfall_ids is None:
        return {sid: asdict(cd) for sid, cd in _card_registry.items()}
    expanded = _expand_scryfall_ids(scryfall_ids)
    return {sid: asdict(_card_registry[sid]) for sid in expanded if sid in _card_registry}


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

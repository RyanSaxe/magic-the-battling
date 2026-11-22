import hashlib
import os
import random
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urlsplit
from uuid import uuid4

from httpx import HTTPStatusError

from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID, Card
from mtb.models.types import UPGRADE_TYPE, VANGUARD_TYPE
from mtb.utils import json_helpers
from mtb.utils.json_helpers import revalidate_and_get
from mtb.utils.scryfall import get_card_from_scryfall

MOCK_CUBE_DATA_ENV = "MTB_FAKE_CUBE_DATA"
MOCK_MAINBOARD_SIZE = 240
MOCK_UPGRADES_SIZE = 4
MOCK_VANGUARDS_SIZE = 4
MOCK_COLORS = ("W", "U", "B", "R", "G")

_CARD_EXECUTOR = ThreadPoolExecutor(max_workers=8)


def _env_flag_enabled(name: str) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return False
    return raw.strip().lower() not in {"", "0", "false", "no", "off"}


def _mock_rng(cube_id: str) -> random.Random:
    digest = hashlib.sha256(cube_id.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return random.Random(seed)


def _mock_card(
    cube_id: str,
    idx: int,
    *,
    type_line: str,
    rng: random.Random,
    life_modifier: int | None = None,
    hand_modifier: int | None = None,
) -> Card:
    ident = f"mock-{cube_id}-{idx:04d}"
    color_count = rng.randint(0, 2)
    colors = list(rng.sample(MOCK_COLORS, color_count))
    return Card(
        name=f"{cube_id}_card_{idx:04d}",
        image_url=f"https://example.invalid/{ident}.jpg",
        png_url=f"https://example.invalid/{ident}.png",
        id=ident,
        scryfall_id=ident,
        type_line=type_line,
        elo=1000.0 + rng.uniform(-120.0, 120.0),
        colors=colors,
        keywords=[],
        cmc=float(rng.randint(0, 7)),
        life_modifier=life_modifier,
        hand_modifier=hand_modifier,
    )


def _mock_cube_data(cube_id: str) -> list[Card]:
    rng = _mock_rng(cube_id)
    if cube_id == DEFAULT_UPGRADES_ID:
        return [_mock_card(cube_id, idx, type_line=UPGRADE_TYPE, rng=rng) for idx in range(MOCK_UPGRADES_SIZE)]
    if cube_id == DEFAULT_VANGUARD_ID:
        return [
            _mock_card(
                cube_id,
                idx,
                type_line=VANGUARD_TYPE,
                rng=rng,
                life_modifier=rng.randint(-2, 6),
                hand_modifier=rng.randint(-1, 2),
            )
            for idx in range(MOCK_VANGUARDS_SIZE)
        ]

    return [_mock_card(cube_id, idx, type_line="creature", rng=rng) for idx in range(MOCK_MAINBOARD_SIZE)]


def cube_json_url(cube_id: str) -> str:
    return f"https://cubecobra.com/cube/api/cubejson/{cube_id}"


def cube_id_from_input(text: str) -> str:
    """The cube ID in what a player entered: the ID itself, or a link to one of the cube's pages on CubeCobra.

    Raises ValueError for a link to anything else.
    """
    text = text.strip()
    if "/" not in text:
        return text
    url = urlsplit(text if "://" in text else f"https://{text}")
    host = url.hostname or ""
    segments = [segment for segment in url.path.split("/") if segment]
    # A cube's pages are /cube/<page>/<id>, such as /cube/list/vintage and /cube/overview/vintage.
    if (host == "cubecobra.com" or host.endswith(".cubecobra.com")) and len(segments) >= 3 and segments[0] == "cube":
        return unquote(segments[2])
    raise ValueError(f"not a link to a cube on CubeCobra: {text}")


def cube_exists_on_cubecobra(cube_id: str) -> bool:
    """False when CubeCobra answers that it has no cube with this ID. Other failures to ask it are raised."""
    if _env_flag_enabled(MOCK_CUBE_DATA_ENV):
        return True
    try:
        json_helpers.get_json(cube_json_url(cube_id))
    except HTTPStatusError as error:
        if error.response.status_code == 404:
            return False
        raise
    return True


def get_cube_data(cube_id: str) -> list[Card]:
    if _env_flag_enabled(MOCK_CUBE_DATA_ENV):
        return _mock_cube_data(cube_id)

    data = revalidate_and_get(cube_json_url(cube_id))
    cube = data["cards"]["mainboard"]

    results = list(_CARD_EXECUTOR.map(cubecobra_to_card, cube))
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
        scryfall_id=card_json["scryfall_id"],
        oracle_text=card_json.get("oracle_text"),
        colors=card_json.get("colors", []),
        keywords=card_json.get("keywords", []),
        cmc=card_json.get("cmc", 0),
    )

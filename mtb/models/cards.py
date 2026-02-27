import random
import warnings

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
    upgrade_target: "Card | None" = None
    oracle_text: str | None = None
    original_owner: str | None = None
    colors: list[str] = Field(default_factory=list)
    cmc: float = 0.0

    # vanguard specific properties
    life_modifier: int | None = None
    hand_modifier: int | None = None

    @property
    def is_upgrade(self) -> bool:
        return self.type_line.lower() == UPGRADE_TYPE

    @property
    def is_vanguard(self) -> bool:
        return self.type_line.lower() == VANGUARD_TYPE

    @property
    def is_companion(self) -> bool:
        return self.oracle_text is not None and "Companion —" in self.oracle_text

    def upgrade(self, upgrade: "Card") -> None:
        if not upgrade.is_upgrade:
            raise ValueError(f"{upgrade.name} is not a conspiracy and hence cannot be an upgrade")
        if upgrade.upgrade_target is not None and upgrade.upgrade_target is not self:
            raise ValueError(f"{upgrade.name} is already linked to {upgrade.upgrade_target.name}")
        upgrade.upgrade_target = self


class Battler(BaseModel):
    cards: list[Card]
    upgrades: list[Card]
    vanguards: list[Card]
    elo: float = 0.0
    original_cards: list[Card] = Field(default_factory=list)
    original_upgrades: list[Card] = Field(default_factory=list)

    def shuffle(self) -> None:
        random.shuffle(self.cards)


DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"

# TODO: actually add a lot of vanguards to the default cube
DEFAULT_VANGUARD_ID = "default_mtb_vanguards"


_SYNTHETIC_COLOR_PATTERNS: tuple[tuple[str, ...], ...] = (
    (),
    ("W",),
    ("U",),
    ("B",),
    ("R",),
    ("G",),
    ("W", "U"),
    ("U", "B"),
    ("B", "R"),
    ("R", "G"),
    ("G", "W"),
    ("W", "B", "G"),
)
_SYNTHETIC_TYPE_LINES: tuple[str, ...] = (
    "Creature - Soldier",
    "Creature - Wizard",
    "Instant",
    "Sorcery",
    "Enchantment",
    "Artifact",
)


def _synthetic_asset_url(card_id: str, kind: str, ext: str) -> str:
    return f"https://mtb.synthetic.invalid/{kind}/{card_id}.{ext}"


def build_synthetic_battler(
    playable_count: int = 240,
    upgrades_count: int = 4,
    vanguards_count: int = 0,
) -> Battler:
    if playable_count <= 0:
        raise ValueError("playable_count must be greater than 0")

    cards: list[Card] = []
    for i in range(playable_count):
        card_id = f"synthetic-card-{i:04d}"
        has_flip = i % 13 == 0
        cards.append(
            Card(
                name=f"Synthetic Card {i}",
                image_url=_synthetic_asset_url(card_id, "image", "jpg"),
                png_url=_synthetic_asset_url(card_id, "image", "png"),
                flip_image_url=_synthetic_asset_url(card_id, "image", "back.jpg") if has_flip else None,
                flip_png_url=_synthetic_asset_url(card_id, "image", "back.png") if has_flip else None,
                id=card_id,
                type_line=_SYNTHETIC_TYPE_LINES[i % len(_SYNTHETIC_TYPE_LINES)],
                elo=1200.0,
                oracle_text=f"Synthetic load-test card {i}.",
                colors=list(_SYNTHETIC_COLOR_PATTERNS[i % len(_SYNTHETIC_COLOR_PATTERNS)]),
                cmc=float(i % 8),
            )
        )

    upgrades = [
        Card(
            name=f"Synthetic Upgrade {i}",
            image_url=_synthetic_asset_url(f"synthetic-upgrade-{i:03d}", "image", "jpg"),
            png_url=_synthetic_asset_url(f"synthetic-upgrade-{i:03d}", "image", "png"),
            id=f"synthetic-upgrade-{i:03d}",
            type_line=UPGRADE_TYPE,
            elo=1200.0,
            oracle_text=f"Synthetic upgrade {i}.",
            colors=[],
            cmc=0.0,
        )
        for i in range(max(0, upgrades_count))
    ]

    vanguards = [
        Card(
            name=f"Synthetic Vanguard {i}",
            image_url=_synthetic_asset_url(f"synthetic-vanguard-{i:03d}", "image", "jpg"),
            png_url=_synthetic_asset_url(f"synthetic-vanguard-{i:03d}", "image", "png"),
            id=f"synthetic-vanguard-{i:03d}",
            type_line=VANGUARD_TYPE,
            elo=1200.0,
            life_modifier=0,
            hand_modifier=0,
            oracle_text=f"Synthetic vanguard {i}.",
            colors=[],
            cmc=0.0,
        )
        for i in range(max(0, vanguards_count))
    ]

    return Battler(
        cards=cards,
        upgrades=upgrades,
        vanguards=vanguards,
        elo=1200.0,
        original_cards=list(cards),
        original_upgrades=list(upgrades),
    )


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str | None = None,
    vanguards_id: str | None = None,
) -> Battler:
    from mtb.utils.cubecobra import get_cube_data  # noqa: PLC0415

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

    elo = sum(card.elo for card in cards) / len(cards)
    return Battler(
        cards=cards,
        upgrades=upgrades,
        vanguards=vanguards,
        elo=elo,
        original_cards=list(cards),
        original_upgrades=list(upgrades),
    )

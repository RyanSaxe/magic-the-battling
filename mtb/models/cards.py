import random

from pydantic import BaseModel, Field

from mtb.models.types import UPGRADE_TYPE, VANGUARD_TYPE, PlayMode

CONSTRUCTED_MIN_CARDS = 100
SHARED_BANNED_KEYWORDS = {"toxic", "poisonous", "proliferate"}
CONSTRUCTED_BANNED_KEYWORDS: set[str] = set()
LIMITED_BANNED_KEYWORDS: set[str] = set()
SHARED_BANNED_CARD_NAMES = {"thassa's oracle", "laboratory maniac", "unexpected potential"}
CONSTRUCTED_BANNED_CARD_NAMES: set[str] = set()
LIMITED_BANNED_CARD_NAMES: set[str] = set()


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
    keywords: list[str] = Field(default_factory=list)
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
    source_id: str | None = None
    original_cards: list[Card] = Field(default_factory=list)
    original_upgrades: list[Card] = Field(default_factory=list)

    def shuffle(self) -> None:
        random.shuffle(self.cards)


DEFAULT_BATTLER_ID = "auto"
DEFAULT_UPGRADES_ID = "default_mtb_upgrades"

# TODO: actually add a lot of vanguards to the default cube
DEFAULT_VANGUARD_ID = "default_mtb_vanguards"


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str | None = None,
    vanguards_id: str | None = None,
) -> Battler:
    from mtb.utils.cubecobra import get_cube_data  # noqa: PLC0415

    cards = get_cube_data(battler_id)
    source_vanguards = [card for card in cards if card.type_line.lower() == VANGUARD_TYPE]
    source_upgrades = [card for card in cards if card.type_line.lower() == UPGRADE_TYPE]

    if source_vanguards or source_upgrades:
        # Temporary guard: battlers cannot supply their own Conspiracies/Vanguards yet.
        # The only supported path right now is the separate default MTB supplemental cubes.
        raise ValueError(
            f"Battler '{battler_id}' is illegal: battler-defined Conspiracy and Vanguard cards "
            "are not supported right now. Use the default MTB upgrades/vanguards instead."
        )

    vanguards = get_cube_data(vanguards_id) if vanguards_id is not None else []

    upgrades = get_cube_data(upgrades_id) if upgrades_id is not None else []
    if not cards:
        raise ValueError(f"Battler '{battler_id}' is illegal: it has no playable cards.")

    elo = sum(card.elo for card in cards) / len(cards)
    return Battler(
        cards=cards,
        upgrades=upgrades,
        vanguards=vanguards,
        elo=elo,
        source_id=battler_id,
        original_cards=list(cards),
        original_upgrades=list(upgrades),
    )


def _normalize_card_name(name: str) -> str:
    return name.strip().casefold().replace("\u2019", "'")


def _get_banned_card_names(play_mode: PlayMode) -> set[str]:
    if play_mode == "constructed":
        return SHARED_BANNED_CARD_NAMES | CONSTRUCTED_BANNED_CARD_NAMES
    return SHARED_BANNED_CARD_NAMES | LIMITED_BANNED_CARD_NAMES


def _get_banned_keywords(play_mode: PlayMode) -> set[str]:
    if play_mode == "constructed":
        return SHARED_BANNED_KEYWORDS | CONSTRUCTED_BANNED_KEYWORDS
    return SHARED_BANNED_KEYWORDS | LIMITED_BANNED_KEYWORDS


def validate_battler(battler: Battler, play_mode: PlayMode = "constructed") -> None:
    playable_cards = battler.cards
    if len(playable_cards) < CONSTRUCTED_MIN_CARDS:
        battler_id = battler.source_id or "unknown"
        msg = (
            f"Battler '{battler_id}' is illegal: it has {len(playable_cards)} playable cards "
            f"and needs at least {CONSTRUCTED_MIN_CARDS}."
        )
        raise ValueError(msg)

    seen_names: set[str] = set()
    duplicate_name: str | None = None
    for card in playable_cards:
        normalized_name = _normalize_card_name(card.name)
        if normalized_name in seen_names:
            duplicate_name = card.name
            break
        seen_names.add(normalized_name)

    if duplicate_name is not None:
        battler_id = battler.source_id or "unknown"
        raise ValueError(
            f"Battler '{battler_id}' is illegal: it is not singleton because {duplicate_name} appears more than once."
        )

    for card in playable_cards:
        normalized_name = _normalize_card_name(card.name)
        if normalized_name in _get_banned_card_names(play_mode):
            battler_id = battler.source_id or "unknown"
            raise ValueError(f"Battler '{battler_id}' is illegal: {card.name} is banned.")

        keywords = {keyword.strip().casefold() for keyword in card.keywords}
        banned_keywords = sorted(_get_banned_keywords(play_mode) & keywords)
        if banned_keywords:
            battler_id = battler.source_id or "unknown"
            keyword = banned_keywords[0]
            raise ValueError(f"Battler '{battler_id}' is illegal: {card.name} has the banned keyword {keyword}.")


def validate_constructed_battler(battler: Battler) -> None:
    validate_battler(battler, play_mode="constructed")

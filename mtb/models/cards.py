import random
from typing import Any

from pydantic import BaseModel, Field, PrivateAttr, computed_field, model_serializer, model_validator

from mtb.models.card_registry import (
    CARD_DATA_FIELDS,
    CardData,
    derive_scryfall_id,
    get_card_data,
    register_card_data,
)
from mtb.models.types import UPGRADE_TYPE, VANGUARD_TYPE, PlayMode

CONSTRUCTED_MIN_CARDS = 100
SHARED_BANNED_KEYWORDS = {"toxic", "poisonous", "proliferate"}
CONSTRUCTED_BANNED_KEYWORDS: set[str] = set()
LIMITED_BANNED_KEYWORDS: set[str] = set()
SHARED_BANNED_CARD_NAMES = {"thassa's oracle", "laboratory maniac", "unexpected potential"}
CONSTRUCTED_BANNED_CARD_NAMES: set[str] = set()
LIMITED_BANNED_CARD_NAMES: set[str] = set()


class Card(BaseModel):
    model_config = {"extra": "ignore"}

    id: str
    scryfall_id: str = ""
    upgrade_target: "Card | None" = None
    original_owner: str | None = None

    _card_data: CardData | None = PrivateAttr(default=None)
    _tokens_cache: tuple["Card", ...] | None = PrivateAttr(default=None)

    @model_validator(mode="before")
    @classmethod
    def _register_and_derive(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        card_id = data.get("id", "")
        scryfall_id = data.get("scryfall_id", "")
        if not scryfall_id and card_id:
            scryfall_id = derive_scryfall_id(card_id)
            data["scryfall_id"] = scryfall_id

        if "name" in data and scryfall_id:
            if "token_scryfall_ids" not in data:
                tokens = data.get("tokens", ())
                sids: list[str] = []
                for t in tokens:
                    if hasattr(t, "scryfall_id"):
                        sids.append(t.scryfall_id)
                    elif isinstance(t, dict):
                        t_id = t.get("id", "")
                        t_sid = t.get("scryfall_id", "") or (derive_scryfall_id(t_id) if t_id else "")
                        if t_sid:
                            sids.append(t_sid)
                            if "name" in t:
                                register_card_data(t_sid, t)
                    elif isinstance(t, str):
                        sids.append(t)
                data["token_scryfall_ids"] = tuple(sids)

            register_card_data(scryfall_id, data)

        return data

    def model_post_init(self, __context: Any) -> None:
        if self.scryfall_id:
            try:
                self._card_data = get_card_data(self.scryfall_id)
            except KeyError:
                pass

    def _data(self) -> CardData:
        if self._card_data is not None:
            return self._card_data
        self._card_data = get_card_data(self.scryfall_id)
        return self._card_data

    @computed_field
    @property
    def name(self) -> str:
        return self._data().name

    @computed_field
    @property
    def image_url(self) -> str:
        return self._data().image_url

    @computed_field
    @property
    def type_line(self) -> str:
        return self._data().type_line

    @computed_field
    @property
    def flip_image_url(self) -> str | None:
        return self._data().flip_image_url

    @computed_field
    @property
    def png_url(self) -> str | None:
        return self._data().png_url

    @computed_field
    @property
    def flip_png_url(self) -> str | None:
        return self._data().flip_png_url

    @computed_field
    @property
    def elo(self) -> float:
        return self._data().elo

    @computed_field
    @property
    def oracle_text(self) -> str | None:
        return self._data().oracle_text

    @computed_field
    @property
    def colors(self) -> list[str]:
        return list(self._data().colors)

    @computed_field
    @property
    def keywords(self) -> list[str]:
        return list(self._data().keywords)

    @computed_field
    @property
    def cmc(self) -> float:
        return self._data().cmc

    @computed_field
    @property
    def life_modifier(self) -> int | None:
        return self._data().life_modifier

    @computed_field
    @property
    def hand_modifier(self) -> int | None:
        return self._data().hand_modifier

    @computed_field
    @property
    def tokens(self) -> tuple["Card", ...]:
        if self._tokens_cache is not None:
            return self._tokens_cache
        token_sids = self._data().token_scryfall_ids
        if not token_sids:
            self._tokens_cache = ()
            return ()
        result = tuple(Card(id=sid, scryfall_id=sid) for sid in token_sids)
        self._tokens_cache = result
        return result

    @model_serializer(mode="wrap")
    def _serialize(self, handler: Any, info: Any) -> dict[str, Any]:
        data = handler(self)
        if info.context and info.context.get("slim_cards"):
            for field_name in CARD_DATA_FIELDS:
                data.pop(field_name, None)
        return data

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

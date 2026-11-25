"""Card, Battler, and CubeCobra deck validation models."""

import random
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, Protocol, Required, Unpack

from pydantic import (
    BaseModel,
    Field,
    PrivateAttr,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    computed_field,
    model_serializer,
    model_validator,
)

from mtb.models.card_registry import (
    CardData,
    CardDataInput,
    derive_scryfall_id,
    extract_token_scryfall_ids,
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
MAX_BANNED_CARDS_NAMED = 3
NO_PLAYABLE_CARDS = "it has no playable cards."


if TYPE_CHECKING:

    class CardArguments(CardDataInput, total=False):
        id: Required[str]
        scryfall_id: str
        upgrade_target: "Card | None"
        is_revealed: bool
        original_owner: str | None


class Card(BaseModel):
    model_config = {"extra": "ignore"}

    id: str
    scryfall_id: str = ""
    upgrade_target: "Card | None" = None
    is_revealed: bool = True
    original_owner: str | None = None

    _card_data: CardData | None = PrivateAttr(default=None)
    _tokens_cache: tuple["Card", ...] | None = PrivateAttr(default=None)

    if TYPE_CHECKING:
        # Card also takes card data, which _register_and_derive moves into the registry before Pydantic
        # drops it as extra, so the constructor accepts more than the model's own fields.
        def __init__(self, **arguments: Unpack["CardArguments"]) -> None: ...

    @model_validator(mode="before")
    @classmethod
    def _register_and_derive(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data

        card_id = data.get("id", "")
        scryfall_id = data.get("scryfall_id", "")
        if not scryfall_id and card_id:
            scryfall_id = derive_scryfall_id(card_id)
            data["scryfall_id"] = scryfall_id

        if "name" in data and scryfall_id:
            if "token_scryfall_ids" not in data:
                data["token_scryfall_ids"] = extract_token_scryfall_ids(data.get("tokens", ()))
            register_card_data(scryfall_id, data)

        return data

    def model_post_init(self, context: object, /) -> None:
        _ = context
        if not self.scryfall_id:
            return
        try:
            self._card_data = get_card_data(self.scryfall_id)
        except KeyError:
            self._card_data = None

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

        self._tokens_cache = tuple(Card(id=sid, scryfall_id=sid) for sid in token_sids)
        return self._tokens_cache

    @model_serializer(mode="wrap")
    def _serialize(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> dict[str, Any]:
        if info.context and info.context.get("slim_cards"):
            return {
                "id": self.id,
                "scryfall_id": self.scryfall_id,
                "upgrade_target": (
                    self.upgrade_target.model_dump(context=info.context) if self.upgrade_target is not None else None
                ),
                "is_revealed": self.is_revealed,
                "original_owner": self.original_owner,
            }
        return handler(self)

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
            msg = f"{upgrade.name} is not a conspiracy and hence cannot be an upgrade"
            raise ValueError(msg)
        if upgrade.upgrade_target is not None and upgrade.upgrade_target is not self:
            msg = f"{upgrade.name} is already linked to {upgrade.upgrade_target.name}"
            raise ValueError(msg)
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

DEFAULT_VANGUARD_ID = "default_mtb_vanguards"


class ListedCard(Protocol):
    """What the rules for starting read from a card."""

    @property
    def name(self) -> str: ...

    @property
    def type_line(self) -> str: ...

    @property
    def keywords(self) -> Sequence[str]: ...


class IllegalBattlerError(ValueError):
    """A card list that can't be played. `problem` is worded for players, so it never says battler."""

    def __init__(self, battler_id: str, problem: str) -> None:
        super().__init__(f"Battler '{battler_id}' is illegal: {problem}")
        self.battler_id = battler_id
        self.problem = problem


def build_battler(
    battler_id: str = DEFAULT_BATTLER_ID,
    upgrades_id: str | None = None,
    *,
    vanguards_id: str | None = None,
) -> Battler:
    from mtb.utils.cubecobra import get_cube_data  # noqa: PLC0415 -- deferred circular import

    cards = get_cube_data(battler_id)
    if problem := _own_supplements_problem(cards):
        raise IllegalBattlerError(battler_id, problem)

    vanguards = get_cube_data(vanguards_id) if vanguards_id is not None else []

    upgrades = get_cube_data(upgrades_id) if upgrades_id is not None else []
    if not cards:
        raise IllegalBattlerError(battler_id, NO_PLAYABLE_CARDS)

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


def _own_supplements_problem(cards: Sequence[ListedCard]) -> str | None:
    if all(card.type_line.lower() not in (UPGRADE_TYPE, VANGUARD_TYPE) for card in cards):
        return None
    # Temporary guard: battlers cannot supply their own Conspiracies/Vanguards yet.
    # The only supported path right now is the separate default MTB supplemental cubes.
    return (
        "its own Conspiracy and Vanguard cards are not supported right now. "
        "Use the default upgrades and vanguards instead."
    )


def _size_or_singleton_problem(cards: Sequence[ListedCard]) -> str | None:
    if len(cards) < CONSTRUCTED_MIN_CARDS:
        return f"it has {len(cards)} playable cards and needs at least {CONSTRUCTED_MIN_CARDS}."

    seen_names: set[str] = set()
    for card in cards:
        normalized_name = _normalize_card_name(card.name)
        if normalized_name in seen_names:
            return f"it is not singleton because {card.name} appears more than once."
        seen_names.add(normalized_name)
    return None


def _has_banned_name(card: ListedCard, play_mode: PlayMode) -> bool:
    return _normalize_card_name(card.name) in _get_banned_card_names(play_mode)


def _find_banned_keyword(card: ListedCard, play_mode: PlayMode) -> str | None:
    keywords = {keyword.strip().casefold() for keyword in card.keywords}
    return min(_get_banned_keywords(play_mode) & keywords, default=None)


def validate_battler(battler: Battler, play_mode: PlayMode = "constructed") -> None:
    battler_id = battler.source_id or "unknown"
    if problem := _size_or_singleton_problem(battler.cards):
        raise IllegalBattlerError(battler_id, problem)

    for card in battler.cards:
        if _has_banned_name(card, play_mode):
            raise IllegalBattlerError(battler_id, f"{card.name} is banned.")
        if keyword := _find_banned_keyword(card, play_mode):
            raise IllegalBattlerError(battler_id, f"{card.name} has the banned keyword {keyword}.")


def find_problem_before_saving(cards: Sequence[ListedCard], play_mode: PlayMode) -> str | None:
    """Why Start would refuse these cards, as a player reads it when saving them."""
    if problem := _own_supplements_problem(cards):
        return problem
    if not cards:
        return NO_PLAYABLE_CARDS
    if problem := _size_or_singleton_problem(cards):
        return problem

    banned = [card for card in cards if _has_banned_name(card, play_mode) or _find_banned_keyword(card, play_mode)]
    if not banned:
        return None
    return _format_banned_cards_problem(banned, play_mode)


def _format_banned_cards_problem(banned: Sequence[ListedCard], play_mode: PlayMode) -> str:
    if len(banned) == 1:
        [card] = banned
        if _has_banned_name(card, play_mode):
            return f"{card.name} is banned."
        keyword = _find_banned_keyword(card, play_mode) or ""
        return f"{card.name} has {keyword.capitalize()}, which is banned."
    named = [card.name for card in banned[:MAX_BANNED_CARDS_NAMED]]
    if others := len(banned) - len(named):
        named.append(f"{others} other{'s' if others > 1 else ''}")
    return f"{', '.join(named[:-1])} and {named[-1]} are banned."


def validate_constructed_battler(battler: Battler) -> None:
    validate_battler(battler, play_mode="constructed")

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from mtb.models.card_registry import export_registry, get_card_data
from mtb.models.cards import Battler, Card
from mtb.models.game import Game, LastBattleResult, Zones
from mtb.phases.battle import BASIC_LAND_IMAGES, TREASURE_TOKEN_IMAGE
from server.schemas.api import CardCatalogEntry, CardRef, GameStateResponse, LastBattleResultView, ZonesView

_SYNTHETIC_CATALOG_ENTRIES = {
    **{
        f"basic-{name.lower()}": CardCatalogEntry(
            scryfall_id=f"basic-{name.lower()}",
            name=name,
            image_url=image_url,
            type_line="Basic Land",
        )
        for name, image_url in BASIC_LAND_IMAGES.items()
    },
    "treasure": CardCatalogEntry(
        scryfall_id="treasure",
        name="Treasure",
        image_url=TREASURE_TOKEN_IMAGE,
        type_line="Token Artifact — Treasure",
    ),
}


def card_to_ref(card: Card | None) -> CardRef | None:
    if card is None:
        return None
    return CardRef(
        id=card.id,
        scryfall_id=card.scryfall_id,
        upgrade_target_id=card.upgrade_target.id if card.upgrade_target is not None else None,
        is_revealed=card.is_revealed,
        original_owner=card.original_owner,
    )


def cards_to_refs(cards: list[Card]) -> list[CardRef]:
    refs: list[CardRef] = []
    for card in cards:
        ref = card_to_ref(card)
        if ref is not None:
            refs.append(ref)
    return refs


def zones_to_view(zones: Zones) -> ZonesView:
    return ZonesView(
        battlefield=cards_to_refs(zones.battlefield),
        graveyard=cards_to_refs(zones.graveyard),
        exile=cards_to_refs(zones.exile),
        hand=cards_to_refs(zones.hand),
        sideboard=cards_to_refs(zones.sideboard),
        upgrades=cards_to_refs(zones.upgrades),
        command_zone=cards_to_refs(zones.command_zone),
        library=cards_to_refs(zones.library),
        treasures=zones.treasures,
        submitted_cards=cards_to_refs(zones.submitted_cards),
        original_hand_ids=list(zones.original_hand_ids),
        tapped_card_ids=list(zones.tapped_card_ids),
        flipped_card_ids=list(zones.flipped_card_ids),
        face_down_card_ids=list(zones.face_down_card_ids),
        counters={card_id: dict(counter_map) for card_id, counter_map in zones.counters.items()},
        attachments={card_id: list(children) for card_id, children in zones.attachments.items()},
        spawned_tokens=cards_to_refs(zones.spawned_tokens),
        revealed_card_ids=list(zones.revealed_card_ids),
    )


def last_battle_result_to_view(result: LastBattleResult | None) -> LastBattleResultView | None:
    if result is None:
        return None
    return LastBattleResultView(
        opponent_name=result.opponent_name,
        winner_name=result.winner_name,
        is_draw=result.is_draw,
        poison_dealt=result.poison_dealt,
        poison_taken=result.poison_taken,
        treasures_gained=result.treasures_gained,
        card_gained=card_to_ref(result.card_gained),
        vanquisher_gained=result.vanquisher_gained,
        pre_battle_treasures=result.pre_battle_treasures,
    )


def catalog_entry_for_scryfall_id(scryfall_id: str) -> CardCatalogEntry:
    if scryfall_id == "__scrubbed__":
        return CardCatalogEntry(
            scryfall_id=scryfall_id,
            name="",
            image_url="",
            type_line="",
        )

    synthetic = _SYNTHETIC_CATALOG_ENTRIES.get(scryfall_id)
    if synthetic is not None:
        return synthetic

    card_data = get_card_data(scryfall_id)
    oracle_text = card_data.oracle_text
    return CardCatalogEntry(
        scryfall_id=scryfall_id,
        name=card_data.name,
        image_url=card_data.image_url,
        flip_image_url=card_data.flip_image_url,
        png_url=card_data.png_url,
        flip_png_url=card_data.flip_png_url,
        type_line=card_data.type_line,
        oracle_text=oracle_text,
        colors=list(card_data.colors),
        keywords=list(card_data.keywords),
        cmc=card_data.cmc,
        life_modifier=card_data.life_modifier,
        hand_modifier=card_data.hand_modifier,
        token_scryfall_ids=list(card_data.token_scryfall_ids),
        is_upgrade=card_data.type_line.lower() == "conspiracy",
        is_vanguard=card_data.type_line.lower() == "vanguard",
        is_companion=oracle_text is not None and oracle_text.casefold().startswith("companion"),
    )


def catalog_entry_for_card(card: Card) -> CardCatalogEntry:
    try:
        return catalog_entry_for_scryfall_id(card.scryfall_id)
    except KeyError:
        try:
            token_scryfall_ids = [token.scryfall_id for token in card.tokens]
        except KeyError:
            token_scryfall_ids = []

        return CardCatalogEntry(
            scryfall_id=card.scryfall_id,
            name=card.name,
            image_url=card.image_url,
            flip_image_url=card.flip_image_url,
            png_url=card.png_url,
            flip_png_url=card.flip_png_url,
            type_line=card.type_line,
            oracle_text=card.oracle_text,
            colors=list(card.colors),
            keywords=list(card.keywords),
            cmc=card.cmc,
            life_modifier=card.life_modifier,
            hand_modifier=card.hand_modifier,
            token_scryfall_ids=token_scryfall_ids,
            is_upgrade=card.is_upgrade,
            is_vanguard=card.is_vanguard,
            is_companion=card.is_companion,
        )


def catalog_entries_for_cards(cards: list[Card]) -> list[CardCatalogEntry]:
    return [catalog_entry_for_card(card) for card in cards]


def build_catalog_from_battler(battler: Battler) -> dict[str, CardCatalogEntry]:
    cards = battler.cards + battler.original_cards + battler.upgrades + battler.original_upgrades + battler.vanguards
    cards_by_scryfall_id = {card.scryfall_id: card for card in cards if card.scryfall_id}
    return build_catalog_from_cards(cards_by_scryfall_id)


def build_catalog_from_game(game: Game) -> dict[str, CardCatalogEntry]:
    cards_by_scryfall_id: dict[str, Card] = {}
    _collect_cards(game, cards_by_scryfall_id, set())
    return build_catalog_from_cards(cards_by_scryfall_id)


def build_catalog_from_scryfall_ids(scryfall_ids: set[str]) -> dict[str, CardCatalogEntry]:
    registry_data = export_registry(scryfall_ids)
    catalog = {scryfall_id: catalog_entry_for_scryfall_id(scryfall_id) for scryfall_id in registry_data}
    for scryfall_id in scryfall_ids:
        if scryfall_id in catalog:
            continue
        synthetic = _SYNTHETIC_CATALOG_ENTRIES.get(scryfall_id)
        if synthetic is not None:
            catalog[scryfall_id] = synthetic
    return catalog


def build_catalog_from_cards(cards_by_scryfall_id: dict[str, Card]) -> dict[str, CardCatalogEntry]:
    catalog = build_catalog_from_scryfall_ids(set(cards_by_scryfall_id))
    for scryfall_id, card in cards_by_scryfall_id.items():
        if scryfall_id in catalog:
            continue
        catalog[scryfall_id] = catalog_entry_for_card(card)
    return catalog


def build_catalog_from_state_refs(state: GameStateResponse) -> dict[str, CardCatalogEntry]:
    scryfall_ids: set[str] = set()
    _collect_ref_scryfall_ids(state, scryfall_ids, set())
    return build_catalog_from_scryfall_ids(scryfall_ids)


def _collect_cards(obj: Any, cards_by_scryfall_id: dict[str, Card], seen: set[int]) -> None:
    if obj is None:
        return

    if isinstance(obj, Card):
        if obj.scryfall_id:
            cards_by_scryfall_id.setdefault(obj.scryfall_id, obj)
        return

    if isinstance(obj, str | int | float | bool):
        return

    obj_id = id(obj)
    if obj_id in seen:
        return
    seen.add(obj_id)

    if isinstance(obj, dict):
        for value in obj.values():
            _collect_cards(value, cards_by_scryfall_id, seen)
        return

    if isinstance(obj, list | tuple | set):
        for item in obj:
            _collect_cards(item, cards_by_scryfall_id, seen)
        return

    if isinstance(obj, BaseModel):
        for field_name in type(obj).model_fields:
            if field_name == "game_ref":
                continue
            _collect_cards(getattr(obj, field_name), cards_by_scryfall_id, seen)


def _collect_ref_scryfall_ids(obj: Any, scryfall_ids: set[str], seen: set[int]) -> None:
    if obj is None:
        return

    if isinstance(obj, CardRef):
        if obj.scryfall_id:
            scryfall_ids.add(obj.scryfall_id)
        return

    if isinstance(obj, str | int | float | bool):
        return

    obj_id = id(obj)
    if obj_id in seen:
        return
    seen.add(obj_id)

    if isinstance(obj, dict):
        for value in obj.values():
            _collect_ref_scryfall_ids(value, scryfall_ids, seen)
        return

    if isinstance(obj, list | tuple | set):
        for item in obj:
            _collect_ref_scryfall_ids(item, scryfall_ids, seen)
        return

    if isinstance(obj, BaseModel):
        for field_name in type(obj).model_fields:
            _collect_ref_scryfall_ids(getattr(obj, field_name), scryfall_ids, seen)

from mtb.models.card_registry import clear_registry, export_registry, import_registry
from mtb.models.cards import Card
from server.services.game_serialization import build_catalog_from_scryfall_ids, catalog_entry_for_card


def test_build_catalog_from_scryfall_ids_includes_synthetic_basics_and_treasure():
    snapshot = export_registry()
    clear_registry()
    try:
        catalog = build_catalog_from_scryfall_ids({"basic-swamp", "treasure"})
    finally:
        clear_registry()
        import_registry(snapshot)

    assert catalog["basic-swamp"].name == "Swamp"
    assert catalog["basic-swamp"].type_line == "Basic Land"
    assert catalog["basic-swamp"].image_url
    assert catalog["treasure"].name == "Treasure"
    assert catalog["treasure"].type_line == "Token Artifact — Treasure"
    assert catalog["treasure"].image_url


def test_catalog_entry_for_card_uses_live_runtime_card_when_registry_is_missing():
    snapshot = export_registry()
    runtime_card = Card(
        id="token-test-12345678",
        scryfall_id="token-test",
        name="Clue",
        image_url="https://example.com/clue.jpg",
        type_line="Token Artifact — Clue",
    )
    clear_registry()
    try:
        entry = catalog_entry_for_card(runtime_card)
    finally:
        clear_registry()
        import_registry(snapshot)

    assert entry.scryfall_id == "token-test"
    assert entry.name == "Clue"
    assert entry.image_url == "https://example.com/clue.jpg"
    assert entry.type_line == "Token Artifact — Clue"

import unicodedata

from mtb.models.card_registry import clear_registry, export_registry, import_registry
from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID, build_battler
from mtb.models.game import create_game, restore_game_from_snapshot, set_battler
from mtb.models.types import UPGRADE_TYPE, VANGUARD_TYPE
from mtb.utils.cubecobra import MOCK_MAINBOARD_SIZE, get_cube_data


def test_mock_cube_data_avoids_network(monkeypatch):
    monkeypatch.setenv("MTB_FAKE_CUBE_DATA", "1")

    def _should_not_call_network(_url: str):
        raise AssertionError("network should not be called when MTB_FAKE_CUBE_DATA=1")

    monkeypatch.setattr("mtb.utils.cubecobra.revalidate_and_get", _should_not_call_network)
    cards = get_cube_data("auto")
    assert len(cards) == MOCK_MAINBOARD_SIZE
    assert all(card.type_line.lower() == "creature" for card in cards)


def test_mock_cube_data_supports_upgrade_and_vanguard_cubes(monkeypatch):
    monkeypatch.setenv("MTB_FAKE_CUBE_DATA", "1")

    upgrades = get_cube_data(DEFAULT_UPGRADES_ID)
    assert len(upgrades) == 4
    assert all(card.type_line.lower() == UPGRADE_TYPE for card in upgrades)

    vanguards = get_cube_data(DEFAULT_VANGUARD_ID)
    assert len(vanguards) == 4
    assert all(card.type_line.lower() == VANGUARD_TYPE for card in vanguards)
    assert all(card.life_modifier is not None for card in vanguards)
    assert all(card.hand_modifier is not None for card in vanguards)


def _cubecobra_card(name: str, card_type: str = "Creature") -> dict:
    lowercase = "".join(char for char in unicodedata.normalize("NFD", name) if not unicodedata.combining(char)).lower()
    details = {"name": name, "name_lower": lowercase, "scryfall_id": lowercase, "type": card_type}
    return {"details": details | {"image_normal": "image", "elo": 1200}}


def test_cube_cards_keep_their_real_names_and_the_upgrades_their_order(monkeypatch):
    mainboard = [_cubecobra_card(name) for name in ["Lórien Revealed", *(f"Filler {i}" for i in range(9))]]
    names = ["Zenith Plot", "Moot Plot", "Éclair Plot", "Dire Plot", "Adder Plot"]
    upgrades = [_cubecobra_card(name, "Conspiracy") for name in names]
    monkeypatch.setattr(
        "mtb.utils.cubecobra.revalidate_and_get",
        lambda url: {"cards": {"mainboard": upgrades if url.endswith(DEFAULT_UPGRADES_ID) else mainboard}},
    )
    saved_in_lowercase = {"lorien revealed": {"name": "lorien revealed"}}
    import_registry(saved_in_lowercase)

    battler = build_battler("vintage", DEFAULT_UPGRADES_ID)
    game = create_game(["Alice"], num_players=1)
    set_battler(game, battler)

    assert export_registry({"lorien revealed"})["lorien revealed"]["name"] == "Lórien Revealed"
    assert "Lórien Revealed" in [card.name for card in battler.original_cards]
    assert [card.name for card in game.available_upgrades] == ["Adder Plot", "Dire Plot", "Éclair Plot", "Moot Plot"]

    saved = game.snapshot_dump_json()
    clear_registry()  # a restart, after which the lowercase game loads first
    import_registry(saved_in_lowercase)
    restore_game_from_snapshot(saved)
    import_registry(saved_in_lowercase)  # and another one after it
    assert export_registry({"lorien revealed"})["lorien revealed"]["name"] == "Lórien Revealed"

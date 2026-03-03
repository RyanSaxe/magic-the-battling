from mtb.models.cards import DEFAULT_UPGRADES_ID, DEFAULT_VANGUARD_ID
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

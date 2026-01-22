import pytest

from mtb.models.cards import Card, build_battler


def _card(name: str, type_line: str, **kwargs) -> Card:
    return Card(name=name, image_url="image", id=name, type_line=type_line, **kwargs)


def test_card_upgrade_links_target():
    base = _card("base", "creature")
    upgrade = _card("upgrade", "conspiracy")

    base.upgrade(upgrade)

    assert upgrade.upgrade_target is base


def test_card_upgrade_rejects_non_conspiracy():
    base = _card("base", "creature")
    non_upgrade = _card("non", "artifact")

    with pytest.raises(ValueError):
        base.upgrade(non_upgrade)


def test_card_upgrade_rejects_already_linked_upgrade():
    base = _card("base", "creature")
    other = _card("other", "creature")
    upgrade = _card("upgrade", "conspiracy")

    base.upgrade(upgrade)

    with pytest.raises(ValueError):
        other.upgrade(upgrade)


def test_build_battler_filters_and_assigns(monkeypatch):
    cards = [
        _card("main1", "creature"),
        _card("main2", "artifact"),
        _card("upgrade1", "conspiracy"),
        _card("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):  # noqa: ARG001
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler()

    assert battler.cards == cards[:2]
    assert battler.upgrades == [cards[2]]
    assert battler.vanguards == [cards[3]]


def test_build_battler_raises_when_no_main_cards(monkeypatch):
    cards = [
        _card("upgrade1", "conspiracy"),
        _card("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):  # noqa: ARG001
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    with pytest.raises(ValueError):
        build_battler()

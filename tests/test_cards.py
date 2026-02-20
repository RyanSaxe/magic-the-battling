import pytest

from mtb.models.cards import build_battler


def test_card_upgrade_links_target(card_factory):
    base = card_factory("base", "Creature")
    upgrade = card_factory("upgrade", "Conspiracy")

    base.upgrade(upgrade)

    assert upgrade.upgrade_target is base


def test_card_upgrade_rejects_non_conspiracy(card_factory):
    base = card_factory("base", "Creature")
    non_upgrade = card_factory("non", "Artifact")

    with pytest.raises(ValueError):
        base.upgrade(non_upgrade)


def test_card_upgrade_rejects_already_linked_upgrade(card_factory):
    base = card_factory("base", "Creature")
    other = card_factory("other", "Creature")
    upgrade = card_factory("upgrade", "Conspiracy")

    base.upgrade(upgrade)

    with pytest.raises(ValueError):
        other.upgrade(upgrade)


def test_build_battler_filters_and_assigns(monkeypatch, card_factory):
    cards = [
        card_factory("main1", "creature"),
        card_factory("main2", "artifact"),
        card_factory("upgrade1", "conspiracy"),
        card_factory("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler()

    assert battler.cards == cards[:2]
    assert battler.upgrades == [cards[2]]
    assert battler.vanguards == [cards[3]]


def test_build_battler_preserves_original_cards(monkeypatch, card_factory):
    cards = [
        card_factory("main1", "creature"),
        card_factory("main2", "artifact"),
        card_factory("upgrade1", "conspiracy"),
        card_factory("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler()

    assert battler.original_cards == battler.cards
    assert battler.original_upgrades == battler.upgrades

    battler.cards.pop()
    battler.upgrades.clear()

    assert len(battler.original_cards) == 2
    assert len(battler.original_upgrades) == 1


def test_build_battler_raises_when_no_main_cards(monkeypatch, card_factory):
    cards = [
        card_factory("upgrade1", "conspiracy"),
        card_factory("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    with pytest.raises(ValueError):
        build_battler()

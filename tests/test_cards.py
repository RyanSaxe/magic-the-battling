import pytest

from mtb.models.cards import Battler, build_battler, validate_battler, validate_constructed_battler


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


def test_build_battler_loads_upgrades_and_vanguards_from_separate_cubes(monkeypatch, card_factory):
    main_cards = [
        card_factory("main1", "creature"),
        card_factory("main2", "artifact"),
    ]
    upgrade_cards = [card_factory("upgrade1", "conspiracy")]
    vanguard_cards = [card_factory("vanguard1", "vanguard")]

    def fake_get_cube_data(identifier: str):
        if identifier == "main_cube":
            return list(main_cards)
        if identifier == "upgrades_cube":
            return list(upgrade_cards)
        if identifier == "vanguards_cube":
            return list(vanguard_cards)
        return []

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler("main_cube", upgrades_id="upgrades_cube", vanguards_id="vanguards_cube")

    assert battler.cards == main_cards
    assert battler.upgrades == upgrade_cards
    assert battler.vanguards == vanguard_cards


def test_build_battler_preserves_original_cards(monkeypatch, card_factory):
    main_cards = [
        card_factory("main1", "creature"),
        card_factory("main2", "artifact"),
    ]
    upgrade_cards = [card_factory("upgrade1", "conspiracy")]

    def fake_get_cube_data(identifier: str):
        if identifier == "main_cube":
            return list(main_cards)
        if identifier == "upgrades_cube":
            return list(upgrade_cards)
        return []

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler("main_cube", upgrades_id="upgrades_cube")

    assert battler.original_cards == battler.cards
    assert battler.original_upgrades == battler.upgrades

    battler.cards.pop()
    battler.upgrades.clear()

    assert len(battler.original_cards) == 2
    assert len(battler.original_upgrades) == 1


def test_build_battler_rejects_source_conspiracies_and_vanguards(monkeypatch, card_factory):
    cards = [
        card_factory("upgrade1", "conspiracy"),
        card_factory("vanguard1", "vanguard"),
    ]

    def fake_get_cube_data(identifier: str):
        return list(cards)

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    with pytest.raises(ValueError, match="battler-defined Conspiracy and Vanguard cards are not supported"):
        build_battler()


def test_build_battler_raises_when_cube_is_empty(monkeypatch):
    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", lambda identifier: [])

    with pytest.raises(ValueError, match="has no playable cards"):
        build_battler()


def test_validate_constructed_battler_requires_100_cards(card_factory):
    battler = Battler(cards=[card_factory(f"c{i}") for i in range(99)], upgrades=[], vanguards=[], source_id="short")

    with pytest.raises(ValueError, match="has 99 playable cards"):
        validate_constructed_battler(battler)


def test_validate_constructed_battler_requires_singleton(card_factory):
    cards = [card_factory(f"c{i}") for i in range(99)]
    cards.append(card_factory("c0"))
    battler = Battler(cards=cards, upgrades=[], vanguards=[], source_id="duplicates")

    with pytest.raises(ValueError, match="not singleton because c0 appears more than once"):
        validate_constructed_battler(battler)


def test_validate_constructed_battler_rejects_banned_keywords(card_factory):
    cards = [card_factory(f"c{i}") for i in range(99)]
    cards.append(card_factory("toxic-card", keywords=["Toxic"]))
    battler = Battler(cards=cards, upgrades=[], vanguards=[], source_id="toxic")

    with pytest.raises(ValueError, match="toxic-card has the banned keyword toxic"):
        validate_constructed_battler(battler)


def test_validate_constructed_battler_rejects_banned_names(card_factory):
    cards = [card_factory(f"c{i}") for i in range(99)]
    cards.append(card_factory("Thassa's Oracle"))
    battler = Battler(cards=cards, upgrades=[], vanguards=[], source_id="oracle")

    with pytest.raises(ValueError, match="Thassa's Oracle is banned"):
        validate_constructed_battler(battler)


def test_validate_limited_battler_rejects_shared_banned_names(card_factory):
    cards = [card_factory(f"c{i}") for i in range(99)]
    cards.append(card_factory("Unexpected Potential"))
    battler = Battler(cards=cards, upgrades=[], vanguards=[], source_id="limited-ban")

    with pytest.raises(ValueError, match="Unexpected Potential is banned"):
        validate_battler(battler, play_mode="limited")

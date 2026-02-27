from server.services.game_manager import GameManager


def test_load_battler_uses_synthetic_mode(monkeypatch):
    monkeypatch.setenv("MTB_SYNTHETIC_BATTLER", "1")
    monkeypatch.setenv("MTB_SYNTHETIC_CARD_COUNT", "12")
    monkeypatch.setenv("MTB_SYNTHETIC_UPGRADES_COUNT", "3")
    monkeypatch.setenv("MTB_SYNTHETIC_VANGUARDS_COUNT", "2")

    manager = GameManager()
    battler = manager._load_battler("ignored", use_upgrades=True, use_vanguards=True)

    assert len(battler.cards) == 12
    assert len(battler.upgrades) == 3
    assert len(battler.vanguards) == 2

    first_card = battler.cards[0]
    assert first_card.image_url
    assert first_card.png_url
    assert first_card.oracle_text
    assert first_card.type_line
    assert first_card.id.startswith("synthetic-card-")

    assert any(card.flip_image_url for card in battler.cards)


def test_load_battler_uses_realistic_synthetic_defaults(monkeypatch):
    monkeypatch.setenv("MTB_SYNTHETIC_BATTLER", "1")

    manager = GameManager()
    battler = manager._load_battler("ignored", use_upgrades=True, use_vanguards=False)

    assert len(battler.cards) == 240
    assert len(battler.upgrades) == 4
    assert len(battler.vanguards) == 0

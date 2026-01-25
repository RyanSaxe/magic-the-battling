from mtb.models.cards import build_battler


def test_build_battler_with_separate_upgrades_cube(monkeypatch, card_factory, upgrade_factory):
    """Verify build_battler loads upgrades from separate cube when upgrades_id is provided."""
    main_cards = [card_factory(f"main{i}") for i in range(10)]
    upgrade_cards = [upgrade_factory(f"upgrade{i}") for i in range(4)]

    def fake_get_cube_data(cube_id: str):
        if cube_id == "main_cube":
            return list(main_cards)
        if cube_id == "upgrades_cube":
            return list(upgrade_cards)
        return []

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", fake_get_cube_data)

    battler = build_battler("main_cube", upgrades_id="upgrades_cube")

    assert len(battler.cards) == 10
    assert len(battler.upgrades) == 4
    for upgrade in battler.upgrades:
        assert upgrade.is_upgrade


def test_game_manager_loads_upgrades_with_defaults(reset_singletons, mock_cube_data, card_factory, upgrade_factory):
    """Verify game_manager loads upgrades when use_upgrades=True."""
    from server.services.game_manager import game_manager  # noqa: PLC0415

    pending = game_manager.create_game(
        player_name="Alice",
        player_id="alice-id",
        cube_id="auto",
        use_upgrades=True,
    )

    game_manager.join_game(pending.join_code, "Bob", "bob-id")
    game = game_manager.start_game(pending.game_id)

    assert game is not None
    assert len(game.available_upgrades) > 0, "Game should have upgrades loaded"
    for upgrade in game.available_upgrades:
        assert upgrade.is_upgrade


def test_game_manager_no_upgrades_when_disabled(reset_singletons, mock_cube_data, card_factory, upgrade_factory):
    """Verify game_manager does not load upgrades when use_upgrades=False."""
    from server.services.game_manager import game_manager  # noqa: PLC0415

    pending = game_manager.create_game(
        player_name="Alice",
        player_id="alice-id",
        cube_id="auto",
        use_upgrades=False,
    )

    game_manager.join_game(pending.join_code, "Bob", "bob-id")
    game = game_manager.start_game(pending.game_id)

    assert game is not None
    assert len(game.available_upgrades) == 0, "Game should not have upgrades"

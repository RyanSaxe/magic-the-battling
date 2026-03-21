import json
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from conftest import setup_battle_ready

from mtb.models.cards import Battler, Card
from mtb.models.game import Game, Puppet, StaticOpponent, create_game, set_battler
from mtb.phases import battle, reward
from server.db.models import PlayerGameHistory
from server.routers.ws import ConnectionManager
from server.runtime_config import MAX_GAME_START_QUEUE
from server.services.game_manager import GameManager


@pytest.fixture
def game_manager():
    return GameManager()


@pytest.fixture
def mock_db_session():
    return MagicMock()


def create_mock_history(
    id: int,
    player_name: str,
    battler_elo: float,
    cube_id: str = "test_cube",
    basics: list[str] | None = None,
) -> MagicMock:
    history = MagicMock(spec=PlayerGameHistory)
    history.id = id
    history.player_name = player_name
    history.battler_elo = battler_elo
    history.game_id = f"game_{id}"

    snapshot = MagicMock()
    snapshot.stage = 3
    snapshot.round = 1
    snapshot.basic_lands_json = json.dumps(basics or ["Plains", "Island", "Mountain"])
    history.snapshots = [snapshot]

    return history


def test_find_historical_players_randomizes_within_elo_range(game_manager, mock_db_session):
    """_find_historical_players should randomly sample from candidates within ELO range."""
    target_elo = 1200.0

    histories = [create_mock_history(i, f"Player{i}", 1200.0 + (i * 10)) for i in range(10)]

    config_data = {"use_upgrades": True, "use_vanguards": False, "cube_id": "test_cube"}

    mock_query = MagicMock()
    mock_db_session.query.return_value = mock_query
    mock_query.options.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = histories
    mock_query.first.return_value = MagicMock(config_json=json.dumps(config_data))

    results_sets = []
    for _ in range(10):
        result = game_manager._find_historical_players(
            mock_db_session,
            target_elo,
            count=3,
            exclude_ids=[],
            use_upgrades=True,
            use_vanguards=False,
            cube_id="test_cube",
        )
        results_sets.append(tuple(h.id for h in result))

    unique_orderings = len(set(results_sets))
    assert unique_orderings > 1, "Expected varied results across multiple calls"


def test_battle_reveal_upgrade_updates_public_visibility(game_manager, card_factory, upgrade_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    target = card_factory("alice-card")
    upgrade = upgrade_factory("hidden-upgrade")
    alice.hand = [target]
    alice.upgrades = [upgrade]
    reward.apply_upgrade_to_card(alice, upgrade, target)
    battle.start(game, alice, bob)

    game_manager._active_games["g1"] = game
    game_manager._player_to_game["pid_alice"] = "g1"
    game_manager._player_to_game["pid_bob"] = "g1"
    game_manager._player_id_to_name["pid_alice"] = "Alice"
    game_manager._player_id_to_name["pid_bob"] = "Bob"

    alice_state_before = game_manager.get_game_state("g1", "pid_alice")
    bob_state_before = game_manager.get_game_state("g1", "pid_bob")

    assert alice_state_before is not None
    assert bob_state_before is not None
    assert alice_state_before.self_player.upgrades[0].is_revealed is False
    assert alice_state_before.current_battle is not None
    assert bob_state_before.current_battle is not None
    assert alice_state_before.current_battle.your_zones.upgrades[0].is_revealed is False
    assert bob_state_before.current_battle.opponent_zones.upgrades == []
    assert next(player for player in bob_state_before.players if player.name == "Alice").upgrades == []

    assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade.id) is True

    bob_state_after = game_manager.get_game_state("g1", "pid_bob")
    assert bob_state_after is not None
    assert bob_state_after.current_battle is not None
    assert len(bob_state_after.current_battle.opponent_zones.upgrades) == 1
    assert bob_state_after.current_battle.opponent_zones.upgrades[0].is_revealed is True
    assert len(next(player for player in bob_state_after.players if player.name == "Alice").upgrades) == 1


def test_battle_reveal_upgrade_broadcasts_animation_to_both_players(game_manager, card_factory, upgrade_factory):
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    target = card_factory("alice-card")
    upgrade = upgrade_factory("hidden-upgrade")
    alice.hand = [target]
    alice.upgrades = [upgrade]
    reward.apply_upgrade_to_card(alice, upgrade, target)
    battle.start(game, alice, bob)

    game_manager._active_games["g1"] = game
    game_manager._player_to_game["pid_alice"] = "g1"
    game_manager._player_to_game["pid_bob"] = "g1"
    game_manager._player_id_to_name["pid_alice"] = "Alice"
    game_manager._player_id_to_name["pid_bob"] = "Bob"

    assert game_manager.handle_battle_reveal_upgrade(game, alice, upgrade.id) is True

    alice_state = game_manager.get_game_state("g1", "pid_alice")
    bob_state = game_manager.get_game_state("g1", "pid_bob")
    assert alice_state is not None
    assert alice_state.current_battle is not None
    assert bob_state is not None
    assert bob_state.current_battle is not None

    alice_anims = alice_state.current_battle.pending_reveal_animations
    bob_anims = bob_state.current_battle.pending_reveal_animations
    assert len(alice_anims) == 1
    assert len(bob_anims) == 1
    assert alice_anims[0].animation_id == bob_anims[0].animation_id
    assert alice_anims[0].player_name == "Alice"
    assert alice_anims[0].upgrade.id == upgrade.id
    assert alice_anims[0].target.id == target.id


def test_find_historical_players_filters_by_elo_range(game_manager, mock_db_session):
    """_find_historical_players should exclude candidates outside ELO range."""
    target_elo = 1200.0

    histories = [
        create_mock_history(1, "InRange1", 1100.0),
        create_mock_history(2, "InRange2", 1300.0),
        create_mock_history(3, "InRange3", 1200.0),
        create_mock_history(4, "OutOfRange1", 800.0),
        create_mock_history(5, "OutOfRange2", 1500.0),
    ]

    config_data = {"use_upgrades": True, "use_vanguards": False, "cube_id": "test_cube"}

    mock_query = MagicMock()
    mock_db_session.query.return_value = mock_query
    mock_query.options.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = histories
    mock_query.first.return_value = MagicMock(config_json=json.dumps(config_data))

    result = game_manager._find_historical_players(
        mock_db_session,
        target_elo,
        count=10,
        exclude_ids=[],
        use_upgrades=True,
        use_vanguards=False,
        cube_id="test_cube",
    )

    result_ids = {h.id for h in result}
    assert 1 in result_ids
    assert 2 in result_ids
    assert 3 in result_ids
    assert 4 not in result_ids
    assert 5 not in result_ids


def test_find_historical_players_treats_legacy_draft_mode_as_limited(game_manager, mock_db_session):
    histories = [create_mock_history(1, "LegacyLimited", 1200.0)]
    config_data = {
        "use_upgrades": True,
        "use_vanguards": False,
        "cube_id": "test_cube",
        "play_mode": "draft",
    }

    mock_query = MagicMock()
    mock_db_session.query.return_value = mock_query
    mock_query.options.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = histories
    mock_query.first.return_value = MagicMock(config_json=json.dumps(config_data))

    result = game_manager._find_historical_players(
        mock_db_session,
        target_elo=1200.0,
        count=1,
        exclude_ids=[],
        use_upgrades=True,
        use_vanguards=False,
        cube_id="test_cube",
        play_mode="limited",
    )

    assert [history.id for history in result] == [1]


class TestSuspiciousNameFiltering:
    def test_single_character_is_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("A") is True
        assert game_manager._is_suspicious_name("1") is True

    def test_empty_name_is_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("") is True

    def test_pure_numbers_are_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("123") is True
        assert game_manager._is_suspicious_name("999999") is True

    def test_test_names_are_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("test") is True
        assert game_manager._is_suspicious_name("Test") is True
        assert game_manager._is_suspicious_name("testing") is True
        assert game_manager._is_suspicious_name("asdf") is True
        assert game_manager._is_suspicious_name("qwerty") is True

    def test_repeated_character_is_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("aaa") is True
        assert game_manager._is_suspicious_name("BBBB") is True

    def test_normal_names_are_not_suspicious(self, game_manager):
        assert game_manager._is_suspicious_name("Alice") is False
        assert game_manager._is_suspicious_name("Bob123") is False
        assert game_manager._is_suspicious_name("Player1") is False
        assert game_manager._is_suspicious_name("xXDragonSlayerXx") is False


class TestTripleSameBasicFiltering:
    def test_triple_same_basic_is_filtered(self, game_manager):
        history = create_mock_history(1, "Player", 1200.0, basics=["Plains", "Plains", "Plains"])
        assert game_manager._has_triple_same_basic(history) is True

    def test_different_basics_pass(self, game_manager):
        history = create_mock_history(1, "Player", 1200.0, basics=["Plains", "Island", "Mountain"])
        assert game_manager._has_triple_same_basic(history) is False

    def test_two_same_one_different_pass(self, game_manager):
        history = create_mock_history(1, "Player", 1200.0, basics=["Plains", "Plains", "Island"])
        assert game_manager._has_triple_same_basic(history) is False

    def test_missing_first_snapshot_is_filtered(self, game_manager):
        history = MagicMock(spec=PlayerGameHistory)
        snapshot = MagicMock()
        snapshot.stage = 3
        snapshot.round = 2
        history.snapshots = [snapshot]
        assert game_manager._has_triple_same_basic(history) is True


class TestCanRejoin:
    def test_can_rejoin_returns_false_for_nonexistent_game(self, game_manager):
        assert game_manager.can_rejoin("nonexistent_game", "Alice") is False

    def test_can_rejoin_returns_false_for_nonexistent_player(self, game_manager):
        mock_game = MagicMock()
        mock_player = MagicMock()
        mock_player.name = "Alice"
        mock_game.players = [mock_player]
        game_manager._active_games["game1"] = mock_game

        assert game_manager.can_rejoin("game1", "Bob") is False

    def test_can_rejoin_returns_true_for_disconnected_player(self, game_manager):
        mock_game = MagicMock()
        mock_player = MagicMock()
        mock_player.name = "Alice"
        mock_game.players = [mock_player]
        game_manager._active_games["game1"] = mock_game

        mock_conn = MagicMock()
        mock_conn.return_value = False
        assert game_manager.can_rejoin("game1", "Alice", is_player_connected=mock_conn) is True

    def test_can_rejoin_returns_false_for_connected_player(self, game_manager):
        mock_game = MagicMock()
        mock_player = MagicMock()
        mock_player.name = "Alice"
        mock_game.players = [mock_player]
        game_manager._active_games["game1"] = mock_game
        game_manager._player_to_game["player_id_1"] = "game1"
        game_manager._player_id_to_name["player_id_1"] = "Alice"

        mock_conn = MagicMock()
        mock_conn.return_value = True
        assert game_manager.can_rejoin("game1", "Alice", is_player_connected=mock_conn) is False


class TestConnectionManagerPendingConnections:
    def test_reserve_connection_marks_player_as_connected(self):
        cm = ConnectionManager()
        assert not cm.is_player_connected("game1", "player1")

        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

    def test_reserved_player_included_in_connected_ids(self):
        cm = ConnectionManager()
        cm.reserve_connection("game1", "player1")

        connected_ids = cm.get_connected_player_ids("game1")
        assert "player1" not in connected_ids

    def test_disconnect_clears_pending_connection(self):
        cm = ConnectionManager()
        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

        cm.disconnect("game1", "player1", MagicMock())
        assert not cm.is_player_connected("game1", "player1")


class TestHotGamesTimezoneHandling:
    def test_hot_games_count_handles_naive_timestamp(self, game_manager):
        game_manager._active_games["game1"] = MagicMock()
        game_manager._last_human_activity["game1"] = datetime.now(UTC).replace(tzinfo=None)

        assert game_manager.hot_games_count() == 1


class TestGameStartQueueGuards:
    def test_can_accept_new_pending_game_rejects_when_start_queue_full(self, game_manager):
        game_manager._game_start_waiters = MAX_GAME_START_QUEUE

        allowed, reason = game_manager.can_accept_new_pending_game()

        assert allowed is False
        assert reason is not None
        assert "starting many games" in reason.lower()

    def test_can_start_game_rejects_when_start_queue_full(self, game_manager):
        pending = game_manager.create_game(player_name="Host", player_id="host_pid")
        pending.target_player_count = 2
        joined = game_manager.join_game(pending.join_code, "Guest", "guest_pid")
        assert joined is not None
        pending.player_ready["host_pid"] = True
        pending.player_ready["guest_pid"] = True
        game_manager._game_start_waiters = MAX_GAME_START_QUEUE

        can_start, reason = game_manager.can_start_game(pending.game_id, "host_pid")

        assert can_start is False
        assert reason is not None
        assert "starting many games" in reason.lower()


class TestConstructedLobbyRules:
    def test_set_player_ready_requires_valid_constructed_battler(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")

        success, error = game_manager.set_player_ready(pending.game_id, "alice_pid", True)

        assert success is False
        assert error is not None
        assert "battler" in error.lower()

    def test_can_start_constructed_game_once_all_battlers_are_loaded(self, game_manager, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        pending.target_player_count = 2
        game_manager.join_game(pending.join_code, "Bob", "bob_pid")

        pending.player_battlers["alice_pid"].battler = Battler(
            cards=[card_factory(f"a{i}") for i in range(100)],
            upgrades=[],
            vanguards=[],
            elo=1150.0,
        )
        pending.player_battlers["bob_pid"].battler = Battler(
            cards=[card_factory(f"b{i}") for i in range(100)],
            upgrades=[],
            vanguards=[],
            elo=1250.0,
        )
        pending.player_ready["alice_pid"] = True
        pending.player_ready["bob_pid"] = True

        can_start, error = game_manager.can_start_game(pending.game_id, "alice_pid")

        assert can_start is True
        assert error is None

    def test_get_lobby_state_includes_constructed_battler_status(self, game_manager, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        pending.player_battlers["alice_pid"].battler = Battler(
            cards=[card_factory(f"a{i}") for i in range(100)],
            upgrades=[],
            vanguards=[],
        )
        pending.player_battlers["alice_pid"].battler_id = "alice_deck"

        lobby = game_manager.get_lobby_state(pending.game_id)

        assert lobby is not None
        assert lobby.play_mode == "constructed"
        assert lobby.players[0].battler_id == "alice_deck"
        assert lobby.players[0].battler_status == "ready"
        assert lobby.target_player_count == 4

    def test_join_game_respects_target_player_cap(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=2)

        joined = game_manager.join_game(pending.join_code, "Bob", "bob_pid")
        blocked = game_manager.join_game(pending.join_code, "Charlie", "charlie_pid")

        assert joined is not None
        assert blocked is None

    def test_set_target_player_count_rejects_below_occupied_slots(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=4)
        game_manager.join_game(pending.join_code, "Bob", "bob_pid")

        success, error = game_manager.set_target_player_count(pending.game_id, "alice_pid", 1)

        assert success is False
        assert error is not None

    def test_set_target_player_count_updates_lobby_state(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=4)

        success, error = game_manager.set_target_player_count(pending.game_id, "alice_pid", 6)
        lobby = game_manager.get_lobby_state(pending.game_id)

        assert success is True
        assert error is None
        assert lobby is not None
        assert lobby.target_player_count == 6

    def test_static_opponent_library_is_in_battle_view(self, game_manager, card_factory):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        static_opp = StaticOpponent(
            name="Bot",
            hand=[],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        battle_state = battle.start(game, alice, static_opp)
        battle_state.opponent_zones.library = [card_factory("LibCard")]

        battle_view = game_manager._make_battle_view(battle_state, alice, game)

        assert len(battle_view.opponent_zones.library) == 1

    def test_clear_player_battler_resets_state_and_unreadies(self, game_manager, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        loading_task = MagicMock()
        loading_task.done.return_value = False

        pending.player_battlers["alice_pid"].battler_id = "alice_deck"
        pending.player_battlers["alice_pid"].battler = Battler(
            cards=[card_factory(f"a{i}") for i in range(100)],
            upgrades=[],
            vanguards=[],
        )
        pending.player_battlers["alice_pid"].battler_loading = True
        pending.player_battlers["alice_pid"].battler_error = "bad battler"
        pending.player_battlers["alice_pid"]._loading_task = loading_task
        pending.player_ready["alice_pid"] = True

        success, error = game_manager.clear_player_battler(pending.game_id, "alice_pid")

        assert success is True
        assert error is None
        loading_task.cancel.assert_called_once()
        assert pending.player_battlers["alice_pid"].battler_id is None
        assert pending.player_battlers["alice_pid"].battler is None
        assert pending.player_battlers["alice_pid"].battler_loading is False
        assert pending.player_battlers["alice_pid"].battler_error is None
        assert pending.player_battlers["alice_pid"]._loading_task is None
        assert pending.player_ready["alice_pid"] is False

    def test_start_game_supports_constructed_puppets_in_sync_path(self, game_manager, mock_db_session, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        pending.puppet_count = 1
        pending.player_battlers["alice_pid"].battler = Battler(
            cards=[card_factory(f"a{i}") for i in range(100)],
            upgrades=[],
            vanguards=[],
            elo=1234.0,
        )
        pending.player_ready["alice_pid"] = True
        game_manager.load_fake_players_for_game = MagicMock()

        game = game_manager.start_game(pending.game_id, mock_db_session)

        assert game is not None
        game_manager.load_fake_players_for_game.assert_called_once()


class TestBattlerValidation:
    def test_load_battler_applies_legality_to_all_battlers(self, game_manager, monkeypatch, card_factory):
        monkeypatch.setattr(
            "mtb.utils.cubecobra.get_cube_data",
            lambda cube_id: [card_factory(f"card{i}") for i in range(99)],
        )

        with pytest.raises(ValueError, match="has 99 playable cards"):
            game_manager._load_battler("too_small", use_upgrades=False, use_vanguards=False, play_mode="constructed")

    def test_load_battler_applies_shared_bans_to_limited_battlers(self, game_manager, monkeypatch, card_factory):
        monkeypatch.setattr(
            "mtb.utils.cubecobra.get_cube_data",
            lambda cube_id: [card_factory(f"card{i}") for i in range(99)] + [card_factory("Unexpected Potential")],
        )

        with pytest.raises(ValueError, match="Unexpected Potential is banned"):
            game_manager._load_battler("limited_ban", use_upgrades=False, use_vanguards=False, play_mode="limited")


class TestPersistPlacementOnElimination:
    def test_persist_player_placement_writes_to_db(self, game_manager, mock_db_session):
        history = MagicMock(spec=PlayerGameHistory)
        mock_query = MagicMock()
        mock_db_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = history

        game_manager._persist_player_placement(mock_db_session, "game1", "Alice", 3)

        assert history.final_placement == 3
        mock_db_session.commit.assert_called_once()

    def test_persist_player_placement_noop_for_missing_history(self, game_manager, mock_db_session):
        mock_query = MagicMock()
        mock_db_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = None

        game_manager._persist_player_placement(mock_db_session, "game1", "Alice", 3)

        mock_db_session.commit.assert_not_called()

    def test_check_sudden_death_ready_persists_placements(self, game_manager, mock_db_session):
        """Mid-game eliminations in _check_sudden_death_ready should persist placement."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        alice.phase = "awaiting_elimination"
        bob.phase = "reward"
        charlie.phase = "reward"
        game.config.poison_to_lose = 10

        mock_query = MagicMock()
        mock_db_session.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = MagicMock(spec=PlayerGameHistory)

        game_manager._check_sudden_death_ready(game, "game1", mock_db_session)

        assert alice.phase == "eliminated"
        assert alice.placement > 0
        assert mock_db_session.commit.call_count >= 1


class TestSelfPlayerPlacement:
    def _make_card(self, name: str) -> Card:
        return Card(name=name, image_url="img", id=name, type_line="Creature")

    def test_get_game_state_includes_self_player_placement(self, game_manager):
        cards = [self._make_card(f"c{i}") for i in range(50)]
        battler = Battler(cards=cards, upgrades=[], vanguards=[])

        game = create_game(["Alice"], num_players=1)
        set_battler(game, battler)
        game.puppets.append(Puppet(name="Bot", player_history_id=1, snapshots={}))

        game_manager._active_games["g1"] = game
        game_manager._player_to_game["pid_alice"] = "g1"
        game_manager._player_id_to_name["pid_alice"] = "Alice"

        alice = game.players[0]
        alice.placement = 2
        alice.phase = "game_over"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None
        assert state.self_player.placement == 2

    def test_placement_zero_before_game_over(self, game_manager):
        cards = [self._make_card(f"c{i}") for i in range(50)]
        battler = Battler(cards=cards, upgrades=[], vanguards=[])

        game = create_game(["Alice"], num_players=1)
        set_battler(game, battler)

        game_manager._active_games["g1"] = game
        game_manager._player_to_game["pid_alice"] = "g1"
        game_manager._player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None
        assert state.self_player.placement == 0


class TestRestoreRecovery:
    def _make_battler(self) -> Battler:
        cards = [Card(name=f"c{i}", image_url="img", id=f"c{i}", type_line="Creature") for i in range(80)]
        return Battler(cards=cards, upgrades=[], vanguards=[])

    def _make_puppet_snapshot(self) -> StaticOpponent:
        return StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            command_zone=[],
            upgrades=[],
            chosen_basics=["Plains", "Island", "Mountain"],
            treasures=1,
            hand_revealed=True,
            is_ghost=False,
            source_player_history_id=1,
        )

    def test_normalize_restored_game_rebinds_active_battle_players(self, game_manager):
        game = create_game(["Alice", "Bob"], num_players=2)
        set_battler(game, self._make_battler())
        alice, bob = game.players
        alice.phase = "battle"
        bob.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Plains", "Island", "Mountain"]
        battle.start(game, alice, bob)

        restored = Game.model_validate_json(game.model_dump_json())
        assert restored.active_battles
        restored_battle = restored.active_battles[0]
        assert restored_battle.player is not restored.players[0]
        assert restored_battle.opponent is not restored.players[1]

        changed = game_manager._normalize_restored_game(restored)

        assert changed is True
        restored_battle = restored.active_battles[0]
        assert restored_battle.player is restored.players[0]
        assert restored_battle.opponent is restored.players[1]

    def test_restored_static_battle_submit_updates_canonical_player(self, game_manager):
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)
        bot_for_round = puppet.get_opponent_for_round(alice.stage, alice.round)
        assert bot_for_round is not None
        battle.start(game, alice, bot_for_round)

        restored = Game.model_validate_json(game.model_dump_json())
        game_manager._normalize_restored_game(restored)
        canonical_alice = restored.players[0]

        handled = game_manager.handle_battle_submit_result(restored, canonical_alice, canonical_alice.name)

        assert handled is True
        assert restored.active_battles == []
        assert canonical_alice.phase == "reward"

    def test_get_game_state_recovers_missing_static_battle(self, game_manager):
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)

        game_manager._active_games["g1"] = game
        game_manager._player_to_game["pid_alice"] = "g1"
        game_manager._player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")

        assert state is not None
        assert state.current_battle is not None
        assert state.current_battle.opponent_name == "Bot"

    def test_get_game_state_includes_catalog_delta_for_runtime_battle_cards(self, game_manager):
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Swamp", "Forest", "Mountain"]
        alice.treasures = 1

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)
        bot_for_round = puppet.get_opponent_for_round(alice.stage, alice.round)
        assert bot_for_round is not None
        battle.start(game, alice, bot_for_round)

        game_manager._active_games["g1"] = game
        game_manager._player_to_game["pid_alice"] = "g1"
        game_manager._player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")

        assert state is not None
        assert state.current_battle is not None
        assert state.catalog_delta["basic-swamp"].name == "Swamp"
        assert state.catalog_delta["basic-forest"].name == "Forest"
        assert state.catalog_delta["basic-mountain"].name == "Mountain"
        assert state.catalog_delta["treasure"].name == "Treasure"

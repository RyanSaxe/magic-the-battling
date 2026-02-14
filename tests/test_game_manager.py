import json
from unittest.mock import MagicMock, patch

import pytest

from mtb.models.cards import Battler, Card
from mtb.models.game import FakePlayer, create_game, set_battler
from server.db.models import PlayerGameHistory
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

        with patch("server.routers.ws.connection_manager") as mock_conn:
            mock_conn.is_player_connected.return_value = False
            assert game_manager.can_rejoin("game1", "Alice") is True

    def test_can_rejoin_returns_false_for_connected_player(self, game_manager):
        mock_game = MagicMock()
        mock_player = MagicMock()
        mock_player.name = "Alice"
        mock_game.players = [mock_player]
        game_manager._active_games["game1"] = mock_game
        game_manager._player_to_game["player_id_1"] = "game1"
        game_manager._player_id_to_name["player_id_1"] = "Alice"

        with patch("server.routers.ws.connection_manager") as mock_conn:
            mock_conn.is_player_connected.return_value = True
            assert game_manager.can_rejoin("game1", "Alice") is False


class TestConnectionManagerPendingConnections:
    def test_reserve_connection_marks_player_as_connected(self):
        from server.routers.ws import ConnectionManager  # noqa: PLC0415

        cm = ConnectionManager()
        assert not cm.is_player_connected("game1", "player1")

        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

    def test_reserved_player_included_in_connected_ids(self):
        from server.routers.ws import ConnectionManager  # noqa: PLC0415

        cm = ConnectionManager()
        cm.reserve_connection("game1", "player1")

        connected_ids = cm.get_connected_player_ids("game1")
        assert "player1" in connected_ids

    def test_disconnect_clears_pending_connection(self):
        from server.routers.ws import ConnectionManager  # noqa: PLC0415

        cm = ConnectionManager()
        cm.reserve_connection("game1", "player1")
        assert cm.is_player_connected("game1", "player1")

        cm.disconnect("game1", "player1")
        assert not cm.is_player_connected("game1", "player1")


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
        game.fake_players.append(FakePlayer(name="Bot", player_history_id=1, snapshots={}))

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

import json
from unittest.mock import MagicMock

import pytest

from server.db.models import PlayerGameHistory
from server.services.game_manager import GameManager


@pytest.fixture
def game_manager():
    return GameManager()


@pytest.fixture
def mock_db_session():
    return MagicMock()


def create_mock_history(id: int, player_name: str, battler_elo: float, cube_id: str = "test_cube") -> MagicMock:
    history = MagicMock(spec=PlayerGameHistory)
    history.id = id
    history.player_name = player_name
    history.battler_elo = battler_elo
    history.game_id = f"game_{id}"

    snapshot = MagicMock()
    snapshot.stage = 3
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

import json
from unittest.mock import MagicMock

from mtb.models.game import BattleSnapshotData
from server.db.models import PlayerGameHistory
from server.routers.games import _build_puppet_snapshots


def _make_source_snapshot(stage: int, round_num: int, treasures: int) -> MagicMock:
    snapshot = MagicMock()
    snapshot.stage = stage
    snapshot.round = round_num
    snapshot.full_state_json = BattleSnapshotData(
        hand=[],
        vanguard=None,
        basic_lands=["Plains", "Island", "Mountain"],
        applied_upgrades=[],
        upgrades=[],
        treasures=treasures,
        sideboard=[],
        command_zone=[],
        poison=0,
        play_draw_preference=None,
    ).model_dump_json()
    return snapshot


def test_build_puppet_snapshots_reuses_best_prior_source_snapshot():
    history = MagicMock(spec=PlayerGameHistory)
    history.source_history_id = 7
    history.poison_history_json = json.dumps(
        {
            "3_1": 1,
            "3_2": 2,
            "3_3": 5,
        }
    )

    source_history = MagicMock(spec=PlayerGameHistory)
    source_history.snapshots = [
        _make_source_snapshot(3, 1, treasures=1),
        _make_source_snapshot(3, 2, treasures=4),
    ]

    db = MagicMock()
    db.query.return_value.options.return_value.filter.return_value.first.return_value = source_history

    snapshots = _build_puppet_snapshots(history, db)

    assert [(snapshot.stage, snapshot.round) for snapshot in snapshots] == [
        (3, 1),
        (3, 2),
        (3, 3),
    ]
    assert [snapshot.poison for snapshot in snapshots] == [1, 2, 5]
    assert [snapshot.treasures for snapshot in snapshots] == [1, 4, 4]

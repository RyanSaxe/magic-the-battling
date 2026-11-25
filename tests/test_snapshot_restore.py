import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server.db.database as db
from pitfight.models.game import restore_game_from_snapshot
from server.db.models import ActiveGameSnapshot, QuarantinedGameSnapshot
from server.main import app

FIXTURE_SNAPSHOTS = sorted((Path(__file__).parent / "fixtures" / "active_game_snapshots").glob("*.json"))
_MISSING = object()

# Shaped like a current snapshot, with game data that a model change has made invalid.
UNRESTORABLE_SNAPSHOT = json.dumps({"data": {"players": "renamed-field"}, "card_registry": {}})


def test_server_start_sets_aside_a_snapshot_it_cannot_restore(
    test_db: None, mock_cube_data: None, *, caplog: pytest.LogCaptureFixture
) -> None:
    _ = (test_db, mock_cube_data)
    with db.SessionLocal() as session:
        session.add(ActiveGameSnapshot(game_id="g1", state_json=UNRESTORABLE_SNAPSHOT))
        session.commit()

    with caplog.at_level(logging.ERROR), TestClient(app):
        pass

    with db.SessionLocal() as session:
        assert session.get(ActiveGameSnapshot, "g1") is None
        quarantined = session.query(QuarantinedGameSnapshot).one()
    assert (quarantined.game_id, quarantined.state_json) == ("g1", UNRESTORABLE_SNAPSHOT)
    assert quarantined.error
    assert any("g1" in record.getMessage() for record in caplog.records if record.levelno >= logging.ERROR)


def _lost_state(saved: object, restored: object, *, path: str = "") -> list[str]:
    """Paths whose saved value the restored game no longer holds. Keys only the restored game has are new fields."""
    if isinstance(saved, dict) and isinstance(restored, dict):
        return [
            lost
            for key, value in saved.items()
            for lost in _lost_state(value, restored.get(key, _MISSING), path=f"{path}/{key}")
        ]
    if isinstance(saved, list) and isinstance(restored, list) and len(saved) == len(restored):
        return [
            lost
            for index, (saved_item, restored_item) in enumerate(zip(saved, restored, strict=True))
            for lost in _lost_state(saved_item, restored_item, path=f"{path}[{index}]")
        ]
    # Comparing types too keeps 1 from matching True when a field changes from int to bool.
    return [] if type(saved) is type(restored) and saved == restored else [path]


@pytest.mark.parametrize("snapshot_path", FIXTURE_SNAPSHOTS, ids=lambda path: path.stem)
def test_games_saved_by_the_deployed_code_restore_with_their_state(snapshot_path: Path) -> None:
    """A fixture that fails here means a deploy would set aside, or silently change, every game in that state.

    Keep the old format readable rather than regenerating the fixture.
    """
    saved_json = snapshot_path.read_text()

    restored_json = restore_game_from_snapshot(saved_json).snapshot_dump_json()

    assert _lost_state(json.loads(saved_json), json.loads(restored_json)) == []

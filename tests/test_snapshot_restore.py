import json
import logging

from fastapi.testclient import TestClient

import server.db.database as db
from server.db.models import ActiveGameSnapshot, QuarantinedGameSnapshot
from server.main import app

# Shaped like a current snapshot, with game data that a model change has made invalid.
UNRESTORABLE_SNAPSHOT = json.dumps({"data": {"players": "renamed-field"}, "card_registry": {}})


def test_server_start_sets_aside_a_snapshot_it_cannot_restore(test_db, mock_cube_data, caplog):
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

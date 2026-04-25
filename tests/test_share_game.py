import json
from datetime import UTC, datetime
from unittest.mock import MagicMock

from mtb.models.game import BattleSnapshotData
from server.db import database
from server.db.models import GameRecord, PlayerGameHistory
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


def test_share_game_endpoint_allows_public_access_for_unshared_finished_games(client):
    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id="public-game",
                cube_id="cube-public",
                shared=False,
                ended_at=datetime.now(UTC),
            )
        )
        db.add(
            PlayerGameHistory(
                game_id="public-game",
                player_name="Alice",
                battler_elo=1200,
                max_stage=3,
                max_round=2,
                final_placement=1,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/games/public-game/share/Alice")

    assert response.status_code == 200
    assert response.json()["game_id"] == "public-game"


def test_battler_games_includes_unshared_finished_games_for_same_cube(client):
    register = client.post(
        "/api/auth/register",
        json={"username": "battler_user", "password": "password123", "email": "battler@test.com"},
    )
    assert register.status_code == 200

    battler = client.post("/api/battlers", json={"cube_id": "cube-public"})
    assert battler.status_code == 200
    battler_id = battler.json()["id"]

    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id="cube-public-game",
                cube_id="cube-public",
                shared=False,
                ended_at=datetime.now(UTC),
                winner_player_id="p1",
            )
        )
        db.add(
            PlayerGameHistory(
                game_id="cube-public-game",
                player_name="Alice",
                battler_elo=1200,
                max_stage=3,
                max_round=2,
                final_placement=1,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/battlers/{battler_id}/games")

    assert response.status_code == 200
    assert response.json()["games"][0]["game_id"] == "cube-public-game"


def test_battler_games_includes_games_where_human_lost(client):
    """Games where all humans died (winner_player_id=None) should still appear."""
    register = client.post(
        "/api/auth/register",
        json={"username": "loser_user", "password": "password123", "email": "loser@test.com"},
    )
    assert register.status_code == 200

    battler = client.post("/api/battlers", json={"cube_id": "cube-lost"})
    assert battler.status_code == 200
    battler_id = battler.json()["id"]

    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id="lost-game",
                cube_id="cube-lost",
                shared=False,
                ended_at=datetime.now(UTC),
                winner_player_id=None,
            )
        )
        db.add(
            PlayerGameHistory(
                game_id="lost-game",
                player_name="Alice",
                battler_elo=1200,
                max_stage=3,
                max_round=2,
                final_placement=2,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/battlers/{battler_id}/games")

    assert response.status_code == 200
    assert len(response.json()["games"]) == 1
    assert response.json()["games"][0]["game_id"] == "lost-game"


def test_my_games_includes_games_where_human_lost(client):
    """The Games tab should show games even when the player lost (winner_player_id=None)."""
    register = client.post(
        "/api/auth/register",
        json={"username": "mygames_user", "password": "password123", "email": "mygames@test.com"},
    )
    assert register.status_code == 200
    user_id = register.json()["user_id"]

    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id="my-lost-game",
                cube_id="cube-x",
                ended_at=datetime.now(UTC),
                winner_player_id=None,
            )
        )
        db.add(
            PlayerGameHistory(
                game_id="my-lost-game",
                player_name="mygames_user",
                battler_elo=1200,
                max_stage=2,
                max_round=3,
                final_placement=3,
                user_id=user_id,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/battlers/my-games")

    assert response.status_code == 200
    assert len(response.json()["games"]) == 1
    assert response.json()["games"][0]["game_id"] == "my-lost-game"


def test_cube_games_endpoint_returns_games_for_any_user(client):
    """The public cube games endpoint works without owning the cube as a battler."""
    client.post(
        "/api/auth/register",
        json={"username": "cube_viewer", "password": "password123", "email": "viewer@test.com"},
    )

    db = database.SessionLocal()
    try:
        db.add(
            GameRecord(
                id="public-cube-game",
                cube_id="someone-elses-cube",
                ended_at=datetime.now(UTC),
            )
        )
        db.add(
            PlayerGameHistory(
                game_id="public-cube-game",
                player_name="OtherPlayer",
                battler_elo=1200,
                max_stage=3,
                max_round=2,
                final_placement=1,
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/battlers/cube/someone-elses-cube/games")

    assert response.status_code == 200
    data = response.json()
    assert len(data["games"]) == 1
    assert data["games"][0]["game_id"] == "public-cube-game"
    assert data["total_games"] == 1

import json
from collections.abc import Callable
from datetime import UTC, datetime
from time import monotonic, sleep
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

import server.routers.games as games_module
from mtb.models.game import BattleSnapshotData
from server.db import database
from server.db.models import BattleSnapshot, CubeMetadata, GameRecord, PlayerGameHistory
from server.services.preview import preview_service
from server.services.share import _build_puppet_snapshots


def _make_source_snapshot(player_history_id: int, stage: int, *, round_num: int, treasures: int) -> BattleSnapshot:
    full_state_json = BattleSnapshotData(
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
    return BattleSnapshot(
        player_history_id=player_history_id,
        stage=stage,
        round=round_num,
        hand_json="[]",
        basic_lands_json=json.dumps(["Plains", "Island", "Mountain"]),
        applied_upgrades_json="[]",
        treasures=treasures,
        full_state_json=full_state_json,
    )


def test_build_puppet_snapshots_reuses_best_prior_source_snapshot(test_db: None) -> None:
    _ = test_db
    with database.SessionLocal() as db:
        db.add(GameRecord(id="src-game", cube_id="cube", ended_at=datetime.now(UTC)))
        db.add(GameRecord(id="puppet-game", cube_id="cube", ended_at=datetime.now(UTC)))
        source_history = PlayerGameHistory(
            game_id="src-game",
            player_name="SourcePlayer",
            battler_elo=1200,
            max_stage=3,
            max_round=2,
        )
        db.add(source_history)
        db.flush()
        db.add_all(
            [
                _make_source_snapshot(source_history.id, 3, round_num=1, treasures=1),
                _make_source_snapshot(source_history.id, 3, round_num=2, treasures=4),
            ]
        )
        puppet_history = PlayerGameHistory(
            game_id="puppet-game",
            player_name="Bot",
            battler_elo=1200,
            max_stage=3,
            max_round=3,
            is_puppet=True,
            source_history_id=source_history.id,
            poison_history_json=json.dumps({"3_1": 1, "3_2": 2, "3_3": 5}),
        )
        db.add(puppet_history)
        db.commit()

        snapshots = _build_puppet_snapshots(puppet_history, db)

    assert [(snapshot.stage, snapshot.round) for snapshot in snapshots] == [
        (3, 1),
        (3, 2),
        (3, 3),
    ]
    assert [snapshot.poison for snapshot in snapshots] == [1, 2, 5]
    assert [snapshot.treasures for snapshot in snapshots] == [1, 4, 4]


def test_share_game_endpoint_allows_public_access_for_unshared_finished_games(client: TestClient) -> None:
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


def test_battler_games_includes_unshared_finished_games_for_same_cube(client: TestClient) -> None:
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


def test_battler_games_includes_games_where_human_lost(client: TestClient) -> None:
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


def test_my_games_includes_games_where_human_lost(client: TestClient) -> None:
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


def test_cube_games_endpoint_returns_games_for_any_user(client: TestClient) -> None:
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


@pytest.fixture
def cubecobra_cube_json(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = {
        "https://cubecobra.com/cube/api/cubejson/vintage": {"name": "Vintage Cube", "image": {"uri": "https://img/v"}},
    }

    def _get_json(url: str) -> dict[str, Any]:
        if url not in responses:
            raise LookupError(url)
        return responses[url]

    monkeypatch.setattr("mtb.utils.json_helpers.get_json", _get_json)


def test_cube_games_endpoint_names_a_cube_with_no_games(client: TestClient) -> None:
    db = database.SessionLocal()
    try:
        db.add(CubeMetadata(cube_id="auto", name="Crucible Starter Cube", image_uri="https://img/auto"))
        db.commit()
    finally:
        db.close()

    response = client.get("/api/battlers/cube/auto/games")

    assert response.status_code == 200
    data = response.json()
    assert data["games"] == []
    assert data["cube_name"] == "Crucible Starter Cube"
    assert data["cube_image_uri"] == "https://img/auto"


def test_cube_games_endpoint_fills_missing_cube_metadata_from_cubecobra(
    client: TestClient, cubecobra_cube_json: None
) -> None:
    _ = cubecobra_cube_json
    response = client.get("/api/battlers/cube/vintage/games")

    assert response.status_code == 200
    assert response.json()["cube_name"] == "Vintage Cube"
    assert response.json()["cube_image_uri"] == "https://img/v"


def test_cube_games_endpoint_leaves_name_empty_when_cubecobra_has_none(
    client: TestClient, cubecobra_cube_json: None
) -> None:
    _ = cubecobra_cube_json
    response = client.get("/api/battlers/cube/unknown-cube/games")

    assert response.status_code == 200
    assert response.json()["cube_name"] is None


def test_battler_games_endpoint_names_the_cube(client: TestClient, cubecobra_cube_json: None) -> None:
    _ = cubecobra_cube_json
    client.post(
        "/api/auth/register",
        json={"username": "vintage_fan", "password": "password123", "email": "vintage@test.com"},
    )
    battler_id = client.post("/api/battlers", json={"cube_id": "vintage"}).json()["id"]

    response = client.get(f"/api/battlers/{battler_id}/games")

    assert response.status_code == 200
    assert response.json()["cube_name"] == "Vintage Cube"


def _play_into_first_battle(
    client: TestClient,
    start_lobby: Callable[[str, str], Response],
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
) -> str:
    """Start a two-player game and ready both players, which records each player's first battle snapshot."""
    host = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2}).json()
    guest = client.post("/api/games/join", json={"join_code": host["join_code"], "player_name": "Bob"}).json()
    game_id = host["game_id"]
    started = start_lobby(game_id, host["session_id"])
    assert started.status_code == 200, started.text

    for player in (host, guest):
        with client.websocket_connect(f"/ws/{game_id}?session_id={player['session_id']}") as ws:
            bootstrap = ws_receive_json_until(ws, lambda m: m["type"] == "game_bootstrap")
            for card in bootstrap["payload"]["state"]["self_player"]["sideboard"][:3]:
                move = {"card_id": card["id"], "source": "sideboard", "destination": "hand"}
                ws.send_json({"action": "build_move", "payload": move})
                ws_receive_json_until(ws, lambda m: m["type"] == "game_state")
            ws.send_json({"action": "build_ready", "payload": {"basics": ["Plains", "Island", "Mountain"]}})
            ws_receive_json_until(ws, lambda m: m["type"] == "game_state")

    game = games_module.game_manager.get_game(game_id)
    assert game is not None
    assert all(player.phase == "battle" for player in game.players)
    return game_id


def test_share_hides_a_game_that_is_still_being_played(
    client: TestClient,
    start_lobby: Callable[[str, str], Response],
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
) -> None:
    game_id = _play_into_first_battle(client, start_lobby, ws_receive_json_until=ws_receive_json_until)

    response = client.get(f"/api/games/{game_id}/share/Bob")

    assert response.status_code == 404
    assert response.json()["code"] == "GAME_IN_PROGRESS"


def test_share_preview_image_hides_a_game_that_is_still_being_played(
    client: TestClient,
    start_lobby: Callable[[str, str], Response],
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_screenshot(url: str, cache_key: str) -> bytes:
        _ = (url, cache_key)
        return b"png"

    monkeypatch.setattr(preview_service, "screenshot", fake_screenshot)
    game_id = _play_into_first_battle(client, start_lobby, ws_receive_json_until=ws_receive_json_until)

    response = client.get(f"/game/{game_id}/share/Bob/preview.png")

    assert response.status_code == 404


def test_share_hides_a_game_evicted_from_memory_while_still_being_played(
    client: TestClient,
    start_lobby: Callable[[str, str], Response],
    *,
    ws_receive_json_until: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    game_id = _play_into_first_battle(client, start_lobby, ws_receive_json_until=ws_receive_json_until)
    monkeypatch.setattr("server.services.game.snapshot_store.IDLE_EVICT_MINUTES", 0)
    # The test client can return before the server has handled the last disconnect, so retry
    # eviction the way the background loop does until the game is idle.
    deadline = monotonic() + 1.0
    while games_module.game_manager.evict_cold_games() == 0:
        assert monotonic() < deadline, "the game never became idle enough to evict"
        sleep(0.01)

    response = client.get(f"/api/games/{game_id}/share/Bob")

    assert response.status_code == 404
    assert response.json()["code"] == "GAME_IN_PROGRESS"

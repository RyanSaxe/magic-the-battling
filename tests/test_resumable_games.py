"""POST /api/games/resumable: the lobbies and games a browser can return to with the seat tokens it holds."""

import pytest

import server.routers.ws as ws_module
from server.db import database
from server.db.models import CubeMetadata, GameRecord


def _resumable(client, *seats: tuple[str, str, str]) -> list[dict]:
    body = {"seats": [{"game_id": g, "player_name": n, "seat_token": t} for g, n, t in seats]}
    response = client.post("/api/games/resumable", json=body)
    assert response.status_code == 200
    return response.json()["games"]


def test_lists_a_lobby_seat_only_with_its_token(client, game_with_players):
    game_id = game_with_players["game_id"]

    listed = _resumable(client, (game_id, "Alice", game_with_players["alice"]["seat_token"]))
    wrong = _resumable(client, (game_id, "Alice", game_with_players["bob"]["seat_token"]))

    assert [(g["game_id"], g["player_name"], g["kind"]) for g in listed] == [(game_id, "Alice", "lobby")]
    assert wrong == []


def test_lists_a_running_game_with_its_last_activity(start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200

    [listed] = _resumable(client, (game_id, "Bob", game_with_players["bob"]["seat_token"]))

    assert listed["kind"] == "game"
    assert listed["last_active_at"] is not None


def test_lists_a_paused_game_without_loading_it(start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    game_manager = ws_module.game_manager
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()
    game_manager._cleanup_game(game_id, preserve_snapshot=True)

    [listed] = _resumable(client, (game_id, "Alice", game_with_players["alice"]["seat_token"]))

    assert listed["kind"] == "game"
    assert game_manager.get_game(game_id) is None


def test_leaves_out_missing_games_and_finished_seats(start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    game = ws_module.game_manager.get_game(game_id)
    assert game is not None
    next(p for p in game.players if p.name == "Bob").phase = "eliminated"

    listed = _resumable(
        client,
        ("no-such-game", "Alice", "token"),
        (game_id, "Bob", game_with_players["bob"]["seat_token"]),
        (game_id, "Alice", game_with_players["alice"]["seat_token"]),
    )

    assert [g["player_name"] for g in listed] == ["Alice"]


def _close(client, game_id: str, name: str, seat_token: str):
    return client.post(f"/api/games/{game_id}/close", json={"player_name": name, "seat_token": seat_token})


def test_closing_a_game_with_one_human_ends_it_for_good(start_lobby, client, monkeypatch):
    game_manager = ws_module.game_manager
    monkeypatch.setattr(game_manager, "_count_available_bots", lambda pending: 1)
    created = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2, "puppet_count": 1},
    ).json()
    game_id, seat_token = created["game_id"], created["seat_token"]
    assert start_lobby(game_id, created["session_id"]).status_code == 200
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()

    assert _close(client, game_id, "Alice", seat_token).status_code == 204

    assert _resumable(client, (game_id, "Alice", seat_token)) == []
    rejoin = client.post(f"/api/games/{game_id}/rejoin", json={"player_name": "Alice", "seat_token": seat_token})
    assert rejoin.status_code == 404
    with database.SessionLocal() as session:
        record = session.get(GameRecord, game_id)
        assert record is not None
        assert record.ended_at is not None


def test_a_game_with_other_players_cannot_be_closed(start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    seat_token = game_with_players["alice"]["seat_token"]

    assert _close(client, game_id, "Alice", seat_token).status_code == 409

    assert [g["player_name"] for g in _resumable(client, (game_id, "Alice", seat_token))] == ["Alice"]


def test_only_the_seat_holder_can_leave_a_lobby(client, game_with_players):
    game_id = game_with_players["game_id"]
    alice, bob = game_with_players["alice"]["seat_token"], game_with_players["bob"]["seat_token"]

    assert _close(client, game_id, "Alice", bob).status_code == 403
    assert _close(client, game_id, "Alice", alice).status_code == 204

    lobby = client.get(f"/api/games/{game_id}/lobby").json()
    assert [player["name"] for player in lobby["players"]] == ["Bob"]


@pytest.fixture
def named_cube(client):
    db = database.SessionLocal()
    try:
        db.add(CubeMetadata(cube_id="test", name="Friday Cube", image_uri="https://img/friday"))
        db.commit()
    finally:
        db.close()


def _move_bob_to_stage_four(game_id: str) -> None:
    game = ws_module.game_manager.get_game(game_id)
    assert game is not None
    bob = next(p for p in game.players if p.name == "Bob")
    bob.stage, bob.round, bob.poison = 4, 2, 3


BOBS_SEAT_AT_STAGE_FOUR = {
    "kind": "game",
    "cube_id": "test",
    "cube_name": "Friday Cube",
    "cube_image_uri": "https://img/friday",
    "play_mode": "limited",
    "use_upgrades": True,
    "player_count": 2,
    "stage": 4,
    "round": 2,
    "poison": 3,
}


def test_describes_a_running_game_for_its_resume_banner(named_cube, start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    _move_bob_to_stage_four(game_id)

    [listed] = _resumable(client, (game_id, "Bob", game_with_players["bob"]["seat_token"]))

    assert {key: listed[key] for key in BOBS_SEAT_AT_STAGE_FOUR} == BOBS_SEAT_AT_STAGE_FOUR


def test_describes_a_paused_game_from_its_snapshot(named_cube, start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    _move_bob_to_stage_four(game_id)
    game_manager = ws_module.game_manager
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()
    game_manager._cleanup_game(game_id, preserve_snapshot=True)

    [listed] = _resumable(client, (game_id, "Bob", game_with_players["bob"]["seat_token"]))

    assert {key: listed[key] for key in BOBS_SEAT_AT_STAGE_FOUR} == BOBS_SEAT_AT_STAGE_FOUR
    assert game_manager.get_game(game_id) is None


def test_leaves_out_a_finished_seat_in_a_paused_game(start_lobby, client, game_with_players):
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    game_manager = ws_module.game_manager
    game = game_manager.get_game(game_id)
    assert game is not None
    next(p for p in game.players if p.name == "Bob").phase = "eliminated"
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()
    game_manager._cleanup_game(game_id, preserve_snapshot=True)

    assert _resumable(client, (game_id, "Bob", game_with_players["bob"]["seat_token"])) == []


def test_describes_a_lobby_seat_without_progress(named_cube, client, game_with_players):
    game_id = game_with_players["game_id"]

    [listed] = _resumable(client, (game_id, "Alice", game_with_players["alice"]["seat_token"]))

    assert listed["cube_name"] == "Friday Cube"
    assert listed["player_count"] == 2
    assert (listed["stage"], listed["round"], listed["poison"]) == (None, None, None)


def test_refuses_more_than_ten_seats(client):
    seats = [{"game_id": f"g{i}", "player_name": "A", "seat_token": "t"} for i in range(11)]

    assert client.post("/api/games/resumable", json={"seats": seats}).status_code == 422

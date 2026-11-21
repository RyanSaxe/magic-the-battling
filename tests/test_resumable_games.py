"""POST /api/games/resumable: the lobbies and games a browser can return to with the seat tokens it holds."""

import server.routers.ws as ws_module


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


def test_lists_a_running_game_with_its_last_activity(client, game_with_players):
    game_id = game_with_players["game_id"]
    client.post(f"/api/games/{game_id}/start")

    [listed] = _resumable(client, (game_id, "Bob", game_with_players["bob"]["seat_token"]))

    assert listed["kind"] == "game"
    assert listed["last_active_at"] is not None


def test_lists_a_paused_game_without_loading_it(client, game_with_players):
    game_id = game_with_players["game_id"]
    client.post(f"/api/games/{game_id}/start")
    game_manager = ws_module.game_manager
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()
    game_manager._cleanup_game(game_id, preserve_snapshot=True)

    [listed] = _resumable(client, (game_id, "Alice", game_with_players["alice"]["seat_token"]))

    assert listed["kind"] == "game"
    assert game_manager.get_game(game_id) is None


def test_leaves_out_missing_games_and_finished_seats(client, game_with_players):
    game_id = game_with_players["game_id"]
    client.post(f"/api/games/{game_id}/start")
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


def test_refuses_more_than_ten_seats(client):
    seats = [{"game_id": f"g{i}", "player_name": "A", "seat_token": "t"} for i in range(11)]

    assert client.post("/api/games/resumable", json={"seats": seats}).status_code == 422

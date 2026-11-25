"""Removing a seat from a lobby, by the host or after its player stays away, leaves nothing of it behind."""

from fastapi.testclient import TestClient

import server.routers.ws as ws_module
from server.services.game_manager import BattlerFailed, GameManager


def test_a_removed_player_takes_their_deck_error_with_them(client: TestClient) -> None:
    created = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2, "play_mode": "constructed"},
    ).json()
    bob = client.post("/api/games/join", json={"join_code": created["join_code"], "player_name": "Bob"}).json()
    game_id = created["game_id"]
    pending = ws_module.game_manager.get_pending_game(game_id)
    assert pending is not None
    pending.player_battlers[bob["player_id"]] = BattlerFailed("bob-deck", "Deck not found")
    assert client.get(f"/api/games/{game_id}/lobby").json()["cube_loading_error"] == "Deck not found"

    ws_module.game_manager.remove_player_from_pending(game_id, bob["player_id"])

    assert client.get(f"/api/games/{game_id}/lobby").json()["cube_loading_error"] is None


def test_an_emptied_lobby_frees_its_join_code(client: TestClient) -> None:
    created = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"}).json()

    ws_module.game_manager.remove_player_from_pending(created["game_id"], created["player_id"])

    assert ws_module.game_manager.get_game_id_by_join_code(created["join_code"]) is None
    assert client.get(f"/api/games/{created['game_id']}/lobby").status_code == 404


def test_new_join_codes_have_only_letters_and_digits() -> None:
    manager = GameManager()
    codes = [manager.create_game(player_name="Alice", player_id=f"host-{i}").join_code for i in range(200)]

    assert all(len(code) == 6 and code.isalnum() and code == code.upper() for code in codes), codes

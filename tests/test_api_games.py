"""REST endpoint tests - focus on contracts/shapes, not game logic."""

import server.routers.games as games_module
import server.services.game_manager as gm_module
from mtb.models.cards import Battler
from mtb.models.game import Config, create_game, set_player_battlers


class TestCreateGame:
    def test_returns_expected_fields(self, client):
        response = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})

        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        assert "join_code" in data
        assert "session_id" in data
        assert "player_id" in data

    def test_creates_unique_games(self, client):
        r1 = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        r2 = client.post("/api/games", json={"player_name": "Bob", "cube_id": "test"})

        assert r1.json()["game_id"] != r2.json()["game_id"]
        assert r1.json()["join_code"] != r2.json()["join_code"]

    def test_persists_guided_mode_default_to_lobby(self, client):
        create = client.post(
            "/api/games",
            json={"player_name": "Alice", "cube_id": "test", "guided_mode_default": True},
        )
        game_id = create.json()["game_id"]

        lobby = client.get(f"/api/games/{game_id}/lobby")
        assert lobby.status_code == 200
        assert lobby.json()["guided_mode_default"] is True


class TestJoinGame:
    def test_join_with_valid_code(self, client):
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        join_code = create.json()["join_code"]

        response = client.post("/api/games/join", json={"join_code": join_code, "player_name": "Bob"})

        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        assert "session_id" in data
        assert "player_id" in data

    def test_join_with_invalid_code_returns_404(self, client):
        response = client.post("/api/games/join", json={"join_code": "BADCODE", "player_name": "Bob"})

        assert response.status_code == 404

    def test_join_started_game_returns_400(self, game_with_players, client):
        client.post(f"/api/games/{game_with_players['game_id']}/start")

        response = client.post(
            "/api/games/join",
            json={"join_code": game_with_players["join_code"], "player_name": "Charlie"},
        )

        assert response.status_code == 400


class TestGetLobby:
    def test_returns_lobby_shape(self, client):
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        game_id = create.json()["game_id"]

        response = client.get(f"/api/games/{game_id}/lobby")

        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        assert "join_code" in data
        assert "players" in data
        assert "can_start" in data
        assert "is_started" in data
        assert "guided_mode_default" in data
        assert isinstance(data["players"], list)

    def test_missing_game_returns_404(self, client):
        response = client.get("/api/games/nonexistent/lobby")

        assert response.status_code == 404

    def test_constructed_lobby_returns_mode_and_battler_fields(self, client):
        create = client.post(
            "/api/games",
            json={"player_name": "Alice", "cube_id": "test", "play_mode": "constructed"},
        )
        game_id = create.json()["game_id"]

        response = client.get(f"/api/games/{game_id}/lobby")

        assert response.status_code == 200
        data = response.json()
        assert data["play_mode"] == "constructed"
        assert data["players"][0]["battler_id"] == "test"
        assert data["players"][0]["battler_status"] in {"loading", "ready"}


class TestGetGameCards:
    def test_constructed_returns_requested_players_battler(self, client, card_factory):
        game = create_game(
            ["Alice", "Bob"],
            num_players=2,
            config=Config(play_mode="constructed", starting_pool_size=0),
        )
        alice_cards = [card_factory(f"alice_{i}") for i in range(10)]
        bob_cards = [card_factory(f"bob_{i}") for i in range(10)]
        set_player_battlers(
            game,
            {
                "Alice": Battler(
                    cards=alice_cards.copy(),
                    upgrades=[],
                    vanguards=[],
                    original_cards=alice_cards.copy(),
                ),
                "Bob": Battler(
                    cards=bob_cards.copy(),
                    upgrades=[],
                    vanguards=[],
                    original_cards=bob_cards.copy(),
                ),
            },
        )
        gm_module.game_manager._active_games["constructed-cards"] = game
        games_module.game_manager._active_games["constructed-cards"] = game

        response = client.get("/api/games/constructed-cards/cards", params={"player_name": "Alice"})

        assert response.status_code == 200
        data = response.json()
        assert all(card["name"].startswith("alice_") for card in data["cards"])


class TestStartGame:
    def test_start_with_enough_players(self, game_with_players, client):
        response = client.post(f"/api/games/{game_with_players['game_id']}/start")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_start_nonexistent_game_returns_404(self, client):
        response = client.post("/api/games/nonexistent/start")

        assert response.status_code == 404


class TestGetGameState:
    def test_requires_valid_session(self, game_with_players, client):
        client.post(f"/api/games/{game_with_players['game_id']}/start")

        response = client.get(
            f"/api/games/{game_with_players['game_id']}",
            params={"session_id": "invalid"},
        )

        assert response.status_code == 401

    def test_returns_game_state_shape(self, game_with_players, client):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        response = client.get(f"/api/games/{game_id}", params={"session_id": session_id})

        assert response.status_code == 200
        data = response.json()
        assert "catalog" in data
        assert "state" in data
        assert data["state"]["game_id"] == game_id
        assert "phase" in data["state"]
        assert "players" in data["state"]
        assert "self_player" in data["state"]
        assert "available_upgrades" in data["state"]
        assert isinstance(data["state"]["players"], list)

    def test_nonexistent_game_returns_404(self, game_with_players, client):
        response = client.get(
            "/api/games/nonexistent",
            params={"session_id": game_with_players["alice"]["session_id"]},
        )

        assert response.status_code == 404


class TestRejoinGame:
    def test_rejoin_recovers_stale_pending_connection(self, game_with_players, client):
        game_id = game_with_players["game_id"]
        client.post(f"/api/games/{game_id}/start")

        first = client.post(f"/api/games/{game_id}/rejoin", json={"player_name": "Alice"})
        assert first.status_code == 200

        second = client.post(f"/api/games/{game_id}/rejoin", json={"player_name": "Alice"})
        assert second.status_code == 200

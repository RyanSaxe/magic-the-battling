"""REST endpoint tests - focus on contracts/shapes, not game logic."""


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
        assert isinstance(data["players"], list)

    def test_missing_game_returns_404(self, client):
        response = client.get("/api/games/nonexistent/lobby")

        assert response.status_code == 404


class TestStartGame:
    def test_start_with_enough_players(self, game_with_players, client):
        response = client.post(f"/api/games/{game_with_players['game_id']}/start")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_start_without_enough_players_returns_400(self, client):
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        game_id = create.json()["game_id"]

        response = client.post(f"/api/games/{game_id}/start")

        assert response.status_code == 400

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
        assert "game_id" in data
        assert "phase" in data
        assert "players" in data
        assert "self_player" in data
        assert "available_upgrades" in data
        assert isinstance(data["players"], list)

    def test_nonexistent_game_returns_404(self, game_with_players, client):
        response = client.get(
            "/api/games/nonexistent",
            params={"session_id": game_with_players["alice"]["session_id"]},
        )

        assert response.status_code == 404

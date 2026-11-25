"""REST endpoint tests - focus on contracts/shapes, not game logic."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

import server.routers.games as games_module
import server.services.game_manager as gm_module
from pitfight.models.cards import Battler, Card
from pitfight.models.game import Config, create_game, set_player_battlers
from server.db import database
from server.db.models import GamePlayerRecord


class TestCreateGame:
    def test_returns_expected_fields(self, client: TestClient) -> None:
        response = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})

        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        assert "join_code" in data
        assert "session_id" in data
        assert "player_id" in data

    def test_creates_unique_games(self, client: TestClient) -> None:
        r1 = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        r2 = client.post("/api/games", json={"player_name": "Bob", "cube_id": "test"})

        assert r1.json()["game_id"] != r2.json()["game_id"]
        assert r1.json()["join_code"] != r2.json()["join_code"]

    def test_persists_guided_mode_default_to_lobby(self, client: TestClient) -> None:
        create = client.post(
            "/api/games",
            json={"player_name": "Alice", "cube_id": "test", "guided_mode_default": True},
        )
        game_id = create.json()["game_id"]

        lobby = client.get(f"/api/games/{game_id}/lobby")
        assert lobby.status_code == 200
        assert lobby.json()["guided_mode_default"] is True

    @pytest.mark.parametrize(
        ("player_name", "message"),
        [
            ("   ", "Player name is required."),
            ("x" * 33, "Player name must be 32 characters or fewer."),
        ],
        ids=["blank", "too_long"],
    )
    def test_rejects_blank_or_overlong_player_name(
        self, client: TestClient, player_name: str, *, message: dict[str, Any]
    ) -> None:
        response = client.post("/api/games", json={"player_name": player_name, "cube_id": "test"})

        assert response.status_code == 422
        assert response.json()["detail"] == message


def _lobby_player_names(client: TestClient, game_id: str) -> list[str]:
    return [player["name"] for player in client.get(f"/api/games/{game_id}/lobby").json()["players"]]


class TestJoinGame:
    def test_join_with_valid_code(self, client: TestClient) -> None:
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        join_code = create.json()["join_code"]

        response = client.post("/api/games/join", json={"join_code": join_code, "player_name": "Bob"})

        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        assert "session_id" in data
        assert "player_id" in data

    def test_join_code_with_surrounding_spaces_joins(self, client: TestClient) -> None:
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        join_code = create.json()["join_code"]

        response = client.post(
            "/api/games/join",
            json={"join_code": f" {join_code.lower()} ", "player_name": "Bob"},
        )

        assert response.status_code == 200

    def test_names_are_stored_trimmed_with_their_casing(self, client: TestClient) -> None:
        create = client.post("/api/games", json={"player_name": "  Alice ", "cube_id": "test"})
        game_id = create.json()["game_id"]

        client.post("/api/games/join", json={"join_code": create.json()["join_code"], "player_name": "bOb "})

        assert _lobby_player_names(client, game_id) == ["Alice", "bOb"]

    @pytest.mark.parametrize("route", ["by_code", "by_game_id"])
    @pytest.mark.parametrize("player_name", ["Alice ", " Alice", "alice", "ALICE"])
    def test_name_matching_a_player_after_trimming_or_ignoring_case_is_taken(
        self, client: TestClient, route: str, *, player_name: str
    ) -> None:
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        game_id = create.json()["game_id"]
        path = "/api/games/join" if route == "by_code" else f"/api/games/{game_id}/join"

        response = client.post(path, json={"join_code": create.json()["join_code"], "player_name": player_name})

        assert response.status_code == 409
        assert response.json()["code"] == "PLAYER_NAME_TAKEN"
        assert _lobby_player_names(client, game_id) == ["Alice"]

    def test_join_with_invalid_code_returns_404(self, client: TestClient) -> None:
        response = client.post("/api/games/join", json={"join_code": "BADCODE", "player_name": "Bob"})

        assert response.status_code == 404

    def test_join_started_game_returns_400(
        self, game_with_players: dict[str, Any], client: TestClient, *, start_lobby: Callable[[str, str], Response]
    ) -> None:
        start_lobby(game_with_players["game_id"], game_with_players["alice"]["session_id"])

        response = client.post(
            "/api/games/join",
            json={"join_code": game_with_players["join_code"], "player_name": "Charlie"},
        )

        assert response.status_code == 400

    def test_join_route_with_wrong_code_returns_structured_error(self, client: TestClient) -> None:
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
        game_id = create.json()["game_id"]

        response = client.post(
            f"/api/games/{game_id}/join",
            json={"join_code": "WRONG1", "player_name": "Bob"},
        )

        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_JOIN_CODE"


class TestGetLobby:
    def test_returns_lobby_shape(self, client: TestClient) -> None:
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

    def test_missing_game_returns_404(self, client: TestClient) -> None:
        response = client.get("/api/games/nonexistent/lobby")

        assert response.status_code == 404

    def test_constructed_lobby_returns_mode_and_battler_fields(self, client: TestClient) -> None:
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
    def test_constructed_returns_requested_players_battler(
        self, client: TestClient, card_factory: Callable[..., Card]
    ) -> None:
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
        gm_module.game_manager.active_games["constructed-cards"] = game
        games_module.game_manager.active_games["constructed-cards"] = game

        response = client.get("/api/games/constructed-cards/cards", params={"player_name": "Alice"})

        assert response.status_code == 200
        data = response.json()
        assert all(card["name"].startswith("alice_") for card in data["cards"])


class TestStartGame:
    def test_start_with_enough_players(
        self, game_with_players: dict[str, Any], start_lobby: Callable[[str, str], Response]
    ) -> None:
        response = start_lobby(game_with_players["game_id"], game_with_players["alice"]["session_id"])

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_start_nonexistent_game_returns_404(self, client: TestClient) -> None:
        response = client.post("/api/games/nonexistent/start")

        assert response.status_code == 404

    @pytest.mark.parametrize("session_id", [None, "not-a-session"])
    def test_start_without_a_valid_session_is_refused(
        self, game_with_players: dict[str, Any], client: TestClient, *, session_id: str
    ) -> None:
        game_id = game_with_players["game_id"]
        params = {"session_id": session_id} if session_id else {}

        response = client.post(f"/api/games/{game_id}/start", params=params)

        assert response.status_code == 401
        assert client.get(f"/api/games/{game_id}/lobby").json()["is_started"] is False

    def test_start_by_a_player_who_is_not_the_host_is_refused(
        self, game_with_players: dict[str, Any], client: TestClient
    ) -> None:
        game_id = game_with_players["game_id"]

        response = client.post(
            f"/api/games/{game_id}/start",
            params={"session_id": game_with_players["bob"]["session_id"]},
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Only the host can start the game"

    def test_start_before_everyone_is_ready_is_refused_and_lobby_can_still_start(
        self, game_with_players: dict[str, Any], client: TestClient, *, start_lobby: Callable[[str, str], Response]
    ) -> None:
        game_id = game_with_players["game_id"]
        host_session_id = game_with_players["alice"]["session_id"]

        refused = client.post(f"/api/games/{game_id}/start", params={"session_id": host_session_id})

        assert refused.status_code == 400
        assert refused.json()["detail"] == "Not all players are ready"
        assert start_lobby(game_id, host_session_id).status_code == 200

    def test_start_with_fewer_players_than_the_table_is_refused(
        self, client: TestClient, start_lobby: Callable[[str, str], Response]
    ) -> None:
        create = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test", "target_player_count": 4})

        response = start_lobby(create.json()["game_id"], create.json()["session_id"])

        assert response.status_code == 400
        assert response.json()["detail"] == "Need exactly 4 players"


class TestGetGameState:
    def test_requires_valid_session(
        self, game_with_players: dict[str, Any], client: TestClient, *, start_lobby: Callable[[str, str], Response]
    ) -> None:
        start_lobby(game_with_players["game_id"], game_with_players["alice"]["session_id"])

        response = client.get(
            f"/api/games/{game_with_players['game_id']}",
            params={"session_id": "invalid"},
        )

        assert response.status_code == 401
        assert response.json()["code"] == "INVALID_SESSION"

    def test_returns_game_state_shape(
        self, game_with_players: dict[str, Any], client: TestClient, *, start_lobby: Callable[[str, str], Response]
    ) -> None:
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        start_lobby(game_id, session_id)

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

    def test_nonexistent_game_returns_404(self, game_with_players: dict[str, Any], client: TestClient) -> None:
        response = client.get(
            "/api/games/nonexistent",
            params={"session_id": game_with_players["alice"]["session_id"]},
        )

        assert response.status_code == 404


class TestRejoinGame:
    def test_rejoin_recovers_stale_pending_connection(
        self, game_with_players: dict[str, Any], client: TestClient, *, start_lobby: Callable[[str, str], Response]
    ) -> None:
        game_id = game_with_players["game_id"]
        start_lobby(game_id, game_with_players["alice"]["session_id"])

        first = client.post(
            f"/api/games/{game_id}/rejoin",
            json={"player_name": "Alice", "seat_token": game_with_players["alice"]["seat_token"]},
        )
        assert first.status_code == 200

        second = client.post(
            f"/api/games/{game_id}/rejoin",
            json={"player_name": "Alice", "seat_token": first.json()["seat_token"]},
        )
        assert second.status_code == 200

    def test_authenticated_owner_keeps_slot_ownership_after_rejoin(
        self, client: TestClient, start_lobby: Callable[[str, str], Response]
    ) -> None:
        register = client.post(
            "/api/auth/register",
            json={"username": "owner_user", "password": "password123", "email": "owner@test.com"},
        )
        assert register.status_code == 200
        owner_id = register.json()["user_id"]

        create = client.post(
            "/api/games",
            json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2},
        )
        assert create.status_code == 200
        game_id = create.json()["game_id"]
        join_code = create.json()["join_code"]

        join = client.post(
            "/api/games/join",
            json={"join_code": join_code, "player_name": "Bob"},
        )
        assert join.status_code == 200

        start = start_lobby(game_id, create.json()["session_id"])
        assert start.status_code == 200

        rejoin = client.post(f"/api/games/{game_id}/rejoin", json={"player_name": "Alice"})
        assert rejoin.status_code == 200

        db = database.SessionLocal()
        try:
            player_row = (
                db.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == "Alice",
                )
                .first()
            )
            assert player_row is not None
            assert player_row.user_id == owner_id
        finally:
            db.close()

        client.cookies.clear()
        attacker = client.post(
            "/api/auth/register",
            json={"username": "attacker_user", "password": "password123", "email": "attacker@test.com"},
        )
        assert attacker.status_code == 200

        blocked = client.post(f"/api/games/{game_id}/rejoin", json={"player_name": "Alice"})
        assert blocked.status_code == 403

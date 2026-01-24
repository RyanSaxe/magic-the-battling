import pytest
from fastapi.testclient import TestClient

import server.routers.ws as ws_module
import server.services.game_manager as gm_module
import server.services.session_manager as sm_module
from mtb.models.cards import Card
from mtb.models.game import Player
from server.main import app
from server.routers.ws import ConnectionManager
from server.services.game_manager import GameManager
from server.services.session_manager import SessionManager


def setup_battle_ready(player: Player, basics: list[str] | None = None) -> None:
    """Set up a player as ready for battle phase."""
    player.phase = "battle"
    player.chosen_basics = basics or ["Plains", "Island", "Mountain"]


@pytest.fixture
def card_factory():
    def _card(name: str, type_line: str = "Creature", **kwargs) -> Card:
        return Card(name=name, image_url="image", id=name, type_line=type_line, **kwargs)

    return _card


@pytest.fixture
def upgrade_factory(card_factory):
    def _upgrade(name: str) -> Card:
        return card_factory(name, type_line="Conspiracy")

    return _upgrade


@pytest.fixture
def reset_singletons():
    """Reset module-level singletons between tests."""
    gm_module.game_manager = GameManager()
    sm_module.session_manager = SessionManager()
    ws_module.connection_manager = ConnectionManager()
    yield
    gm_module.game_manager = GameManager()
    sm_module.session_manager = SessionManager()
    ws_module.connection_manager = ConnectionManager()


@pytest.fixture
def mock_cube_data(card_factory, monkeypatch):
    """Mock cubecobra to avoid network calls."""

    def _mock(cube_id: str):
        return [card_factory(f"card{i}") for i in range(45)]

    monkeypatch.setattr("server.services.game_manager.get_cube_data", _mock)


@pytest.fixture
def client(reset_singletons, mock_cube_data):
    return TestClient(app)


@pytest.fixture
def game_with_players(client):
    """Create game with 2 players, return credentials."""
    r1 = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
    d1 = r1.json()
    r2 = client.post("/api/games/join", json={"join_code": d1["join_code"], "player_name": "Bob"})
    d2 = r2.json()
    return {
        "game_id": d1["game_id"],
        "join_code": d1["join_code"],
        "alice": {"session_id": d1["session_id"], "player_id": d1["player_id"]},
        "bob": {"session_id": d2["session_id"], "player_id": d2["player_id"]},
    }

"""Who can take a seat back: the browser holding the seat token, or the account that took the seat."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from starlette.websockets import WebSocketDisconnect

import server.routers.ws as ws_module
from server.db import database
from server.db.models import GamePlayerRecord
from server.main import app


def _rejoin(client: TestClient, game_id: str, *, name: str, seat_token: str | None = None) -> Response:
    return client.post(f"/api/games/{game_id}/rejoin", json={"player_name": name, "seat_token": seat_token})


def _started(start_lobby: Callable[[str, str], Response], game_with_players: dict[str, Any]) -> str:
    game_id = game_with_players["game_id"]
    assert start_lobby(game_id, game_with_players["alice"]["session_id"]).status_code == 200
    return game_id


def _seat_owner_name(client: TestClient, game_id: str, *, session_id: str) -> str | None:
    response = client.get(f"/api/games/{game_id}", params={"session_id": session_id})
    return response.json()["state"]["self_player"]["name"] if response.status_code == 200 else None


def test_create_and_join_return_a_seat_token(game_with_players: dict[str, Any]) -> None:
    assert game_with_players["alice"]["seat_token"]
    assert game_with_players["bob"]["seat_token"]
    assert game_with_players["alice"]["seat_token"] != game_with_players["bob"]["seat_token"]


def test_knowing_the_game_id_and_a_name_is_not_enough_to_take_a_seat(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, game_with_players: dict[str, Any]
) -> None:
    game_id = _started(start_lobby, game_with_players)
    stranger = TestClient(app)

    missing = _rejoin(stranger, game_id, name="Alice")
    wrong = _rejoin(stranger, game_id, name="Alice", seat_token=game_with_players["bob"]["seat_token"])

    assert missing.status_code == 403
    assert missing.json()["code"] == "SEAT_CLAIM_REQUIRED"
    assert wrong.status_code == 403
    assert _seat_owner_name(client, game_id, session_id=game_with_players["alice"]["session_id"]) == "Alice"


def test_the_seat_token_takes_the_seat_back_and_keeps_working(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, game_with_players: dict[str, Any]
) -> None:
    game_id = _started(start_lobby, game_with_players)
    seat_token = game_with_players["alice"]["seat_token"]

    reclaimed = _rejoin(client, game_id, name="Alice", seat_token=seat_token)

    assert reclaimed.status_code == 200
    assert _seat_owner_name(client, game_id, session_id=reclaimed.json()["session_id"]) == "Alice"
    assert reclaimed.json()["seat_token"] == seat_token
    assert _rejoin(client, game_id, name="Alice", seat_token=seat_token).status_code == 200


def test_a_lobby_seat_can_be_taken_back(client: TestClient, game_with_players: dict[str, Any]) -> None:
    game_id = game_with_players["game_id"]

    reclaimed = _rejoin(client, game_id, name="Bob", seat_token=game_with_players["bob"]["seat_token"])

    assert reclaimed.status_code == 200
    lobby = client.get(f"/api/games/{game_id}/lobby").json()
    bob = next(p for p in lobby["players"] if p["name"] == "Bob")
    assert bob["player_id"] == reclaimed.json()["player_id"]
    assert [p["name"] for p in lobby["players"]] == ["Alice", "Bob"]


def test_a_lobby_seat_needs_its_token(client: TestClient, game_with_players: dict[str, Any]) -> None:
    _ = client
    game_id = game_with_players["game_id"]
    stranger = TestClient(app)

    missing = _rejoin(stranger, game_id, name="Bob")
    wrong = _rejoin(stranger, game_id, name="Bob", seat_token=game_with_players["alice"]["seat_token"])

    assert missing.status_code == 403
    assert missing.json()["code"] == "SEAT_CLAIM_REQUIRED"
    assert wrong.status_code == 403


def test_the_host_keeps_hosting_after_taking_their_lobby_seat_back(
    client: TestClient, game_with_players: dict[str, Any]
) -> None:
    game_id = game_with_players["game_id"]

    reclaimed = _rejoin(client, game_id, name="Alice", seat_token=game_with_players["alice"]["seat_token"])

    lobby = client.get(f"/api/games/{game_id}/lobby").json()
    alice = next(p for p in lobby["players"] if p["name"] == "Alice")
    assert alice["is_host"] is True
    assert alice["player_id"] == reclaimed.json()["player_id"]


def test_a_released_lobby_seat_cannot_be_taken_back(
    client: TestClient, game_with_players: dict[str, Any], *, ws_receive_json: Callable[..., dict[str, Any]]
) -> None:
    game_id = game_with_players["game_id"]
    with client.websocket_connect(f"/ws/{game_id}?session_id={game_with_players['alice']['session_id']}") as host:
        ws_receive_json(host)
        bob_id = game_with_players["bob"]["player_id"]
        host.send_json({"action": "kick_player", "payload": {"target_player_id": bob_id}})
        ws_receive_json(host)

    response = _rejoin(client, game_id, name="Bob", seat_token=game_with_players["bob"]["seat_token"])

    assert response.status_code == 404
    assert response.json()["code"] == "PLAYER_NOT_IN_GAME"


def test_an_unknown_game_answers_game_not_found(client: TestClient) -> None:
    response = _rejoin(client, "no-such-game", name="Alice", seat_token="token")  # noqa: S106 -- test fixture credential literal

    assert response.status_code == 404
    assert response.json()["code"] == "GAME_NOT_FOUND"


def test_the_seat_token_survives_a_server_restart(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, game_with_players: dict[str, Any]
) -> None:
    game_id = _started(start_lobby, game_with_players)
    game_manager = ws_module.game_manager
    game_manager.mark_game_dirty(game_id)
    game_manager.persist_dirty_games()
    game_manager.cleanup_game(game_id, preserve_snapshot=True)
    ws_module.session_manager.reset_all()

    assert _rejoin(client, game_id, name="Alice").status_code == 403
    reclaimed = _rejoin(client, game_id, name="Alice", seat_token=game_with_players["alice"]["seat_token"])

    assert reclaimed.status_code == 200
    assert _seat_owner_name(client, game_id, session_id=reclaimed.json()["session_id"]) == "Alice"


def test_a_seat_from_before_seat_tokens_is_claimed_once_by_name(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, game_with_players: dict[str, Any]
) -> None:
    game_id = _started(start_lobby, game_with_players)
    db = database.SessionLocal()
    try:
        db.query(GamePlayerRecord).filter(GamePlayerRecord.game_id == game_id).update({"seat_token_hash": None})
        db.commit()
    finally:
        db.close()

    first = _rejoin(client, game_id, name="Alice")
    second = _rejoin(client, game_id, name="Alice")

    assert first.status_code == 200
    assert second.status_code == 403
    assert _rejoin(client, game_id, name="Alice", seat_token=first.json()["seat_token"]).status_code == 200


@pytest.mark.parametrize("started", [False, True])
def test_an_account_seat_needs_the_account_or_the_token(
    start_lobby: Callable[[str, str], Response], client: TestClient, *, started: bool
) -> None:
    client.post(
        "/api/auth/register",
        json={"username": "seat_owner", "password": "password123", "email": "seat_owner@test.com"},
    )
    created = client.post(
        "/api/games", json={"player_name": "seat_owner", "cube_id": "test", "target_player_count": 2}
    ).json()
    client.post("/api/games/join", json={"join_code": created["join_code"], "player_name": "Bob"})
    game_id = created["game_id"]
    if started:
        assert start_lobby(game_id, created["session_id"]).status_code == 200
    logged_out = TestClient(app)

    without_login = _rejoin(logged_out, game_id, name="seat_owner")
    with_token = _rejoin(logged_out, game_id, name="seat_owner", seat_token=created["seat_token"])
    with_login = _rejoin(client, game_id, name="seat_owner")

    assert without_login.status_code == 403
    assert without_login.json()["code"] == "NOT_AUTHENTICATED"
    assert with_token.status_code == 200
    assert with_login.status_code == 200
    assert _rejoin(logged_out, game_id, name="seat_owner", seat_token=created["seat_token"]).status_code == 403
    assert (
        _rejoin(logged_out, game_id, name="seat_owner", seat_token=with_login.json()["seat_token"]).status_code == 200
    )


@pytest.mark.parametrize("started", [False, True])
def test_the_reclaimed_session_replaces_the_socket_that_held_the_seat(
    start_lobby: Callable[[str, str], Response],
    client: TestClient,
    *,
    game_with_players: dict[str, Any],
    ws_receive_json: Callable[..., dict[str, Any]],
    started: bool,
) -> None:
    game_id = _started(start_lobby, game_with_players) if started else game_with_players["game_id"]
    alice = game_with_players["alice"]
    expected = "game_bootstrap" if started else "lobby_state"

    with client.websocket_connect(f"/ws/{game_id}?session_id={alice['session_id']}") as old:
        ws_receive_json(old)
        reclaimed = _rejoin(client, game_id, name="Alice", seat_token=alice["seat_token"]).json()

        with client.websocket_connect(f"/ws/{game_id}?session_id={reclaimed['session_id']}") as new:
            assert ws_receive_json(new)["type"] == expected
            assert ws_receive_json(old)["type"] == "seat_moved"
            with pytest.raises(WebSocketDisconnect) as closed:
                ws_receive_json(old)
            assert closed.value.code == 4006


def test_a_spectator_keeps_following_a_seat_that_was_taken_back(
    start_lobby: Callable[[str, str], Response],
    client: TestClient,
    *,
    ws_receive_json: Callable[..., dict[str, Any]],
    ws_receive_json_until: Callable[..., dict[str, Any]],
) -> None:
    created = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2, "auto_approve_spectators": True},
    ).json()
    client.post("/api/games/join", json={"join_code": created["join_code"], "player_name": "Bob"})
    game_id = created["game_id"]
    assert start_lobby(game_id, created["session_id"]).status_code == 200
    request_id = client.post(
        f"/api/games/{game_id}/spectate-request", json={"target_player_name": "Alice", "spectator_name": "Viewer"}
    ).json()["request_id"]
    approval = client.get(f"/api/games/{game_id}/spectate-request/{request_id}").json()
    spectate_url = f"/ws/{game_id}?session_id={approval['session_id']}&spectate_player=Alice&request_id={request_id}"

    with client.websocket_connect(spectate_url) as spectator:
        assert ws_receive_json(spectator)["type"] == "game_bootstrap"
        reclaimed = _rejoin(client, game_id, name="Alice", seat_token=created["seat_token"]).json()
        with client.websocket_connect(f"/ws/{game_id}?session_id={reclaimed['session_id']}") as alice:
            card = ws_receive_json(alice)["payload"]["state"]["self_player"]["sideboard"][0]
            move = {"card_id": card["id"], "source": "sideboard", "destination": "hand"}
            alice.send_json({"action": "build_move", "payload": move})
            update = ws_receive_json_until(spectator, lambda m: m["type"] == "game_state", description="game_state")

    assert card["id"] in [c["id"] for c in update["payload"]["self_player"]["hand"]]

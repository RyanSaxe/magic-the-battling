from datetime import UTC, datetime, timedelta

import pytest
from starlette.websockets import WebSocketDisconnect

import server.routers.games as games_module
from server.runtime_config import SPECTATE_REQUEST_TTL_MINUTES


@pytest.fixture
def start_game(client, start_lobby):
    def _start(host_name: str, guest_name: str, **settings) -> tuple[dict, dict]:
        host = client.post(
            "/api/games",
            json={"player_name": host_name, "cube_id": "test", "target_player_count": 2, **settings},
        ).json()
        guest = client.post("/api/games/join", json={"join_code": host["join_code"], "player_name": guest_name}).json()
        started = start_lobby(host["game_id"], host["session_id"])
        assert started.status_code == 200, started.text
        return host, guest

    return _start


def _request_to_watch(client, game_id: str, target: str) -> str:
    response = client.post(
        f"/api/games/{game_id}/spectate-request",
        json={"target_player_name": target, "spectator_name": "Watcher"},
    )
    assert response.status_code == 200, response.text
    return response.json()["request_id"]


def _request_status(client, game_id: str, request_id: str) -> dict:
    response = client.get(f"/api/games/{game_id}/spectate-request/{request_id}")
    assert response.status_code == 200, response.text
    return response.json()


def _spectate_url(game_id: str, session_id: str, request_id: str, target: str) -> str:
    return f"/ws/{game_id}?session_id={session_id}&spectate_player={target}&request_id={request_id}"


@pytest.fixture
def answer_request(client, ws_receive_json_until):
    def _answer(game_id: str, player_session_id: str, request_id: str, *, allowed: bool) -> None:
        with client.websocket_connect(f"/ws/{game_id}?session_id={player_session_id}") as ws:
            ws_receive_json_until(ws, lambda m: m["type"] == "game_bootstrap")
            ws.send_json({"action": "spectate_response", "payload": {"request_id": request_id, "allowed": allowed}})
            # spectate_response sends no reply; an unknown action's error shows the server handled it.
            ws.send_json({"action": "flush"})
            ws_receive_json_until(ws, lambda m: m["type"] == "error")

    return _answer


@pytest.fixture
def watched_player_name(client, ws_receive_json_until):
    def _watch(url: str) -> str:
        with client.websocket_connect(url) as ws:
            bootstrap = ws_receive_json_until(ws, lambda m: m["type"] == "game_bootstrap")
        return bootstrap["payload"]["state"]["self_player"]["name"]

    return _watch


@pytest.fixture
def assert_spectating_refused(client, ws_receive_json):
    def _assert(url: str) -> None:
        with client.websocket_connect(url) as ws:
            message = ws_receive_json(ws)
            assert message["type"] == "connection_error"
            assert message["payload"]["code"] == "INVALID_REQUEST"
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws_receive_json(ws)
        assert exc_info.value.code == 4003

    return _assert


def test_approval_in_one_game_does_not_watch_a_player_in_another(client, start_game, assert_spectating_refused):
    open_game, _ = start_game("Alice", "Carol", auto_approve_spectators=True)
    other_game, _ = start_game("Alice", "Bob")
    request_id = _request_to_watch(client, open_game["game_id"], "Alice")
    session_id = _request_status(client, open_game["game_id"], request_id)["session_id"]

    assert_spectating_refused(_spectate_url(other_game["game_id"], session_id, request_id, "Alice"))


def test_approval_to_watch_a_player_does_not_watch_their_opponent(
    client, start_game, answer_request, assert_spectating_refused, watched_player_name
):
    victim, opponent = start_game("Victim", "Opponent")
    game_id = victim["game_id"]
    request_id = _request_to_watch(client, game_id, "Opponent")
    answer_request(game_id, opponent["session_id"], request_id, allowed=True)
    session_id = _request_status(client, game_id, request_id)["session_id"]

    assert_spectating_refused(_spectate_url(game_id, session_id, request_id, "Victim"))
    assert watched_player_name(_spectate_url(game_id, session_id, request_id, "Opponent")) == "Opponent"


@pytest.mark.parametrize("allowed", [True, False])
def test_only_the_watched_player_can_answer_a_spectate_request(client, start_game, answer_request, allowed):
    victim, opponent = start_game("Victim", "Opponent")
    game_id = victim["game_id"]
    request_id = _request_to_watch(client, game_id, "Victim")

    answer_request(game_id, opponent["session_id"], request_id, allowed=allowed)
    assert _request_status(client, game_id, request_id)["status"] == "pending"

    answer_request(game_id, victim["session_id"], request_id, allowed=allowed)
    assert _request_status(client, game_id, request_id)["status"] == ("approved" if allowed else "denied")


def test_approved_spectator_can_still_connect_and_reconnect_after_other_requests(
    client, start_game, watched_player_name
):
    host, _ = start_game("Alice", "Bob", auto_approve_spectators=True)
    game_id = host["game_id"]
    request_id = _request_to_watch(client, game_id, "Alice")
    # Every new request sweeps expired ones, as the background loop does every few seconds.
    _request_to_watch(client, game_id, "Bob")

    status = _request_status(client, game_id, request_id)
    assert status["status"] == "approved"
    url = _spectate_url(game_id, status["session_id"], request_id, "Alice")
    assert watched_player_name(url) == "Alice"
    assert watched_player_name(url) == "Alice"


def test_denied_spectator_still_sees_the_denial_after_other_requests(client, start_game, answer_request):
    host, _ = start_game("Alice", "Bob")
    game_id = host["game_id"]
    request_id = _request_to_watch(client, game_id, "Alice")
    answer_request(game_id, host["session_id"], request_id, allowed=False)
    _request_to_watch(client, game_id, "Bob")

    assert _request_status(client, game_id, request_id)["status"] == "denied"


def _requests_listed(message: dict) -> list[str]:
    return [request["spectator_name"] for request in message["payload"]["requests"]]


def _until_requests(ws_receive_json_until, ws, names: list[str]) -> dict:
    return ws_receive_json_until(ws, lambda m: m["type"] == "spectate_requests" and _requests_listed(m) == names)


def _ask(client, game_id: str, target: str, spectator: str) -> str:
    response = client.post(
        f"/api/games/{game_id}/spectate-request",
        json={"target_player_name": target, "spectator_name": spectator},
    )
    assert response.status_code == 200, response.text
    return response.json()["request_id"]


def _answer_on(ws, request_id: str, *, allowed: bool) -> None:
    ws.send_json({"action": "spectate_response", "payload": {"request_id": request_id, "allowed": allowed}})


def test_open_spectating_approves_a_request_in_a_lobby(client):
    lobby = client.post(
        "/api/games",
        json={"player_name": "Alice", "cube_id": "test", "target_player_count": 2, "auto_approve_spectators": True},
    ).json()

    request_id = _request_to_watch(client, lobby["game_id"], "Alice")

    assert _request_status(client, lobby["game_id"], request_id)["status"] == "approved"


def test_the_watched_player_sees_requests_made_before_they_connected(client, game_with_players, ws_receive_json_until):
    game_id = game_with_players["game_id"]
    _ask(client, game_id, "Alice", "Carol")
    _ask(client, game_id, "Alice", "Dan")
    _ask(client, game_id, "Bob", "Erin")

    with client.websocket_connect(f"/ws/{game_id}?session_id={game_with_players['alice']['session_id']}") as alice:
        _until_requests(ws_receive_json_until, alice, ["Carol", "Dan"])


def test_a_second_request_does_not_hide_the_first(client, start_game, ws_receive_json_until):
    host, _ = start_game("Alice", "Bob")
    game_id = host["game_id"]

    with client.websocket_connect(f"/ws/{game_id}?session_id={host['session_id']}") as alice:
        ws_receive_json_until(alice, lambda m: m["type"] == "game_bootstrap")
        first = _ask(client, game_id, "Alice", "Carol")
        second = _ask(client, game_id, "Alice", "Dan")
        _until_requests(ws_receive_json_until, alice, ["Carol", "Dan"])

        _answer_on(alice, second, allowed=False)
        _until_requests(ws_receive_json_until, alice, ["Carol"])

    assert _request_status(client, game_id, first)["status"] == "pending"
    assert _request_status(client, game_id, second)["status"] == "denied"


def test_a_cancelled_request_leaves_the_queue_and_cannot_be_approved(client, start_game, ws_receive_json_until):
    host, _ = start_game("Alice", "Bob")
    game_id = host["game_id"]

    with client.websocket_connect(f"/ws/{game_id}?session_id={host['session_id']}") as alice:
        ws_receive_json_until(alice, lambda m: m["type"] == "game_bootstrap")
        request_id = _ask(client, game_id, "Alice", "Carol")
        _until_requests(ws_receive_json_until, alice, ["Carol"])

        cancelled = client.delete(f"/api/games/{game_id}/spectate-request/{request_id}")
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"
        _until_requests(ws_receive_json_until, alice, [])

        _answer_on(alice, request_id, allowed=True)
        _until_requests(ws_receive_json_until, alice, [])

    status = _request_status(client, game_id, request_id)
    assert status["status"] == "cancelled"
    assert status["session_id"] is None


def test_an_unanswered_request_expires_and_says_so(client, start_game, ws_receive_json_until):
    host, _ = start_game("Alice", "Bob")
    game_id = host["game_id"]

    with client.websocket_connect(f"/ws/{game_id}?session_id={host['session_id']}") as alice:
        ws_receive_json_until(alice, lambda m: m["type"] == "game_bootstrap")
        request_id = _ask(client, game_id, "Alice", "Carol")
        _until_requests(ws_receive_json_until, alice, ["Carol"])

        # The server sweeps from its event loop, where it can tell the watched player.
        client.portal.call(
            games_module.game_manager.cleanup_expired_spectate_requests,
            datetime.now(UTC) + timedelta(minutes=SPECTATE_REQUEST_TTL_MINUTES + 1),
        )
        _until_requests(ws_receive_json_until, alice, [])

    assert _request_status(client, game_id, request_id)["status"] == "expired"


def test_an_approved_request_becomes_watching_when_the_spectator_connects(client, start_game, watched_player_name):
    host, _ = start_game("Alice", "Bob", auto_approve_spectators=True)
    game_id = host["game_id"]
    request_id = _request_to_watch(client, game_id, "Alice")
    status = _request_status(client, game_id, request_id)
    assert status["status"] == "approved"

    assert watched_player_name(_spectate_url(game_id, status["session_id"], request_id, "Alice")) == "Alice"

    watching = _request_status(client, game_id, request_id)
    assert watching["status"] == "watching"
    assert watching["session_id"] == status["session_id"]

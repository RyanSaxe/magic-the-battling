import pytest
from starlette.websockets import WebSocketDisconnect


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

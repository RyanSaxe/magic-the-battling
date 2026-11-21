"""The lobby host role: kept through short absences, passed on when the host stays away."""

import time

import pytest

import server.routers.ws as ws_module

GRACE_SECONDS = 0.05


@pytest.fixture
def short_grace(monkeypatch):
    monkeypatch.setattr("server.services.game_manager.HOST_HANDOFF_GRACE_SECONDS", GRACE_SECONDS)


def _lobby(client, names: list[str]) -> tuple[str, dict[str, dict]]:
    created = client.post(
        "/api/games", json={"player_name": names[0], "cube_id": "test", "target_player_count": 4}
    ).json()
    seats = {names[0]: created}
    for name in names[1:]:
        seats[name] = client.post(
            "/api/games/join", json={"join_code": created["join_code"], "player_name": name}
        ).json()
    return created["game_id"], seats


def _connect(client, game_id: str, seat: dict):
    return client.websocket_connect(f"/ws/{game_id}?session_id={seat['session_id']}")


def _host(client, game_id: str) -> str:
    players = client.get(f"/api/games/{game_id}/lobby").json()["players"]
    return next(p["name"] for p in players if p["is_host"])


def _hosted_by(name: str):
    def predicate(message: dict) -> bool:
        if message["type"] != "lobby_state":
            return False
        return any(p["name"] == name and p["is_host"] for p in message["payload"]["players"])

    return predicate


def test_lobby_players_show_who_is_away(client, ws_receive_json):
    game_id, seats = _lobby(client, ["Anya", "Boris"])

    with _connect(client, game_id, seats["Anya"]) as anya:
        ws_receive_json(anya)
        players = {p["name"]: p for p in client.get(f"/api/games/{game_id}/lobby").json()["players"]}

    assert players["Anya"]["is_connected"] is True
    assert players["Boris"]["is_connected"] is False


def test_a_host_away_past_the_grace_hands_off_to_the_earliest_joined_connected_player(
    client, short_grace, ws_receive_json, ws_receive_json_until
):
    game_id, seats = _lobby(client, ["Anya", "Boris", "Dmitri"])

    with _connect(client, game_id, seats["Dmitri"]) as dmitri:
        ws_receive_json(dmitri)
        with _connect(client, game_id, seats["Anya"]) as anya:
            ws_receive_json(anya)

        ws_receive_json_until(dmitri, _hosted_by("Dmitri"), description="Dmitri as host")

    assert _host(client, game_id) == "Dmitri"


def test_a_host_back_within_the_grace_keeps_the_role(client, monkeypatch, ws_receive_json):
    monkeypatch.setattr("server.services.game_manager.HOST_HANDOFF_GRACE_SECONDS", 0.5)
    game_id, seats = _lobby(client, ["Anya", "Boris"])

    with _connect(client, game_id, seats["Boris"]) as boris:
        ws_receive_json(boris)
        with _connect(client, game_id, seats["Anya"]) as anya:
            ws_receive_json(anya)
        with _connect(client, game_id, seats["Anya"]) as anya:
            ws_receive_json(anya)
            time.sleep(0.7)
            assert _host(client, game_id) == "Anya"


def test_a_former_host_who_returns_stays_a_guest(client, short_grace, ws_receive_json, ws_receive_json_until):
    game_id, seats = _lobby(client, ["Anya", "Boris"])

    with _connect(client, game_id, seats["Boris"]) as boris:
        ws_receive_json(boris)
        with _connect(client, game_id, seats["Anya"]) as anya:
            ws_receive_json(anya)
        ws_receive_json_until(boris, _hosted_by("Boris"), description="Boris as host")

        with _connect(client, game_id, seats["Anya"]) as anya:
            ws_receive_json(anya)
            assert _host(client, game_id) == "Boris"


def test_with_nobody_else_connected_the_role_waits_for_the_next_player_to_connect(client, short_grace, ws_receive_json):
    game_id, seats = _lobby(client, ["Anya", "Boris"])

    with _connect(client, game_id, seats["Anya"]) as anya:
        ws_receive_json(anya)
    time.sleep(GRACE_SECONDS * 4)
    assert _host(client, game_id) == "Anya"

    with _connect(client, game_id, seats["Boris"]) as boris:
        first_state = ws_receive_json(boris)

    assert _hosted_by("Boris")(first_state)


@pytest.mark.parametrize(("dmitri_connected", "expected_host"), [(True, "Dmitri"), (False, "Boris")])
def test_removing_the_host_seat_passes_the_role_on(client, ws_receive_json, dmitri_connected, expected_host):
    game_id, seats = _lobby(client, ["Anya", "Boris", "Dmitri"])
    anya_id = seats["Anya"]["player_id"]

    if dmitri_connected:
        with _connect(client, game_id, seats["Dmitri"]) as dmitri:
            ws_receive_json(dmitri)
            ws_module.game_manager.remove_player_from_pending(game_id, anya_id)
    else:
        ws_module.game_manager.remove_player_from_pending(game_id, anya_id)

    assert _host(client, game_id) == expected_host

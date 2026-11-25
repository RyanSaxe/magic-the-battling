import asyncio
import json
import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

import server.services.game_manager as game_manager_module
from server.main import app
from server.routers.voice import VoiceTurnSettings, get_voice_turn_settings
from server.services.voice_turn import DEFAULT_ICE_SERVERS, IceServerCache, fetch_ice_servers


@contextmanager
def _override_turn_settings(settings: VoiceTurnSettings) -> Generator[None]:
    app.dependency_overrides[get_voice_turn_settings] = lambda: settings
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_voice_turn_settings, None)


def test_ice_servers_rejects_unknown_game_and_non_player_sessions(
    client: TestClient,
    game_with_players: dict[str, Any],
) -> None:
    game_id = game_with_players["game_id"]
    alice_session = game_with_players["alice"]["session_id"]

    unknown_game = client.get("/api/games/does-not-exist/voice/ice-servers", params={"session_id": alice_session})
    assert unknown_game.status_code == 404

    missing_session = client.get(f"/api/games/{game_id}/voice/ice-servers")
    assert missing_session.status_code == 403

    invalid_session = client.get(
        f"/api/games/{game_id}/voice/ice-servers",
        headers={"X-Session-Id": "not-a-real-session"},
    )
    assert invalid_session.status_code == 403

    other_game_resp = client.post(
        "/api/games",
        json={"player_name": "Cara", "cube_id": "test", "target_player_count": 2},
    )
    other_session = other_game_resp.json()["session_id"]
    wrong_game = client.get(
        f"/api/games/{game_id}/voice/ice-servers",
        headers={"X-Session-Id": other_session},
    )
    assert wrong_game.status_code == 403

    spectate_resp = client.post(
        f"/api/games/{game_id}/spectate-request",
        json={"target_player_name": "Alice", "spectator_name": "Watcher"},
    )
    assert spectate_resp.status_code == 200
    request_id = spectate_resp.json()["request_id"]
    approved = game_manager_module.game_manager.respond_to_spectate_request(
        request_id,
        game_id=game_id,
        responder_id=game_with_players["alice"]["player_id"],
        allowed=True,
    )
    assert approved is True
    spectate_status = client.get(f"/api/games/{game_id}/spectate-request/{request_id}")
    assert spectate_status.status_code == 200
    spectator_session_id = spectate_status.json()["session_id"]
    assert spectator_session_id is not None

    spectator_resp = client.get(
        f"/api/games/{game_id}/voice/ice-servers",
        params={"session_id": spectator_session_id},
    )
    assert spectator_resp.status_code == 403


def test_ice_servers_falls_back_to_default_stun_when_unconfigured(
    client: TestClient,
    game_with_players: dict[str, Any],
) -> None:
    game_id = game_with_players["game_id"]
    alice_session = game_with_players["alice"]["session_id"]

    with _override_turn_settings(VoiceTurnSettings(key_id="", api_token="", ttl_seconds=86400)):
        by_query = client.get(f"/api/games/{game_id}/voice/ice-servers", params={"session_id": alice_session})
        by_header = client.get(f"/api/games/{game_id}/voice/ice-servers", headers={"X-Session-Id": alice_session})

    assert by_query.status_code == 200
    assert by_query.json() == {"ice_servers": DEFAULT_ICE_SERVERS}
    assert by_header.status_code == 200
    assert by_header.json() == {"ice_servers": DEFAULT_ICE_SERVERS}


def test_ice_servers_endpoint_uses_cloudflare_and_caches_credentials(
    client: TestClient,
    game_with_players: dict[str, Any],
) -> None:
    secret_bearer = "cf-secret-api-bearer-value"  # noqa: S105 -- test fixture value
    seen_requests: list[tuple[str, str, dict[str, Any]]] = []
    cloudflare_ice = {
        "urls": [
            "stun:stun.cloudflare.com:3478",
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        "username": "cf-user",
        "credential": "cf-cred",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        seen_requests.append((str(request.url), request.headers.get("authorization", ""), json.loads(request.content)))
        return httpx.Response(200, json={"iceServers": cloudflare_ice})

    settings = VoiceTurnSettings(
        key_id="turn-key-123",
        api_token=secret_bearer,
        ttl_seconds=7200,
        transport=httpx.MockTransport(handler),
    )
    game_id = game_with_players["game_id"]
    alice_session = game_with_players["alice"]["session_id"]
    bob_session = game_with_players["bob"]["session_id"]

    with _override_turn_settings(settings):
        first = client.get(f"/api/games/{game_id}/voice/ice-servers", params={"session_id": alice_session})
        second = client.get(f"/api/games/{game_id}/voice/ice-servers", headers={"X-Session-Id": bob_session})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == {"ice_servers": [cloudflare_ice]}
    assert second.json() == {"ice_servers": [cloudflare_ice]}
    assert seen_requests == [
        (
            "https://rtc.live.cloudflare.com/v1/turn/keys/turn-key-123/credentials/generate-ice-servers",
            f"Bearer {secret_bearer}",
            {"ttl": 7200},
        )
    ]


def test_fetch_ice_servers_parses_list_and_respects_cache_ttl() -> None:
    calls = 0
    current_time = 100.0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "iceServers": [
                    {"urls": "stun:stun.cloudflare.com:3478"},
                    {
                        "urls": ["turn:turn.cloudflare.com:3478?transport=udp"],
                        "username": f"user-{calls}",
                        "credential": f"cred-{calls}",
                    },
                ]
            },
        )

    cache = IceServerCache()
    transport = httpx.MockTransport(handler)
    first = asyncio.run(
        fetch_ice_servers(
            key_id="key-a",
            api_token="tok-a",  # noqa: S106 -- test fixture value
            ttl_seconds=120,
            transport=transport,
            now=lambda: current_time,
            cache=cache,
        )
    )
    assert calls == 1
    assert first[1]["username"] == "user-1"

    current_time = 159.0
    cached = asyncio.run(
        fetch_ice_servers(
            key_id="key-a",
            api_token="tok-a",  # noqa: S106 -- test fixture value
            ttl_seconds=120,
            transport=transport,
            now=lambda: current_time,
            cache=cache,
        )
    )
    assert calls == 1
    assert cached == first

    current_time = 160.0
    refreshed = asyncio.run(
        fetch_ice_servers(
            key_id="key-a",
            api_token="tok-a",  # noqa: S106 -- test fixture value
            ttl_seconds=120,
            transport=transport,
            now=lambda: current_time,
            cache=cache,
        )
    )
    assert calls == 2
    assert refreshed[1]["username"] == "user-2"


def test_fetch_ice_servers_falls_back_to_stun_on_upstream_500_and_timeout_without_logging_token(
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret_bearer = "never-log-this-turn-secret"  # noqa: S105 -- test fixture value

    def timeout_error(request: httpx.Request) -> httpx.Response:
        msg = "timed out"
        raise httpx.ReadTimeout(msg, request=request)

    with caplog.at_level(logging.WARNING, logger="server.services.voice_turn"):
        on_500 = asyncio.run(
            fetch_ice_servers(
                key_id="key-err",
                api_token=secret_bearer,
                ttl_seconds=3600,
                transport=httpx.MockTransport(lambda _request: httpx.Response(500, text="upstream boom")),
                cache=IceServerCache(),
            )
        )
        on_timeout = asyncio.run(
            fetch_ice_servers(
                key_id="key-err",
                api_token=secret_bearer,
                ttl_seconds=3600,
                transport=httpx.MockTransport(timeout_error),
                cache=IceServerCache(),
            )
        )

    assert on_500 == DEFAULT_ICE_SERVERS
    assert on_timeout == DEFAULT_ICE_SERVERS
    assert len(caplog.records) == 2
    assert secret_bearer not in caplog.text

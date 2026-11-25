"""HTTP and WebSocket transport helpers for creating, joining, and connecting to games."""

from __future__ import annotations

import asyncio
import gzip
import json
import random
import time
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
import websockets

from server.perf.models import (
    CREATE_RETRY_BASE_SEC,
    CREATE_RETRY_MAX_SEC,
    IDEMPOTENCY_KEY_HEADER,
    RETRYABLE_CREATE_STATUSES,
    WS_CONNECT_RETRY_BASE_SEC,
    WS_CONNECT_RETRY_MAX_SEC,
    GameFlowError,
    HarnessConfig,
    WebSocketProto,
)


def ws_url_for(
    base_url: str,
    *,
    game_id: str,
    session_id: str,
    spectate_player: str | None = None,
    request_id: str | None = None,
) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    params: dict[str, str] = {"session_id": session_id}
    if spectate_player and request_id:
        params["spectate_player"] = spectate_player
        params["request_id"] = request_id
    return urlunparse((scheme, parsed.netloc, f"/ws/{game_id}", "", urlencode(params), ""))


def decode_ws_message(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        try:
            text = gzip.decompress(raw).decode("utf-8")
        except OSError:
            text = raw.decode("utf-8")
    else:
        text = raw

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        msg = "websocket payload is not an object"
        raise GameFlowError(msg)
    return parsed


def remaining_timeout(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        msg = "game exceeded timeout"
        raise TimeoutError(msg)
    return remaining


def retry_delay_sec(attempt: int, *, base_sec: float, max_sec: float) -> float:
    exp = min(max_sec, base_sec * (2**attempt))
    return random.random() * exp  # noqa: S311 -- non-cryptographic game RNG


async def sleep_retry_or_timeout(
    *,
    deadline: float,
    attempt: int,
    base_sec: float,
    max_sec: float,
    exhausted_message: str,
) -> None:
    remaining = remaining_timeout(deadline)
    delay = retry_delay_sec(attempt, base_sec=base_sec, max_sec=max_sec)
    if delay >= remaining:
        raise TimeoutError(exhausted_message)
    await asyncio.sleep(delay)


def build_create_game_payload(
    player_name: str,
    cfg: HarnessConfig,
    *,
    target_player_count: int | None = None,
    puppet_count: int | None = None,
    auto_approve_spectators: bool | None = None,
) -> dict[str, Any]:
    puppets = cfg.puppet_count if puppet_count is None else puppet_count
    target = (puppets + 1) if target_player_count is None else target_player_count
    auto_approve = (cfg.spectators_per_game > 0) if auto_approve_spectators is None else auto_approve_spectators
    return {
        "player_name": player_name,
        "cube_id": cfg.cube_id,
        "use_upgrades": cfg.use_upgrades,
        "target_player_count": target,
        "puppet_count": puppets,
        "auto_approve_spectators": auto_approve,
    }


async def _post_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_body: dict[str, Any],
    headers: dict[str, str] | None = None,
    deadline: float,
    label: str,
) -> dict[str, Any]:
    attempt = 0
    while True:
        attempt += 1
        try:
            response = await client.post(url, json=json_body, headers=headers)
        except httpx.HTTPError as exc:
            await sleep_retry_or_timeout(
                deadline=deadline,
                attempt=attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=f"{label} retries exhausted: {exc}",
            )
            continue

        if response.status_code in RETRYABLE_CREATE_STATUSES:
            detail = response.text.strip()
            await sleep_retry_or_timeout(
                deadline=deadline,
                attempt=attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=f"{label} retry window exhausted ({response.status_code}: {detail})",
            )
            continue

        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            msg = f"{label} response was not a JSON object"
            raise GameFlowError(msg)
        return payload


async def create_lobby_with_retry(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    player_name: str,
    deadline: float,
    idempotency_key: str,
    target_player_count: int | None = None,
    puppet_count: int | None = None,
    auto_approve_spectators: bool | None = None,
) -> tuple[str, str, str, float]:
    started = time.perf_counter()
    create_payload = build_create_game_payload(
        player_name,
        cfg,
        target_player_count=target_player_count,
        puppet_count=puppet_count,
        auto_approve_spectators=auto_approve_spectators,
    )
    payload = await _post_with_retry(
        client,
        "/api/games",
        json_body=create_payload,
        headers={IDEMPOTENCY_KEY_HEADER: idempotency_key},
        deadline=deadline,
        label="create_game",
    )
    return (
        str(payload["game_id"]),
        str(payload["join_code"]),
        str(payload["session_id"]),
        (time.perf_counter() - started) * 1000.0,
    )


async def create_game_with_retry(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    player_name: str,
    deadline: float,
    idempotency_key: str,
) -> tuple[str, str, float]:
    game_id, _join_code, session_id, create_ms = await create_lobby_with_retry(
        client,
        cfg,
        player_name=player_name,
        deadline=deadline,
        idempotency_key=idempotency_key,
    )
    return game_id, session_id, create_ms


async def join_game_with_retry(
    client: httpx.AsyncClient,
    *,
    game_id: str,
    join_code: str,
    player_name: str,
    deadline: float,
) -> str:
    payload = await _post_with_retry(
        client,
        f"/api/games/{game_id}/join",
        json_body={"join_code": join_code, "player_name": player_name},
        deadline=deadline,
        label="join_game",
    )
    return str(payload["session_id"])


async def request_spectate_with_retry(
    client: httpx.AsyncClient,
    *,
    game_id: str,
    target_player_name: str,
    spectator_name: str,
    deadline: float,
) -> tuple[str, str]:
    created = await _post_with_retry(
        client,
        f"/api/games/{game_id}/spectate-request",
        json_body={"target_player_name": target_player_name, "spectator_name": spectator_name},
        deadline=deadline,
        label="spectate_request",
    )
    request_id = str(created["request_id"])

    while True:
        response = await client.get(f"/api/games/{game_id}/spectate-request/{request_id}")
        response.raise_for_status()
        status_payload = response.json()
        status = status_payload.get("status")
        if status == "approved" and status_payload.get("session_id"):
            return request_id, str(status_payload["session_id"])
        if status in {"denied", "cancelled", "expired"}:
            msg = f"spectate request ended with status={status}"
            raise GameFlowError(msg)
        remaining_timeout(deadline)
        await asyncio.sleep(0.05)


async def connect_ws_with_retry(
    *,
    ws_uri: str,
    deadline: float,
) -> tuple[WebSocketProto, float]:
    ws_started = time.perf_counter()
    ws_attempt = 0

    while True:
        ws_attempt += 1
        try:
            ws = await websockets.connect(
                ws_uri,
                max_size=None,
                open_timeout=min(30.0, remaining_timeout(deadline)),
                close_timeout=5,
            )
        except Exception as exc:  # noqa: BLE001 -- broad boundary catch
            await sleep_retry_or_timeout(
                deadline=deadline,
                attempt=ws_attempt,
                base_sec=WS_CONNECT_RETRY_BASE_SEC,
                max_sec=WS_CONNECT_RETRY_MAX_SEC,
                exhausted_message=f"ws connect retries exhausted: {exc}",
            )
            continue
        return ws, (time.perf_counter() - ws_started) * 1000.0

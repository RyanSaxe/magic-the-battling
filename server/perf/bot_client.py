"""WebSocket and HTTP bot client that drives synthetic Pitfight games to completion."""

from __future__ import annotations

import asyncio
import gzip
import json
import random
import secrets
import time
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
import websockets

from server.perf.models import (
    BASIC_LANDS,
    CREATE_RETRY_BASE_SEC,
    CREATE_RETRY_MAX_SEC,
    IDEMPOTENCY_KEY_HEADER,
    PASSIVE_PHASES,
    RETRYABLE_CREATE_STATUSES,
    TERMINAL_PHASES,
    WS_CONNECT_RETRY_BASE_SEC,
    WS_CONNECT_RETRY_MAX_SEC,
    GameFlowError,
    GameResult,
    HarnessConfig,
    IdleHotGame,
    PhaseContext,
    WebSocketProto,
)


def ws_url_for(base_url: str, *, game_id: str, session_id: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    query = urlencode({"session_id": session_id})
    return urlunparse((scheme, parsed.netloc, f"/ws/{game_id}", "", query, ""))


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
        raise TimeoutError("game exceeded timeout")
    return remaining


def retry_delay_sec(attempt: int, *, base_sec: float, max_sec: float) -> float:
    exp = min(max_sec, base_sec * (2**attempt))
    return random.random() * exp


async def recv_ws_message(ctx: PhaseContext) -> dict[str, Any]:
    raw = await asyncio.wait_for(ctx.ws.recv(), timeout=remaining_timeout(ctx.deadline))
    return decode_ws_message(raw)


async def send_ws_action(ws: WebSocketProto, action: str, *, payload: dict[str, Any] | None = None) -> None:
    await ws.send(json.dumps({"action": action, "payload": payload or {}}))


async def maybe_apply_action_jitter(ctx: PhaseContext) -> None:
    if ctx.ws_action_jitter_ms <= 0:
        return
    delay_sec = ctx.rng.uniform(0.0, ctx.ws_action_jitter_ms) / 1000.0
    if delay_sec <= 0:
        return
    await asyncio.sleep(min(delay_sec, remaining_timeout(ctx.deadline)))


def _parse_ws_state_message(
    message: dict[str, Any],
    *,
    allow_lobby: bool,
) -> tuple[str, dict[str, Any]] | None:
    msg_type = message.get("type")
    payload = message.get("payload", {})

    if msg_type == "error":
        msg = payload.get("message", "Unknown game error") if isinstance(payload, dict) else "Unknown game error"
        raise GameFlowError(str(msg))
    if msg_type == "kicked" and not allow_lobby:
        raise GameFlowError("player was kicked")
    if msg_type == "game_bootstrap":
        state = payload.get("state") if isinstance(payload, dict) else None
        if isinstance(state, dict):
            return "game_bootstrap", state
        raise GameFlowError("game_bootstrap payload did not contain object state")
    if msg_type == "game_state" or (allow_lobby and msg_type == "lobby_state"):
        if isinstance(payload, dict):
            return msg_type, payload
        raise GameFlowError(f"{msg_type} payload was not an object")
    return None


async def wait_for_game_state(ctx: PhaseContext) -> dict[str, Any]:
    while True:
        message = await recv_ws_message(ctx)
        parsed = _parse_ws_state_message(message, allow_lobby=False)
        if parsed is not None:
            return parsed[1]


async def wait_for_lobby_or_game_state(ctx: PhaseContext) -> tuple[str, dict[str, Any]]:
    while True:
        message = await recv_ws_message(ctx)
        parsed = _parse_ws_state_message(message, allow_lobby=True)
        if parsed is not None:
            return parsed


async def send_action_and_wait_state(
    ctx: PhaseContext,
    action: str,
    *,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    await maybe_apply_action_jitter(ctx)
    started = time.perf_counter()
    await send_ws_action(ctx.ws, action, payload=payload)
    state = await wait_for_game_state(ctx)
    latency_ms = (time.perf_counter() - started) * 1000.0
    ctx.result.record_action(action, latency_ms)
    return state


def choose_swap_target(self_player: dict[str, Any]) -> tuple[str, str]:
    if self_player.get("sideboard"):
        card = self_player["sideboard"][0]
        return str(card["id"]), "sideboard"
    if self_player.get("hand"):
        card = self_player["hand"][0]
        return str(card["id"]), "hand"
    upgrades = self_player.get("upgrades") or []
    if upgrades:
        return str(upgrades[0]["id"]), "upgrades"
    msg = "no card available to swap from player pool"
    raise GameFlowError(msg)


async def draft_swap_once(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    self_player = state["self_player"]
    current_pack = self_player.get("current_pack") or []
    if not current_pack:
        raise GameFlowError("draft pack is empty")
    pack_card_id = str(current_pack[0]["id"])
    player_card_id, destination = choose_swap_target(self_player)
    payload = {
        "pack_card_id": pack_card_id,
        "player_card_id": player_card_id,
        "destination": destination,
    }
    return await send_action_and_wait_state(ctx, "draft_swap", payload=payload)


async def play_draft_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await draft_swap_once(ctx, state)
    state = await draft_swap_once(ctx, state)

    treasures = int(state["self_player"].get("treasures", 0))
    if treasures <= 0:
        raise GameFlowError("draft_roll requested but player has no treasures")
    state = await send_action_and_wait_state(ctx, "draft_roll")

    state = await draft_swap_once(ctx, state)
    return await send_action_and_wait_state(ctx, "draft_done")


async def apply_pending_build_upgrades(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    while True:
        self_player = state["self_player"]
        pending = [
            upgrade
            for upgrade in self_player.get("upgrades", [])
            if upgrade.get("upgrade_target_id") is None and upgrade.get("upgrade_target") is None
        ]
        if not pending:
            return state
        hand = self_player.get("hand", [])
        if not hand:
            raise GameFlowError("cannot apply build upgrade: hand is empty")
        payload = {
            "upgrade_id": str(pending[0]["id"]),
            "target_card_id": str(hand[0]["id"]),
        }
        state = await send_action_and_wait_state(ctx, "build_apply_upgrade", payload=payload)


async def play_build_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    while True:
        self_player = state["self_player"]
        hand = self_player.get("hand", [])
        hand_size = int(self_player.get("hand_size", 0))
        if len(hand) >= hand_size:
            break
        sideboard = self_player.get("sideboard", [])
        if not sideboard:
            raise GameFlowError("cannot fill hand: sideboard is empty")
        payload = {
            "card_id": str(sideboard[0]["id"]),
            "source": "sideboard",
            "destination": "hand",
        }
        state = await send_action_and_wait_state(ctx, "build_move", payload=payload)

    state = await apply_pending_build_upgrades(ctx, state)

    self_player = state["self_player"]
    if self_player.get("hand") and self_player.get("sideboard"):
        payload = {
            "card_a_id": str(self_player["hand"][0]["id"]),
            "source_a": "hand",
            "card_b_id": str(self_player["sideboard"][0]["id"]),
            "source_b": "sideboard",
        }
        state = await send_action_and_wait_state(ctx, "build_swap", payload=payload)

    basics = ctx.rng.sample(list(BASIC_LANDS), 3)
    hand_order = [str(card["id"]) for card in state["self_player"].get("hand", [])]
    payload = {
        "basics": basics,
        "play_draw_preference": "play",
        "hand_order": hand_order,
    }
    return await send_action_and_wait_state(ctx, "build_ready", payload=payload)


async def ensure_current_battle(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    candidate = state
    for _ in range(4):
        if candidate.get("current_battle"):
            return candidate
        candidate = await wait_for_game_state(ctx)
    raise GameFlowError("battle phase reached without current_battle payload")


async def play_battle_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await ensure_current_battle(ctx, state)

    while True:
        battle = state.get("current_battle") or {}
        your_zones = battle.get("your_zones") or {}
        hand = your_zones.get("hand") or []
        if not hand:
            break
        payload = {
            "card_id": str(hand[0]["id"]),
            "from_zone": "hand",
            "to_zone": "battlefield",
        }
        state = await send_action_and_wait_state(ctx, "battle_move", payload=payload)

    for _ in range(2):
        payload = {
            "action_type": "create_treasure",
            "card_id": "",
            "data": {},
        }
        state = await send_action_and_wait_state(ctx, "battle_update_card_state", payload=payload)

    winner_name = str(state["self_player"]["name"])
    return await send_action_and_wait_state(ctx, "battle_submit_result", payload={"result": winner_name})


async def play_reward_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    self_player = state["self_player"]
    available_upgrades = state.get("available_upgrades") or []
    if bool(self_player.get("is_stage_increasing")) and available_upgrades:
        choice = ctx.rng.choice(available_upgrades)
        return await send_action_and_wait_state(ctx, "reward_done", payload={"upgrade_id": str(choice["id"])})
    return await send_action_and_wait_state(ctx, "reward_done")


async def enter_game_from_lobby(ctx: PhaseContext) -> dict[str, Any]:
    ready_sent = False
    start_sent = False

    while True:
        msg_type, payload = await wait_for_lobby_or_game_state(ctx)
        if msg_type in {"game_state", "game_bootstrap"}:
            return payload

        can_start = bool(payload.get("can_start", False))
        if not ready_sent:
            await maybe_apply_action_jitter(ctx)
            await send_ws_action(ctx.ws, "set_ready", payload={"is_ready": True})
            ready_sent = True
            continue

        if can_start and not start_sent:
            start_sent = True
            await maybe_apply_action_jitter(ctx)
            start_sent_at = time.perf_counter()
            await send_ws_action(ctx.ws, "start_game")
            state = await wait_for_game_state(ctx)
            ctx.result.start_game_ms = (time.perf_counter() - start_sent_at) * 1000.0
            return state


_PHASE_HANDLERS = {
    "draft": play_draft_phase,
    "build": play_build_phase,
    "battle": play_battle_phase,
    "reward": play_reward_phase,
}


async def play_until_terminal(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    current = state
    while True:
        self_player = current.get("self_player") or {}
        phase = str(self_player.get("phase", ""))
        if phase in TERMINAL_PHASES:
            return current

        handler = _PHASE_HANDLERS.get(phase)
        if handler is not None:
            current = await handler(ctx, current)
            continue
        if phase in PASSIVE_PHASES:
            current = await wait_for_game_state(ctx)
            continue

        msg = f"unsupported phase encountered: {phase or '<empty>'}"
        raise GameFlowError(msg)


def build_create_game_payload(player_name: str, cfg: HarnessConfig) -> dict[str, Any]:
    return {
        "player_name": player_name,
        "cube_id": cfg.cube_id,
        "use_upgrades": cfg.use_upgrades,
        "target_player_count": cfg.puppet_count + 1,
        "puppet_count": cfg.puppet_count,
        "auto_approve_spectators": False,
    }


async def _sleep_retry_or_timeout(
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


async def create_game_with_retry(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    player_name: str,
    deadline: float,
    idempotency_key: str,
) -> tuple[str, str, float]:
    create_started = time.perf_counter()
    create_attempt = 0
    create_payload = build_create_game_payload(player_name, cfg)

    while True:
        create_attempt += 1
        try:
            response = await client.post(
                "/api/games",
                json=create_payload,
                headers={IDEMPOTENCY_KEY_HEADER: idempotency_key},
            )
        except httpx.HTTPError as exc:
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=create_attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=f"create_game retries exhausted: {exc}",
            )
            continue

        if response.status_code in RETRYABLE_CREATE_STATUSES:
            detail = response.text.strip()
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=create_attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=f"create_game retry window exhausted ({response.status_code}: {detail})",
            )
            continue

        response.raise_for_status()
        payload = response.json()
        return (
            str(payload["game_id"]),
            str(payload["session_id"]),
            (time.perf_counter() - create_started) * 1000.0,
        )


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
        except Exception as exc:
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=ws_attempt,
                base_sec=WS_CONNECT_RETRY_BASE_SEC,
                max_sec=WS_CONNECT_RETRY_MAX_SEC,
                exhausted_message=f"ws connect retries exhausted: {exc}",
            )
            continue
        return ws, (time.perf_counter() - ws_started) * 1000.0


def _to_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, (float, str)):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def record_terminal_state(result: GameResult, state: dict[str, Any]) -> None:
    self_player = state.get("self_player") or {}
    phase = str(self_player.get("phase", ""))
    result.final_phase = phase
    result.final_stage = _to_int(self_player.get("stage"))
    result.final_round = _to_int(self_player.get("round"))
    result.success = phase in TERMINAL_PHASES
    if not result.success:
        result.error = f"terminal phase not reached (final phase: {phase})"


async def run_one_game(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    game_index: int,
    timeout_sec: float,
) -> GameResult:
    result = GameResult(index=game_index)
    game_started_at = time.perf_counter()
    player_name = f"PerfPlayer-{game_index:05d}-{cfg.seed}"
    deadline = time.monotonic() + timeout_sec
    idempotency_key = f"perf-{cfg.seed}-{game_index}-{secrets.token_urlsafe(6)}"

    ws: WebSocketProto | None = None
    try:
        game_id, session_id, create_ms = await create_game_with_retry(
            client,
            cfg,
            player_name=player_name,
            deadline=deadline,
            idempotency_key=idempotency_key,
        )
        result.create_game_ms = create_ms
        result.game_id = game_id

        ws_uri = ws_url_for(cfg.base_url, game_id=game_id, session_id=session_id)
        ws, ws_connect_ms = await connect_ws_with_retry(ws_uri=ws_uri, deadline=deadline)
        result.ws_connect_ms = ws_connect_ms

        ctx = PhaseContext(
            ws=ws,
            deadline=deadline,
            result=result,
            rng=random.Random(cfg.seed + game_index),
            ws_action_jitter_ms=cfg.ws_action_jitter_ms,
        )
        state = await enter_game_from_lobby(ctx)
        state = await play_until_terminal(ctx, state)
        record_terminal_state(result, state)
    except TimeoutError as exc:
        result.error = f"timeout: {exc}"
    except httpx.HTTPStatusError as exc:
        result.error = f"http {exc.response.status_code}: {exc.response.text.strip()}"
    except GameFlowError as exc:
        result.error = str(exc)
    except Exception as exc:
        result.error = f"unexpected: {exc}"
    finally:
        result.duration_sec = time.perf_counter() - game_started_at
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass
    return result


async def run_one_idle_hot_game(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    hot_index: int,
    timeout_sec: float,
) -> IdleHotGame:
    deadline = time.monotonic() + timeout_sec
    player_name = f"IdleHot-{hot_index:05d}-{cfg.seed}"
    idempotency_key = f"idle-hot-{cfg.seed}-{hot_index}-{secrets.token_urlsafe(6)}"

    game_id, session_id, _ = await create_game_with_retry(
        client,
        cfg,
        player_name=player_name,
        deadline=deadline,
        idempotency_key=idempotency_key,
    )

    ws_uri = ws_url_for(cfg.base_url, game_id=game_id, session_id=session_id)
    ws, _ = await connect_ws_with_retry(ws_uri=ws_uri, deadline=deadline)

    ctx = PhaseContext(
        ws=ws,
        deadline=deadline,
        result=GameResult(index=hot_index, game_id=game_id),
        rng=random.Random((cfg.seed * 17) + hot_index),
        ws_action_jitter_ms=cfg.ws_action_jitter_ms,
    )

    try:
        state = await enter_game_from_lobby(ctx)
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass
        raise

    self_player = state.get("self_player") or {}
    phase = str(self_player.get("phase") or "")
    if phase in TERMINAL_PHASES:
        try:
            await ws.close()
        except Exception:
            pass
        raise GameFlowError(f"idle hot game reached terminal phase immediately: {phase}")

    return IdleHotGame(game_id=game_id, session_id=session_id, ws=ws, phase=phase or None)


async def close_idle_hot_games(games: list[IdleHotGame]) -> None:
    async def _close_one(game: IdleHotGame) -> None:
        try:
            await game.ws.close()
        except Exception:
            pass

    if not games:
        return
    await asyncio.gather(*(_close_one(game) for game in games), return_exceptions=True)

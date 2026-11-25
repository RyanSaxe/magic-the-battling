"""Bot phase driver that plays Pitfight lobby, draft, build, battle, and reward actions."""

from __future__ import annotations

import asyncio
import json
import time
from typing import TYPE_CHECKING, Any

from server.perf.models import (
    BASIC_LANDS,
    PASSIVE_PHASES,
    TERMINAL_PHASES,
    GameFlowError,
    GameResult,
    PhaseContext,
    WebSocketProto,
)
from server.perf.transport import decode_ws_message, remaining_timeout

if TYPE_CHECKING:
    from collections.abc import Callable


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
        msg_0 = "player was kicked"
        raise GameFlowError(msg_0)
    if msg_type == "game_bootstrap":
        state = payload.get("state") if isinstance(payload, dict) else None
        if isinstance(state, dict):
            return "game_bootstrap", state
        msg_0 = "game_bootstrap payload did not contain object state"
        raise GameFlowError(msg_0)
    if msg_type == "game_state" or (allow_lobby and msg_type == "lobby_state"):
        if isinstance(payload, dict):
            return msg_type, payload
        msg_0 = f"{msg_type} payload was not an object"
        raise GameFlowError(msg_0)
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
    until: Callable[[dict[str, Any]], bool] | None = None,
) -> dict[str, Any]:
    await maybe_apply_action_jitter(ctx)
    started = time.perf_counter()
    if ctx.action_clock is not None:
        ctx.action_clock.last_action_sent_at = started
    await send_ws_action(ctx.ws, action, payload=payload)
    while True:
        state = await wait_for_game_state(ctx)
        if until is None or until(state):
            break
    latency_ms = (time.perf_counter() - started) * 1000.0
    ctx.result.record_action(action, latency_ms)
    return state


def _phase_of(state: dict[str, Any]) -> str:
    return str((state.get("self_player") or {}).get("phase", ""))


def _is_upgrade_pending(self_player: dict[str, Any], upgrade_id: str) -> bool:
    for upgrade in self_player.get("upgrades", []):
        if str(upgrade.get("id")) == upgrade_id:
            return upgrade.get("upgrade_target_id") is None and upgrade.get("upgrade_target") is None
    return False


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
        msg = "draft pack is empty"
        raise GameFlowError(msg)
    pack_card_id = str(current_pack[0]["id"])
    player_card_id, destination = choose_swap_target(self_player)
    payload = {
        "pack_card_id": pack_card_id,
        "player_card_id": player_card_id,
        "destination": destination,
    }
    return await send_action_and_wait_state(
        ctx,
        "draft_swap",
        payload=payload,
        until=lambda s: (
            _phase_of(s) != "draft"
            or all(str(card.get("id")) != pack_card_id for card in (s["self_player"].get("current_pack") or []))
        ),
    )


async def play_draft_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await draft_swap_once(ctx, state)
    state = await draft_swap_once(ctx, state)

    treasures = int(state["self_player"].get("treasures", 0))
    if treasures > 0:
        state = await send_action_and_wait_state(
            ctx,
            "draft_roll",
            until=lambda s: _phase_of(s) != "draft" or int(s["self_player"].get("treasures", 0)) < treasures,
        )
        state = await draft_swap_once(ctx, state)

    return await send_action_and_wait_state(ctx, "draft_done", until=lambda s: _phase_of(s) != "draft")


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
            msg = "cannot apply build upgrade: hand is empty"
            raise GameFlowError(msg)
        upgrade_id = str(pending[0]["id"])
        payload = {
            "upgrade_id": upgrade_id,
            "target_card_id": str(hand[0]["id"]),
        }
        state = await send_action_and_wait_state(
            ctx,
            "build_apply_upgrade",
            payload=payload,
            until=lambda s, uid=upgrade_id: _phase_of(s) != "build" or not _is_upgrade_pending(s["self_player"], uid),
        )


async def play_build_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    while True:
        self_player = state["self_player"]
        hand = self_player.get("hand", [])
        hand_size = int(self_player.get("hand_size", 0))
        if len(hand) >= hand_size:
            break
        sideboard = self_player.get("sideboard", [])
        if not sideboard:
            msg = "cannot fill hand: sideboard is empty"
            raise GameFlowError(msg)
        card_id = str(sideboard[0]["id"])
        payload = {
            "card_id": card_id,
            "source": "sideboard",
            "destination": "hand",
        }
        state = await send_action_and_wait_state(
            ctx,
            "build_move",
            payload=payload,
            until=lambda s, cid=card_id: (
                _phase_of(s) != "build" or any(str(c.get("id")) == cid for c in (s["self_player"].get("hand") or []))
            ),
        )

    state = await apply_pending_build_upgrades(ctx, state)

    self_player = state["self_player"]
    if self_player.get("hand") and self_player.get("sideboard"):
        card_a_id = str(self_player["hand"][0]["id"])
        payload = {
            "card_a_id": card_a_id,
            "source_a": "hand",
            "card_b_id": str(self_player["sideboard"][0]["id"]),
            "source_b": "sideboard",
        }
        state = await send_action_and_wait_state(
            ctx,
            "build_swap",
            payload=payload,
            until=lambda s, cid=card_a_id: (
                _phase_of(s) != "build" or all(str(c.get("id")) != cid for c in (s["self_player"].get("hand") or []))
            ),
        )

    basics = ctx.rng.sample(list(BASIC_LANDS), 3)
    hand_order = [str(card["id"]) for card in state["self_player"].get("hand", [])]
    payload = {
        "basics": basics,
        "play_draw_preference": "play",
        "hand_order": hand_order,
    }
    return await send_action_and_wait_state(
        ctx,
        "build_ready",
        payload=payload,
        until=lambda s: _phase_of(s) != "build" or bool(s["self_player"].get("build_ready")),
    )


async def ensure_current_battle(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    candidate = state
    for _ in range(4):
        if candidate.get("current_battle") or _phase_of(candidate) != "battle":
            return candidate
        candidate = await wait_for_game_state(ctx)
    msg = "battle phase reached without current_battle payload"
    raise GameFlowError(msg)


def _choose_battle_winner(state: dict[str, Any]) -> str:
    self_name = str(state["self_player"]["name"])
    battle = state.get("current_battle") or {}
    opponent_name = str(battle.get("opponent_name") or "")
    if not opponent_name or opponent_name == self_name:
        return self_name
    for player in state.get("players") or []:
        if player.get("name") == opponent_name:
            if player.get("is_ghost") or player.get("is_puppet"):
                return self_name
            return min(self_name, opponent_name)
    return self_name


async def play_battle_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await ensure_current_battle(ctx, state)
    if _phase_of(state) != "battle":
        return state

    while True:
        battle = state.get("current_battle") or {}
        your_zones = battle.get("your_zones") or {}
        hand = your_zones.get("hand") or []
        if not hand:
            break
        card_id = str(hand[0]["id"])
        payload = {"card_id": card_id, "from_zone": "hand", "to_zone": "battlefield"}
        state = await send_action_and_wait_state(
            ctx,
            "battle_move",
            payload=payload,
            until=lambda s, cid=card_id: (
                _phase_of(s) != "battle"
                or all(
                    str(c.get("id")) != cid
                    for c in (((s.get("current_battle") or {}).get("your_zones") or {}).get("hand") or [])
                )
            ),
        )

    for _ in range(2):
        prev_tokens = len(((state.get("current_battle") or {}).get("your_zones") or {}).get("spawned_tokens") or [])
        payload = {"action_type": "create_treasure", "card_id": "", "data": {}}
        state = await send_action_and_wait_state(
            ctx,
            "battle_update_card_state",
            payload=payload,
            until=lambda s, prev=prev_tokens: (
                _phase_of(s) != "battle"
                or len(((s.get("current_battle") or {}).get("your_zones") or {}).get("spawned_tokens") or []) > prev
            ),
        )

    self_name = str(state["self_player"]["name"])
    winner_name = _choose_battle_winner(state)
    return await send_action_and_wait_state(
        ctx,
        "battle_submit_result",
        payload={"result": winner_name},
        until=lambda s: (
            _phase_of(s) != "battle" or self_name in ((s.get("current_battle") or {}).get("result_submissions") or {})
        ),
    )


async def play_reward_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    self_player = state["self_player"]
    available_upgrades = state.get("available_upgrades") or []
    if bool(self_player.get("is_stage_increasing")) and available_upgrades:
        choice = ctx.rng.choice(available_upgrades)
        return await send_action_and_wait_state(
            ctx,
            "reward_done",
            payload={"upgrade_id": str(choice["id"])},
            until=lambda s: _phase_of(s) != "reward",
        )
    return await send_action_and_wait_state(ctx, "reward_done", until=lambda s: _phase_of(s) != "reward")


async def enter_game_from_lobby(ctx: PhaseContext, *, is_host: bool = True) -> dict[str, Any]:
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

        if is_host and can_start and not start_sent:
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


def _is_waiting_for_others(state: dict[str, Any]) -> bool:
    self_player = state.get("self_player") or {}
    phase = str(self_player.get("phase", ""))
    if phase in PASSIVE_PHASES:
        return True
    if phase == "build" and bool(self_player.get("build_ready")):
        return True
    if phase == "battle":
        submissions = (state.get("current_battle") or {}).get("result_submissions") or {}
        if str(self_player.get("name", "")) in submissions:
            return True
    return False


async def play_until_terminal(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    current = state
    while True:
        phase = _phase_of(current)
        if phase in TERMINAL_PHASES:
            return current
        if _is_waiting_for_others(current):
            current = await wait_for_game_state(ctx)
            continue

        handler = _PHASE_HANDLERS.get(phase)
        if handler is not None:
            current = await handler(ctx, current)
            continue

        msg = f"unsupported phase encountered: {phase or '<empty>'}"
        raise GameFlowError(msg)


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

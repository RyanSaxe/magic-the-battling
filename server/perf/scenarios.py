"""End-to-end game scenarios: single-player goldfish, multi-human tables, and spectator fan-out."""

from __future__ import annotations

import asyncio
import contextlib
import random
import secrets
import time

import httpx
import websockets

from server.perf.bot_client import (
    enter_game_from_lobby,
    play_until_terminal,
    record_terminal_state,
)
from server.perf.models import (
    ActionClock,
    GameFlowError,
    GameResult,
    HarnessConfig,
    IdleHotGame,
    PhaseContext,
    WebSocketProto,
)
from server.perf.transport import (
    connect_ws_with_retry,
    create_game_with_retry,
    create_lobby_with_retry,
    decode_ws_message,
    join_game_with_retry,
    remaining_timeout,
    request_spectate_with_retry,
    ws_url_for,
)


async def _run_spectator_listener(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    game_id: str,
    target_player_name: str,
    spectator_name: str,
    deadline: float,
    result: GameResult,
    action_clock: ActionClock,
    ready_event: asyncio.Event,
    stop_event: asyncio.Event,
) -> None:
    request_id, session_id = await request_spectate_with_retry(
        client,
        game_id=game_id,
        target_player_name=target_player_name,
        spectator_name=spectator_name,
        deadline=deadline,
    )
    ws_uri = ws_url_for(
        cfg.base_url,
        game_id=game_id,
        session_id=session_id,
        spectate_player=target_player_name,
        request_id=request_id,
    )
    ws, _ = await connect_ws_with_retry(ws_uri=ws_uri, deadline=deadline)
    last_recorded_sent_at: float | None = None
    try:
        await _consume_spectator_stream(
            ws,
            deadline=deadline,
            result=result,
            action_clock=action_clock,
            ready_event=ready_event,
            stop_event=stop_event,
            last_recorded_sent_at=last_recorded_sent_at,
        )
    finally:
        ready_event.set()
        with contextlib.suppress(Exception):
            await ws.close()


async def _consume_spectator_stream(
    ws: WebSocketProto,
    *,
    deadline: float,
    result: GameResult,
    action_clock: ActionClock,
    ready_event: asyncio.Event,
    stop_event: asyncio.Event,
    last_recorded_sent_at: float | None,
) -> None:
    while not stop_event.is_set():
        timeout = min(0.25, remaining_timeout(deadline))
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        except TimeoutError:
            continue
        except websockets.ConnectionClosed:
            return

        message = decode_ws_message(raw)
        msg_type = message.get("type")
        if msg_type == "game_bootstrap":
            ready_event.set()
            result.record_spectator_message(None)
            continue
        if msg_type == "game_state":
            ready_event.set()
            latency_ms = _spectator_latency_ms(action_clock, last_recorded_sent_at)
            if latency_ms is not None:
                last_recorded_sent_at = action_clock.last_action_sent_at
            result.record_spectator_message(latency_ms)
            continue
        if msg_type == "game_over":
            return


def _spectator_latency_ms(action_clock: ActionClock, last_recorded_sent_at: float | None) -> float | None:
    sent_at = action_clock.last_action_sent_at
    if sent_at is None or sent_at == last_recorded_sent_at:
        return None
    now = time.perf_counter()
    if now < sent_at:
        return None
    return (now - sent_at) * 1000.0


async def _start_spectators(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    game_id: str,
    target_player_name: str,
    deadline: float,
    result: GameResult,
    action_clock: ActionClock,
    stop_event: asyncio.Event,
) -> list[asyncio.Task[None]]:
    ready_events = [asyncio.Event() for _ in range(cfg.spectators_per_game)]
    tasks = [
        asyncio.create_task(
            _run_spectator_listener(
                client,
                cfg,
                game_id=game_id,
                target_player_name=target_player_name,
                spectator_name=f"Spec-{result.index:04d}-{spec_idx:02d}",
                deadline=deadline,
                result=result,
                action_clock=action_clock,
                ready_event=ready_events[spec_idx],
                stop_event=stop_event,
            ),
        )
        for spec_idx in range(cfg.spectators_per_game)
    ]
    await asyncio.wait_for(
        asyncio.gather(*(event.wait() for event in ready_events)),
        timeout=remaining_timeout(deadline),
    )
    return tasks


async def _stop_spectators(tasks: list[asyncio.Task[None]], stop_event: asyncio.Event) -> None:
    if not tasks:
        return
    stop_event.set()
    await asyncio.gather(*tasks)


def _format_game_exception(exc: Exception) -> str:
    if isinstance(exc, TimeoutError):
        return f"timeout: {exc}"
    if isinstance(exc, httpx.HTTPStatusError):
        return f"http {exc.response.status_code}: {exc.response.text.strip()}"
    if isinstance(exc, GameFlowError):
        return str(exc)
    return f"unexpected: {exc}"


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
    spectator_tasks: list[asyncio.Task[None]] = []
    stop_spectators = asyncio.Event()
    action_clock = ActionClock()
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
            rng=random.Random(cfg.seed + game_index),  # noqa: S311 -- non-cryptographic game RNG
            ws_action_jitter_ms=cfg.ws_action_jitter_ms,
            action_clock=action_clock,
        )
        state = await enter_game_from_lobby(ctx)
        if cfg.spectators_per_game > 0:
            spectator_tasks = await _start_spectators(
                client,
                cfg,
                game_id=game_id,
                target_player_name=player_name,
                deadline=deadline,
                result=result,
                action_clock=action_clock,
                stop_event=stop_spectators,
            )
        state = await play_until_terminal(ctx, state)
        await _stop_spectators(spectator_tasks, stop_spectators)
        record_terminal_state(result, state)
    except Exception as exc:  # noqa: BLE001 -- broad boundary catch
        result.error = _format_game_exception(exc)
    finally:
        stop_spectators.set()
        for task in spectator_tasks:
            if not task.done():
                task.cancel()
        if spectator_tasks:
            await asyncio.gather(*spectator_tasks, return_exceptions=True)
        result.duration_sec = time.perf_counter() - game_started_at
        if ws is not None:
            with contextlib.suppress(Exception):
                await ws.close()
    return result


async def _run_table_player(
    *,
    player_index: int,
    ws: WebSocketProto,
    table_index: int,
    cfg: HarnessConfig,
    deadline: float,
    action_clock: ActionClock,
    game_started: asyncio.Event,
    spectators_ready: asyncio.Event,
) -> GameResult:
    player_result = GameResult(index=player_index)
    ctx = PhaseContext(
        ws=ws,
        deadline=deadline,
        result=player_result,
        rng=random.Random(cfg.seed + (table_index * 100) + player_index),  # noqa: S311 -- non-cryptographic game RNG
        ws_action_jitter_ms=cfg.ws_action_jitter_ms,
        action_clock=action_clock,
    )
    state = await enter_game_from_lobby(ctx, is_host=(player_index == 0))
    if player_index == 0:
        game_started.set()
    await asyncio.wait_for(spectators_ready.wait(), timeout=remaining_timeout(deadline))
    final_state = await play_until_terminal(ctx, state)
    record_terminal_state(player_result, final_state)
    return player_result


def _merge_table_player_results(
    table_result: GameResult,
    player_results: list[GameResult],
) -> None:
    host_result = player_results[0]
    table_result.start_game_ms = host_result.start_game_ms
    table_result.final_phase = host_result.final_phase
    table_result.final_stage = host_result.final_stage
    table_result.final_round = host_result.final_round
    for p_res in player_results:
        table_result.actions_sent += p_res.actions_sent
        table_result.action_latencies_ms.extend(p_res.action_latencies_ms)
        for action, latencies in p_res.action_latencies_by_type_ms.items():
            table_result.action_latencies_by_type_ms.setdefault(action, []).extend(latencies)
    failed_players = [p_res for p_res in player_results if not p_res.success]
    table_result.success = not failed_players
    if failed_players:
        table_result.error = failed_players[0].error or "multiplayer player failed to reach terminal phase"


async def run_one_multiplayer_table(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    table_index: int,
    timeout_sec: float,
) -> GameResult:
    table_result = GameResult(index=table_index)
    started_at = time.perf_counter()
    deadline = time.monotonic() + timeout_sec
    player_count = cfg.players_per_table
    player_names = [f"Table-{table_index:04d}-P{idx}-{cfg.seed}" for idx in range(player_count)]
    idempotency_key = f"mp-{cfg.seed}-{table_index}-{secrets.token_urlsafe(6)}"

    sockets: list[WebSocketProto] = []
    spectator_tasks: list[asyncio.Task[None]] = []
    stop_spectators = asyncio.Event()
    action_clock = ActionClock()
    try:
        game_id, join_code, host_session, create_ms = await create_lobby_with_retry(
            client,
            cfg,
            player_name=player_names[0],
            deadline=deadline,
            idempotency_key=idempotency_key,
            target_player_count=player_count,
            puppet_count=0,
            auto_approve_spectators=cfg.spectators_per_game > 0,
        )
        table_result.create_game_ms = create_ms
        table_result.game_id = game_id

        guest_sessions = await asyncio.gather(
            *(
                join_game_with_retry(
                    client,
                    game_id=game_id,
                    join_code=join_code,
                    player_name=name,
                    deadline=deadline,
                )
                for name in player_names[1:]
            ),
        )
        all_sessions = [host_session, *guest_sessions]
        ws_results = await asyncio.gather(
            *(
                connect_ws_with_retry(
                    ws_uri=ws_url_for(cfg.base_url, game_id=game_id, session_id=sid),
                    deadline=deadline,
                )
                for sid in all_sessions
            ),
        )
        sockets = [ws for ws, _ in ws_results]
        table_result.ws_connect_ms = max(ms for _, ms in ws_results)

        game_started = asyncio.Event()
        spectators_ready = asyncio.Event()
        if cfg.spectators_per_game <= 0:
            spectators_ready.set()

        player_tasks = [
            asyncio.create_task(
                _run_table_player(
                    player_index=idx,
                    ws=sockets[idx],
                    table_index=table_index,
                    cfg=cfg,
                    deadline=deadline,
                    action_clock=action_clock,
                    game_started=game_started,
                    spectators_ready=spectators_ready,
                ),
            )
            for idx in range(player_count)
        ]

        if cfg.spectators_per_game > 0:
            await asyncio.wait_for(game_started.wait(), timeout=remaining_timeout(deadline))
            spectator_tasks = await _start_spectators(
                client,
                cfg,
                game_id=game_id,
                target_player_name=player_names[0],
                deadline=deadline,
                result=table_result,
                action_clock=action_clock,
                stop_event=stop_spectators,
            )
            spectators_ready.set()

        player_results = await asyncio.gather(*player_tasks)
        await _stop_spectators(spectator_tasks, stop_spectators)
        _merge_table_player_results(table_result, list(player_results))
    except Exception as exc:  # noqa: BLE001 -- broad boundary catch
        table_result.error = _format_game_exception(exc)
    finally:
        stop_spectators.set()
        for task in spectator_tasks:
            if not task.done():
                task.cancel()
        if spectator_tasks:
            await asyncio.gather(*spectator_tasks, return_exceptions=True)
        table_result.duration_sec = time.perf_counter() - started_at
        await asyncio.gather(*(ws.close() for ws in sockets), return_exceptions=True)
    return table_result


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
        rng=random.Random((cfg.seed * 17) + hot_index),  # noqa: S311 -- non-cryptographic game RNG
        ws_action_jitter_ms=cfg.ws_action_jitter_ms,
    )

    try:
        state = await enter_game_from_lobby(ctx)
    except Exception:
        with contextlib.suppress(Exception):
            await ws.close()
        raise

    self_player = state.get("self_player") or {}
    phase = str(self_player.get("phase") or "")
    if phase in {"winner", "game_over", "eliminated"}:
        with contextlib.suppress(Exception):
            await ws.close()
        msg = f"idle hot game reached terminal phase immediately: {phase}"
        raise GameFlowError(msg)

    return IdleHotGame(game_id=game_id, session_id=session_id, ws=ws, phase=phase or None)


async def close_idle_hot_games(games: list[IdleHotGame]) -> None:
    async def _close_one(game: IdleHotGame) -> None:
        with contextlib.suppress(Exception):
            await game.ws.close()

    if not games:
        return
    await asyncio.gather(*(_close_one(game) for game in games), return_exceptions=True)

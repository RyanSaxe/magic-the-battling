import asyncio
import json
from dataclasses import replace

from server.perf.load_harness import (
    GameSessionState,
    PerfMetrics,
    PerfSummary,
    PerfThresholds,
    PlayerRuntime,
    ServerSample,
    _choose_draft_swap,
    _handle_game_state,
    _record_action_latency,
    _send_action,
    compute_memory_growth_mb_per_min,
    evaluate_thresholds,
    percentile,
)


def _summary(**overrides) -> PerfSummary:
    base = PerfSummary(
        duration_seconds=10.0,
        games_started=100,
        games_completed=99,
        games_failed=1,
        game_timeouts=0,
        completion_rate_pct=99.0,
        actions_sent=1000,
        error_messages=5,
        disconnects=4,
        error_rate_pct=0.5,
        disconnect_rate_pct=0.2,
        p50_latency_ms=120.0,
        p95_latency_ms=300.0,
        p99_latency_ms=420.0,
        max_latency_ms=500.0,
        peak_rss_mb=900.0,
        avg_cpu_pct=35.0,
        peak_cpu_pct=60.0,
        memory_growth_mb_per_min=4.0,
    )
    return replace(base, **overrides)


def test_percentile_uses_linear_interpolation():
    values = [10.0, 20.0, 30.0, 40.0]
    assert percentile(values, 95) == 38.5


def test_compute_memory_growth_mb_per_min_from_samples():
    samples = [
        ServerSample(timestamp=0.0, rss_mb=100.0, cpu_pct=0.0),
        ServerSample(timestamp=60.0, rss_mb=130.0, cpu_pct=0.0),
    ]

    growth = compute_memory_growth_mb_per_min(samples)
    assert growth == 30.0


def test_evaluate_thresholds_detects_failure():
    summary = _summary(p95_latency_ms=800.0)
    thresholds = PerfThresholds(max_p95_latency_ms=500.0)

    checks = evaluate_thresholds(summary, thresholds)
    by_name = {check.name: check for check in checks}

    assert by_name["p95_latency_ms"].passed is False
    assert by_name["games_started"].passed is True


def test_evaluate_thresholds_requires_memory_sample_when_memory_limits_set():
    summary = _summary(peak_rss_mb=None, memory_growth_mb_per_min=None)
    thresholds = PerfThresholds(
        max_peak_rss_mb=2048.0,
        max_memory_growth_mb_per_min=10.0,
    )

    checks = evaluate_thresholds(summary, thresholds)
    by_name = {check.name: check for check in checks}

    assert by_name["peak_rss_mb"].passed is False
    assert by_name["memory_growth_mb_per_min"].passed is False


class _FakeWs:
    def __init__(self):
        self.sent: list[str] = []

    async def send(self, payload: str):
        self.sent.append(payload)


def test_send_action_applies_backpressure_until_state_update():
    ws = _FakeWs()
    runtime = PlayerRuntime(name="p1", is_host=False)
    metrics = PerfMetrics(started_at="now", start_monotonic=0.0)

    async def _run():
        sent1 = await _send_action(ws, runtime, metrics, "set_ready")
        sent2 = await _send_action(ws, runtime, metrics, "start_game")
        _record_action_latency(runtime, metrics)
        sent3 = await _send_action(ws, runtime, metrics, "start_game")
        return sent1, sent2, sent3

    sent1, sent2, sent3 = asyncio.run(_run())

    assert sent1 is True
    assert sent2 is False
    assert sent3 is True
    assert len(ws.sent) == 2


def test_send_action_never_bypasses_state_ack():
    ws = _FakeWs()
    runtime = PlayerRuntime(name="p1", is_host=False, waiting_for_state_update=True, waiting_since=0.0)
    metrics = PerfMetrics(started_at="now", start_monotonic=0.0)

    async def _run():
        return await _send_action(ws, runtime, metrics, "start_game")

    sent = asyncio.run(_run())
    assert sent is False
    assert len(ws.sent) == 0


def test_choose_draft_swap_uses_non_matching_card_not_just_first():
    self_player = {
        "hand": [{"id": "pack1"}, {"id": "hand2"}],
        "sideboard": [],
    }
    current_pack = [{"id": "pack1"}, {"id": "pack2"}]

    swap = _choose_draft_swap(self_player, current_pack)
    assert swap == ("pack1", "hand2", "hand")


def test_build_move_not_resent_for_same_card_on_stale_state():
    ws = _FakeWs()
    runtime = PlayerRuntime(name="p1", is_host=False)
    metrics = PerfMetrics(started_at="now", start_monotonic=0.0)
    session_state = GameSessionState(player_count=2)
    stop_event = asyncio.Event()
    payload = {
        "self_player": {
            "phase": "build",
            "stage": 1,
            "round": 1,
            "hand_size": 0,
            "hand": [{"id": "h1"}],
            "sideboard": [],
            "build_ready": False,
        }
    }

    async def _run():
        await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)
        _record_action_latency(runtime, metrics)
        await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)

    asyncio.run(_run())

    assert len(ws.sent) == 1


def test_battle_submit_sent_once_per_turn_even_after_ack():
    ws = _FakeWs()
    runtime = PlayerRuntime(name="alice", is_host=False)
    metrics = PerfMetrics(started_at="now", start_monotonic=0.0)
    session_state = GameSessionState(player_count=2)
    stop_event = asyncio.Event()
    payload = {
        "self_player": {
            "phase": "battle",
            "stage": 1,
            "round": 2,
        },
        "current_battle": {
            "result_submissions": {},
            "opponent_name": "bob",
        },
    }

    async def _run():
        await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)
        _record_action_latency(runtime, metrics)
        await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)
        _record_action_latency(runtime, metrics)
        await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)

    asyncio.run(_run())

    submit_actions = [json.loads(msg) for msg in ws.sent if json.loads(msg).get("action") == "battle_submit_result"]
    assert len(submit_actions) == 1

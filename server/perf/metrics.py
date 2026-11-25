"""RSS sampling, run aggregation, timeout scaling, threshold checks, and summary formatting."""

from __future__ import annotations

import asyncio
import math
import statistics
import subprocess
import sys
from collections import Counter
from dataclasses import asdict
from typing import Any

from server.perf.models import GameResult, HarnessConfig, RunSummary


def read_process_rss_mb(pid: int) -> float | None:
    cmd = ["ps", "-o", "rss=", "-p", str(pid)]
    try:
        result = subprocess.run(  # noqa: S603 -- trusted local subprocess args
            cmd,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None

    try:
        rss_kb = int(raw)
    except ValueError:
        return None
    return rss_kb / 1024.0


class ProcessSampler:
    def __init__(self, pid: int, *, interval_sec: float = 0.25) -> None:
        self._pid = pid
        self._interval_sec = interval_sec
        self._task: asyncio.Task[None] | None = None
        self._values: list[float] = []

    def mark(self) -> int:
        return len(self._values)

    async def sample_now(self) -> None:
        value = await asyncio.to_thread(read_process_rss_mb, self._pid)
        if value is not None:
            self._values.append(value)

    async def start(self) -> None:
        if self._task is not None:
            return

        async def _loop() -> None:
            while True:
                await self.sample_now()
                await asyncio.sleep(self._interval_sec)

        self._task = asyncio.create_task(_loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        self._task = None

    def slice_stats(self, start_idx: int) -> dict[str, float | int | None]:
        return stats_dict(self._values[start_idx:])

    def slice_window(self, start_idx: int) -> dict[str, float | int | None]:
        return rss_window_dict(self._values[start_idx:])


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = (len(ordered) - 1) * p
    lower = math.floor(idx)
    upper = math.ceil(idx)
    if lower == upper:
        return ordered[lower]
    lower_value = ordered[lower]
    upper_value = ordered[upper]
    fraction = idx - lower
    return lower_value + (upper_value - lower_value) * fraction


def stats_dict(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {
            "count": 0,
            "avg": None,
            "min": None,
            "p50": None,
            "p95": None,
            "p99": None,
            "max": None,
        }
    return {
        "count": len(values),
        "avg": statistics.fmean(values),
        "min": min(values),
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
        "max": max(values),
    }


def rss_window_dict(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {
            "count": 0,
            "start": None,
            "end": None,
            "peak": None,
            "delta_end": None,
            "delta_peak": None,
        }
    start = values[0]
    end = values[-1]
    peak = max(values)
    return {
        "count": len(values),
        "start": start,
        "end": end,
        "peak": peak,
        "delta_end": end - start,
        "delta_peak": peak - start,
    }


def choose_timeout_seconds(
    *,
    single_game_seconds: float,
    concurrency: int,
    multiplier: float,
    min_timeout: float,
    max_timeout: float,
    assumed_start_slots: int = 100,
) -> float:
    # At high concurrency, per-game wall time can scale close to linearly due event-loop
    # contention and game-start queueing; include a linear term to avoid optimistic timeouts.
    concurrency_factor = max(1.0, min(5.0, math.sqrt(max(concurrency, 1) / 25.0)))
    queue_factor = max(1.0, math.sqrt(max(concurrency, 1) / max(assumed_start_slots, 1)))
    scaled_factor = max(concurrency_factor * queue_factor, float(max(concurrency, 1)) * 1.5)
    computed = single_game_seconds * multiplier * scaled_factor
    return max(min_timeout, min(max_timeout, computed))


def timeout_for_sweep(
    cfg: HarnessConfig,
    calibration_result: GameResult,
    *,
    timeout_per_game_sec: float,
    concurrency: int,
    idle_hot_games: int = 0,
) -> float:
    if cfg.game_timeout_sec is not None:
        return timeout_per_game_sec
    return choose_timeout_seconds(
        single_game_seconds=calibration_result.duration_sec,
        concurrency=concurrency + max(0, idle_hot_games),
        multiplier=cfg.timeout_multiplier,
        min_timeout=cfg.timeout_min_sec,
        max_timeout=cfg.timeout_max_sec,
    )


def _compute_rss_per_game(
    server_rss_window_mb: dict[str, float | int | None] | None,
    succeeded: int,
) -> dict[str, float | int | None] | None:
    if not server_rss_window_mb or succeeded <= 0:
        return None
    delta_end = server_rss_window_mb.get("delta_end")
    delta_peak = server_rss_window_mb.get("delta_peak")
    return {
        "count": succeeded,
        "delta_end_per_game": (float(delta_end) / succeeded) if delta_end is not None else None,
        "delta_peak_per_game": (float(delta_peak) / succeeded) if delta_peak is not None else None,
    }


def summarize_run(
    *,
    label: str,
    cfg: HarnessConfig,
    games: int,
    concurrency: int,
    idle_hot_games: int,
    timeout_per_game_sec: float,
    wall_time_sec: float,
    results: list[GameResult],
    server_rss_mb: dict[str, float | int | None] | None,
    server_rss_window_mb: dict[str, float | int | None] | None,
    preload_server_status: dict[str, Any] | None,
    preload_rss_window_mb: dict[str, float | int | None] | None,
    scenario: str = "goldfish",
    players_per_game: int = 1,
    puppet_count: int | None = None,
) -> RunSummary:
    completed = len(results)
    succeeded = sum(1 for result in results if result.success)
    failed = completed - succeeded

    by_action: dict[str, list[float]] = {}
    failure_reasons: Counter[str] = Counter()
    final_phase_counts: Counter[str] = Counter()
    terminal_stage_round_counts: Counter[str] = Counter()

    for result in results:
        final_phase_counts[result.final_phase or "<unknown>"] += 1
        if result.final_stage is not None and result.final_round is not None:
            terminal_stage_round_counts[f"{result.final_stage}-{result.final_round}"] += 1
        if not result.success and result.error:
            failure_reasons[result.error] += 1
        for action, latencies in result.action_latencies_by_type_ms.items():
            by_action.setdefault(action, []).extend(latencies)

    spectator_latencies = [lat for result in results for lat in result.spectator_latencies_ms]
    spectator_messages = sum(result.spectator_messages_received for result in results)
    spectator_stats = stats_dict(spectator_latencies) if (cfg.spectators_per_game > 0 or spectator_latencies) else None

    return RunSummary(
        label=label,
        games=games,
        concurrency=concurrency,
        idle_hot_games=idle_hot_games,
        puppet_count=cfg.puppet_count if puppet_count is None else puppet_count,
        timeout_per_game_sec=timeout_per_game_sec,
        wall_time_sec=wall_time_sec,
        completed=completed,
        succeeded=succeeded,
        failed=failed,
        throughput_games_per_sec=(succeeded / wall_time_sec) if wall_time_sec > 0 else 0.0,
        duration_stats_sec=stats_dict([r.duration_sec for r in results]),
        create_game_stats_ms=stats_dict([r.create_game_ms for r in results if r.create_game_ms is not None]),
        ws_connect_stats_ms=stats_dict([r.ws_connect_ms for r in results if r.ws_connect_ms is not None]),
        start_game_stats_ms=stats_dict([r.start_game_ms for r in results if r.start_game_ms is not None]),
        action_latency_stats_ms=stats_dict([lat for r in results for lat in r.action_latencies_ms]),
        action_latency_by_type_ms={action: stats_dict(latencies) for action, latencies in sorted(by_action.items())},
        failure_reasons=dict(failure_reasons),
        final_phase_counts=dict(final_phase_counts),
        terminal_stage_round_counts=dict(terminal_stage_round_counts),
        server_rss_mb=server_rss_mb,
        server_rss_window_mb=server_rss_window_mb,
        server_rss_per_game_mb=_compute_rss_per_game(server_rss_window_mb, succeeded),
        preload_server_status=preload_server_status,
        preload_rss_window_mb=preload_rss_window_mb,
        scenario=scenario,
        players_per_game=players_per_game,
        spectators_per_game=cfg.spectators_per_game,
        spectator_messages_received=spectator_messages,
        spectator_message_latency_ms=spectator_stats,
    )


def build_report(
    cfg: HarnessConfig,
    *,
    calibration_result: GameResult,
    timeout_per_game_sec: float,
    runtime_reset_results: list[dict[str, Any]],
    sweeps: list[RunSummary],
) -> dict[str, Any]:
    return {
        "config": {
            "base_url": cfg.base_url,
            "sweep_games": cfg.sweep_games,
            "hot_game_counts": cfg.hot_game_counts,
            "multiplayer_tables": cfg.multiplayer_tables,
            "players_per_table": cfg.players_per_table,
            "spectators_per_game": cfg.spectators_per_game,
            "concurrency_override": cfg.concurrency_override,
            "puppet_count": cfg.puppet_count,
            "cube_id": cfg.cube_id,
            "use_upgrades": cfg.use_upgrades,
            "disable_caps": cfg.disable_caps,
            "disable_ws_gzip": cfg.disable_ws_gzip,
            "mock_cube_data": cfg.mock_cube_data,
            "db_copy": cfg.db_copy,
            "seed": cfg.seed,
            "reset_runtime_between_sweeps": cfg.reset_runtime_between_sweeps,
            "fresh_server_per_sweep": cfg.fresh_server_per_sweep,
            "rss_sample_interval_sec": cfg.rss_sample_interval_sec,
            "ws_action_jitter_ms": cfg.ws_action_jitter_ms,
            "max_p95_ms": cfg.max_p95_ms,
            "max_rss_mb": cfg.max_rss_mb,
        },
        "calibration": asdict(calibration_result),
        "timeout_per_game_sec": timeout_per_game_sec,
        "runtime_resets": runtime_reset_results,
        "sweeps": [asdict(item) for item in sweeps],
    }


def _sweep_peak_rss_mb(sweep: dict[str, Any]) -> float | None:
    window = sweep.get("server_rss_window_mb")
    if isinstance(window, dict) and window.get("peak") is not None:
        return float(window["peak"])
    rss_stats = sweep.get("server_rss_mb")
    if isinstance(rss_stats, dict) and rss_stats.get("max") is not None:
        return float(rss_stats["max"])
    return None


def _check_sweep_p95(
    label: str,
    stats: object,
    *,
    metric_name: str,
    max_p95_ms: float,
) -> str | None:
    if not isinstance(stats, dict):
        return None
    p95 = stats.get("p95")
    if p95 is None:
        return None
    p95_val = float(p95)
    if p95_val > max_p95_ms:
        return f"sweep '{label}' breached --max-p95-ms ({metric_name}={p95_val:.2f}ms > {max_p95_ms:.2f}ms)"
    return None


def _check_single_sweep_thresholds(cfg: HarnessConfig, sweep: dict[str, Any]) -> list[str]:
    breaches: list[str] = []
    label = str(sweep.get("label", "<unknown>"))
    if cfg.max_p95_ms is not None:
        for key, metric in (
            ("action_latency_stats_ms", "action p95"),
            ("spectator_message_latency_ms", "spectator p95"),
        ):
            if breach := _check_sweep_p95(label, sweep.get(key), metric_name=metric, max_p95_ms=cfg.max_p95_ms):
                breaches.append(breach)
    if cfg.max_rss_mb is not None:
        peak_rss = _sweep_peak_rss_mb(sweep)
        if peak_rss is not None and peak_rss > cfg.max_rss_mb:
            breaches.append(
                f"sweep '{label}' breached --max-rss-mb (peak={peak_rss:.2f}MB > {cfg.max_rss_mb:.2f}MB)",
            )
    return breaches


def check_regression_thresholds(cfg: HarnessConfig, report: dict[str, Any]) -> list[str]:
    if cfg.max_p95_ms is None and cfg.max_rss_mb is None:
        return []

    breaches: list[str] = []
    for sweep in report.get("sweeps", []):
        if isinstance(sweep, dict):
            breaches.extend(_check_single_sweep_thresholds(cfg, sweep))
    return breaches


def _fmt_float(value: float | None) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, int):
        return str(value)
    return f"{value:.2f}"


def format_stats_line(stats: dict[str, float | int | None]) -> str:
    if not stats or int(stats.get("count", 0) or 0) == 0:
        return "count=0"
    return (
        f"count={_fmt_float(stats.get('count'))} avg={_fmt_float(stats.get('avg'))} "
        f"min={_fmt_float(stats.get('min'))} p50={_fmt_float(stats.get('p50'))} "
        f"p95={_fmt_float(stats.get('p95'))} p99={_fmt_float(stats.get('p99'))} "
        f"max={_fmt_float(stats.get('max'))}"
    )


def _format_rss_window(label: str, window: dict[str, float | int | None] | None) -> str | None:
    if not window or int(window.get("count", 0) or 0) == 0:
        return None
    return (
        f"{label}: "
        f"start={_fmt_float(window.get('start'))} "
        f"end={_fmt_float(window.get('end'))} "
        f"peak={_fmt_float(window.get('peak'))} "
        f"delta_end={_fmt_float(window.get('delta_end'))} "
        f"delta_peak={_fmt_float(window.get('delta_peak'))}"
    )


def _append_summary_metadata(lines: list[str], summary: RunSummary) -> None:
    if summary.spectators_per_game > 0:
        lines.append(
            f"spectators/game={summary.spectators_per_game} spectator_messages={summary.spectator_messages_received}",
        )
    if summary.spectator_message_latency_ms:
        lines.append(f"spectator latency ms: {format_stats_line(summary.spectator_message_latency_ms)}")
    if summary.final_phase_counts:
        pairs = ", ".join(f"{phase}:{count}" for phase, count in sorted(summary.final_phase_counts.items()))
        lines.append(f"terminal phases: {pairs}")
    if summary.terminal_stage_round_counts:
        pairs = ", ".join(
            f"{stage_round}:{count}" for stage_round, count in sorted(summary.terminal_stage_round_counts.items())
        )
        lines.append(f"terminal stage-round: {pairs}")
    if summary.preload_server_status:
        pairs = ", ".join(
            f"{key}={value}" for key, value in sorted(summary.preload_server_status.items()) if value is not None
        )
        lines.append(f"idle hot preload status: {pairs}")


def _append_summary_rss(lines: list[str], summary: RunSummary) -> None:
    if preload_line := _format_rss_window("idle hot preload rss window MB", summary.preload_rss_window_mb):
        lines.append(preload_line)
    if summary.server_rss_mb:
        lines.append(f"managed server rss MB: {format_stats_line(summary.server_rss_mb)}")
    if rss_line := _format_rss_window("managed rss window MB", summary.server_rss_window_mb):
        lines.append(rss_line)
    if summary.server_rss_per_game_mb:
        lines.append(
            "managed rss per successful game MB: "
            f"delta_end={_fmt_float(summary.server_rss_per_game_mb.get('delta_end_per_game'))} "
            f"delta_peak={_fmt_float(summary.server_rss_per_game_mb.get('delta_peak_per_game'))}",
        )


def print_summary(summary: RunSummary) -> None:
    lines = [
        "",
        f"=== {summary.label} ===",
        (
            f"scenario={summary.scenario} games={summary.games} concurrency={summary.concurrency} "
            f"players/game={summary.players_per_game} idle_hot_games={summary.idle_hot_games} "
            f"puppet_count={summary.puppet_count} timeout/game={summary.timeout_per_game_sec:.1f}s "
            f"wall={summary.wall_time_sec:.2f}s throughput={summary.throughput_games_per_sec:.2f} games/s"
        ),
        f"completed={summary.completed} succeeded={summary.succeeded} failed={summary.failed}",
        f"game duration sec: {format_stats_line(summary.duration_stats_sec)}",
        f"create_game ms: {format_stats_line(summary.create_game_stats_ms)}",
        f"ws_connect ms: {format_stats_line(summary.ws_connect_stats_ms)}",
        f"start_game ms: {format_stats_line(summary.start_game_stats_ms)}",
        f"action latency ms: {format_stats_line(summary.action_latency_stats_ms)}",
    ]
    _append_summary_metadata(lines, summary)
    _append_summary_rss(lines, summary)
    if summary.failure_reasons:
        lines.append("failure reasons:")
        lines.extend(
            f"  {count}x {reason}"
            for reason, count in sorted(summary.failure_reasons.items(), key=lambda item: (-item[1], item[0]))
        )
    sys.stdout.write("\n".join(lines) + "\n")

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import math
import random
import statistics
import time
from collections import deque
from contextlib import AsyncExitStack
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import psutil
import websockets
from websockets.exceptions import ConnectionClosed

ALL_BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]
TERMINAL_PHASES = frozenset(["winner", "game_over", "eliminated"])


@dataclass(slots=True)
class RunConfig:
    base_url: str = "http://127.0.0.1:8000"
    games: int = 100
    players_per_game: int = 4
    max_parallel_games: int = 50
    game_timeout_seconds: float = 90.0
    http_timeout_seconds: float = 20.0
    ws_open_timeout_seconds: float = 10.0
    sample_interval_seconds: float = 1.0
    report_dir: Path = Path("tests/perf/reports")
    cube_id: str = "auto"
    use_upgrades: bool = True
    server_pid: int | None = None
    threshold_file: Path = Path("tests/perf/thresholds.json")
    fail_on_threshold: bool = True


@dataclass(slots=True)
class PerfThresholds:
    min_games_started: int = 1
    min_completion_rate_pct: float = 95.0
    max_p95_latency_ms: float = 500.0
    max_error_rate_pct: float = 1.0
    max_disconnect_rate_pct: float = 1.0
    max_peak_rss_mb: float | None = None
    max_memory_growth_mb_per_min: float | None = None


@dataclass(slots=True)
class ServerSample:
    timestamp: float
    rss_mb: float
    cpu_pct: float


@dataclass(slots=True)
class PerfMetrics:
    started_at: str
    start_monotonic: float
    games_started: int = 0
    games_completed: int = 0
    games_failed: int = 0
    game_timeouts: int = 0
    actions_sent: int = 0
    error_messages: int = 0
    error_messages_by_text: dict[str, int] = field(default_factory=dict)
    disconnects: int = 0
    action_latencies_ms: list[float] = field(default_factory=list)
    server_samples: list[ServerSample] = field(default_factory=list)
    unhandled_exceptions: list[str] = field(default_factory=list)


@dataclass(slots=True)
class PerfSummary:
    duration_seconds: float
    games_started: int
    games_completed: int
    games_failed: int
    game_timeouts: int
    completion_rate_pct: float
    actions_sent: int
    error_messages: int
    disconnects: int
    error_rate_pct: float
    disconnect_rate_pct: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    max_latency_ms: float
    peak_rss_mb: float | None
    avg_cpu_pct: float | None
    peak_cpu_pct: float | None
    memory_growth_mb_per_min: float | None


@dataclass(slots=True)
class ThresholdCheck:
    name: str
    passed: bool
    actual: float | int | None
    expected: str


@dataclass(slots=True)
class PlayerRuntime:
    name: str
    is_host: bool
    pending_action_sent_at: deque[float] = field(default_factory=deque)
    set_ready_sent: bool = False
    start_game_sent: bool = False
    basics_by_turn: dict[tuple[int, int], list[str]] = field(default_factory=dict)
    draft_done_sent: set[tuple[int, int]] = field(default_factory=set)
    draft_swaps_sent: dict[tuple[int, int], int] = field(default_factory=dict)
    draft_roll_target: dict[tuple[int, int], bool] = field(default_factory=dict)
    draft_roll_sent: set[tuple[int, int]] = field(default_factory=set)
    build_ready_sent: set[tuple[int, int]] = field(default_factory=set)
    build_upgrade_sent: set[tuple[int, int, str]] = field(default_factory=set)
    build_move_sent: set[tuple[int, int, str, str, str]] = field(default_factory=set)
    build_expected_hand_count: dict[tuple[int, int], int] = field(default_factory=dict)
    battle_moves_sent: dict[tuple[int, int], int] = field(default_factory=dict)
    battle_treasure_sent: set[tuple[int, int]] = field(default_factory=set)
    battle_submit_sent: set[tuple[int, int]] = field(default_factory=set)
    reward_done_sent: set[tuple[int, int]] = field(default_factory=set)
    waiting_for_state_update: bool = False
    waiting_since: float | None = None
    last_state_signature: str | None = None
    last_seen_phase: str | None = None
    last_seen_stage: int | None = None
    last_seen_round: int | None = None
    last_seen_treasures: int | None = None
    last_seen_pack_ids: list[str] = field(default_factory=list)
    last_seen_hand_ids: list[str] = field(default_factory=list)
    last_seen_sideboard_ids: list[str] = field(default_factory=list)
    last_sent_action: str | None = None
    last_sent_payload: dict[str, Any] | None = None
    last_draft_swap_payload: dict[str, Any] | None = None
    inflight_action: str | None = None
    inflight_payload: dict[str, Any] | None = None
    inflight_phase: str | None = None
    inflight_treasures: int | None = None
    inflight_pack_ids: tuple[str, ...] = ()
    inflight_hand_ids: tuple[str, ...] = ()
    inflight_sideboard_ids: tuple[str, ...] = ()


@dataclass(slots=True)
class GameSessionState:
    player_count: int
    terminal_players: set[str] = field(default_factory=set)
    battle_results_by_key: dict[str, str] = field(default_factory=dict)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if pct <= 0:
        return min(values)
    if pct >= 100:
        return max(values)

    sorted_values = sorted(values)
    index = (len(sorted_values) - 1) * (pct / 100.0)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return sorted_values[lower]

    weight = index - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def compute_memory_growth_mb_per_min(samples: list[ServerSample]) -> float:
    if len(samples) < 2:
        return 0.0

    base = samples[0].timestamp
    xs = [sample.timestamp - base for sample in samples]
    ys = [sample.rss_mb for sample in samples]

    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(ys)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return 0.0

    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    slope_mb_per_second = numerator / denominator
    return slope_mb_per_second * 60.0


def load_thresholds(path: Path) -> PerfThresholds:
    if not path.exists():
        return PerfThresholds()

    raw = json.loads(path.read_text())
    if not isinstance(raw, dict):
        return PerfThresholds()

    allowed = {item.name for item in fields(PerfThresholds)}
    filtered = {key: value for key, value in raw.items() if key in allowed}
    return PerfThresholds(**filtered)


def build_summary(metrics: PerfMetrics, duration_seconds: float, players_per_game: int) -> PerfSummary:
    completion_rate_pct = (metrics.games_completed / metrics.games_started * 100.0) if metrics.games_started else 0.0
    error_rate_pct = (metrics.error_messages / metrics.actions_sent * 100.0) if metrics.actions_sent else 0.0

    disconnect_base = metrics.games_started * players_per_game
    disconnect_rate_pct = (metrics.disconnects / disconnect_base * 100.0) if disconnect_base else 0.0

    peak_rss = max((sample.rss_mb for sample in metrics.server_samples), default=None)
    cpu_values = [sample.cpu_pct for sample in metrics.server_samples]
    avg_cpu = statistics.fmean(cpu_values) if cpu_values else None
    peak_cpu = max(cpu_values) if cpu_values else None
    memory_growth = compute_memory_growth_mb_per_min(metrics.server_samples) if metrics.server_samples else None

    return PerfSummary(
        duration_seconds=duration_seconds,
        games_started=metrics.games_started,
        games_completed=metrics.games_completed,
        games_failed=metrics.games_failed,
        game_timeouts=metrics.game_timeouts,
        completion_rate_pct=completion_rate_pct,
        actions_sent=metrics.actions_sent,
        error_messages=metrics.error_messages,
        disconnects=metrics.disconnects,
        error_rate_pct=error_rate_pct,
        disconnect_rate_pct=disconnect_rate_pct,
        p50_latency_ms=percentile(metrics.action_latencies_ms, 50),
        p95_latency_ms=percentile(metrics.action_latencies_ms, 95),
        p99_latency_ms=percentile(metrics.action_latencies_ms, 99),
        max_latency_ms=max(metrics.action_latencies_ms, default=0.0),
        peak_rss_mb=peak_rss,
        avg_cpu_pct=avg_cpu,
        peak_cpu_pct=peak_cpu,
        memory_growth_mb_per_min=memory_growth,
    )


def evaluate_thresholds(summary: PerfSummary, thresholds: PerfThresholds) -> list[ThresholdCheck]:
    checks: list[ThresholdCheck] = []

    checks.append(
        ThresholdCheck(
            name="games_started",
            passed=summary.games_started >= thresholds.min_games_started,
            actual=summary.games_started,
            expected=f">= {thresholds.min_games_started}",
        )
    )
    checks.append(
        ThresholdCheck(
            name="completion_rate_pct",
            passed=summary.completion_rate_pct >= thresholds.min_completion_rate_pct,
            actual=summary.completion_rate_pct,
            expected=f">= {thresholds.min_completion_rate_pct:.2f}",
        )
    )
    checks.append(
        ThresholdCheck(
            name="p95_latency_ms",
            passed=summary.p95_latency_ms <= thresholds.max_p95_latency_ms,
            actual=summary.p95_latency_ms,
            expected=f"<= {thresholds.max_p95_latency_ms:.2f}",
        )
    )
    checks.append(
        ThresholdCheck(
            name="error_rate_pct",
            passed=summary.error_rate_pct <= thresholds.max_error_rate_pct,
            actual=summary.error_rate_pct,
            expected=f"<= {thresholds.max_error_rate_pct:.2f}",
        )
    )
    checks.append(
        ThresholdCheck(
            name="disconnect_rate_pct",
            passed=summary.disconnect_rate_pct <= thresholds.max_disconnect_rate_pct,
            actual=summary.disconnect_rate_pct,
            expected=f"<= {thresholds.max_disconnect_rate_pct:.2f}",
        )
    )

    if thresholds.max_peak_rss_mb is not None:
        if summary.peak_rss_mb is None:
            checks.append(
                ThresholdCheck(
                    name="peak_rss_mb",
                    passed=False,
                    actual=None,
                    expected=f"<= {thresholds.max_peak_rss_mb:.2f}",
                )
            )
        else:
            checks.append(
                ThresholdCheck(
                    name="peak_rss_mb",
                    passed=summary.peak_rss_mb <= thresholds.max_peak_rss_mb,
                    actual=summary.peak_rss_mb,
                    expected=f"<= {thresholds.max_peak_rss_mb:.2f}",
                )
            )

    if thresholds.max_memory_growth_mb_per_min is not None:
        if summary.memory_growth_mb_per_min is None:
            checks.append(
                ThresholdCheck(
                    name="memory_growth_mb_per_min",
                    passed=False,
                    actual=None,
                    expected=f"<= {thresholds.max_memory_growth_mb_per_min:.2f}",
                )
            )
        else:
            checks.append(
                ThresholdCheck(
                    name="memory_growth_mb_per_min",
                    passed=summary.memory_growth_mb_per_min <= thresholds.max_memory_growth_mb_per_min,
                    actual=summary.memory_growth_mb_per_min,
                    expected=f"<= {thresholds.max_memory_growth_mb_per_min:.2f}",
                )
            )

    return checks


def _format_metric(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, int):
        return str(value)
    return f"{value:.2f}"


def _render_markdown_report(
    config: RunConfig,
    summary: PerfSummary,
    thresholds: PerfThresholds,
    checks: list[ThresholdCheck],
    error_messages_by_text: dict[str, int],
) -> str:
    lines = [
        "# Multiplayer Load Report",
        "",
        f"- Generated (UTC): {datetime.now(UTC).isoformat()}",
        f"- Base URL: `{config.base_url}`",
        f"- Games Target: `{config.games}`",
        f"- Max Parallel Games: `{config.max_parallel_games}`",
        f"- Players Per Game: `{config.players_per_game}`",
        f"- Cube ID: `{config.cube_id}`",
        f"- Use Upgrades: `{config.use_upgrades}`",
        "",
        "## Summary",
        "",
        f"- Duration (s): `{summary.duration_seconds:.2f}`",
        f"- Games Started: `{summary.games_started}`",
        f"- Games Completed: `{summary.games_completed}`",
        f"- Games Failed: `{summary.games_failed}`",
        f"- Game Timeouts: `{summary.game_timeouts}`",
        f"- Completion Rate (%): `{summary.completion_rate_pct:.2f}`",
        f"- Actions Sent: `{summary.actions_sent}`",
        f"- Error Messages: `{summary.error_messages}`",
        f"- Error Rate (%): `{summary.error_rate_pct:.2f}`",
        f"- Disconnects: `{summary.disconnects}`",
        f"- Disconnect Rate (%): `{summary.disconnect_rate_pct:.2f}`",
        f"- P50 Latency (ms): `{summary.p50_latency_ms:.2f}`",
        f"- P95 Latency (ms): `{summary.p95_latency_ms:.2f}`",
        f"- P99 Latency (ms): `{summary.p99_latency_ms:.2f}`",
        f"- Max Latency (ms): `{summary.max_latency_ms:.2f}`",
        f"- Peak RSS (MB): `{_format_metric(summary.peak_rss_mb)}`",
        f"- Avg CPU (%): `{_format_metric(summary.avg_cpu_pct)}`",
        f"- Peak CPU (%): `{_format_metric(summary.peak_cpu_pct)}`",
        f"- Memory Growth (MB/min): `{_format_metric(summary.memory_growth_mb_per_min)}`",
        "",
        "## Thresholds",
        "",
        f"- min_games_started: `{thresholds.min_games_started}`",
        f"- min_completion_rate_pct: `{thresholds.min_completion_rate_pct:.2f}`",
        f"- max_p95_latency_ms: `{thresholds.max_p95_latency_ms:.2f}`",
        f"- max_error_rate_pct: `{thresholds.max_error_rate_pct:.2f}`",
        f"- max_disconnect_rate_pct: `{thresholds.max_disconnect_rate_pct:.2f}`",
        f"- max_peak_rss_mb: `{_format_metric(thresholds.max_peak_rss_mb)}`",
        f"- max_memory_growth_mb_per_min: `{_format_metric(thresholds.max_memory_growth_mb_per_min)}`",
        "",
        "## Threshold Check Results",
        "",
    ]

    for check in checks:
        status = "PASS" if check.passed else "FAIL"
        lines.append(f"- [{status}] `{check.name}` actual=`{_format_metric(check.actual)}` expected=`{check.expected}`")

    if error_messages_by_text:
        lines.append("")
        lines.append("## Error Breakdown")
        lines.append("")
        for message, count in sorted(error_messages_by_text.items(), key=lambda item: item[1], reverse=True)[:10]:
            lines.append(f"- `{count}`: `{message}`")

    return "\n".join(lines) + "\n"


def write_reports(
    config: RunConfig,
    metrics: PerfMetrics,
    summary: PerfSummary,
    thresholds: PerfThresholds,
    checks: list[ThresholdCheck],
) -> tuple[Path, Path]:
    config.report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    json_path = config.report_dir / f"load-report-{timestamp}.json"
    markdown_path = config.report_dir / f"load-report-{timestamp}.md"

    payload = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "config": {
            **asdict(config),
            "report_dir": str(config.report_dir),
            "threshold_file": str(config.threshold_file),
        },
        "summary": asdict(summary),
        "thresholds": asdict(thresholds),
        "checks": [asdict(check) for check in checks],
        "error_messages_by_text": metrics.error_messages_by_text,
        "server_samples": [asdict(sample) for sample in metrics.server_samples],
        "unhandled_exceptions": metrics.unhandled_exceptions,
    }
    json_path.write_text(json.dumps(payload, indent=2))
    markdown_path.write_text(
        _render_markdown_report(config, summary, thresholds, checks, metrics.error_messages_by_text)
    )
    return json_path, markdown_path


def _as_ws_base_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.startswith("https://"):
        return "wss://" + normalized.removeprefix("https://")
    if normalized.startswith("http://"):
        return "ws://" + normalized.removeprefix("http://")
    raise ValueError(f"Unsupported base URL: {base_url}")


def _decode_ws_message(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        try:
            raw = gzip.decompress(raw)
        except OSError:
            pass
        text = raw.decode()
    else:
        text = raw
    message = json.loads(text)
    if not isinstance(message, dict):
        raise ValueError("WebSocket payload was not a JSON object")
    return message


def _card_id_list(cards: Any) -> list[str]:
    if not isinstance(cards, list):
        return []
    return [card["id"] for card in cards if isinstance(card, dict) and isinstance(card.get("id"), str)]


def _state_signature(msg_type: str, payload: dict[str, Any], runtime_name: str) -> str | None:
    if msg_type == "lobby_state":
        players = payload.get("players")
        ready = None
        if isinstance(players, list):
            for player in players:
                if isinstance(player, dict) and player.get("name") == runtime_name:
                    ready = bool(player.get("is_ready", False))
                    break
        return json.dumps(
            {
                "type": "lobby",
                "can_start": bool(payload.get("can_start", False)),
                "is_started": bool(payload.get("is_started", False)),
                "ready": ready,
            },
            sort_keys=True,
        )

    if msg_type == "game_state":
        self_player = payload.get("self_player")
        if not isinstance(self_player, dict):
            return None
        current_battle = payload.get("current_battle")
        result_submissions = (
            current_battle.get("result_submissions")
            if isinstance(current_battle, dict) and isinstance(current_battle.get("result_submissions"), dict)
            else {}
        )
        your_battlefield_ids = []
        if isinstance(current_battle, dict):
            your_zones = current_battle.get("your_zones")
            if isinstance(your_zones, dict):
                your_battlefield_ids = _card_id_list(your_zones.get("battlefield"))
        upgrade_targets: list[tuple[str, str | None]] = []
        upgrades = self_player.get("upgrades")
        if isinstance(upgrades, list):
            for upgrade in upgrades:
                if not isinstance(upgrade, dict):
                    continue
                upgrade_id = upgrade.get("id")
                if not isinstance(upgrade_id, str):
                    continue
                target = upgrade.get("upgrade_target")
                target_id = target.get("id") if isinstance(target, dict) and isinstance(target.get("id"), str) else None
                upgrade_targets.append((upgrade_id, target_id))
        return json.dumps(
            {
                "type": "game",
                "phase": self_player.get("phase"),
                "stage": self_player.get("stage"),
                "round": self_player.get("round"),
                "build_ready": bool(self_player.get("build_ready", False)),
                "treasures": self_player.get("treasures"),
                "hand_ids": _card_id_list(self_player.get("hand")),
                "sideboard_ids": _card_id_list(self_player.get("sideboard")),
                "pack_ids": _card_id_list(self_player.get("current_pack")),
                "battlefield_ids": your_battlefield_ids,
                "upgrade_targets": upgrade_targets,
                "self_submitted_result": runtime_name in result_submissions,
            },
            sort_keys=True,
        )

    return None


def _record_action_latency(runtime: PlayerRuntime, metrics: PerfMetrics) -> None:
    if runtime.pending_action_sent_at:
        sent_at = runtime.pending_action_sent_at.popleft()
        latency_ms = (time.monotonic() - sent_at) * 1000.0
        metrics.action_latencies_ms.append(latency_ms)
    runtime.waiting_for_state_update = False
    runtime.waiting_since = None
    runtime.inflight_action = None
    runtime.inflight_payload = None
    runtime.inflight_phase = None
    runtime.inflight_treasures = None
    runtime.inflight_pack_ids = ()
    runtime.inflight_hand_ids = ()
    runtime.inflight_sideboard_ids = ()


async def _send_action(
    ws: Any,
    runtime: PlayerRuntime,
    metrics: PerfMetrics,
    action: str,
    payload: dict[str, Any] | None = None,
) -> bool:
    if runtime.waiting_for_state_update:
        # Keep exactly one in-flight action per player runtime. Sending a second action
        # against stale state can create invalid moves (especially in draft).
        return False

    runtime.pending_action_sent_at.append(time.monotonic())
    metrics.actions_sent += 1
    runtime.waiting_for_state_update = True
    runtime.waiting_since = time.monotonic()
    runtime.last_sent_action = action
    runtime.last_sent_payload = payload.copy() if payload else {}
    if action == "draft_swap":
        runtime.last_draft_swap_payload = payload.copy() if payload else {}
    runtime.inflight_action = action
    runtime.inflight_payload = payload.copy() if payload else {}
    runtime.inflight_phase = runtime.last_seen_phase
    runtime.inflight_treasures = runtime.last_seen_treasures
    runtime.inflight_pack_ids = tuple(runtime.last_seen_pack_ids)
    runtime.inflight_hand_ids = tuple(runtime.last_seen_hand_ids)
    runtime.inflight_sideboard_ids = tuple(runtime.last_seen_sideboard_ids)
    await ws.send(
        json.dumps(
            {
                "action": action,
                "payload": payload or {},
            }
        )
    )
    return True


async def _handle_lobby_state(payload: dict[str, Any], ws: Any, runtime: PlayerRuntime, metrics: PerfMetrics) -> None:
    if not runtime.set_ready_sent and await _send_action(ws, runtime, metrics, "set_ready", {"is_ready": True}):
        runtime.set_ready_sent = True

    if (
        runtime.is_host
        and payload.get("can_start")
        and not runtime.start_game_sent
        and await _send_action(ws, runtime, metrics, "start_game")
    ):
        runtime.start_game_sent = True


def _safe_stage_round(self_player: dict[str, Any]) -> tuple[int, int]:
    stage_raw = self_player.get("stage", 0)
    round_raw = self_player.get("round", 0)
    stage = int(stage_raw) if isinstance(stage_raw, int | float | str) else 0
    round_num = int(round_raw) if isinstance(round_raw, int | float | str) else 0
    return stage, round_num


def _first_card_id(cards: Any) -> str | None:
    if not isinstance(cards, list):
        return None
    for card in cards:
        if isinstance(card, dict):
            card_id = card.get("id")
            if isinstance(card_id, str):
                return card_id
    return None


def _pick_basics(runtime: PlayerRuntime, turn_key: tuple[int, int]) -> list[str]:
    cached = runtime.basics_by_turn.get(turn_key)
    if cached is not None:
        return cached

    rng = random.Random(f"{runtime.name}:{turn_key[0]}:{turn_key[1]}")
    basics = [rng.choice(ALL_BASICS) for _ in range(3)]
    runtime.basics_by_turn[turn_key] = basics
    return basics


def _choose_draft_swap(self_player: dict[str, Any], current_pack: list[Any]) -> tuple[str, str, str] | None:
    pack_card_id = _first_card_id(current_pack)
    if pack_card_id is None:
        return None

    for destination in ("sideboard", "hand"):
        collection = self_player.get(destination)
        if not isinstance(collection, list):
            continue
        for card in collection:
            if not isinstance(card, dict):
                continue
            player_card_id = card.get("id")
            if isinstance(player_card_id, str) and player_card_id != pack_card_id:
                return pack_card_id, player_card_id, destination
    return None


def _choose_unapplied_upgrade(self_player: dict[str, Any]) -> tuple[str, str] | None:
    upgrades = self_player.get("upgrades")
    hand = self_player.get("hand")
    sideboard = self_player.get("sideboard")
    if not isinstance(upgrades, list) or not isinstance(hand, list) or not isinstance(sideboard, list):
        return None

    target_card_id = _first_card_id(hand) or _first_card_id(sideboard)
    if target_card_id is None:
        return None

    for upgrade in upgrades:
        if not isinstance(upgrade, dict):
            continue
        upgrade_id = upgrade.get("id")
        if not isinstance(upgrade_id, str):
            continue
        if upgrade.get("upgrade_target") is None:
            return upgrade_id, target_card_id
    return None


def _battle_result_for_turn(
    session_state: GameSessionState,
    turn_key: tuple[int, int],
    player_name: str,
    opponent_name: str,
) -> str:
    battle_key = f"{turn_key[0]}:{turn_key[1]}:{'|'.join(sorted((player_name, opponent_name)))}"
    cached = session_state.battle_results_by_key.get(battle_key)
    if cached is not None:
        return cached

    roll = random.random()
    if roll < 0.1:
        result = "draw"
    elif roll < 0.55:
        result = player_name
    else:
        result = opponent_name
    session_state.battle_results_by_key[battle_key] = result
    return result


def _is_stage_increasing(round_num: int) -> bool:
    return round_num > 0 and round_num % 3 == 0


async def _handle_draft_phase(
    self_player: dict[str, Any],
    ws: Any,
    runtime: PlayerRuntime,
    metrics: PerfMetrics,
    turn_key: tuple[int, int],
) -> None:
    current_pack = self_player.get("current_pack")
    if not isinstance(current_pack, list):
        return

    swaps_sent = runtime.draft_swaps_sent.get(turn_key, 0)
    treasures_raw = self_player.get("treasures", 0)
    treasures = int(treasures_raw) if isinstance(treasures_raw, int | float | str) else 0
    wants_roll = runtime.draft_roll_target.setdefault(turn_key, treasures > 0 and random.random() < 0.3)

    if swaps_sent < 2:
        swap = _choose_draft_swap(self_player, current_pack)
        if swap is None:
            return
        pack_card_id, player_card_id, destination = swap
        if await _send_action(
            ws,
            runtime,
            metrics,
            "draft_swap",
            {"pack_card_id": pack_card_id, "player_card_id": player_card_id, "destination": destination},
        ):
            runtime.draft_swaps_sent[turn_key] = swaps_sent + 1
        return

    if wants_roll and turn_key not in runtime.draft_roll_sent:
        if treasures <= 0:
            runtime.draft_roll_target[turn_key] = False
            wants_roll = False
        elif await _send_action(ws, runtime, metrics, "draft_roll"):
            runtime.draft_roll_sent.add(turn_key)
        return

    required_swaps = 2
    if swaps_sent < required_swaps:
        swap = _choose_draft_swap(self_player, current_pack)
        if swap is None:
            return
        pack_card_id, player_card_id, destination = swap
        if await _send_action(
            ws,
            runtime,
            metrics,
            "draft_swap",
            {"pack_card_id": pack_card_id, "player_card_id": player_card_id, "destination": destination},
        ):
            runtime.draft_swaps_sent[turn_key] = swaps_sent + 1
        return

    if turn_key not in runtime.draft_done_sent and await _send_action(ws, runtime, metrics, "draft_done"):
        runtime.draft_done_sent.add(turn_key)


async def _handle_build_phase(  # noqa: PLR0912
    self_player: dict[str, Any],
    ws: Any,
    runtime: PlayerRuntime,
    metrics: PerfMetrics,
    turn_key: tuple[int, int],
) -> None:
    hand = self_player.get("hand")
    sideboard = self_player.get("sideboard")
    if not isinstance(hand, list) or not isinstance(sideboard, list):
        return

    hand_size_raw = self_player.get("hand_size", len(hand))
    hand_size = int(hand_size_raw) if isinstance(hand_size_raw, int | float | str) else len(hand)

    stage, round_num = turn_key
    current_hand_count = len(hand)
    expected_hand_count = runtime.build_expected_hand_count.get(turn_key, current_hand_count)
    if current_hand_count < expected_hand_count:
        # Ignore stale snapshots that arrive behind our last acknowledged move.
        return
    runtime.build_expected_hand_count[turn_key] = current_hand_count

    if current_hand_count < hand_size:
        for card in sideboard:
            if not isinstance(card, dict):
                continue
            move_id = card.get("id")
            if not isinstance(move_id, str):
                continue
            move_key = (stage, round_num, move_id, "sideboard", "hand")
            if move_key in runtime.build_move_sent:
                continue
            if await _send_action(
                ws,
                runtime,
                metrics,
                "build_move",
                {"card_id": move_id, "source": "sideboard", "destination": "hand"},
            ):
                runtime.build_move_sent.add(move_key)
                runtime.build_expected_hand_count[turn_key] = current_hand_count + 1
            break
        return

    if current_hand_count > hand_size:
        for card in hand:
            if not isinstance(card, dict):
                continue
            move_id = card.get("id")
            if not isinstance(move_id, str):
                continue
            move_key = (stage, round_num, move_id, "hand", "sideboard")
            if move_key in runtime.build_move_sent:
                continue
            if await _send_action(
                ws,
                runtime,
                metrics,
                "build_move",
                {"card_id": move_id, "source": "hand", "destination": "sideboard"},
            ):
                runtime.build_move_sent.add(move_key)
                runtime.build_expected_hand_count[turn_key] = max(0, current_hand_count - 1)
            break
        return

    upgrade_choice = _choose_unapplied_upgrade(self_player)
    if upgrade_choice is not None:
        upgrade_id, target_card_id = upgrade_choice
        upgrade_key = (stage, round_num, upgrade_id)
        if upgrade_key not in runtime.build_upgrade_sent and await _send_action(
            ws,
            runtime,
            metrics,
            "build_apply_upgrade",
            {"upgrade_id": upgrade_id, "target_card_id": target_card_id},
        ):
            runtime.build_upgrade_sent.add(upgrade_key)
        return

    if not self_player.get("build_ready", False) and turn_key not in runtime.build_ready_sent:
        hand_order = [card["id"] for card in hand if isinstance(card, dict) and isinstance(card.get("id"), str)]
        payload_data: dict[str, Any] = {
            "basics": _pick_basics(runtime, turn_key),
            "play_draw_preference": "play",
        }
        if len(hand_order) == len(hand):
            payload_data["hand_order"] = hand_order

        if await _send_action(ws, runtime, metrics, "build_ready", payload_data):
            runtime.build_ready_sent.add(turn_key)


async def _handle_battle_phase(
    payload: dict[str, Any],
    ws: Any,
    runtime: PlayerRuntime,
    session_state: GameSessionState,
    metrics: PerfMetrics,
    turn_key: tuple[int, int],
) -> None:
    current_battle = payload.get("current_battle")
    if not isinstance(current_battle, dict):
        return

    result_submissions = current_battle.get("result_submissions")
    if not isinstance(result_submissions, dict):
        return

    your_zones = current_battle.get("your_zones")
    hand_cards = your_zones.get("hand") if isinstance(your_zones, dict) else []
    moves_sent = runtime.battle_moves_sent.get(turn_key, 0)
    if moves_sent < 2 and isinstance(hand_cards, list) and hand_cards:
        move_id = _first_card_id(hand_cards)
        if move_id is not None and await _send_action(
            ws,
            runtime,
            metrics,
            "battle_move",
            {
                "card_id": move_id,
                "from_zone": "hand",
                "to_zone": "battlefield",
                "from_owner": "player",
                "to_owner": "player",
            },
        ):
            runtime.battle_moves_sent[turn_key] = moves_sent + 1
        return

    if turn_key not in runtime.battle_treasure_sent and await _send_action(
        ws,
        runtime,
        metrics,
        "battle_update_card_state",
        {"action_type": "create_treasure", "card_id": "", "data": {}},
    ):
        runtime.battle_treasure_sent.add(turn_key)
        return

    if turn_key in runtime.battle_submit_sent:
        return
    if runtime.name in result_submissions:
        return

    opponent_name = current_battle.get("opponent_name")
    if not isinstance(opponent_name, str):
        return
    result = _battle_result_for_turn(session_state, turn_key, runtime.name, opponent_name)
    if await _send_action(ws, runtime, metrics, "battle_submit_result", {"result": result}):
        runtime.battle_submit_sent.add(turn_key)


async def _handle_reward_phase(
    payload: dict[str, Any],
    ws: Any,
    runtime: PlayerRuntime,
    metrics: PerfMetrics,
    turn_key: tuple[int, int],
) -> None:
    if turn_key in runtime.reward_done_sent:
        return

    _, round_num = turn_key
    reward_payload: dict[str, Any] = {}
    if _is_stage_increasing(round_num) and payload.get("use_upgrades", True):
        available = payload.get("available_upgrades")
        if isinstance(available, list) and available:
            upgrade_id = _first_card_id(available)
            if upgrade_id is not None:
                reward_payload["upgrade_id"] = upgrade_id

    if await _send_action(ws, runtime, metrics, "reward_done", reward_payload):
        runtime.reward_done_sent.add(turn_key)


async def _handle_game_state(
    payload: dict[str, Any],
    ws: Any,
    runtime: PlayerRuntime,
    session_state: GameSessionState,
    stop_event: asyncio.Event,
    metrics: PerfMetrics,
) -> None:
    self_player = payload.get("self_player")
    if not isinstance(self_player, dict):
        return

    runtime.last_seen_phase = self_player.get("phase") if isinstance(self_player.get("phase"), str) else None
    stage, round_num = _safe_stage_round(self_player)
    runtime.last_seen_stage = stage
    runtime.last_seen_round = round_num
    runtime.last_seen_pack_ids = _card_id_list(self_player.get("current_pack"))
    runtime.last_seen_hand_ids = _card_id_list(self_player.get("hand"))
    runtime.last_seen_sideboard_ids = _card_id_list(self_player.get("sideboard"))

    phase = self_player.get("phase")
    if not isinstance(phase, str):
        return

    if phase in TERMINAL_PHASES:
        session_state.terminal_players.add(runtime.name)
        if len(session_state.terminal_players) >= session_state.player_count:
            stop_event.set()
        return

    turn_key = (stage, round_num)

    if phase == "draft":
        await _handle_draft_phase(self_player, ws, runtime, metrics, turn_key)
        return

    if phase == "build":
        await _handle_build_phase(self_player, ws, runtime, metrics, turn_key)
        return

    if phase == "battle":
        await _handle_battle_phase(payload, ws, runtime, session_state, metrics, turn_key)
        return

    if phase == "reward":
        await _handle_reward_phase(payload, ws, runtime, metrics, turn_key)


async def _run_player_loop(  # noqa: PLR0912
    ws: Any,
    runtime: PlayerRuntime,
    session_state: GameSessionState,
    stop_event: asyncio.Event,
    metrics: PerfMetrics,
) -> None:
    while not stop_event.is_set():
        try:
            raw = await ws.recv()
        except ConnectionClosed:
            metrics.disconnects += 1
            stop_event.set()
            return
        except Exception as exc:
            if len(metrics.unhandled_exceptions) < 20:
                metrics.unhandled_exceptions.append(f"player loop exception ({runtime.name}): {exc!r}")
            stop_event.set()
            return

        try:
            message = _decode_ws_message(raw)
        except Exception as exc:
            metrics.error_messages += 1
            if len(metrics.unhandled_exceptions) < 20:
                metrics.unhandled_exceptions.append(f"invalid ws payload ({runtime.name}): {exc!r}")
            continue

        msg_type = message.get("type")
        payload = message.get("payload", {})

        if msg_type in ("lobby_state", "game_state") and isinstance(payload, dict):
            signature = _state_signature(msg_type, payload, runtime.name)
            if signature != runtime.last_state_signature:
                if not runtime.waiting_for_state_update or _did_inflight_action_ack(runtime, msg_type, payload):
                    _record_action_latency(runtime, metrics)
                runtime.last_state_signature = signature

        if msg_type == "error":
            metrics.error_messages += 1
            if isinstance(payload, dict):
                message = payload.get("message")
                if not isinstance(message, str):
                    message = "<non-string>"
            else:
                message = "<non-dict>"
            metrics.error_messages_by_text[message] = metrics.error_messages_by_text.get(message, 0) + 1
            if message.startswith("Unknown action: draft_swap") and len(metrics.unhandled_exceptions) < 20:
                detail = {
                    "player": runtime.name,
                    "phase": runtime.last_seen_phase,
                    "stage": runtime.last_seen_stage,
                    "round": runtime.last_seen_round,
                    "pack_ids": runtime.last_seen_pack_ids[:6],
                    "hand_ids": runtime.last_seen_hand_ids[:6],
                    "sideboard_ids": runtime.last_seen_sideboard_ids[:6],
                    "inflight_action": runtime.inflight_action,
                    "inflight_payload": runtime.inflight_payload,
                    "last_sent_action": runtime.last_sent_action,
                    "last_sent_payload": runtime.last_sent_payload,
                    "last_draft_swap_payload": runtime.last_draft_swap_payload,
                }
                metrics.unhandled_exceptions.append(f"draft_swap_error: {json.dumps(detail, sort_keys=True)}")
            if "Hand must have exactly" in message or message.startswith("Unknown action: build_move"):
                runtime.build_ready_sent.clear()
                runtime.build_expected_hand_count.clear()
                runtime.build_move_sent.clear()
            _record_action_latency(runtime, metrics)
            continue

        if not isinstance(payload, dict):
            continue

        if msg_type == "lobby_state":
            await _handle_lobby_state(payload, ws, runtime, metrics)
        elif msg_type == "game_state":
            await _handle_game_state(payload, ws, runtime, session_state, stop_event, metrics)


def _did_inflight_action_ack(runtime: PlayerRuntime, msg_type: str, payload: dict[str, Any]) -> bool:  # noqa: PLR0912
    inflight_action = runtime.inflight_action
    if inflight_action is None:
        return True

    if msg_type == "lobby_state":
        return True

    if msg_type != "game_state":
        return True

    self_player = payload.get("self_player")
    if not isinstance(self_player, dict):
        return False

    phase = self_player.get("phase")
    if not isinstance(phase, str):
        return False

    pack_ids = tuple(_card_id_list(self_player.get("current_pack")))
    hand_ids = tuple(_card_id_list(self_player.get("hand")))
    sideboard_ids = tuple(_card_id_list(self_player.get("sideboard")))
    treasures_raw = self_player.get("treasures")
    treasures = int(treasures_raw) if isinstance(treasures_raw, int | float | str) else None

    if inflight_action == "draft_swap":
        payload_swap = runtime.inflight_payload if isinstance(runtime.inflight_payload, dict) else {}
        pack_card_id = payload_swap.get("pack_card_id")
        player_card_id = payload_swap.get("player_card_id")
        destination = payload_swap.get("destination")
        if not isinstance(pack_card_id, str) or not isinstance(player_card_id, str):
            return False
        if destination == "hand":
            dest_ids = hand_ids
        elif destination == "sideboard":
            dest_ids = sideboard_ids
        else:
            return False
        return pack_card_id in dest_ids and player_card_id in pack_ids

    if inflight_action == "draft_roll":
        if pack_ids != runtime.inflight_pack_ids:
            return True
        return (
            runtime.inflight_treasures is not None and treasures is not None and treasures < runtime.inflight_treasures
        )

    if inflight_action == "draft_done":
        return phase != "draft"

    return True


async def _run_single_game(
    game_index: int,
    config: RunConfig,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    metrics: PerfMetrics,
) -> None:
    async with semaphore:
        player_names = [f"g{game_index}-p{idx + 1}" for idx in range(config.players_per_game)]
        host_name = player_names[0]

        try:
            create_res = await client.post(
                "/api/games",
                json={
                    "player_name": host_name,
                    "cube_id": config.cube_id,
                    "use_upgrades": config.use_upgrades,
                    "target_player_count": config.players_per_game,
                },
            )
            create_res.raise_for_status()
            created = create_res.json()

            join_responses: list[dict[str, Any]] = []
            for player_name in player_names[1:]:
                join_res = await client.post(
                    "/api/games/join",
                    json={
                        "join_code": created["join_code"],
                        "player_name": player_name,
                    },
                )
                join_res.raise_for_status()
                join_responses.append(join_res.json())
        except Exception as exc:
            metrics.games_failed += 1
            if len(metrics.unhandled_exceptions) < 20:
                metrics.unhandled_exceptions.append(f"game setup {game_index}: {exc!r}")
            return

        metrics.games_started += 1

        game_id = created["game_id"]
        ws_base = _as_ws_base_url(config.base_url)
        session_ids = [created["session_id"], *[joined["session_id"] for joined in join_responses]]
        ws_urls = [f"{ws_base}/ws/{game_id}?session_id={session_id}" for session_id in session_ids]

        completed = False
        try:
            async with AsyncExitStack() as stack:
                sockets = []
                for ws_url in ws_urls:
                    ws = await stack.enter_async_context(
                        websockets.connect(
                            ws_url,
                            open_timeout=config.ws_open_timeout_seconds,
                            close_timeout=2,
                            ping_interval=20,
                            ping_timeout=20,
                        )
                    )
                    sockets.append(ws)

                stop_event = asyncio.Event()
                session_state = GameSessionState(player_count=config.players_per_game)
                runtimes = [PlayerRuntime(name=name, is_host=(idx == 0)) for idx, name in enumerate(player_names)]
                tasks = [
                    asyncio.create_task(_run_player_loop(ws, runtime, session_state, stop_event, metrics))
                    for ws, runtime in zip(sockets, runtimes, strict=True)
                ]
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=config.game_timeout_seconds)
                    completed = len(session_state.terminal_players) == config.players_per_game
                except TimeoutError:
                    metrics.game_timeouts += 1
                finally:
                    stop_event.set()
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as exc:
            if len(metrics.unhandled_exceptions) < 20:
                metrics.unhandled_exceptions.append(f"ws game {game_index}: {exc!r}")

        if completed:
            metrics.games_completed += 1
        else:
            metrics.games_failed += 1


async def _sample_server_metrics(
    server_pid: int,
    sample_interval_seconds: float,
    stop_event: asyncio.Event,
    metrics: PerfMetrics,
) -> None:
    try:
        process = psutil.Process(server_pid)
    except (psutil.NoSuchProcess, psutil.AccessDenied) as exc:
        metrics.unhandled_exceptions.append(f"unable to inspect pid {server_pid}: {exc!r}")
        return

    process.cpu_percent(interval=None)

    while not stop_event.is_set():
        try:
            mem = process.memory_info().rss / (1024 * 1024)
            cpu = process.cpu_percent(interval=None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return

        metrics.server_samples.append(
            ServerSample(
                timestamp=time.time(),
                rss_mb=mem,
                cpu_pct=cpu,
            )
        )

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=sample_interval_seconds)
        except TimeoutError:
            continue


async def run_load_test(config: RunConfig) -> tuple[PerfSummary, list[ThresholdCheck], tuple[Path, Path]]:
    if config.players_per_game < 2:
        raise ValueError("players_per_game must be >= 2")
    if config.players_per_game % 2 != 0:
        raise ValueError("players_per_game must be even")

    thresholds = load_thresholds(config.threshold_file)
    metrics = PerfMetrics(started_at=datetime.now(UTC).isoformat(), start_monotonic=time.monotonic())

    sampling_stop_event = asyncio.Event()
    sampler_task: asyncio.Task | None = None
    if config.server_pid is not None:
        sampler_task = asyncio.create_task(
            _sample_server_metrics(
                config.server_pid,
                config.sample_interval_seconds,
                sampling_stop_event,
                metrics,
            )
        )

    timeout = httpx.Timeout(config.http_timeout_seconds)
    async with httpx.AsyncClient(base_url=config.base_url, timeout=timeout) as client:
        semaphore = asyncio.Semaphore(config.max_parallel_games)
        tasks = [
            asyncio.create_task(_run_single_game(idx, config, client, semaphore, metrics))
            for idx in range(config.games)
        ]
        await asyncio.gather(*tasks)

    sampling_stop_event.set()
    if sampler_task is not None:
        await sampler_task

    duration_seconds = time.monotonic() - metrics.start_monotonic
    summary = build_summary(metrics, duration_seconds, config.players_per_game)
    checks = evaluate_thresholds(summary, thresholds)
    report_paths = write_reports(config, metrics, summary, thresholds, checks)
    return summary, checks, report_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run multiplayer load tests against the FastAPI + WS backend.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="HTTP base URL for the backend.")
    parser.add_argument("--games", type=int, default=100, help="Total games to simulate.")
    parser.add_argument("--players-per-game", type=int, default=4, help="Players per game (must be even).")
    parser.add_argument("--max-parallel-games", type=int, default=50, help="Max in-flight games at once.")
    parser.add_argument(
        "--game-timeout-seconds",
        type=float,
        default=90.0,
        help="Timeout per game before marking as failed.",
    )
    parser.add_argument(
        "--http-timeout-seconds",
        type=float,
        default=20.0,
        help="Timeout for create/join API calls.",
    )
    parser.add_argument(
        "--ws-open-timeout-seconds",
        type=float,
        default=10.0,
        help="Timeout for opening websocket connections.",
    )
    parser.add_argument(
        "--sample-interval-seconds",
        type=float,
        default=1.0,
        help="Sampling interval for server RSS/CPU metrics.",
    )
    parser.add_argument(
        "--server-pid",
        type=int,
        default=0,
        help="Server process PID for memory/cpu sampling (0 disables sampling).",
    )
    parser.add_argument("--cube-id", default="auto", help="Cube id passed when creating games.")
    parser.add_argument(
        "--use-upgrades",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable or disable upgrades in created games.",
    )
    parser.add_argument(
        "--report-dir",
        default="tests/perf/reports",
        help="Directory where JSON/Markdown reports are written.",
    )
    parser.add_argument(
        "--threshold-file",
        default="tests/perf/thresholds.json",
        help="Threshold config JSON file.",
    )
    parser.add_argument(
        "--fail-on-threshold",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Return exit code 1 if any threshold fails.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = RunConfig(
        base_url=args.base_url,
        games=args.games,
        players_per_game=args.players_per_game,
        max_parallel_games=args.max_parallel_games,
        game_timeout_seconds=args.game_timeout_seconds,
        http_timeout_seconds=args.http_timeout_seconds,
        ws_open_timeout_seconds=args.ws_open_timeout_seconds,
        sample_interval_seconds=args.sample_interval_seconds,
        report_dir=Path(args.report_dir),
        cube_id=args.cube_id,
        use_upgrades=args.use_upgrades,
        server_pid=args.server_pid or None,
        threshold_file=Path(args.threshold_file),
        fail_on_threshold=args.fail_on_threshold,
    )

    summary, checks, report_paths = asyncio.run(run_load_test(config))

    print(f"Load test finished in {summary.duration_seconds:.2f}s")
    print(f"Games started/completed/failed: {summary.games_started}/{summary.games_completed}/{summary.games_failed}")
    print(f"P95 latency: {summary.p95_latency_ms:.2f} ms")
    print(f"Error rate: {summary.error_rate_pct:.2f}%")
    print(f"Disconnect rate: {summary.disconnect_rate_pct:.2f}%")
    print(f"Peak RSS: {_format_metric(summary.peak_rss_mb)} MB")
    print(f"Memory growth: {_format_metric(summary.memory_growth_mb_per_min)} MB/min")
    print(f"JSON report: {report_paths[0]}")
    print(f"Markdown report: {report_paths[1]}")

    failed_checks = [check for check in checks if not check.passed]
    if failed_checks:
        print("Failed thresholds:")
        for check in failed_checks:
            print(f"- {check.name}: actual={_format_metric(check.actual)} expected={check.expected}")
        if config.fail_on_threshold:
            raise SystemExit(1)


if __name__ == "__main__":
    main()

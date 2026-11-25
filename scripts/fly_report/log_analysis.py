"""Log parsing and latency/egress aggregation for Fly.io activity reports."""

from __future__ import annotations

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from scripts.fly_report.fly_client import (
    ReportError,
    build_fly_logs_command,
    extract_json_objects,
    run_command,
    run_remote_python,
)

if TYPE_CHECKING:
    import argparse

logger = logging.getLogger(__name__)

SERVER_STATUS_RE = re.compile(
    r"Server status: games=(?P<games>\d+) pending=(?P<pending>\d+) "
    r"connections=(?P<connections>\d+) spectators=(?P<spectators>\d+) memory=(?P<memory>\d+) MB",
)
ROUND_EGRESS_RE = re.compile(
    r"Round egress: .* draft=(?P<draft_kb>\d+)KB/(?P<draft_msgs>\d+)m "
    r"build=(?P<build_kb>\d+)KB/(?P<build_msgs>\d+)m "
    r"battle=(?P<battle_kb>\d+)KB/(?P<battle_msgs>\d+)m "
    r"spectate=(?P<spectate_kb>\d+)KB/(?P<spectate_msgs>\d+)m",
)
HTTP_LINE_RE = re.compile(r"\"[A-Z]+ (?P<path>[^ ]+) HTTP/\d\.\d\" (?P<status>\d{3})")
HTTP_LATENCY_RE = re.compile(
    r"HTTP latency: request_id=(?P<request_id>\S+) method=(?P<method>\S+) "
    r"path=(?P<path>\S+) status=(?P<status>\d+) duration_ms=(?P<duration_ms>[0-9.]+)",
)
WS_ACTION_LATENCY_RE = re.compile(
    r"WS action latency: action=(?P<action>\S+) game_id=(?P<game_id>\S+) "
    r"player_id=(?P<player_id>\S+) result=(?P<result>\S+) duration_ms=(?P<duration_ms>[0-9.]+)",
)
WS_BROADCAST_LATENCY_RE = re.compile(
    r"WS broadcast latency: kind=(?P<kind>\S+) game_id=(?P<game_id>\S+) "
    r"recipients=(?P<recipients>\d+) spectators=(?P<spectators>\d+) duration_ms=(?P<duration_ms>[0-9.]+)",
)

_NAMED_EVENT_MARKERS = (
    ("Game started:", "game_started"),
    ("Game won:", "game_won"),
    ("Game over with no winner", "game_over_no_winner"),
    ("Scheduling abandoned game cleanup", "cleanup_scheduled"),
    ("Cancelled abandoned game cleanup", "cleanup_cancelled"),
    ("Executing cleanup for game_id", "cleanup_executed"),
    ("connection closed", "ws_connection_closed"),
    ("connection open", "ws_connection_open"),
)


@dataclass
class LogAccumulator:
    level_counts: Counter[str] = field(default_factory=Counter)
    timestamps: list[str] = field(default_factory=list)
    server_status_samples: list[dict[str, int]] = field(default_factory=list)
    event_counts: Counter[str] = field(default_factory=Counter)
    http_path_counts: Counter[str] = field(default_factory=Counter)
    http_status_counts: Counter[str] = field(default_factory=Counter)
    latency_http: list[float] = field(default_factory=list)
    latency_ws_action: list[float] = field(default_factory=list)
    latency_ws_broadcast: list[float] = field(default_factory=list)
    latency_http_buckets: Counter[str] = field(default_factory=Counter)
    latency_ws_action_buckets: Counter[str] = field(default_factory=Counter)
    latency_ws_broadcast_buckets: Counter[str] = field(default_factory=Counter)
    egress_totals: dict[str, int] = field(
        default_factory=lambda: {
            "rounds": 0,
            "draft_kb": 0,
            "draft_msgs": 0,
            "build_kb": 0,
            "build_msgs": 0,
            "battle_kb": 0,
            "battle_msgs": 0,
            "spectate_kb": 0,
            "spectate_msgs": 0,
        },
    )


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil((pct / 100) * len(ordered)) - 1))
    return round(ordered[idx], 2)


def _latency_stats(values: list[float], buckets: Counter[str] | None = None) -> dict[str, object]:
    if not values:
        return {
            "count": 0,
            "avg_ms": None,
            "p50_ms": None,
            "p95_ms": None,
            "p99_ms": None,
            "max_ms": None,
            "top_buckets": {},
        }
    return {
        "count": len(values),
        "avg_ms": round(sum(values) / len(values), 2),
        "p50_ms": _percentile(values, 50),
        "p95_ms": _percentile(values, 95),
        "p99_ms": _percentile(values, 99),
        "max_ms": round(max(values), 2),
        "top_buckets": dict((buckets or Counter()).most_common(8)),
    }


def _record_named_events(message: str, event_counts: Counter[str]) -> None:
    for needle, key in _NAMED_EVENT_MARKERS:
        if needle in message:
            event_counts[key] += 1
    if "Traceback" in message or "Exception" in message or " - ERROR - " in message:
        event_counts["error_keyword_lines"] += 1


def _record_server_status(message: str, acc: LogAccumulator) -> None:
    if not (match := SERVER_STATUS_RE.search(message)):
        return
    acc.server_status_samples.append({key: int(value) for key, value in match.groupdict().items()})
    acc.event_counts["server_status"] += 1


def _record_http_request(message: str, acc: LogAccumulator) -> None:
    if not (http_match := HTTP_LINE_RE.search(message)):
        return
    acc.event_counts["http_requests"] += 1
    path = http_match.group("path")
    status = http_match.group("status")
    acc.http_path_counts[f"{path} {status}"] += 1
    acc.http_status_counts[status] += 1


def _record_egress(message: str, acc: LogAccumulator) -> None:
    if not (egress_match := ROUND_EGRESS_RE.search(message)):
        return
    acc.event_counts["round_egress"] += 1
    acc.egress_totals["rounds"] += 1
    for key, value in egress_match.groupdict().items():
        acc.egress_totals[key] += int(value)


def _record_latency(message: str, acc: LogAccumulator) -> None:
    if http_latency_match := HTTP_LATENCY_RE.search(message):
        acc.event_counts["http_latency_lines"] += 1
        duration_ms = float(http_latency_match.group("duration_ms"))
        method = http_latency_match.group("method")
        path = http_latency_match.group("path")
        status = http_latency_match.group("status")
        acc.latency_http.append(duration_ms)
        acc.latency_http_buckets[f"{method} {path} {status}"] += 1

    if ws_action_match := WS_ACTION_LATENCY_RE.search(message):
        acc.event_counts["ws_action_latency_lines"] += 1
        duration_ms = float(ws_action_match.group("duration_ms"))
        action = ws_action_match.group("action")
        acc.latency_ws_action.append(duration_ms)
        acc.latency_ws_action_buckets[action] += 1

    if ws_broadcast_match := WS_BROADCAST_LATENCY_RE.search(message):
        acc.event_counts["ws_broadcast_latency_lines"] += 1
        duration_ms = float(ws_broadcast_match.group("duration_ms"))
        kind = ws_broadcast_match.group("kind")
        acc.latency_ws_broadcast.append(duration_ms)
        acc.latency_ws_broadcast_buckets[kind] += 1


def _record_log_event(event: dict[str, object], acc: LogAccumulator) -> None:
    level = str(event.get("level", "unknown")).lower()
    acc.level_counts[level] += 1

    timestamp = event.get("timestamp")
    if isinstance(timestamp, str):
        acc.timestamps.append(timestamp)

    message = str(event.get("message", ""))
    _record_server_status(message, acc)
    _record_named_events(message, acc.event_counts)
    _record_http_request(message, acc)
    _record_egress(message, acc)
    _record_latency(message, acc)


def _build_server_status_summary(samples: list[dict[str, int]]) -> dict[str, object]:
    if not samples:
        return {}
    memories = [sample["memory"] for sample in samples]
    return {
        "samples": len(samples),
        "memory_mb_min": min(memories),
        "memory_mb_max": max(memories),
        "memory_mb_avg": round(sum(memories) / len(memories), 2),
        "games_counts": dict(Counter(sample["games"] for sample in samples)),
        "pending_counts": dict(Counter(sample["pending"] for sample in samples)),
        "connections_counts": dict(Counter(sample["connections"] for sample in samples)),
        "spectators_counts": dict(Counter(sample["spectators"] for sample in samples)),
    }


def summarize_logs(
    log_events: list[dict[str, object]],
    *,
    source: str,
    source_note: str,
) -> dict[str, object]:
    if not log_events:
        return {"source": source, "log_events": 0, "note": f"No log events returned by {source} logs."}

    acc = LogAccumulator()
    for event in log_events:
        _record_log_event(event, acc)

    fly_log_cap = 100
    note = source_note
    if source == "fly" and len(log_events) == fly_log_cap:
        note += " This fetch returned exactly 100 events, which indicates a practical per-call cap."

    return {
        "source": source,
        "log_events": len(log_events),
        "time_range": {
            "first": min(acc.timestamps) if acc.timestamps else None,
            "last": max(acc.timestamps) if acc.timestamps else None,
        },
        "level_counts": dict(acc.level_counts),
        "event_counts": dict(acc.event_counts),
        "server_status_summary": _build_server_status_summary(acc.server_status_samples),
        "http_top_paths": dict(acc.http_path_counts.most_common(8)),
        "http_status_counts": dict(acc.http_status_counts),
        "egress_totals": acc.egress_totals if acc.egress_totals["rounds"] else None,
        "latency": {
            "http": _latency_stats(acc.latency_http, acc.latency_http_buckets),
            "ws_action": _latency_stats(acc.latency_ws_action, acc.latency_ws_action_buckets),
            "ws_broadcast": _latency_stats(acc.latency_ws_broadcast, acc.latency_ws_broadcast_buckets),
        },
        "buffer_note": note,
    }


def fetch_fly_logs_summary(args: argparse.Namespace) -> dict[str, object]:
    result = run_command(build_fly_logs_command(args), timeout_sec=args.timeout_sec, verbose=args.verbose)
    events = extract_json_objects(result.stdout)
    if args.verbose and result.stderr.strip():
        logger.info("[fly logs stderr] %s", result.stderr.strip())
    return summarize_logs(
        events,
        source="fly",
        source_note=(
            "fly logs --no-tail returns the current Fly log buffer only; historical logs outside that buffer "
            "are not returned."
        ),
    )


def build_remote_file_log_script(hours: int, *, log_file_path: str, rotate_count: int) -> str:
    return f"""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

hours = {hours}
base_path = Path({log_file_path!r})
rotate_count = {rotate_count}
cutoff = datetime.now(UTC) - timedelta(hours=hours)

files_considered = [str(base_path)] + [str(Path(f"{{base_path}}.{{idx}}")) for idx in range(1, rotate_count + 1)]
files_used = []
lines_scanned = 0
events = []

def parse_timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed

for path_str in files_considered:
    path = Path(path_str)
    if not path.exists() or not path.is_file():
        continue
    files_used.append(path_str)
    try:
        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                lines_scanned += 1
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except Exception:
                    continue
                timestamp = payload.get("timestamp")
                parsed_ts = parse_timestamp(timestamp)
                if parsed_ts is None or parsed_ts < cutoff:
                    continue
                events.append(
                    {{
                        "timestamp": timestamp,
                        "level": payload.get("level", "info"),
                        "message": payload.get("message", ""),
                    }}
                )
    except Exception:
        continue

result = {{
    "files_considered": files_considered,
    "files_used": files_used,
    "lines_scanned": lines_scanned,
    "events": events,
}}

print("JSON_START")
print(json.dumps(result, sort_keys=True))
print("JSON_END")
"""


def fetch_file_logs_summary(args: argparse.Namespace) -> dict[str, object]:
    script = build_remote_file_log_script(
        args.hours,
        log_file_path=args.log_file_path,
        rotate_count=args.log_rotate_count,
    )
    payload = run_remote_python(args, script)
    events = payload.get("events", [])
    if not isinstance(events, list):
        msg = "Unexpected event list in file log payload."
        raise ReportError(msg)
    summary = summarize_logs(
        [event for event in events if isinstance(event, dict)],
        source="file",
        source_note="Read from persistent machine log files for the configured window.",
    )
    summary["files_considered"] = payload.get("files_considered", [])
    summary["files_used"] = payload.get("files_used", [])
    summary["lines_scanned"] = payload.get("lines_scanned", 0)
    return summary

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import math
import re
import shutil
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

DEFAULT_APP = "magic-the-battling"
DEFAULT_HOURS = 24
DEFAULT_LOG_FILE_PATH = "/data/logs/server.jsonl"
DEFAULT_LOG_ROTATE_COUNT = 5

SERVER_STATUS_RE = re.compile(
    r"Server status: games=(?P<games>\d+) pending=(?P<pending>\d+) "
    r"connections=(?P<connections>\d+) spectators=(?P<spectators>\d+) memory=(?P<memory>\d+) MB"
)
ROUND_EGRESS_RE = re.compile(
    r"Round egress: .* draft=(?P<draft_kb>\d+)KB/(?P<draft_msgs>\d+)m "
    r"build=(?P<build_kb>\d+)KB/(?P<build_msgs>\d+)m "
    r"battle=(?P<battle_kb>\d+)KB/(?P<battle_msgs>\d+)m "
    r"spectate=(?P<spectate_kb>\d+)KB/(?P<spectate_msgs>\d+)m"
)
HTTP_LINE_RE = re.compile(r"\"[A-Z]+ (?P<path>[^ ]+) HTTP/\d\.\d\" (?P<status>\d{3})")
HTTP_LATENCY_RE = re.compile(
    r"HTTP latency: request_id=(?P<request_id>\S+) method=(?P<method>\S+) "
    r"path=(?P<path>\S+) status=(?P<status>\d+) duration_ms=(?P<duration_ms>[0-9.]+)"
)
WS_ACTION_LATENCY_RE = re.compile(
    r"WS action latency: action=(?P<action>\S+) game_id=(?P<game_id>\S+) "
    r"player_id=(?P<player_id>\S+) result=(?P<result>\S+) duration_ms=(?P<duration_ms>[0-9.]+)"
)
WS_BROADCAST_LATENCY_RE = re.compile(
    r"WS broadcast latency: kind=(?P<kind>\S+) game_id=(?P<game_id>\S+) "
    r"recipients=(?P<recipients>\d+) spectators=(?P<spectators>\d+) duration_ms=(?P<duration_ms>[0-9.]+)"
)


@dataclass
class CommandResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


class ReportError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a detailed Fly app activity report (logs + machine + DB summary).",
    )
    parser.add_argument("--app", default=DEFAULT_APP, help=f"Fly app name (default: {DEFAULT_APP})")
    parser.add_argument(
        "--hours",
        type=int,
        default=DEFAULT_HOURS,
        help=f"Activity window size for DB analysis (default: {DEFAULT_HOURS})",
    )
    parser.add_argument("--region", help="Optional Fly region filter for logs/ssh")
    parser.add_argument("--machine", help="Optional Fly machine id filter for logs/ssh")
    parser.add_argument("--db-path", default="/data/mtb.db", help="Path to SQLite DB inside machine")
    parser.add_argument(
        "--log-source",
        choices=("fly", "file", "both"),
        default="both",
        help="Log source to analyze (default: both)",
    )
    parser.add_argument(
        "--log-file-path",
        default=DEFAULT_LOG_FILE_PATH,
        help=f"Persistent JSON log file path inside machine (default: {DEFAULT_LOG_FILE_PATH})",
    )
    parser.add_argument(
        "--log-rotate-count",
        type=int,
        default=DEFAULT_LOG_ROTATE_COUNT,
        help=f"Number of rotated log files to include for file log analysis (default: {DEFAULT_LOG_ROTATE_COUNT})",
    )
    parser.add_argument("--skip-logs", action="store_true", help="Skip Fly logs analysis")
    parser.add_argument("--skip-db", action="store_true", help="Skip DB activity analysis over SSH")
    parser.add_argument("--skip-machine", action="store_true", help="Skip machine runtime memory read over SSH")
    parser.add_argument("--json", action="store_true", help="Print full report as JSON")
    parser.add_argument("--verbose", action="store_true", help="Print command-level debug info to stderr")
    parser.add_argument("--timeout-sec", type=int, default=90, help="Command timeout in seconds (default: 90)")
    return parser.parse_args()


def run_command(args: list[str], timeout_sec: int, verbose: bool) -> CommandResult:
    if verbose:
        print(f"[cmd] {' '.join(args)}", file=sys.stderr)
    try:
        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired as exc:
        raise ReportError(f"Command timed out after {timeout_sec}s: {' '.join(args)}") from exc

    result = CommandResult(
        args=args,
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
    if result.returncode != 0:
        msg = result.stderr.strip() or result.stdout.strip() or "(no output)"
        raise ReportError(f"Command failed ({result.returncode}): {' '.join(args)}\n{msg}")
    return result


def extract_first_json_value(text: str) -> Any:
    decoder = json.JSONDecoder()
    for idx, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            value, _ = decoder.raw_decode(text[idx:])
            return value
        except json.JSONDecodeError:
            continue
    raise ReportError("Unable to parse JSON payload from command output.")


def extract_json_objects(text: str) -> list[dict[str, Any]]:
    decoder = json.JSONDecoder()
    objects: list[dict[str, Any]] = []
    idx = 0
    while idx < len(text):
        start = text.find("{", idx)
        if start == -1:
            break
        try:
            value, end = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            idx = start + 1
            continue
        idx = end
        if isinstance(value, dict):
            objects.append(value)
    return objects


def build_fly_logs_command(args: argparse.Namespace) -> list[str]:
    cmd = ["fly", "logs", "-a", args.app, "--json", "--no-tail"]
    if args.region:
        cmd.extend(["--region", args.region])
    if args.machine:
        cmd.extend(["--machine", args.machine])
    return cmd


def build_fly_ssh_command(args: argparse.Namespace, remote_command: str) -> list[str]:
    cmd = ["fly", "ssh", "console", "-a", args.app, "-C", remote_command]
    if args.region:
        cmd.extend(["--region", args.region])
    if args.machine:
        cmd.extend(["--machine", args.machine])
    return cmd


def fetch_status(args: argparse.Namespace) -> dict[str, Any]:
    result = run_command(["fly", "status", "-a", args.app, "--json"], args.timeout_sec, args.verbose)
    return extract_first_json_value(result.stdout)


def fetch_machine_list(args: argparse.Namespace) -> list[dict[str, Any]]:
    result = run_command(["fly", "machine", "list", "-a", args.app, "--json"], args.timeout_sec, args.verbose)
    value = extract_first_json_value(result.stdout)
    if not isinstance(value, list):
        raise ReportError("Unexpected machine list JSON payload.")
    return value


def fetch_checks(args: argparse.Namespace) -> dict[str, list[dict[str, Any]]]:
    result = run_command(["fly", "checks", "list", "-a", args.app, "--json"], args.timeout_sec, args.verbose)
    value = extract_first_json_value(result.stdout)
    if not isinstance(value, dict):
        raise ReportError("Unexpected checks JSON payload.")
    return {str(k): v if isinstance(v, list) else [] for k, v in value.items()}


def summarize_checks(checks: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    total = 0
    status_counts: Counter[str] = Counter()
    for machine_checks in checks.values():
        for check in machine_checks:
            total += 1
            status = str(check.get("status", "unknown")).lower()
            status_counts[status] += 1
    return {"total": total, "status_counts": dict(status_counts)}


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil((pct / 100) * len(ordered)) - 1))
    return round(ordered[idx], 2)


def _latency_stats(values: list[float], buckets: Counter[str] | None = None) -> dict[str, Any]:
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


def _new_log_accumulator() -> dict[str, Any]:
    return {
        "level_counts": Counter(),
        "timestamps": [],
        "server_status_samples": [],
        "event_counts": Counter(),
        "http_path_counts": Counter(),
        "http_status_counts": Counter(),
        "latency_http": [],
        "latency_ws_action": [],
        "latency_ws_broadcast": [],
        "latency_http_buckets": Counter(),
        "latency_ws_action_buckets": Counter(),
        "latency_ws_broadcast_buckets": Counter(),
        "egress_totals": {
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
    }


def _record_named_events(message: str, event_counts: Counter[str]) -> None:
    for needle, key in (
        ("Game started:", "game_started"),
        ("Game won:", "game_won"),
        ("Game over with no winner", "game_over_no_winner"),
        ("Scheduling abandoned game cleanup", "cleanup_scheduled"),
        ("Cancelled abandoned game cleanup", "cleanup_cancelled"),
        ("Executing cleanup for game_id", "cleanup_executed"),
        ("connection closed", "ws_connection_closed"),
        ("connection open", "ws_connection_open"),
    ):
        if needle in message:
            event_counts[key] += 1
    if "Traceback" in message or "Exception" in message or " - ERROR - " in message:
        event_counts["error_keyword_lines"] += 1


def _record_server_status(message: str, event_counts: Counter[str], samples: list[dict[str, int]]) -> None:
    if not (match := SERVER_STATUS_RE.search(message)):
        return
    samples.append({key: int(value) for key, value in match.groupdict().items()})
    event_counts["server_status"] += 1


def _record_http_request(
    message: str,
    event_counts: Counter[str],
    path_counts: Counter[str],
    status_counts: Counter[str],
) -> None:
    if not (http_match := HTTP_LINE_RE.search(message)):
        return
    event_counts["http_requests"] += 1
    path = http_match.group("path")
    status = http_match.group("status")
    path_counts[f"{path} {status}"] += 1
    status_counts[status] += 1


def _record_egress(message: str, event_counts: Counter[str], egress_totals: dict[str, int]) -> None:
    if not (egress_match := ROUND_EGRESS_RE.search(message)):
        return
    event_counts["round_egress"] += 1
    egress_totals["rounds"] += 1
    for key, value in egress_match.groupdict().items():
        egress_totals[key] += int(value)


def _record_latency(
    message: str,
    event_counts: Counter[str],
    accumulator: dict[str, Any],
) -> None:
    if http_latency_match := HTTP_LATENCY_RE.search(message):
        event_counts["http_latency_lines"] += 1
        duration_ms = float(http_latency_match.group("duration_ms"))
        method = http_latency_match.group("method")
        path = http_latency_match.group("path")
        status = http_latency_match.group("status")
        accumulator["latency_http"].append(duration_ms)
        accumulator["latency_http_buckets"][f"{method} {path} {status}"] += 1

    if ws_action_match := WS_ACTION_LATENCY_RE.search(message):
        event_counts["ws_action_latency_lines"] += 1
        duration_ms = float(ws_action_match.group("duration_ms"))
        action = ws_action_match.group("action")
        accumulator["latency_ws_action"].append(duration_ms)
        accumulator["latency_ws_action_buckets"][action] += 1

    if ws_broadcast_match := WS_BROADCAST_LATENCY_RE.search(message):
        event_counts["ws_broadcast_latency_lines"] += 1
        duration_ms = float(ws_broadcast_match.group("duration_ms"))
        kind = ws_broadcast_match.group("kind")
        accumulator["latency_ws_broadcast"].append(duration_ms)
        accumulator["latency_ws_broadcast_buckets"][kind] += 1


def _record_log_event(event: dict[str, Any], accumulator: dict[str, Any]) -> None:
    level = str(event.get("level", "unknown")).lower()
    accumulator["level_counts"][level] += 1

    timestamp = event.get("timestamp")
    if isinstance(timestamp, str):
        accumulator["timestamps"].append(timestamp)

    message = str(event.get("message", ""))
    _record_server_status(message, accumulator["event_counts"], accumulator["server_status_samples"])
    _record_named_events(message, accumulator["event_counts"])
    _record_http_request(
        message,
        accumulator["event_counts"],
        accumulator["http_path_counts"],
        accumulator["http_status_counts"],
    )
    _record_egress(message, accumulator["event_counts"], accumulator["egress_totals"])
    _record_latency(message, accumulator["event_counts"], accumulator)


def _build_server_status_summary(samples: list[dict[str, int]]) -> dict[str, Any]:
    if not samples:
        return {}
    memories = [sample["memory"] for sample in samples]
    games = Counter(sample["games"] for sample in samples)
    pending = Counter(sample["pending"] for sample in samples)
    connections = Counter(sample["connections"] for sample in samples)
    spectators = Counter(sample["spectators"] for sample in samples)
    return {
        "samples": len(samples),
        "memory_mb_min": min(memories),
        "memory_mb_max": max(memories),
        "memory_mb_avg": round(sum(memories) / len(memories), 2),
        "games_counts": dict(games),
        "pending_counts": dict(pending),
        "connections_counts": dict(connections),
        "spectators_counts": dict(spectators),
    }


def summarize_logs(
    log_events: list[dict[str, Any]],
    *,
    source: str,
    source_note: str,
) -> dict[str, Any]:
    if not log_events:
        return {"source": source, "log_events": 0, "note": f"No log events returned by {source} logs."}

    accumulator = _new_log_accumulator()
    for event in log_events:
        _record_log_event(event, accumulator)

    note = source_note
    if source == "fly" and len(log_events) == 100:
        note += " This fetch returned exactly 100 events, which indicates a practical per-call cap."

    timestamps = accumulator["timestamps"]
    egress_totals = accumulator["egress_totals"]
    return {
        "source": source,
        "log_events": len(log_events),
        "time_range": {
            "first": min(timestamps) if timestamps else None,
            "last": max(timestamps) if timestamps else None,
        },
        "level_counts": dict(accumulator["level_counts"]),
        "event_counts": dict(accumulator["event_counts"]),
        "server_status_summary": _build_server_status_summary(accumulator["server_status_samples"]),
        "http_top_paths": dict(accumulator["http_path_counts"].most_common(8)),
        "http_status_counts": dict(accumulator["http_status_counts"]),
        "egress_totals": egress_totals if egress_totals["rounds"] else None,
        "latency": {
            "http": _latency_stats(accumulator["latency_http"], accumulator["latency_http_buckets"]),
            "ws_action": _latency_stats(accumulator["latency_ws_action"], accumulator["latency_ws_action_buckets"]),
            "ws_broadcast": _latency_stats(
                accumulator["latency_ws_broadcast"], accumulator["latency_ws_broadcast_buckets"]
            ),
        },
        "buffer_note": note,
    }


def fetch_fly_logs_summary(args: argparse.Namespace) -> dict[str, Any]:
    result = run_command(build_fly_logs_command(args), args.timeout_sec, args.verbose)
    events = extract_json_objects(result.stdout)
    if args.verbose and result.stderr.strip():
        print(f"[fly logs stderr] {result.stderr.strip()}", file=sys.stderr)
    return summarize_logs(
        events,
        source="fly",
        source_note=(
            "fly logs --no-tail returns the current Fly log buffer only; historical logs outside that buffer "
            "are not returned."
        ),
    )


def build_remote_file_log_script(hours: int, log_file_path: str, rotate_count: int) -> str:
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


def fetch_file_logs_summary(args: argparse.Namespace) -> dict[str, Any]:
    script = build_remote_file_log_script(args.hours, args.log_file_path, args.log_rotate_count)
    payload = run_remote_python(args, script)
    if not isinstance(payload, dict):
        raise ReportError("Unexpected file log payload.")
    events = payload.get("events", [])
    if not isinstance(events, list):
        raise ReportError("Unexpected event list in file log payload.")
    summary = summarize_logs(
        [event for event in events if isinstance(event, dict)],
        source="file",
        source_note="Read from persistent machine log files for the configured window.",
    )
    summary["files_considered"] = payload.get("files_considered", [])
    summary["files_used"] = payload.get("files_used", [])
    summary["lines_scanned"] = payload.get("lines_scanned", 0)
    return summary


def build_remote_db_script(hours: int, db_path: str) -> str:
    return f"""
import json
import sqlite3
from datetime import datetime, UTC

hours = {hours}
db_path = {db_path!r}
window = f"-{{hours}} hours"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None

summary = {{
    "window_hours": hours,
    "now_utc": datetime.now(UTC).isoformat(),
    "games_total": cur.execute("SELECT COUNT(*) FROM games").fetchone()[0],
    "games_last_window": cur.execute(
        "SELECT COUNT(*) FROM games WHERE datetime(created_at) >= datetime(?, ?)",
        ("now", window),
    ).fetchone()[0],
    "completed_last_window": cur.execute(
        "SELECT COUNT(*) FROM games WHERE datetime(created_at) >= datetime(?, ?) AND ended_at IS NOT NULL",
        ("now", window),
    ).fetchone()[0],
    "unfinished_started_last_window": cur.execute(
        "SELECT COUNT(*) FROM games WHERE datetime(created_at) >= datetime(?, ?) AND ended_at IS NULL",
        ("now", window),
    ).fetchone()[0],
    "open_games_total": cur.execute("SELECT COUNT(*) FROM games WHERE ended_at IS NULL").fetchone()[0],
    "first_game_at": cur.execute("SELECT MIN(created_at) FROM games").fetchone()[0],
    "latest_game_at": cur.execute("SELECT MAX(created_at) FROM games").fetchone()[0],
}}

rows = cur.execute(
    "SELECT id, created_at, ended_at, winner_player_id, config_json "
    "FROM games "
    "WHERE datetime(created_at) >= datetime(?, ?) "
    "ORDER BY datetime(created_at) DESC",
    ("now", window),
).fetchall()

history_counts = {{
    row["game_id"]: {{
        "history_rows": int(row["history_rows"] or 0),
        "human_histories": int(row["human_histories"] or 0),
        "puppet_histories": int(row["puppet_histories"] or 0),
    }}
    for row in cur.execute(
        "SELECT game_id, COUNT(*) AS history_rows, "
        "SUM(CASE WHEN is_puppet = 0 THEN 1 ELSE 0 END) AS human_histories, "
        "SUM(CASE WHEN is_puppet = 1 THEN 1 ELSE 0 END) AS puppet_histories "
        "FROM player_game_history GROUP BY game_id"
    ).fetchall()
}}

games = []
durations = []
cube_counts = {{}}
for row in rows:
    counts = history_counts.get(
        row["id"], {{"history_rows": 0, "human_histories": 0, "puppet_histories": 0}}
    )
    created = parse_dt(row["created_at"])
    ended = parse_dt(row["ended_at"])
    duration_min = None
    if created and ended:
        duration_min = round((ended - created).total_seconds() / 60, 2)
        durations.append(duration_min)

    cube_id = None
    if row["config_json"]:
        try:
            cube_id = json.loads(row["config_json"]).get("cube_id")
        except Exception:
            cube_id = None
    cube_key = cube_id or "unknown"
    cube_counts[cube_key] = cube_counts.get(cube_key, 0) + 1

    games.append(
        {{
            "id": row["id"],
            "created_at": row["created_at"],
            "ended_at": row["ended_at"],
            "duration_min": duration_min,
            "winner": row["winner_player_id"],
            "history_rows": counts["history_rows"],
            "human_histories": counts["human_histories"],
            "puppet_histories": counts["puppet_histories"],
            "cube_id": cube_id,
        }}
    )

window_with_history = sum(1 for g in games if g["history_rows"] > 0)
window_without_history = summary["games_last_window"] - window_with_history
unfinished_with_history = sum(1 for g in games if g["ended_at"] is None and g["history_rows"] > 0)
unfinished_without_history = sum(1 for g in games if g["ended_at"] is None and g["history_rows"] == 0)
completed_with_winner = sum(1 for g in games if g["ended_at"] and g["winner"])
completed_without_winner = sum(1 for g in games if g["ended_at"] and not g["winner"])

open_rows = cur.execute("SELECT id, created_at FROM games WHERE ended_at IS NULL").fetchall()
now_naive = datetime.now(UTC).replace(tzinfo=None)
open_age_hours = []
for row in open_rows:
    created = parse_dt(row["created_at"])
    if created:
        open_age_hours.append((now_naive - created).total_seconds() / 3600)

open_age = {{
    "open_gt_24h": sum(1 for value in open_age_hours if value > 24),
    "open_gt_72h": sum(1 for value in open_age_hours if value > 72),
    "open_gt_168h": sum(1 for value in open_age_hours if value > 168),
}}

duration_stats = None
if durations:
    duration_stats = {{
        "count": len(durations),
        "min": round(min(durations), 2),
        "max": round(max(durations), 2),
        "avg": round(sum(durations) / len(durations), 2),
    }}

table_sizes = {{
    "games": cur.execute("SELECT COUNT(*) FROM games").fetchone()[0],
    "player_game_history": cur.execute("SELECT COUNT(*) FROM player_game_history").fetchone()[0],
    "battle_snapshots": cur.execute("SELECT COUNT(*) FROM battle_snapshots").fetchone()[0],
}}

unfinished_with_history_ids = [
    {{
        "id": g["id"],
        "created_at": g["created_at"],
        "history_rows": g["history_rows"],
    }}
    for g in games
    if g["ended_at"] is None and g["history_rows"] > 0
]

report = {{
    "summary": summary,
    "activity_breakdown": {{
        "window_with_history": window_with_history,
        "window_without_history": window_without_history,
        "unfinished_with_history": unfinished_with_history,
        "unfinished_without_history": unfinished_without_history,
        "completed_with_winner": completed_with_winner,
        "completed_without_winner": completed_without_winner,
    }},
    "duration_stats_completed_games": duration_stats,
    "open_age": open_age,
    "cube_breakdown": sorted(
        [{{"cube_id": key, "games": value}} for key, value in cube_counts.items()],
        key=lambda item: (-item["games"], item["cube_id"]),
    ),
    "unfinished_with_history_ids": unfinished_with_history_ids,
    "table_sizes": table_sizes,
}}

print("JSON_START")
print(json.dumps(report, sort_keys=True))
print("JSON_END")
"""


def run_remote_python(args: argparse.Namespace, script: str) -> dict[str, Any]:
    encoded = base64.b64encode(script.encode("utf-8")).decode("ascii")
    remote = f"python -c \"import base64; exec(base64.b64decode('{encoded}'))\""
    result = run_command(build_fly_ssh_command(args, remote), args.timeout_sec, args.verbose)
    text = result.stdout
    if args.verbose and result.stderr.strip():
        print(f"[fly ssh stderr] {result.stderr.strip()}", file=sys.stderr)

    marker_start = text.find("JSON_START")
    marker_end = text.find("JSON_END")
    if marker_start != -1 and marker_end != -1 and marker_end > marker_start:
        payload = text[marker_start + len("JSON_START") : marker_end].strip()
        return extract_first_json_value(payload)

    return extract_first_json_value(text)


def fetch_db_report(args: argparse.Namespace) -> dict[str, Any]:
    script = build_remote_db_script(args.hours, args.db_path)
    payload = run_remote_python(args, script)
    if not isinstance(payload, dict):
        raise ReportError("Unexpected DB report payload.")
    return payload


def fetch_runtime_memory(args: argparse.Namespace) -> dict[str, Any]:
    script = """
import json
from pathlib import Path

def read_text(path):
    try:
        return Path(path).read_text().strip()
    except Exception:
        return None

meminfo = {}
meminfo_text = read_text("/proc/meminfo")
if meminfo_text:
    for line in meminfo_text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meminfo[key.strip()] = value.strip()

report = {
    "memory_usage_bytes": read_text("/sys/fs/cgroup/memory/memory.usage_in_bytes"),
    "memory_limit_bytes": read_text("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
    "memory_failcnt": read_text("/sys/fs/cgroup/memory/memory.failcnt"),
    "memory_oom_control": read_text("/sys/fs/cgroup/memory/memory.oom_control"),
    "meminfo": {
        "MemTotal": meminfo.get("MemTotal"),
        "MemFree": meminfo.get("MemFree"),
        "MemAvailable": meminfo.get("MemAvailable"),
        "Cached": meminfo.get("Cached"),
    },
}

print("JSON_START")
print(json.dumps(report, sort_keys=True))
print("JSON_END")
"""
    payload = run_remote_python(args, script)
    if not isinstance(payload, dict):
        raise ReportError("Unexpected runtime memory payload.")
    return payload


def select_primary_log_summary(logs: dict[str, Any] | None) -> dict[str, Any] | None:
    if not logs:
        return None
    primary = logs.get("primary")
    if isinstance(primary, dict):
        return primary
    summaries = logs.get("summaries")
    if isinstance(summaries, dict):
        if isinstance(summaries.get("file"), dict):
            return summaries["file"]
        if isinstance(summaries.get("fly"), dict):
            return summaries["fly"]
    if "log_events" in logs:
        return logs
    return None


def assess_risks(logs: dict[str, Any] | None, db: dict[str, Any] | None, checks: dict[str, Any]) -> list[str]:
    items: list[str] = []
    primary_logs = select_primary_log_summary(logs)

    if primary_logs:
        items.append(primary_logs.get("buffer_note", ""))
        if primary_logs.get("event_counts", {}).get("error_keyword_lines", 0) > 0:
            items.append("Errors/exceptions were detected in log messages; inspect raw logs for stack traces.")
        else:
            items.append("No explicit error/exception lines were detected in fetched logs.")

    check_total = checks.get("total", 0)
    if check_total == 0:
        items.append("No Fly health checks are configured. Add checks to detect regressions faster.")

    if db:
        summary = db.get("summary", {})
        breakdown = db.get("activity_breakdown", {})
        open_age = db.get("open_age", {})
        open_total = int(summary.get("open_games_total", 0) or 0)
        unfinished = int(summary.get("unfinished_started_last_window", 0) or 0)
        with_history = int(breakdown.get("unfinished_with_history", 0) or 0)
        if open_total >= 100:
            items.append(
                f"Open game backlog is high ({open_total} games with no ended_at). "
                "Consider an abandoned/completed lifecycle state."
            )
        if unfinished > 0:
            items.append(
                f"{unfinished} games started in the window are still unfinished; {with_history} had real history rows."
            )
        if int(open_age.get("open_gt_168h", 0) or 0) > 0:
            items.append(
                f"{open_age.get('open_gt_168h')} open games are older than 7 days. "
                "Schedule cleanup/backfill for stale rows."
            )

    return [item for item in items if item]


def _print_log_summary(title: str, summary: dict[str, Any]) -> None:
    print(title)
    print(f"- source: {summary.get('source')}")
    print(f"- events fetched: {summary.get('log_events')}")
    time_range = summary.get("time_range", {})
    print(f"- time range: {time_range.get('first')} .. {time_range.get('last')}")
    print(f"- levels: {summary.get('level_counts', {})}")
    print(f"- event counts: {summary.get('event_counts', {})}")
    status_summary = summary.get("server_status_summary", {})
    if status_summary:
        print(
            "- server-status samples: "
            f"{status_summary.get('samples')} | memory MB min/avg/max="
            f"{status_summary.get('memory_mb_min')}/"
            f"{status_summary.get('memory_mb_avg')}/"
            f"{status_summary.get('memory_mb_max')}"
        )
    egress = summary.get("egress_totals")
    if egress:
        print(
            "- round egress totals: "
            f"rounds={egress.get('rounds')} "
            f"battle={egress.get('battle_kb')}KB/{egress.get('battle_msgs')}m "
            f"draft={egress.get('draft_kb')}KB/{egress.get('draft_msgs')}m "
            f"build={egress.get('build_kb')}KB/{egress.get('build_msgs')}m"
        )
    top_paths = summary.get("http_top_paths")
    if top_paths:
        print(f"- top HTTP paths: {top_paths}")
    latency = summary.get("latency", {})
    if latency:
        print(f"- latency http: {latency.get('http')}")
        print(f"- latency ws_action: {latency.get('ws_action')}")
        print(f"- latency ws_broadcast: {latency.get('ws_broadcast')}")
    if "files_used" in summary:
        print(f"- files used: {summary.get('files_used')}")
        print(f"- lines scanned: {summary.get('lines_scanned')}")
    print(f"- note: {summary.get('buffer_note')}")
    print()


def _print_app_status(report: dict[str, Any]) -> None:
    status = report.get("status", {})
    print("App Status")
    print(f"- hostname: {status.get('Hostname')}")
    print(f"- status: {status.get('Status')} | version: {status.get('Version')}")
    print(f"- platform: {status.get('PlatformVersion')}")

    machines = report.get("machines", [])
    print(f"- machines: {len(machines)}")
    for machine in machines:
        guest = machine.get("config", {}).get("guest", {})
        print(
            "- machine: "
            f"{machine.get('id')} state={machine.get('state')} region={machine.get('region')} "
            f"size={guest.get('cpu_kind')}:{guest.get('cpus')}cpu:{guest.get('memory_mb')}MB"
        )

    checks_summary = report.get("checks_summary", {})
    print(f"- checks configured: {checks_summary.get('total', 0)}")
    if checks_summary.get("status_counts"):
        print(f"- check status counts: {checks_summary['status_counts']}")
    print()


def _print_logs_section(report: dict[str, Any]) -> None:
    logs = report.get("logs")
    if not logs:
        return
    print("Logs")
    print(f"- requested source: {logs.get('requested_source')}")
    print(f"- primary source: {logs.get('primary_source')}")
    print()
    summaries = logs.get("summaries", {})
    if isinstance(summaries.get("file"), dict):
        _print_log_summary("File Log Summary", summaries["file"])
    if isinstance(summaries.get("fly"), dict):
        _print_log_summary("Fly Buffer Log Summary", summaries["fly"])


def _print_runtime_memory(report: dict[str, Any]) -> None:
    memory = report.get("runtime_memory")
    if not memory:
        return
    print("Runtime Memory")
    print(f"- cgroup usage/limit bytes: {memory.get('memory_usage_bytes')} / {memory.get('memory_limit_bytes')}")
    print(f"- cgroup failcnt: {memory.get('memory_failcnt')}")
    meminfo = memory.get("meminfo", {})
    print(f"- /proc/meminfo: MemTotal={meminfo.get('MemTotal')} MemAvailable={meminfo.get('MemAvailable')}")
    print()


def _print_db_activity(report: dict[str, Any]) -> None:
    db = report.get("db")
    if not db:
        return
    summary = db.get("summary", {})
    duration = db.get("duration_stats_completed_games")
    breakdown = db.get("activity_breakdown", {})
    open_age = db.get("open_age", {})
    print("DB Activity")
    print(
        "- games in window: "
        f"started={summary.get('games_last_window')} "
        f"completed={summary.get('completed_last_window')} "
        f"unfinished={summary.get('unfinished_started_last_window')}"
    )
    print(f"- open games total: {summary.get('open_games_total')}")
    if duration:
        print(
            "- completed duration minutes: "
            f"count={duration.get('count')} "
            f"min/avg/max={duration.get('min')}/{duration.get('avg')}/{duration.get('max')}"
        )
    print(
        "- window composition: "
        f"with_history={breakdown.get('window_with_history')} "
        f"without_history={breakdown.get('window_without_history')} "
        f"unfinished_with_history={breakdown.get('unfinished_with_history')}"
    )
    print(
        "- open age buckets: "
        f">24h={open_age.get('open_gt_24h')} "
        f">72h={open_age.get('open_gt_72h')} "
        f">168h={open_age.get('open_gt_168h')}"
    )
    print(f"- cube breakdown: {db.get('cube_breakdown')}")
    stale = db.get("unfinished_with_history_ids", [])
    if stale:
        print(f"- unfinished with history (up to 8): {stale[:8]}")
    print(f"- table sizes: {db.get('table_sizes')}")
    print()


def _print_risk_signals(report: dict[str, Any]) -> None:
    print("Risk Signals")
    for item in report.get("risk_signals", []):
        print(f"- {item}")


def print_human_report(report: dict[str, Any]) -> None:
    print(f"Fly Activity Report | app={report['app']} | generated_utc={report['generated_utc']}")
    print(f"Window: last {report['inputs']['hours']}h")
    print()
    _print_app_status(report)
    _print_logs_section(report)
    _print_runtime_memory(report)
    _print_db_activity(report)
    _print_risk_signals(report)


def main() -> int:
    args = parse_args()
    if args.hours <= 0:
        raise ReportError("--hours must be > 0")
    if args.timeout_sec <= 0:
        raise ReportError("--timeout-sec must be > 0")
    if args.log_rotate_count < 0:
        raise ReportError("--log-rotate-count must be >= 0")

    if shutil.which("fly") is None:
        raise ReportError("fly CLI is not installed or not in PATH.")

    status = fetch_status(args)
    machines = fetch_machine_list(args)
    checks_raw = fetch_checks(args)
    checks_summary = summarize_checks(checks_raw)

    logs_summary = None
    if not args.skip_logs:
        log_summaries: dict[str, dict[str, Any]] = {}
        if args.log_source in ("fly", "both"):
            log_summaries["fly"] = fetch_fly_logs_summary(args)
        if args.log_source in ("file", "both"):
            log_summaries["file"] = fetch_file_logs_summary(args)
        primary_source = "file" if "file" in log_summaries else "fly"
        logs_summary = {
            "requested_source": args.log_source,
            "primary_source": primary_source,
            "primary": log_summaries.get(primary_source),
            "summaries": log_summaries,
        }

    db_report = None if args.skip_db else fetch_db_report(args)
    runtime_memory = None if args.skip_machine else fetch_runtime_memory(args)

    report = {
        "generated_utc": datetime.now(UTC).isoformat(),
        "app": args.app,
        "inputs": {
            "hours": args.hours,
            "region": args.region,
            "machine": args.machine,
            "db_path": args.db_path,
            "log_source": args.log_source,
            "log_file_path": args.log_file_path,
            "log_rotate_count": args.log_rotate_count,
            "skip_logs": args.skip_logs,
            "skip_db": args.skip_db,
            "skip_machine": args.skip_machine,
        },
        "status": status,
        "machines": machines,
        "checks_raw": checks_raw,
        "checks_summary": checks_summary,
        "logs": logs_summary,
        "db": db_report,
        "runtime_memory": runtime_memory,
    }
    report["risk_signals"] = assess_risks(logs_summary, db_report, checks_summary)

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_human_report(report)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReportError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

"""Remote Python scripts executed over Fly SSH for DB and memory inspection."""

from __future__ import annotations

import argparse

from scripts.fly_report.fly_client import run_remote_python


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


def fetch_db_report(args: argparse.Namespace) -> dict[str, object]:
    script = build_remote_db_script(args.hours, args.db_path)
    return run_remote_python(args, script)


def fetch_runtime_memory(args: argparse.Namespace) -> dict[str, object]:
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
    return run_remote_python(args, script)

"""Risk assessment and human-readable report formatting for Fly.io activity."""

from __future__ import annotations

import sys


def _as_dict(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _as_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0


def select_primary_log_summary(logs: dict[str, object] | None) -> dict[str, object] | None:
    if not logs:
        return None
    primary = logs.get("primary")
    if isinstance(primary, dict):
        return primary
    summaries = logs.get("summaries")
    if isinstance(summaries, dict):
        for key in ("file", "fly"):
            candidate = summaries.get(key)
            if isinstance(candidate, dict):
                return candidate
    if "log_events" in logs:
        return logs
    return None


def _assess_db_risks(db: dict[str, object]) -> list[str]:
    items: list[str] = []
    summary = _as_dict(db.get("summary"))
    breakdown = _as_dict(db.get("activity_breakdown"))
    open_age = _as_dict(db.get("open_age"))
    open_total = _as_int(summary.get("open_games_total"))
    unfinished = _as_int(summary.get("unfinished_started_last_window"))
    with_history = _as_int(breakdown.get("unfinished_with_history"))
    high_open_games_threshold = 100
    if open_total >= high_open_games_threshold:
        items.append(
            f"Open game backlog is high ({open_total} games with no ended_at). "
            "Consider an abandoned/completed lifecycle state.",
        )
    if unfinished > 0:
        items.append(
            f"{unfinished} games started in the window are still unfinished; {with_history} had real history rows.",
        )
    if _as_int(open_age.get("open_gt_168h")) > 0:
        items.append(
            f"{open_age.get('open_gt_168h')} open games are older than 7 days. "
            "Schedule cleanup/backfill for stale rows.",
        )
    return items


def assess_risks(
    *,
    logs: dict[str, object] | None,
    db: dict[str, object] | None,
    checks: dict[str, object],
) -> list[str]:
    items: list[str] = []
    primary_logs = select_primary_log_summary(logs)

    if primary_logs:
        note = str(primary_logs.get("buffer_note", ""))
        if note:
            items.append(note)
        event_counts = _as_dict(primary_logs.get("event_counts"))
        if _as_int(event_counts.get("error_keyword_lines")) > 0:
            items.append("Errors/exceptions were detected in log messages; inspect raw logs for stack traces.")
        else:
            items.append("No explicit error/exception lines were detected in fetched logs.")

    if _as_int(checks.get("total")) == 0:
        items.append("No Fly health checks are configured. Add checks to detect regressions faster.")

    if db:
        items.extend(_assess_db_risks(db))

    return [item for item in items if item]


def _append_log_summary_lines(lines: list[str], *, title: str, summary: dict[str, object]) -> None:
    time_range = _as_dict(summary.get("time_range"))
    lines.extend(
        [
            title,
            f"- source: {summary.get('source')}",
            f"- events fetched: {summary.get('log_events')}",
            f"- time range: {time_range.get('first')} .. {time_range.get('last')}",
            f"- levels: {summary.get('level_counts', {})}",
            f"- event counts: {summary.get('event_counts', {})}",
        ],
    )
    status_summary = _as_dict(summary.get("server_status_summary"))
    if status_summary:
        lines.append(
            "- server-status samples: "
            f"{status_summary.get('samples')} | memory MB min/avg/max="
            f"{status_summary.get('memory_mb_min')}/"
            f"{status_summary.get('memory_mb_avg')}/"
            f"{status_summary.get('memory_mb_max')}",
        )
    egress = _as_dict(summary.get("egress_totals"))
    if egress:
        lines.append(
            "- round egress totals: "
            f"rounds={egress.get('rounds')} "
            f"battle={egress.get('battle_kb')}KB/{egress.get('battle_msgs')}m "
            f"draft={egress.get('draft_kb')}KB/{egress.get('draft_msgs')}m "
            f"build={egress.get('build_kb')}KB/{egress.get('build_msgs')}m",
        )
    _append_log_latency_and_files(lines, summary)


def _append_log_latency_and_files(lines: list[str], summary: dict[str, object]) -> None:
    top_paths = summary.get("http_top_paths")
    if top_paths:
        lines.append(f"- top HTTP paths: {top_paths}")
    latency = _as_dict(summary.get("latency"))
    if latency:
        lines.extend(
            [
                f"- latency http: {latency.get('http')}",
                f"- latency ws_action: {latency.get('ws_action')}",
                f"- latency ws_broadcast: {latency.get('ws_broadcast')}",
            ],
        )
    if "files_used" in summary:
        lines.extend(
            [
                f"- files used: {summary.get('files_used')}",
                f"- lines scanned: {summary.get('lines_scanned')}",
            ],
        )
    lines.extend([f"- note: {summary.get('buffer_note')}", ""])


def _append_app_status_lines(lines: list[str], report: dict[str, object]) -> None:
    status = _as_dict(report.get("status"))
    machines = _as_list(report.get("machines"))
    lines.extend(
        [
            "App Status",
            f"- hostname: {status.get('Hostname')}",
            f"- status: {status.get('Status')} | version: {status.get('Version')}",
            f"- platform: {status.get('PlatformVersion')}",
            f"- machines: {len(machines)}",
        ],
    )
    for raw_machine in machines:
        machine = _as_dict(raw_machine)
        guest = _as_dict(_as_dict(machine.get("config")).get("guest"))
        lines.append(
            "- machine: "
            f"{machine.get('id')} state={machine.get('state')} region={machine.get('region')} "
            f"size={guest.get('cpu_kind')}:{guest.get('cpus')}cpu:{guest.get('memory_mb')}MB",
        )

    checks_summary = _as_dict(report.get("checks_summary"))
    lines.append(f"- checks configured: {checks_summary.get('total', 0)}")
    if checks_summary.get("status_counts"):
        lines.append(f"- check status counts: {checks_summary['status_counts']}")
    lines.append("")


def _append_logs_section_lines(lines: list[str], report: dict[str, object]) -> None:
    logs = _as_dict(report.get("logs"))
    if not logs:
        return
    lines.extend(
        [
            "Logs",
            f"- requested source: {logs.get('requested_source')}",
            f"- primary source: {logs.get('primary_source')}",
            "",
        ],
    )
    summaries = _as_dict(logs.get("summaries"))
    for key, title in (("file", "File Log Summary"), ("fly", "Fly Buffer Log Summary")):
        summary = summaries.get(key)
        if isinstance(summary, dict):
            _append_log_summary_lines(lines, title=title, summary=summary)


def _append_runtime_memory_lines(lines: list[str], report: dict[str, object]) -> None:
    memory = _as_dict(report.get("runtime_memory"))
    if not memory:
        return
    meminfo = _as_dict(memory.get("meminfo"))
    lines.extend(
        [
            "Runtime Memory",
            f"- cgroup usage/limit bytes: {memory.get('memory_usage_bytes')} / {memory.get('memory_limit_bytes')}",
            f"- cgroup failcnt: {memory.get('memory_failcnt')}",
            f"- /proc/meminfo: MemTotal={meminfo.get('MemTotal')} MemAvailable={meminfo.get('MemAvailable')}",
            "",
        ],
    )


def _append_db_activity_lines(lines: list[str], report: dict[str, object]) -> None:
    db = _as_dict(report.get("db"))
    if not db:
        return
    summary = _as_dict(db.get("summary"))
    duration = _as_dict(db.get("duration_stats_completed_games"))
    breakdown = _as_dict(db.get("activity_breakdown"))
    open_age = _as_dict(db.get("open_age"))
    lines.extend(
        [
            "DB Activity",
            (
                "- games in window: "
                f"started={summary.get('games_last_window')} "
                f"completed={summary.get('completed_last_window')} "
                f"unfinished={summary.get('unfinished_started_last_window')}"
            ),
            f"- open games total: {summary.get('open_games_total')}",
        ],
    )
    if duration:
        lines.append(
            "- completed duration minutes: "
            f"count={duration.get('count')} "
            f"min/avg/max={duration.get('min')}/{duration.get('avg')}/{duration.get('max')}",
        )
    lines.extend(
        [
            (
                "- window composition: "
                f"with_history={breakdown.get('window_with_history')} "
                f"without_history={breakdown.get('window_without_history')} "
                f"unfinished_with_history={breakdown.get('unfinished_with_history')}"
            ),
            (
                "- open age buckets: "
                f">24h={open_age.get('open_gt_24h')} "
                f">72h={open_age.get('open_gt_72h')} "
                f">168h={open_age.get('open_gt_168h')}"
            ),
            f"- cube breakdown: {db.get('cube_breakdown')}",
        ],
    )
    stale = _as_list(db.get("unfinished_with_history_ids"))
    if stale:
        lines.append(f"- unfinished with history (up to 8): {stale[:8]}")
    lines.extend([f"- table sizes: {db.get('table_sizes')}", ""])


def _append_risk_signal_lines(lines: list[str], report: dict[str, object]) -> None:
    lines.append("Risk Signals")
    lines.extend(f"- {item}" for item in _as_list(report.get("risk_signals")))


def format_human_report(report: dict[str, object]) -> str:
    inputs = _as_dict(report.get("inputs"))
    lines = [
        f"Fly Activity Report | app={report['app']} | generated_utc={report['generated_utc']}",
        f"Window: last {inputs.get('hours')}h",
        "",
    ]
    _append_app_status_lines(lines, report)
    _append_logs_section_lines(lines, report)
    _append_runtime_memory_lines(lines, report)
    _append_db_activity_lines(lines, report)
    _append_risk_signal_lines(lines, report)
    return "\n".join(lines) + "\n"


def write_human_report(report: dict[str, object]) -> None:
    sys.stdout.write(format_human_report(report))

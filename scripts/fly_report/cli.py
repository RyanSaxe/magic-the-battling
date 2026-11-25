"""CLI argument parsing and report assembly for the Fly.io activity report."""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from datetime import UTC, datetime

from scripts.fly_report.fly_client import (
    ReportError,
    fetch_checks,
    fetch_machine_list,
    fetch_status,
    summarize_checks,
)
from scripts.fly_report.log_analysis import fetch_file_logs_summary, fetch_fly_logs_summary
from scripts.fly_report.remote_probes import fetch_db_report, fetch_runtime_memory
from scripts.fly_report.report import assess_risks, write_human_report

DEFAULT_APP = "magic-the-battling"
DEFAULT_HOURS = 24
DEFAULT_LOG_FILE_PATH = "/data/logs/server.jsonl"
DEFAULT_LOG_ROTATE_COUNT = 5


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
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
    return parser.parse_args(argv)


def _validate_args(args: argparse.Namespace) -> None:
    if args.hours <= 0:
        msg = "--hours must be > 0"
        raise ReportError(msg)
    if args.timeout_sec <= 0:
        msg = "--timeout-sec must be > 0"
        raise ReportError(msg)
    if args.log_rotate_count < 0:
        msg = "--log-rotate-count must be >= 0"
        raise ReportError(msg)
    if shutil.which("fly") is None:
        msg = "fly CLI is not installed or not in PATH."
        raise ReportError(msg)


def _collect_logs_summary(args: argparse.Namespace) -> dict[str, object] | None:
    if args.skip_logs:
        return None
    log_summaries: dict[str, dict[str, object]] = {}
    if args.log_source in ("fly", "both"):
        log_summaries["fly"] = fetch_fly_logs_summary(args)
    if args.log_source in ("file", "both"):
        log_summaries["file"] = fetch_file_logs_summary(args)
    primary_source = "file" if "file" in log_summaries else "fly"
    return {
        "requested_source": args.log_source,
        "primary_source": primary_source,
        "primary": log_summaries.get(primary_source),
        "summaries": log_summaries,
    }


def build_report(args: argparse.Namespace) -> dict[str, object]:
    status = fetch_status(args)
    machines = fetch_machine_list(args)
    checks_raw = fetch_checks(args)
    checks_summary = summarize_checks(checks_raw)
    logs_summary = _collect_logs_summary(args)
    db_report = None if args.skip_db else fetch_db_report(args)
    runtime_memory = None if args.skip_machine else fetch_runtime_memory(args)

    report: dict[str, object] = {
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
    report["risk_signals"] = assess_risks(logs=logs_summary, db=db_report, checks=checks_summary)
    return report


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    args = parse_args(argv)
    _validate_args(args)
    report = build_report(args)

    if args.json:
        sys.stdout.write(f"{json.dumps(report, indent=2, sort_keys=True)}\n")
    else:
        write_human_report(report)
    return 0

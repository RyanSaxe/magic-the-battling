#!/usr/bin/env python3
"""Compatibility CLI entrypoint for generating the Fly.io app activity report."""

from __future__ import annotations

import logging
import sys

from scripts.fly_report.cli import (
    DEFAULT_APP,
    DEFAULT_HOURS,
    DEFAULT_LOG_FILE_PATH,
    DEFAULT_LOG_ROTATE_COUNT,
    build_report,
    main,
    parse_args,
)
from scripts.fly_report.fly_client import (
    CommandResult,
    ReportError,
    build_fly_logs_command,
    build_fly_ssh_command,
    extract_first_json_value,
    extract_json_objects,
    fetch_checks,
    fetch_machine_list,
    fetch_status,
    run_command,
    run_remote_python,
    summarize_checks,
)
from scripts.fly_report.log_analysis import (
    build_remote_file_log_script,
    fetch_file_logs_summary,
    fetch_fly_logs_summary,
    summarize_logs,
)
from scripts.fly_report.remote_probes import build_remote_db_script, fetch_db_report, fetch_runtime_memory
from scripts.fly_report.report import (
    assess_risks,
    format_human_report,
    select_primary_log_summary,
    write_human_report,
)

__all__ = [
    "DEFAULT_APP",
    "DEFAULT_HOURS",
    "DEFAULT_LOG_FILE_PATH",
    "DEFAULT_LOG_ROTATE_COUNT",
    "CommandResult",
    "ReportError",
    "assess_risks",
    "build_fly_logs_command",
    "build_fly_ssh_command",
    "build_remote_db_script",
    "build_remote_file_log_script",
    "build_report",
    "extract_first_json_value",
    "extract_json_objects",
    "fetch_checks",
    "fetch_db_report",
    "fetch_file_logs_summary",
    "fetch_fly_logs_summary",
    "fetch_machine_list",
    "fetch_runtime_memory",
    "fetch_status",
    "format_human_report",
    "main",
    "parse_args",
    "run_command",
    "run_remote_python",
    "select_primary_log_summary",
    "summarize_checks",
    "summarize_logs",
    "write_human_report",
]

logger = logging.getLogger(__name__)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    try:
        raise SystemExit(main())
    except ReportError as exc:
        logger.exception("Fly activity report failed")
        raise SystemExit(1) from exc

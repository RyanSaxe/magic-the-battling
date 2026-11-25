"""Fly CLI execution, JSON extraction, and machine/status/check fetchers."""

from __future__ import annotations

import argparse
import base64
import json
import logging
import subprocess
from collections import Counter
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CommandResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


class ReportError(RuntimeError):
    pass


def run_command(args: list[str], *, timeout_sec: int, verbose: bool) -> CommandResult:
    if verbose:
        logger.info("[cmd] %s", " ".join(args))
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


def extract_first_json_value(text: str) -> object:
    decoder = json.JSONDecoder()
    for idx, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            value, _ = decoder.raw_decode(text[idx:])
        except json.JSONDecodeError:
            continue
        return value
    raise ReportError("Unable to parse JSON payload from command output.")


def extract_json_objects(text: str) -> list[dict[str, object]]:
    decoder = json.JSONDecoder()
    objects: list[dict[str, object]] = []
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


def run_remote_python(args: argparse.Namespace, script: str) -> dict[str, object]:
    encoded = base64.b64encode(script.encode("utf-8")).decode("ascii")
    remote = f"python -c \"import base64; exec(base64.b64decode('{encoded}'))\""
    result = run_command(build_fly_ssh_command(args, remote), timeout_sec=args.timeout_sec, verbose=args.verbose)
    text = result.stdout
    if args.verbose and result.stderr.strip():
        logger.info("[fly ssh stderr] %s", result.stderr.strip())

    marker_start = text.find("JSON_START")
    marker_end = text.find("JSON_END")
    payload = text
    if marker_start != -1 and marker_end != -1 and marker_end > marker_start:
        payload = text[marker_start + len("JSON_START") : marker_end].strip()

    value = extract_first_json_value(payload)
    if not isinstance(value, dict):
        raise ReportError("Unexpected remote python JSON payload.")
    return value


def fetch_status(args: argparse.Namespace) -> dict[str, object]:
    result = run_command(
        ["fly", "status", "-a", args.app, "--json"],
        timeout_sec=args.timeout_sec,
        verbose=args.verbose,
    )
    value = extract_first_json_value(result.stdout)
    if not isinstance(value, dict):
        raise ReportError("Unexpected status JSON payload.")
    return value


def fetch_machine_list(args: argparse.Namespace) -> list[dict[str, object]]:
    result = run_command(
        ["fly", "machine", "list", "-a", args.app, "--json"],
        timeout_sec=args.timeout_sec,
        verbose=args.verbose,
    )
    value = extract_first_json_value(result.stdout)
    if not isinstance(value, list):
        raise ReportError("Unexpected machine list JSON payload.")
    return [item for item in value if isinstance(item, dict)]


def fetch_checks(args: argparse.Namespace) -> dict[str, list[dict[str, object]]]:
    result = run_command(
        ["fly", "checks", "list", "-a", args.app, "--json"],
        timeout_sec=args.timeout_sec,
        verbose=args.verbose,
    )
    value = extract_first_json_value(result.stdout)
    if not isinstance(value, dict):
        raise ReportError("Unexpected checks JSON payload.")
    return {
        str(key): [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []
        for key, items in value.items()
    }


def summarize_checks(checks: dict[str, list[dict[str, object]]]) -> dict[str, object]:
    total = 0
    status_counts: Counter[str] = Counter()
    for machine_checks in checks.values():
        for check in machine_checks:
            total += 1
            status = str(check.get("status", "unknown")).lower()
            status_counts[status] += 1
    return {"total": total, "status_counts": dict(status_counts)}

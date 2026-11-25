"""CLI argument parsing and entrypoint for the Pitfight load harness."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

from server.perf.models import DEFAULT_BACKEND_PORT, DEFAULT_BASE_URL, VALID_PUPPET_COUNTS, HarnessConfig
from server.perf.runner import run_harness

logger = logging.getLogger(__name__)


def _parse_int_list(raw: str, *, flag_name: str, min_value: int, bound_label: str) -> list[int]:
    values: list[int] = []
    seen: set[int] = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            parsed = int(token)
        except ValueError as exc:
            raise ValueError(f"invalid {flag_name} value: {token}") from exc
        if parsed < min_value:
            raise ValueError(f"{flag_name} value must be {bound_label}: {parsed}")
        if parsed not in seen:
            values.append(parsed)
            seen.add(parsed)

    if not values:
        raise ValueError(f"--{flag_name} did not contain any {bound_label} integers")
    return values


def parse_sweep(raw: str | None, fallback_games: int) -> list[int]:
    if raw is None:
        return [fallback_games]
    return _parse_int_list(raw, flag_name="sweep", min_value=1, bound_label="positive")


def parse_hot_sweep(raw: str | None, fallback_hot_games: int) -> list[int]:
    if raw is None:
        return [fallback_hot_games]
    return _parse_int_list(raw, flag_name="hot-sweep", min_value=0, bound_label="non-negative")


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run concurrent end-to-end goldfish load tests against real game engine flows.",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Backend base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--games", type=int, default=10, help="Number of games to run for a single sweep")
    parser.add_argument("--sweep", default=None, help="Comma-separated game counts, e.g. 1,10,100,1000")
    parser.add_argument(
        "--hot-games",
        type=int,
        default=0,
        help="Number of idle started games to keep hot in memory during each measured sweep (default: 0)",
    )
    parser.add_argument(
        "--hot-sweep",
        default=None,
        help="Comma-separated idle hot-game counts, e.g. 0,50,100,200",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=None,
        help="Concurrent games per sweep (default: equals games)",
    )
    parser.add_argument(
        "--puppet-count",
        type=int,
        choices=VALID_PUPPET_COUNTS,
        default=3,
        help="Puppet count per game (valid: 1, 3, 5, 7; default: 3)",
    )
    parser.add_argument("--cube-id", default="auto", help="Cube id for create_game (default: auto)")
    parser.add_argument("--seed", type=int, default=1337, help="Deterministic seed base")
    parser.add_argument(
        "--game-timeout-sec",
        type=float,
        default=None,
        help="Fixed timeout per game. If omitted, timeout is calibrated from one baseline game.",
    )
    parser.add_argument(
        "--timeout-multiplier",
        type=float,
        default=2.5,
        help="Multiplier for calibrated timeout (default: 2.5)",
    )
    parser.add_argument("--timeout-min-sec", type=float, default=60.0, help="Minimum timeout per game")
    parser.add_argument("--timeout-max-sec", type=float, default=900.0, help="Maximum timeout per game")
    parser.add_argument(
        "--calibration-timeout-sec",
        type=float,
        default=300.0,
        help="Timeout used for the single calibration game",
    )
    parser.add_argument(
        "--disable-caps",
        dest="disable_caps",
        action="store_true",
        default=True,
        help="Disable server guardrail caps when harness manages local server (default: true)",
    )
    parser.add_argument(
        "--respect-caps",
        dest="disable_caps",
        action="store_false",
        help="Respect current server caps (useful for blocked-capacity behavior tests)",
    )
    parser.add_argument(
        "--disable-ws-gzip",
        action="store_true",
        help="When harness manages local server, set MTB_COMPRESS_WS=0 to disable WS gzip compression",
    )
    parser.add_argument(
        "--mock-cube-data",
        dest="mock_cube_data",
        action="store_true",
        default=True,
        help="Use deterministic local cube data (no external CubeCobra/Scryfall calls) (default: true)",
    )
    parser.add_argument(
        "--real-cube-data",
        dest="mock_cube_data",
        action="store_false",
        help="Use real CubeCobra/Scryfall data (requires external network/cache)",
    )
    parser.add_argument(
        "--db-copy",
        action="store_true",
        help="Run against a managed local server pointed at a temporary DB copy (deleted on exit)",
    )
    parser.add_argument("--db-source", default=None, help="DB source path for --db-copy")
    parser.add_argument("--backend-port", type=int, default=DEFAULT_BACKEND_PORT, help="Managed server port")
    parser.add_argument(
        "--startup-timeout-sec",
        type=float,
        default=90.0,
        help="Managed server startup timeout",
    )
    parser.add_argument(
        "--ops-token",
        default=None,
        help="Ops token used for runtime reset when targeting an external server",
    )
    parser.add_argument(
        "--runtime-reset-between-sweeps",
        dest="reset_runtime_between_sweeps",
        action="store_true",
        default=True,
        help="Reset in-memory games/sessions between sweeps (default: true)",
    )
    parser.add_argument(
        "--no-runtime-reset-between-sweeps",
        dest="reset_runtime_between_sweeps",
        action="store_false",
        help="Do not reset in-memory games/sessions between sweeps",
    )
    parser.add_argument(
        "--fresh-server-per-sweep",
        action="store_true",
        help="When using --db-copy, launch a fresh managed server and DB copy for each sweep",
    )
    parser.add_argument(
        "--rss-sample-interval-sec",
        type=float,
        default=0.25,
        help="Managed server RSS sample interval in seconds",
    )
    parser.add_argument(
        "--ws-action-jitter-ms",
        type=float,
        default=0.0,
        help="Random per-WS-action jitter up to this many milliseconds (harness only)",
    )
    parser.add_argument("--json", action="store_true", help="Print final report as JSON")
    parser.add_argument("--json-output", default=None, help="Write final report JSON to this path")
    parser.add_argument(
        "--no-upgrades",
        dest="use_upgrades",
        action="store_false",
        default=True,
        help="Disable upgrades in created games",
    )
    return parser


def _validate_args(args: argparse.Namespace) -> None:
    if args.games <= 0:
        raise ValueError("--games must be positive")
    if args.hot_games < 0:
        raise ValueError("--hot-games must be non-negative")
    if args.concurrency is not None and args.concurrency <= 0:
        raise ValueError("--concurrency must be positive")
    if args.backend_port < 1 or args.backend_port > 65535:
        raise ValueError("--backend-port must be between 1 and 65535")
    if args.rss_sample_interval_sec <= 0:
        raise ValueError("--rss-sample-interval-sec must be positive")
    if args.ws_action_jitter_ms < 0:
        raise ValueError("--ws-action-jitter-ms must be non-negative")
    if args.fresh_server_per_sweep and not args.db_copy:
        raise ValueError("--fresh-server-per-sweep requires --db-copy")


def parse_args(argv: list[str] | None = None) -> HarnessConfig:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    _validate_args(args)

    sweep = parse_sweep(args.sweep, args.games)
    hot_sweep = parse_hot_sweep(args.hot_sweep, args.hot_games)
    return HarnessConfig(
        base_url=args.base_url.rstrip("/"),
        sweep_games=sweep,
        hot_game_counts=hot_sweep,
        concurrency_override=args.concurrency,
        puppet_count=args.puppet_count,
        cube_id=args.cube_id,
        use_upgrades=args.use_upgrades,
        seed=args.seed,
        game_timeout_sec=args.game_timeout_sec,
        timeout_multiplier=args.timeout_multiplier,
        timeout_min_sec=args.timeout_min_sec,
        timeout_max_sec=args.timeout_max_sec,
        calibration_timeout_sec=args.calibration_timeout_sec,
        disable_caps=args.disable_caps,
        disable_ws_gzip=args.disable_ws_gzip,
        mock_cube_data=args.mock_cube_data,
        db_copy=args.db_copy,
        db_source=args.db_source,
        backend_port=args.backend_port,
        startup_timeout_sec=args.startup_timeout_sec,
        ops_token=args.ops_token,
        reset_runtime_between_sweeps=args.reset_runtime_between_sweeps,
        fresh_server_per_sweep=args.fresh_server_per_sweep,
        rss_sample_interval_sec=args.rss_sample_interval_sec,
        ws_action_jitter_ms=args.ws_action_jitter_ms,
        json_output=args.json,
        json_output_path=args.json_output,
    )


def write_json_report(report: dict[str, Any], output_path: str) -> None:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info("[harness] wrote json report: %s", path)


async def main_async(argv: list[str] | None = None) -> int:
    try:
        cfg = parse_args(argv)
    except ValueError as exc:
        logger.error("error: %s", exc)
        return 2

    try:
        report = await run_harness(cfg)
    except Exception as exc:
        logger.error("[harness] failed: %s", exc)
        return 1

    if cfg.json_output:
        sys.stdout.write(f"{json.dumps(report, indent=2)}\n")
    if cfg.json_output_path:
        write_json_report(report, cfg.json_output_path)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    return asyncio.run(main_async(argv))

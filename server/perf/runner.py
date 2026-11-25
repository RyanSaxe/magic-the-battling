"""Managed server lifecycle, sweep execution, calibration, and runtime resets."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Self

import httpx

from server.perf.metrics import (
    ProcessSampler,
    build_report,
    choose_timeout_seconds,
    print_summary,
    summarize_run,
    timeout_for_sweep,
)
from server.perf.models import (
    DEFAULT_BASE_URL,
    FAKE_MODE_TARGET_ELO,
    GameResult,
    HarnessConfig,
    IdleHotGame,
    RunSummary,
    cap_overrides_for,
)
from server.perf.scenarios import (
    close_idle_hot_games,
    run_one_game,
    run_one_idle_hot_game,
    run_one_multiplayer_table,
)
from server.perf.seeding import resolve_db_source, seed_puppet_histories

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


async def wait_for_health(
    base_url: str,
    timeout_sec: float,
    *,
    process: subprocess.Popen[bytes] | None = None,
) -> None:
    deadline = time.monotonic() + timeout_sec
    health_url = f"{base_url}/health"
    async with httpx.AsyncClient(timeout=2.0) as client:
        while time.monotonic() < deadline:
            if process is not None and process.poll() is not None:
                msg = f"managed server exited early with code {process.returncode}"
                raise RuntimeError(msg)
            try:
                response = await client.get(health_url)
            except httpx.HTTPError:
                await asyncio.sleep(0.3)
                continue
            http_ok = 200
            if response.status_code == http_ok:
                return
            await asyncio.sleep(0.3)
    msg = f"server health check timed out after {timeout_sec:.1f}s ({health_url})"
    raise TimeoutError(msg)


async def fetch_server_status(base_url: str, ops_token: str | None) -> dict[str, Any] | None:
    if not ops_token:
        return None

    timeout = httpx.Timeout(10.0, connect=5.0, read=10.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
            response = await client.get("/api/ops/capacity", headers={"x-ops-token": ops_token})
            response.raise_for_status()
            payload = response.json()
    except Exception:  # noqa: BLE001 -- broad boundary catch
        return None

    if not isinstance(payload, dict):
        return None

    keys = ("loaded_games", "hot_games", "pending_games", "sessions", "game_starts_in_flight")
    return {key: payload.get(key) for key in keys if key in payload}


@dataclass
class ManagedServer:
    config: HarnessConfig
    process: subprocess.Popen[bytes] | None = None
    temp_db_dir: Path | None = None
    temp_db_path: Path | None = None
    base_url: str = DEFAULT_BASE_URL
    ops_token: str = ""

    def _prepare_temp_db(self, env: dict[str, str]) -> None:
        source_db = resolve_db_source(self.config.db_source)
        temp_dir = Path(tempfile.mkdtemp(prefix="mtb-load-db-"))
        temp_db = temp_dir / source_db.name
        if source_db.exists():
            shutil.copy2(source_db, temp_db)
            logger.info("[harness] using DB copy: %s (source: %s)", temp_db, source_db)
        else:
            temp_db.touch()
            logger.info(
                "[harness] db source not found, using fresh temp DB: %s (expected source: %s)",
                temp_db,
                source_db,
            )
        self.temp_db_dir = temp_dir
        self.temp_db_path = temp_db
        env["DATABASE_PATH"] = str(temp_db)

    def _build_env(self) -> dict[str, str]:
        env = os.environ.copy()
        self.ops_token = secrets.token_urlsafe(24)
        env["MTB_OPS_TOKEN"] = self.ops_token
        if self.config.db_copy:
            self._prepare_temp_db(env)
        if self.config.disable_caps:
            env.update(
                cap_overrides_for(
                    self.config.max_requested_loaded_games,
                    max_ws_connections=self.config.max_requested_ws_connections,
                ),
            )
        env["MTB_COMPRESS_WS"] = "0" if self.config.disable_ws_gzip else "1"
        env["MTB_FAKE_CUBE_DATA"] = "1" if self.config.mock_cube_data else "0"
        # Perf runs do not exercise share-preview screenshots; disable preview startup for stability.
        env["MTB_DISABLE_PREVIEW"] = "1"
        # Perf baselines should not inherit previously snapshotted active games.
        env["MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS"] = "0"
        return env

    async def __aenter__(self) -> Self:
        self.base_url = f"http://127.0.0.1:{self.config.backend_port}"
        env = self._build_env()
        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "server.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(self.config.backend_port),
        ]
        self.process = subprocess.Popen(  # noqa: ASYNC220, S603 -- managed local server process; trusted local subprocess args
            cmd,
            cwd=Path(__file__).parents[2],
            env=env,
            start_new_session=True,
        )
        await wait_for_health(self.base_url, self.config.startup_timeout_sec, process=self.process)
        if self.temp_db_path is not None and self.config.sweep_games:
            target_elo = FAKE_MODE_TARGET_ELO if self.config.mock_cube_data else None
            seeded = seed_puppet_histories(
                self.temp_db_path,
                cube_id=self.config.cube_id,
                use_upgrades=self.config.use_upgrades,
                use_vanguards=False,
                min_histories=max(16, self.config.puppet_count * 4),
                target_elo=target_elo,
            )
            if seeded > 0:
                logger.info("[harness] seeded %s synthetic puppet histories for load runs", seeded)
        logger.info("[harness] managed server ready at %s", self.base_url)
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        if self.process is not None and self.process.poll() is None:
            with suppress(OSError):
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()

        if self.temp_db_dir is not None:
            shutil.rmtree(self.temp_db_dir, ignore_errors=True)
            logger.info("[harness] removed temp DB dir: %s", self.temp_db_dir)


async def preload_idle_hot_games(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    idle_hot_games: int,
    timeout_per_game_sec: float,
    sampler: ProcessSampler | None,
) -> tuple[list[IdleHotGame], dict[str, Any] | None, dict[str, float | int | None] | None]:
    if idle_hot_games <= 0:
        return [], None, None

    preload_mark = sampler.mark() if sampler else 0
    if sampler is not None:
        await sampler.sample_now()

    preload_concurrency = max(1, min(idle_hot_games, 50))
    semaphore = asyncio.Semaphore(preload_concurrency)

    async def _worker(idx: int) -> IdleHotGame:
        async with semaphore:
            return await run_one_idle_hot_game(client, cfg, hot_index=idx, timeout_sec=timeout_per_game_sec)

    tasks = [asyncio.create_task(_worker(idx)) for idx in range(idle_hot_games)]
    idle_games: list[IdleHotGame] = []
    try:
        idle_games.extend([await task for task in asyncio.as_completed(tasks)])
    except Exception:
        for task in tasks:
            task.cancel()
        await close_idle_hot_games(idle_games)
        raise

    preload_rss_window = None
    if sampler is not None:
        await sampler.sample_now()
        preload_rss_window = sampler.slice_window(preload_mark)

    status = await fetch_server_status(cfg.base_url, cfg.ops_token)
    return idle_games, status, preload_rss_window


async def _run_concurrent_games(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    games: int,
    concurrency: int,
    timeout_per_game_sec: float,
    scenario: str,
) -> list[GameResult]:
    semaphore = asyncio.Semaphore(concurrency)
    progress_every = max(1, games // 20)
    results: list[GameResult] = []

    async def _worker(idx: int) -> GameResult:
        async with semaphore:
            if scenario == "multiplayer":
                return await run_one_multiplayer_table(client, cfg, table_index=idx, timeout_sec=timeout_per_game_sec)
            return await run_one_game(client, cfg, game_index=idx, timeout_sec=timeout_per_game_sec)

    tasks = [asyncio.create_task(_worker(idx)) for idx in range(games)]
    for completed, task in enumerate(asyncio.as_completed(tasks), start=1):
        result = await task
        results.append(result)
        if completed % progress_every == 0 or completed == games:
            failures = sum(1 for item in results if not item.success)
            logger.info("[harness] progress %s/%s completed (failures=%s)", completed, games, failures)
    return results


def _sweep_label(cfg: HarnessConfig, *, games: int, idle_hot_games: int, scenario: str) -> str:
    if scenario == "multiplayer":
        base = f"multiplayer-tables-{games}x{cfg.players_per_table}"
    elif idle_hot_games > 0:
        base = f"load-games-{games}-hot-{idle_hot_games}"
    else:
        base = f"load-games-{games}"
    if cfg.spectators_per_game > 0:
        return f"{base}-spec-{cfg.spectators_per_game}"
    return base


async def run_sweep(
    *,
    cfg: HarnessConfig,
    games: int,
    concurrency: int,
    idle_hot_games: int,
    timeout_per_game_sec: float,
    sampler: ProcessSampler | None,
    scenario: str = "goldfish",
) -> RunSummary:
    extra_conns = cfg.players_per_table if scenario == "multiplayer" else 1
    conn_factor = extra_conns + cfg.spectators_per_game
    limits = httpx.Limits(
        max_connections=max(200, concurrency * conn_factor * 2),
        max_keepalive_connections=max(100, concurrency * conn_factor),
    )
    timeout = httpx.Timeout(30.0, connect=15.0, read=30.0, write=30.0, pool=30.0)

    started = time.perf_counter()
    preload_status = None
    preload_rss_window = None
    idle_games: list[IdleHotGame] = []

    async with httpx.AsyncClient(base_url=cfg.base_url, timeout=timeout, limits=limits) as client:
        if idle_hot_games > 0 and scenario == "goldfish":
            idle_games, preload_status, preload_rss_window = await preload_idle_hot_games(
                client,
                cfg,
                idle_hot_games=idle_hot_games,
                timeout_per_game_sec=timeout_per_game_sec,
                sampler=sampler,
            )
            logger.info(
                "[harness] preloaded idle hot games: requested=%s connected=%s status=%s",
                idle_hot_games,
                len(idle_games),
                preload_status or {},
            )

        start_mark = sampler.mark() if sampler else 0
        if sampler is not None:
            await sampler.sample_now()

        try:
            results = await _run_concurrent_games(
                client,
                cfg,
                games=games,
                concurrency=concurrency,
                timeout_per_game_sec=timeout_per_game_sec,
                scenario=scenario,
            )
        finally:
            await close_idle_hot_games(idle_games)

    wall_time = time.perf_counter() - started
    rss_stats = None
    rss_window = None
    if sampler is not None:
        await sampler.sample_now()
        rss_stats = sampler.slice_stats(start_mark)
        rss_window = sampler.slice_window(start_mark)

    summary = summarize_run(
        label=_sweep_label(cfg, games=games, idle_hot_games=idle_hot_games, scenario=scenario),
        cfg=cfg,
        games=games,
        concurrency=concurrency,
        idle_hot_games=idle_hot_games,
        timeout_per_game_sec=timeout_per_game_sec,
        wall_time_sec=wall_time,
        results=results,
        server_rss_mb=rss_stats,
        server_rss_window_mb=rss_window,
        preload_server_status=preload_status,
        preload_rss_window_mb=preload_rss_window,
        scenario=scenario,
        players_per_game=cfg.players_per_table if scenario == "multiplayer" else 1,
        puppet_count=0 if scenario == "multiplayer" else cfg.puppet_count,
    )
    print_summary(summary)
    return summary


async def calibrate_timeout(cfg: HarnessConfig, concurrency: int) -> tuple[float, GameResult]:
    calibration_timeout = cfg.game_timeout_sec or cfg.calibration_timeout_sec
    limits = httpx.Limits(max_connections=32, max_keepalive_connections=32)
    timeout = httpx.Timeout(30.0, connect=15.0, read=30.0, write=30.0, pool=30.0)
    use_multiplayer = not cfg.sweep_games and bool(cfg.multiplayer_tables)
    async with httpx.AsyncClient(base_url=cfg.base_url, timeout=timeout, limits=limits) as client:
        if use_multiplayer:
            result = await run_one_multiplayer_table(client, cfg, table_index=0, timeout_sec=calibration_timeout)
        else:
            result = await run_one_game(client, cfg, game_index=0, timeout_sec=calibration_timeout)

    if not result.success:
        msg = result.error or "calibration game failed"
        msg_0 = f"calibration failed: {msg}"
        raise RuntimeError(msg_0)

    chosen = cfg.game_timeout_sec
    if chosen is None:
        chosen = choose_timeout_seconds(
            single_game_seconds=result.duration_sec,
            concurrency=concurrency,
            multiplier=cfg.timeout_multiplier,
            min_timeout=cfg.timeout_min_sec,
            max_timeout=cfg.timeout_max_sec,
        )
    logger.info(
        "[harness] calibration complete: one game took %.2fs; timeout/game set to %.1fs",
        result.duration_sec,
        chosen,
    )
    return chosen, result


async def clear_runtime_state(base_url: str, ops_token: str) -> dict[str, Any]:
    headers = {"x-ops-token": ops_token}
    timeout = httpx.Timeout(30.0, connect=15.0, read=30.0, write=30.0, pool=30.0)
    async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
        response = await client.post("/api/ops/runtime-reset", headers=headers)
        response.raise_for_status()
        payload = response.json()
    sessions_removed = payload.get("sessions_removed", 0)
    games = payload.get("games", {})
    cleared_games = games.get("games_cleared", 0) if isinstance(games, dict) else 0
    logger.info(
        "[harness] runtime reset complete: cleared_games=%s sessions_removed=%s",
        cleared_games,
        sessions_removed,
    )
    return payload


async def _maybe_reset_runtime(
    cfg: HarnessConfig,
    *,
    ops_token: str | None,
    label: str,
    runtime_reset_results: list[dict[str, Any]],
) -> None:
    if not cfg.reset_runtime_between_sweeps:
        return
    if ops_token:
        reset = await clear_runtime_state(cfg.base_url, ops_token)
        runtime_reset_results.append({"label": label, "result": reset})
    else:
        logger.info("[harness] note: skipping %s runtime reset; ops token unavailable.", label)


def _planned_sweeps(cfg: HarnessConfig) -> list[tuple[str, int, int]]:
    plans: list[tuple[str, int, int]] = [
        ("goldfish", idle_hot_games, games) for idle_hot_games in cfg.hot_game_counts for games in cfg.sweep_games
    ]
    plans.extend(("multiplayer", 0, tables) for tables in cfg.multiplayer_tables)
    return plans


async def execute_sweeps(
    cfg: HarnessConfig,
    sampler: ProcessSampler | None,
    *,
    ops_token: str | None,
) -> dict[str, Any]:
    plans = _planned_sweeps(cfg)
    first_scenario, first_hot, first_count = plans[0]
    first_concurrency = cfg.concurrency_for(first_count)
    if first_scenario == "multiplayer":
        cal_concurrency = first_concurrency * cfg.players_per_table
    else:
        cal_concurrency = first_concurrency + first_hot
    timeout_per_game_sec, calibration_result = await calibrate_timeout(cfg, concurrency=cal_concurrency)

    sweeps: list[RunSummary] = []
    runtime_reset_results: list[dict[str, Any]] = []
    await _maybe_reset_runtime(
        cfg,
        ops_token=ops_token,
        label="post-calibration",
        runtime_reset_results=runtime_reset_results,
    )

    for idx, (scenario, idle_hot_games, games) in enumerate(plans):
        if idx > 0:
            await _maybe_reset_runtime(
                cfg,
                ops_token=ops_token,
                label=f"pre-sweep-{scenario}-{games}-hot-{idle_hot_games}",
                runtime_reset_results=runtime_reset_results,
            )

        concurrency = cfg.concurrency_for(games)
        planned_timeout = timeout_for_sweep(
            cfg,
            calibration_result,
            timeout_per_game_sec=timeout_per_game_sec,
            concurrency=concurrency * (cfg.players_per_table if scenario == "multiplayer" else 1),
            idle_hot_games=idle_hot_games,
        )
        sweeps.append(
            await run_sweep(
                cfg=cfg,
                games=games,
                concurrency=concurrency,
                idle_hot_games=idle_hot_games,
                timeout_per_game_sec=planned_timeout,
                sampler=sampler,
                scenario=scenario,
            ),
        )

    await _maybe_reset_runtime(
        cfg,
        ops_token=ops_token,
        label="post-sweeps",
        runtime_reset_results=runtime_reset_results,
    )

    return build_report(
        cfg,
        calibration_result=calibration_result,
        timeout_per_game_sec=timeout_per_game_sec,
        runtime_reset_results=runtime_reset_results,
        sweeps=sweeps,
    )


@asynccontextmanager
async def _managed_server_with_sampler(
    cfg: HarnessConfig,
) -> AsyncGenerator[tuple[ManagedServer, ProcessSampler | None]]:
    async with ManagedServer(cfg) as managed:
        cfg.base_url = managed.base_url
        cfg.ops_token = managed.ops_token
        sampler = (
            ProcessSampler(managed.process.pid, interval_sec=cfg.rss_sample_interval_sec)
            if managed.process is not None
            else None
        )
        if sampler is not None:
            await sampler.start()
        try:
            yield managed, sampler
        finally:
            if sampler is not None:
                await sampler.stop()


async def run_with_managed_server(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.base_url != DEFAULT_BASE_URL:
        logger.info("[harness] --db-copy uses a managed local server; ignoring --base-url=%s", cfg.base_url)

    async with _managed_server_with_sampler(cfg) as (managed, sampler):
        return await execute_sweeps(cfg, sampler, ops_token=managed.ops_token)


async def run_with_fresh_server_per_sweep(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.base_url != DEFAULT_BASE_URL:
        logger.info("[harness] --db-copy uses a managed local server; ignoring --base-url=%s", cfg.base_url)

    plans = _planned_sweeps(cfg)
    first_scenario, first_hot, first_count = plans[0]
    first_concurrency = cfg.concurrency_for(first_count)
    cal_concurrency = (
        first_concurrency * cfg.players_per_table if first_scenario == "multiplayer" else first_concurrency + first_hot
    )

    async with ManagedServer(cfg) as managed:
        cfg.base_url = managed.base_url
        cfg.ops_token = managed.ops_token
        timeout_per_game_sec, calibration_result = await calibrate_timeout(cfg, concurrency=cal_concurrency)

    sweeps: list[RunSummary] = []
    for scenario, idle_hot_games, games in plans:
        concurrency = cfg.concurrency_for(games)
        planned_timeout = timeout_for_sweep(
            cfg,
            calibration_result,
            timeout_per_game_sec=timeout_per_game_sec,
            concurrency=concurrency * (cfg.players_per_table if scenario == "multiplayer" else 1),
            idle_hot_games=idle_hot_games,
        )
        async with _managed_server_with_sampler(cfg) as (_managed, sampler):
            sweep_summary = await run_sweep(
                cfg=cfg,
                games=games,
                concurrency=concurrency,
                idle_hot_games=idle_hot_games,
                timeout_per_game_sec=planned_timeout,
                sampler=sampler,
                scenario=scenario,
            )
        sweeps.append(sweep_summary)

    return build_report(
        cfg,
        calibration_result=calibration_result,
        timeout_per_game_sec=timeout_per_game_sec,
        runtime_reset_results=[],
        sweeps=sweeps,
    )


async def run_against_existing_server(cfg: HarnessConfig) -> dict[str, Any]:
    await wait_for_health(cfg.base_url, timeout_sec=30.0)
    if cfg.disable_caps:
        logger.info("[harness] note: --disable-caps cannot modify an already-running external server.")
    if cfg.disable_ws_gzip:
        logger.info("[harness] note: --disable-ws-gzip cannot modify an already-running external server.")
    if cfg.mock_cube_data:
        logger.info("[harness] note: --mock-cube-data only applies when harness manages the server process.")
    if cfg.fresh_server_per_sweep:
        logger.info("[harness] note: --fresh-server-per-sweep requires --db-copy and is ignored for external servers.")
    if cfg.reset_runtime_between_sweeps and not cfg.ops_token:
        logger.info("[harness] note: runtime reset requires --ops-token when targeting an external server.")
    return await execute_sweeps(cfg, sampler=None, ops_token=cfg.ops_token)


async def run_harness(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.db_copy:
        if cfg.fresh_server_per_sweep:
            return await run_with_fresh_server_per_sweep(cfg)
        return await run_with_managed_server(cfg)
    return await run_against_existing_server(cfg)

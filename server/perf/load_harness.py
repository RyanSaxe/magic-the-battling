from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import math
import os
import random
import secrets
import shutil
import signal
import sqlite3
import statistics
import subprocess
import sys
import tempfile
import time
from collections import Counter
from contextlib import closing
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse

import httpx
import websockets

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_BACKEND_PORT = 8000
VALID_PUPPET_COUNTS = (1, 3, 5, 7)
BASIC_LANDS = ("Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes")
TERMINAL_PHASES = {"winner", "game_over", "eliminated"}
PASSIVE_PHASES = {"awaiting_elimination"}
RETRYABLE_CREATE_STATUSES = {408, 425, 429, 500, 502, 503, 504}
CREATE_RETRY_BASE_SEC = 0.15
CREATE_RETRY_MAX_SEC = 3.0
WS_CONNECT_RETRY_BASE_SEC = 0.10
WS_CONNECT_RETRY_MAX_SEC = 2.0
IDEMPOTENCY_KEY_HEADER = "x-mtb-idempotency-key"
PUPPET_HISTORY_ELO_WINDOW = 200.0
FAKE_MODE_TARGET_ELO = 1000.0


class GameFlowError(RuntimeError):
    """Raised when the harness receives a game/action error from the server."""


@dataclass
class GameResult:
    index: int
    success: bool = False
    duration_sec: float = 0.0
    error: str | None = None
    game_id: str | None = None
    final_phase: str | None = None
    final_stage: int | None = None
    final_round: int | None = None
    create_game_ms: float | None = None
    ws_connect_ms: float | None = None
    start_game_ms: float | None = None
    actions_sent: int = 0
    action_latencies_ms: list[float] = field(default_factory=list)
    action_latencies_by_type_ms: dict[str, list[float]] = field(default_factory=dict)

    def record_action(self, action: str, latency_ms: float) -> None:
        self.actions_sent += 1
        self.action_latencies_ms.append(latency_ms)
        bucket = self.action_latencies_by_type_ms.setdefault(action, [])
        bucket.append(latency_ms)


@dataclass
class RunSummary:
    label: str
    games: int
    concurrency: int
    puppet_count: int
    timeout_per_game_sec: float
    wall_time_sec: float
    completed: int
    succeeded: int
    failed: int
    throughput_games_per_sec: float
    duration_stats_sec: dict[str, float | int | None]
    create_game_stats_ms: dict[str, float | int | None]
    ws_connect_stats_ms: dict[str, float | int | None]
    start_game_stats_ms: dict[str, float | int | None]
    action_latency_stats_ms: dict[str, float | int | None]
    action_latency_by_type_ms: dict[str, dict[str, float | int | None]]
    failure_reasons: dict[str, int]
    final_phase_counts: dict[str, int]
    terminal_stage_round_counts: dict[str, int]
    server_rss_mb: dict[str, float | int | None] | None = None
    server_rss_window_mb: dict[str, float | int | None] | None = None
    server_rss_per_game_mb: dict[str, float | int | None] | None = None


@dataclass
class HarnessConfig:
    base_url: str
    sweep_games: list[int]
    concurrency_override: int | None
    puppet_count: int
    cube_id: str
    use_upgrades: bool
    seed: int
    game_timeout_sec: float | None
    timeout_multiplier: float
    timeout_min_sec: float
    timeout_max_sec: float
    calibration_timeout_sec: float
    disable_caps: bool
    disable_ws_gzip: bool
    mock_cube_data: bool
    db_copy: bool
    db_source: str | None
    backend_port: int
    startup_timeout_sec: float
    ops_token: str | None
    reset_runtime_between_sweeps: bool
    fresh_server_per_sweep: bool
    rss_sample_interval_sec: float
    ws_action_jitter_ms: float
    json_output: bool
    json_output_path: str | None

    @property
    def max_requested_games(self) -> int:
        return max(self.sweep_games)

    def concurrency_for(self, games: int) -> int:
        if self.concurrency_override is None:
            return games
        return max(1, min(games, self.concurrency_override))


@dataclass
class ManagedServer:
    config: HarnessConfig
    process: subprocess.Popen | None = None
    temp_db_dir: Path | None = None
    temp_db_path: Path | None = None
    base_url: str = DEFAULT_BASE_URL
    ops_token: str = ""

    async def __aenter__(self) -> ManagedServer:
        self.base_url = f"http://127.0.0.1:{self.config.backend_port}"
        env = os.environ.copy()
        self.ops_token = secrets.token_urlsafe(24)
        env["MTB_OPS_TOKEN"] = self.ops_token

        if self.config.db_copy:
            source_db = resolve_db_source(self.config.db_source)
            temp_dir = Path(tempfile.mkdtemp(prefix="mtb-load-db-"))
            temp_db = temp_dir / source_db.name
            if source_db.exists():
                shutil.copy2(source_db, temp_db)
                print(f"[harness] using DB copy: {temp_db} (source: {source_db})")
            else:
                temp_db.touch()
                print(f"[harness] db source not found, using fresh temp DB: {temp_db} (expected source: {source_db})")
            self.temp_db_dir = temp_dir
            self.temp_db_path = temp_db
            env["DATABASE_PATH"] = str(temp_db)

        if self.config.disable_caps:
            env.update(cap_overrides_for(self.config.max_requested_games))

        env["MTB_COMPRESS_WS"] = "0" if self.config.disable_ws_gzip else "1"
        env["MTB_FAKE_CUBE_DATA"] = "1" if self.config.mock_cube_data else "0"
        # Perf runs do not exercise share-preview screenshots; disable preview startup for stability.
        env["MTB_DISABLE_PREVIEW"] = "1"
        # Perf baselines should not inherit previously snapshotted active games.
        env["MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS"] = "0"

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "server.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(self.config.backend_port),
        ]
        self.process = subprocess.Popen(
            cmd,
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            start_new_session=True,
        )
        await wait_for_health(self.base_url, self.config.startup_timeout_sec, self.process)
        if self.temp_db_path is not None:
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
                print(f"[harness] seeded {seeded} synthetic puppet histories for load runs")
        print(f"[harness] managed server ready at {self.base_url}")
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self.process is not None and self.process.poll() is None:
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
            except OSError:
                pass
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()

        if self.temp_db_dir is not None:
            shutil.rmtree(self.temp_db_dir, ignore_errors=True)
            print(f"[harness] removed temp DB dir: {self.temp_db_dir}")


class ProcessSampler:
    def __init__(self, pid: int, interval_sec: float = 0.25) -> None:
        self._pid = pid
        self._interval_sec = interval_sec
        self._task: asyncio.Task | None = None
        self._values: list[float] = []

    def mark(self) -> int:
        return len(self._values)

    async def sample_now(self) -> None:
        value = await asyncio.to_thread(read_process_rss_mb, self._pid)
        if value is not None:
            self._values.append(value)

    async def start(self) -> None:
        if self._task is not None:
            return

        async def _loop() -> None:
            while True:
                await self.sample_now()
                await asyncio.sleep(self._interval_sec)

        self._task = asyncio.create_task(_loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        self._task = None

    def slice_stats(self, start_idx: int) -> dict[str, float | int | None]:
        return stats_dict(self._values[start_idx:])

    def slice_window(self, start_idx: int) -> dict[str, float | int | None]:
        return rss_window_dict(self._values[start_idx:])


@dataclass
class PhaseContext:
    ws: Any
    deadline: float
    result: GameResult
    rng: random.Random
    ws_action_jitter_ms: float = 0.0


def resolve_db_source(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "data" / "mtb.db").resolve()


def _mock_snapshot_card(seed: str, idx: int) -> dict[str, Any]:
    sid = f"seed-{seed}-{idx:02d}"
    return {
        "id": sid,
        "scryfall_id": sid,
        "upgrade_target": None,
        "original_owner": None,
    }


def _mock_snapshot_card_data(seed: str, idx: int) -> tuple[str, dict[str, Any]]:
    sid = f"seed-{seed}-{idx:02d}"
    return sid, {
        "name": f"seed_card_{seed}_{idx}",
        "image_url": f"https://example.invalid/seed/{seed}/{idx}.jpg",
        "type_line": "creature",
        "flip_image_url": None,
        "png_url": None,
        "flip_png_url": None,
        "elo": 0.0,
        "oracle_text": None,
        "colors": [],
        "keywords": [],
        "cmc": 0.0,
        "life_modifier": None,
        "hand_modifier": None,
        "token_scryfall_ids": [],
    }


def _seed_history_payload(seed: int) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    hand = [_mock_snapshot_card(str(seed), idx) for idx in range(7)]
    registry: dict[str, Any] = {}
    for idx in range(7):
        sid, card_data = _mock_snapshot_card_data(str(seed), idx)
        registry[sid] = card_data
    basics = ["Plains", "Island", "Swamp"]
    snapshot_data = {
        "hand": hand,
        "vanguard": None,
        "basic_lands": basics,
        "applied_upgrades": [],
        "upgrades": [],
        "treasures": 1,
        "sideboard": [],
        "command_zone": [],
        "poison": 0,
        "play_draw_preference": "play",
    }
    full_state = {"data": snapshot_data, "card_registry": registry}
    return full_state, hand, basics


def _is_suspicious_name(name: str) -> bool:
    if not name or len(name) <= 1:
        return True
    if name.isdigit():
        return True
    lower = name.lower()
    if lower in ("test", "testing", "asdf", "qwerty"):
        return True
    return len(set(lower)) == 1


def _is_varied_basics_json(raw: Any) -> bool:
    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if not isinstance(raw, str):
        raw = str(raw)
    if not raw:
        return False
    try:
        basics = json.loads(raw)
    except Exception:
        return False
    if not isinstance(basics, list) or not basics:
        return False
    return len({str(b) for b in basics}) > 1


def _count_usable_histories(
    conn: sqlite3.Connection,
    *,
    config_json: str,
    target_elo: float | None,
    elo_window: float,
) -> int:
    rows = conn.execute(
        """
        SELECT h.player_name, h.battler_elo, s.basic_lands_json
        FROM player_game_history h
        JOIN games g ON g.id = h.game_id
        JOIN battle_snapshots s ON s.player_history_id = h.id
        WHERE h.max_stage >= 6
          AND g.config_json = ?
          AND s.stage = 3
          AND s.round = 1
        """,
        (config_json,),
    ).fetchall()

    usable = 0
    for player_name, battler_elo, basics_json in rows:
        name = str(player_name or "")
        if _is_suspicious_name(name):
            continue
        if not _is_varied_basics_json(basics_json):
            continue
        if target_elo is not None:
            try:
                elo = float(battler_elo)
            except (TypeError, ValueError):
                continue
            if abs(elo - target_elo) > elo_window:
                continue
        usable += 1

    return usable


def seed_puppet_histories(
    db_path: Path,
    *,
    cube_id: str,
    use_upgrades: bool,
    use_vanguards: bool,
    min_histories: int,
    target_elo: float | None = None,
    elo_window: float = PUPPET_HISTORY_ELO_WINDOW,
) -> int:
    config_json = json.dumps(
        {
            "use_upgrades": use_upgrades,
            "use_vanguards": use_vanguards,
            "cube_id": cube_id,
        }
    )

    with closing(sqlite3.connect(str(db_path))) as conn:
        conn.execute("PRAGMA busy_timeout=5000")
        usable_count = _count_usable_histories(
            conn,
            config_json=config_json,
            target_elo=target_elo,
            elo_window=elo_window,
        )
        missing = max(0, min_histories - usable_count)
        if missing == 0:
            return 0

        inserted = 0
        for idx in range(missing):
            suffix = secrets.token_hex(4)
            game_id = f"perf_seed_game_{suffix}_{idx}"
            player_name = f"ArchivePilot{idx + 1:04d}"
            base_elo = target_elo if target_elo is not None else 1200.0
            elo = base_elo + float(((idx % 9) - 4) * 15)
            full_state, hand, basics = _seed_history_payload(idx)

            conn.execute(
                """
                INSERT INTO games (id, config_json, shared)
                VALUES (?, ?, 0)
                """,
                (game_id, config_json),
            )
            cursor = conn.execute(
                """
                INSERT INTO player_game_history
                  (game_id, player_name, battler_elo, max_stage, max_round, final_placement, is_puppet)
                VALUES (?, ?, ?, 6, 3, 2, 0)
                """,
                (game_id, player_name, elo),
            )
            rowid = cursor.lastrowid
            if rowid is None:
                msg = "failed to insert seeded player_game_history row"
                raise RuntimeError(msg)
            history_id = int(rowid)
            conn.execute(
                """
                INSERT INTO battle_snapshots
                  (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
                   applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
                VALUES (?, 3, 1, ?, NULL, ?, ?, 1, 0, 'play', ?)
                """,
                (
                    history_id,
                    json.dumps(hand),
                    json.dumps(basics),
                    json.dumps([]),
                    json.dumps(full_state),
                ),
            )
            inserted += 1

        conn.commit()
        return inserted


def cap_overrides_for(max_games: int) -> dict[str, str]:
    scale = max(1, max_games)
    return {
        "MTB_MAX_HOT_GAMES": str(max(1_000, scale * 3)),
        "MTB_MAX_TOTAL_LOADED_GAMES_HARD": str(max(1_500, scale * 4)),
        "MTB_MAX_PENDING_GAMES": str(max(1_000, scale * 3)),
        "MTB_MAX_WS_CONNECTIONS": str(max(2_000, scale * 4)),
        "MTB_MAX_SESSIONS_TOTAL": str(max(50_000, scale * 20)),
    }


async def wait_for_health(base_url: str, timeout_sec: float, process: subprocess.Popen | None = None) -> None:
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
            if response.status_code == 200:
                return
            await asyncio.sleep(0.3)
    msg = f"server health check timed out after {timeout_sec:.1f}s ({health_url})"
    raise TimeoutError(msg)


def read_process_rss_mb(pid: int) -> float | None:
    cmd = ["ps", "-o", "rss=", "-p", str(pid)]
    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None

    try:
        rss_kb = int(raw)
    except ValueError:
        return None
    return rss_kb / 1024.0


def parse_sweep(raw: str | None, fallback_games: int) -> list[int]:
    if raw is None:
        return [fallback_games]

    values: list[int] = []
    seen: set[int] = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            parsed = int(token)
        except ValueError as exc:
            msg = f"invalid sweep value: {token}"
            raise ValueError(msg) from exc
        if parsed <= 0:
            msg = f"sweep value must be positive: {parsed}"
            raise ValueError(msg)
        if parsed not in seen:
            values.append(parsed)
            seen.add(parsed)

    if not values:
        msg = "--sweep did not contain any positive integers"
        raise ValueError(msg)
    return values


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = (len(ordered) - 1) * p
    lower = math.floor(idx)
    upper = math.ceil(idx)
    if lower == upper:
        return ordered[lower]
    lower_value = ordered[lower]
    upper_value = ordered[upper]
    fraction = idx - lower
    return lower_value + (upper_value - lower_value) * fraction


def stats_dict(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {
            "count": 0,
            "avg": None,
            "min": None,
            "p50": None,
            "p95": None,
            "p99": None,
            "max": None,
        }
    return {
        "count": len(values),
        "avg": statistics.fmean(values),
        "min": min(values),
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "p99": percentile(values, 0.99),
        "max": max(values),
    }


def rss_window_dict(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {
            "count": 0,
            "start": None,
            "end": None,
            "peak": None,
            "delta_end": None,
            "delta_peak": None,
        }
    start = values[0]
    end = values[-1]
    peak = max(values)
    return {
        "count": len(values),
        "start": start,
        "end": end,
        "peak": peak,
        "delta_end": end - start,
        "delta_peak": peak - start,
    }


def choose_timeout_seconds(
    single_game_seconds: float,
    concurrency: int,
    multiplier: float,
    min_timeout: float,
    max_timeout: float,
    assumed_start_slots: int = 100,
) -> float:
    # At high concurrency, per-game wall time can scale close to linearly due event-loop
    # contention and game-start queueing; include a linear term to avoid optimistic timeouts.
    concurrency_factor = max(1.0, min(5.0, math.sqrt(max(concurrency, 1) / 25.0)))
    queue_factor = max(1.0, math.sqrt(max(concurrency, 1) / max(assumed_start_slots, 1)))
    scaled_factor = max(concurrency_factor * queue_factor, float(max(concurrency, 1)) * 1.5)
    computed = single_game_seconds * multiplier * scaled_factor
    return max(min_timeout, min(max_timeout, computed))


def ws_url_for(base_url: str, game_id: str, session_id: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    query = urlencode({"session_id": session_id})
    return urlunparse((scheme, parsed.netloc, f"/ws/{game_id}", "", query, ""))


def decode_ws_message(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        try:
            text = gzip.decompress(raw).decode("utf-8")
        except OSError:
            text = raw.decode("utf-8")
    else:
        text = raw

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        msg = "websocket payload is not an object"
        raise GameFlowError(msg)
    return parsed


def remaining_timeout(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("game exceeded timeout")
    return remaining


def retry_delay_sec(attempt: int, base_sec: float, max_sec: float) -> float:
    exp = min(max_sec, base_sec * (2**attempt))
    return random.random() * exp


async def recv_ws_message(ctx: PhaseContext) -> dict[str, Any]:
    raw = await asyncio.wait_for(ctx.ws.recv(), timeout=remaining_timeout(ctx.deadline))
    return decode_ws_message(raw)


async def send_ws_action(ws: Any, action: str, payload: dict[str, Any] | None = None) -> None:
    await ws.send(json.dumps({"action": action, "payload": payload or {}}))


async def maybe_apply_action_jitter(ctx: PhaseContext) -> None:
    if ctx.ws_action_jitter_ms <= 0:
        return
    delay_ms = ctx.rng.uniform(0.0, ctx.ws_action_jitter_ms)
    delay_sec = delay_ms / 1000.0
    if delay_sec <= 0:
        return
    await asyncio.sleep(min(delay_sec, remaining_timeout(ctx.deadline)))


async def wait_for_game_state(ctx: PhaseContext) -> dict[str, Any]:
    while True:
        message = await recv_ws_message(ctx)
        msg_type = message.get("type")
        payload = message.get("payload", {})

        if msg_type == "error":
            msg = payload.get("message", "Unknown game error")
            raise GameFlowError(str(msg))

        if msg_type == "game_bootstrap":
            if isinstance(payload, dict):
                state = payload.get("state")
                if isinstance(state, dict):
                    return state
            raise GameFlowError("game_bootstrap payload did not contain object state")

        if msg_type == "game_state":
            if isinstance(payload, dict):
                return payload
            msg = "game_state payload was not an object"
            raise GameFlowError(msg)

        if msg_type in {"server_notice", "game_over", "lobby_state"}:
            continue

        if msg_type == "kicked":
            raise GameFlowError("player was kicked")


async def send_action_and_wait_state(
    ctx: PhaseContext,
    action: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    await maybe_apply_action_jitter(ctx)
    started = time.perf_counter()
    await send_ws_action(ctx.ws, action, payload)
    state = await wait_for_game_state(ctx)
    latency_ms = (time.perf_counter() - started) * 1000.0
    ctx.result.record_action(action, latency_ms)
    return state


def choose_swap_target(self_player: dict[str, Any]) -> tuple[str, str]:
    if self_player.get("sideboard"):
        card = self_player["sideboard"][0]
        return str(card["id"]), "sideboard"
    if self_player.get("hand"):
        card = self_player["hand"][0]
        return str(card["id"]), "hand"
    upgrades = self_player.get("upgrades") or []
    if upgrades:
        return str(upgrades[0]["id"]), "upgrades"
    msg = "no card available to swap from player pool"
    raise GameFlowError(msg)


async def draft_swap_once(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    self_player = state["self_player"]
    current_pack = self_player.get("current_pack") or []
    if not current_pack:
        raise GameFlowError("draft pack is empty")
    pack_card_id = str(current_pack[0]["id"])
    player_card_id, destination = choose_swap_target(self_player)
    payload = {
        "pack_card_id": pack_card_id,
        "player_card_id": player_card_id,
        "destination": destination,
    }
    return await send_action_and_wait_state(ctx, "draft_swap", payload)


async def play_draft_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await draft_swap_once(ctx, state)
    state = await draft_swap_once(ctx, state)

    treasures = int(state["self_player"].get("treasures", 0))
    if treasures <= 0:
        raise GameFlowError("draft_roll requested but player has no treasures")
    state = await send_action_and_wait_state(ctx, "draft_roll")

    state = await draft_swap_once(ctx, state)
    state = await send_action_and_wait_state(ctx, "draft_done")
    return state


async def apply_pending_build_upgrades(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    while True:
        self_player = state["self_player"]
        pending = [
            upgrade
            for upgrade in self_player.get("upgrades", [])
            if upgrade.get("upgrade_target_id") is None and upgrade.get("upgrade_target") is None
        ]
        if not pending:
            return state
        hand = self_player.get("hand", [])
        if not hand:
            raise GameFlowError("cannot apply build upgrade: hand is empty")
        payload = {
            "upgrade_id": str(pending[0]["id"]),
            "target_card_id": str(hand[0]["id"]),
        }
        state = await send_action_and_wait_state(ctx, "build_apply_upgrade", payload)


async def play_build_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    while True:
        self_player = state["self_player"]
        hand = self_player.get("hand", [])
        hand_size = int(self_player.get("hand_size", 0))
        if len(hand) >= hand_size:
            break
        sideboard = self_player.get("sideboard", [])
        if not sideboard:
            raise GameFlowError("cannot fill hand: sideboard is empty")
        payload = {
            "card_id": str(sideboard[0]["id"]),
            "source": "sideboard",
            "destination": "hand",
        }
        state = await send_action_and_wait_state(ctx, "build_move", payload)

    state = await apply_pending_build_upgrades(ctx, state)

    self_player = state["self_player"]
    if self_player.get("hand") and self_player.get("sideboard"):
        payload = {
            "card_a_id": str(self_player["hand"][0]["id"]),
            "source_a": "hand",
            "card_b_id": str(self_player["sideboard"][0]["id"]),
            "source_b": "sideboard",
        }
        state = await send_action_and_wait_state(ctx, "build_swap", payload)

    basics = ctx.rng.sample(list(BASIC_LANDS), 3)
    hand_order = [str(card["id"]) for card in state["self_player"].get("hand", [])]
    payload = {
        "basics": basics,
        "play_draw_preference": "play",
        "hand_order": hand_order,
    }
    return await send_action_and_wait_state(ctx, "build_ready", payload)


async def ensure_current_battle(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    candidate = state
    for _ in range(4):
        if candidate.get("current_battle"):
            return candidate
        candidate = await wait_for_game_state(ctx)
    raise GameFlowError("battle phase reached without current_battle payload")


async def play_battle_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    state = await ensure_current_battle(ctx, state)

    while True:
        battle = state.get("current_battle") or {}
        your_zones = battle.get("your_zones") or {}
        hand = your_zones.get("hand") or []
        if not hand:
            break
        payload = {
            "card_id": str(hand[0]["id"]),
            "from_zone": "hand",
            "to_zone": "battlefield",
        }
        state = await send_action_and_wait_state(ctx, "battle_move", payload)

    for _ in range(2):
        payload = {
            "action_type": "create_treasure",
            "card_id": "",
            "data": {},
        }
        state = await send_action_and_wait_state(ctx, "battle_update_card_state", payload)

    winner_name = str(state["self_player"]["name"])
    return await send_action_and_wait_state(ctx, "battle_submit_result", {"result": winner_name})


async def play_reward_phase(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    self_player = state["self_player"]
    available_upgrades = state.get("available_upgrades") or []
    if bool(self_player.get("is_stage_increasing")) and available_upgrades:
        choice = ctx.rng.choice(available_upgrades)
        return await send_action_and_wait_state(ctx, "reward_done", {"upgrade_id": str(choice["id"])})
    return await send_action_and_wait_state(ctx, "reward_done")


async def wait_for_lobby_or_game_state(ctx: PhaseContext) -> tuple[str, dict[str, Any]]:
    while True:
        message = await recv_ws_message(ctx)
        msg_type = message.get("type")
        payload = message.get("payload", {})

        if msg_type == "error":
            msg = payload.get("message", "Unknown lobby error")
            raise GameFlowError(str(msg))

        if msg_type == "game_bootstrap":
            if isinstance(payload, dict):
                state = payload.get("state")
                if isinstance(state, dict):
                    return "game_bootstrap", state
            raise GameFlowError("game_bootstrap payload did not contain object state")

        if msg_type == "game_state":
            if isinstance(payload, dict):
                return "game_state", payload
            raise GameFlowError("game_state payload was not an object")

        if msg_type == "lobby_state":
            if isinstance(payload, dict):
                return "lobby_state", payload
            raise GameFlowError("lobby_state payload was not an object")

        if msg_type in {"server_notice", "game_over"}:
            continue


async def enter_game_from_lobby(ctx: PhaseContext) -> dict[str, Any]:
    ready_sent = False
    start_sent = False
    start_sent_at: float | None = None

    while True:
        msg_type, payload = await wait_for_lobby_or_game_state(ctx)
        if msg_type in {"game_state", "game_bootstrap"}:
            return payload

        can_start = bool(payload.get("can_start", False))
        if not ready_sent:
            await maybe_apply_action_jitter(ctx)
            await send_ws_action(ctx.ws, "set_ready", {"is_ready": True})
            ready_sent = True
            continue

        if can_start and not start_sent:
            start_sent = True
            await maybe_apply_action_jitter(ctx)
            start_sent_at = time.perf_counter()
            await send_ws_action(ctx.ws, "start_game")
            state = await wait_for_game_state(ctx)
            if start_sent_at is not None:
                ctx.result.start_game_ms = (time.perf_counter() - start_sent_at) * 1000.0
            return state


async def play_until_terminal(ctx: PhaseContext, state: dict[str, Any]) -> dict[str, Any]:
    current = state
    while True:
        self_player = current.get("self_player") or {}
        phase = str(self_player.get("phase", ""))
        if phase in TERMINAL_PHASES:
            return current

        if phase == "draft":
            current = await play_draft_phase(ctx, current)
            continue
        if phase == "build":
            current = await play_build_phase(ctx, current)
            continue
        if phase == "battle":
            current = await play_battle_phase(ctx, current)
            continue
        if phase == "reward":
            current = await play_reward_phase(ctx, current)
            continue
        if phase in PASSIVE_PHASES:
            current = await wait_for_game_state(ctx)
            continue

        msg = f"unsupported phase encountered: {phase or '<empty>'}"
        raise GameFlowError(msg)


def build_create_game_payload(player_name: str, cfg: HarnessConfig) -> dict[str, Any]:
    return {
        "player_name": player_name,
        "cube_id": cfg.cube_id,
        "use_upgrades": cfg.use_upgrades,
        "target_player_count": cfg.puppet_count + 1,
        "puppet_count": cfg.puppet_count,
        "auto_approve_spectators": False,
    }


async def _sleep_retry_or_timeout(
    *,
    deadline: float,
    attempt: int,
    base_sec: float,
    max_sec: float,
    exhausted_message: str,
) -> None:
    remaining = remaining_timeout(deadline)
    delay = retry_delay_sec(attempt, base_sec, max_sec)
    if delay >= remaining:
        raise TimeoutError(exhausted_message)
    await asyncio.sleep(delay)


async def create_game_with_retry(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    *,
    player_name: str,
    deadline: float,
    idempotency_key: str,
) -> tuple[str, str, float]:
    create_started = time.perf_counter()
    create_attempt = 0
    create_payload = build_create_game_payload(player_name, cfg)

    while True:
        create_attempt += 1
        try:
            response = await client.post(
                "/api/games",
                json=create_payload,
                headers={IDEMPOTENCY_KEY_HEADER: idempotency_key},
            )
        except httpx.HTTPError as exc:
            msg = f"create_game retries exhausted: {exc}"
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=create_attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=msg,
            )
            continue

        if response.status_code in RETRYABLE_CREATE_STATUSES:
            detail = response.text.strip()
            msg = f"create_game retry window exhausted ({response.status_code}: {detail})"
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=create_attempt,
                base_sec=CREATE_RETRY_BASE_SEC,
                max_sec=CREATE_RETRY_MAX_SEC,
                exhausted_message=msg,
            )
            continue

        response.raise_for_status()
        payload = response.json()
        game_id = str(payload["game_id"])
        session_id = str(payload["session_id"])
        create_ms = (time.perf_counter() - create_started) * 1000.0
        return game_id, session_id, create_ms


async def connect_ws_with_retry(
    *,
    ws_uri: str,
    deadline: float,
) -> tuple[Any, float]:
    ws_started = time.perf_counter()
    ws_attempt = 0

    while True:
        ws_attempt += 1
        try:
            ws = await websockets.connect(
                ws_uri,
                max_size=None,
                open_timeout=min(30.0, remaining_timeout(deadline)),
                close_timeout=5,
            )
            ws_connect_ms = (time.perf_counter() - ws_started) * 1000.0
            return ws, ws_connect_ms
        except Exception as exc:
            msg = f"ws connect retries exhausted: {exc}"
            await _sleep_retry_or_timeout(
                deadline=deadline,
                attempt=ws_attempt,
                base_sec=WS_CONNECT_RETRY_BASE_SEC,
                max_sec=WS_CONNECT_RETRY_MAX_SEC,
                exhausted_message=msg,
            )


def record_terminal_state(result: GameResult, state: dict[str, Any]) -> None:
    self_player = state.get("self_player") or {}
    phase = str(self_player.get("phase", ""))
    result.final_phase = phase
    result.final_stage = _to_int(self_player.get("stage"))
    result.final_round = _to_int(self_player.get("round"))
    result.success = phase in TERMINAL_PHASES
    if not result.success:
        result.error = f"terminal phase not reached (final phase: {phase})"


async def run_one_game(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    game_index: int,
    timeout_sec: float,
) -> GameResult:
    result = GameResult(index=game_index)
    game_started_at = time.perf_counter()
    player_name = f"PerfPlayer-{game_index:05d}-{cfg.seed}"
    deadline = time.monotonic() + timeout_sec
    idempotency_key = f"perf-{cfg.seed}-{game_index}-{secrets.token_urlsafe(6)}"

    ws = None
    try:
        game_id, session_id, create_ms = await create_game_with_retry(
            client,
            cfg,
            player_name=player_name,
            deadline=deadline,
            idempotency_key=idempotency_key,
        )
        result.create_game_ms = create_ms
        result.game_id = game_id

        ws_uri = ws_url_for(cfg.base_url, game_id, session_id)
        ws, ws_connect_ms = await connect_ws_with_retry(ws_uri=ws_uri, deadline=deadline)
        result.ws_connect_ms = ws_connect_ms

        rng = random.Random(cfg.seed + game_index)
        ctx = PhaseContext(
            ws=ws,
            deadline=deadline,
            result=result,
            rng=rng,
            ws_action_jitter_ms=cfg.ws_action_jitter_ms,
        )

        state = await enter_game_from_lobby(ctx)
        state = await play_until_terminal(ctx, state)
        record_terminal_state(result, state)

    except TimeoutError as exc:
        result.error = f"timeout: {exc}"
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        detail = exc.response.text.strip()
        result.error = f"http {status}: {detail}"
    except GameFlowError as exc:
        result.error = str(exc)
    except Exception as exc:
        result.error = f"unexpected: {exc}"
    finally:
        result.duration_sec = time.perf_counter() - game_started_at
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass
    return result


def summarize_run(
    label: str,
    cfg: HarnessConfig,
    games: int,
    concurrency: int,
    timeout_per_game_sec: float,
    wall_time_sec: float,
    results: list[GameResult],
    server_rss_mb: dict[str, float | int | None] | None,
    server_rss_window_mb: dict[str, float | int | None] | None,
) -> RunSummary:
    completed = len(results)
    succeeded = sum(1 for result in results if result.success)
    failed = completed - succeeded

    duration_values = [result.duration_sec for result in results]
    create_values = [result.create_game_ms for result in results if result.create_game_ms is not None]
    ws_values = [result.ws_connect_ms for result in results if result.ws_connect_ms is not None]
    start_values = [result.start_game_ms for result in results if result.start_game_ms is not None]
    action_values = [lat for result in results for lat in result.action_latencies_ms]

    by_action: dict[str, list[float]] = {}
    for result in results:
        for action, latencies in result.action_latencies_by_type_ms.items():
            by_action.setdefault(action, []).extend(latencies)

    failure_reasons = Counter()
    final_phase_counts = Counter()
    terminal_stage_round_counts = Counter()
    for result in results:
        final_phase_counts[result.final_phase or "<unknown>"] += 1
        if result.final_stage is not None and result.final_round is not None:
            terminal_stage_round_counts[f"{result.final_stage}-{result.final_round}"] += 1
        if not result.success and result.error:
            failure_reasons[result.error] += 1

    action_by_type = {action: stats_dict(latencies) for action, latencies in sorted(by_action.items())}

    throughput = 0.0
    if wall_time_sec > 0:
        throughput = succeeded / wall_time_sec

    rss_per_game = None
    if server_rss_window_mb and succeeded > 0:
        delta_end = server_rss_window_mb.get("delta_end")
        delta_peak = server_rss_window_mb.get("delta_peak")
        rss_per_game = {
            "count": succeeded,
            "delta_end_per_game": (float(delta_end) / succeeded) if delta_end is not None else None,
            "delta_peak_per_game": (float(delta_peak) / succeeded) if delta_peak is not None else None,
        }

    return RunSummary(
        label=label,
        games=games,
        concurrency=concurrency,
        puppet_count=cfg.puppet_count,
        timeout_per_game_sec=timeout_per_game_sec,
        wall_time_sec=wall_time_sec,
        completed=completed,
        succeeded=succeeded,
        failed=failed,
        throughput_games_per_sec=throughput,
        duration_stats_sec=stats_dict(duration_values),
        create_game_stats_ms=stats_dict(create_values),
        ws_connect_stats_ms=stats_dict(ws_values),
        start_game_stats_ms=stats_dict(start_values),
        action_latency_stats_ms=stats_dict(action_values),
        action_latency_by_type_ms=action_by_type,
        failure_reasons=dict(failure_reasons),
        final_phase_counts=dict(final_phase_counts),
        terminal_stage_round_counts=dict(terminal_stage_round_counts),
        server_rss_mb=server_rss_mb,
        server_rss_window_mb=server_rss_window_mb,
        server_rss_per_game_mb=rss_per_game,
    )


def print_summary(summary: RunSummary) -> None:
    print()
    print(f"=== {summary.label} ===")
    print(
        f"games={summary.games} concurrency={summary.concurrency} "
        f"puppet_count={summary.puppet_count} timeout/game={summary.timeout_per_game_sec:.1f}s "
        f"wall={summary.wall_time_sec:.2f}s throughput={summary.throughput_games_per_sec:.2f} games/s"
    )
    print(f"completed={summary.completed} succeeded={summary.succeeded} failed={summary.failed}")
    print(f"game duration sec: {format_stats_line(summary.duration_stats_sec)}")
    print(f"create_game ms: {format_stats_line(summary.create_game_stats_ms)}")
    print(f"ws_connect ms: {format_stats_line(summary.ws_connect_stats_ms)}")
    print(f"start_game ms: {format_stats_line(summary.start_game_stats_ms)}")
    print(f"action latency ms: {format_stats_line(summary.action_latency_stats_ms)}")
    if summary.final_phase_counts:
        pairs = ", ".join(f"{phase}:{count}" for phase, count in sorted(summary.final_phase_counts.items()))
        print(f"terminal phases: {pairs}")
    if summary.terminal_stage_round_counts:
        pairs = ", ".join(
            f"{stage_round}:{count}" for stage_round, count in sorted(summary.terminal_stage_round_counts.items())
        )
        print(f"terminal stage-round: {pairs}")
    if summary.server_rss_mb:
        print(f"managed server rss MB: {format_stats_line(summary.server_rss_mb)}")
    if summary.server_rss_window_mb and int(summary.server_rss_window_mb.get("count", 0) or 0) > 0:
        print(
            "managed rss window MB: "
            f"start={_fmt_float(summary.server_rss_window_mb.get('start'))} "
            f"end={_fmt_float(summary.server_rss_window_mb.get('end'))} "
            f"peak={_fmt_float(summary.server_rss_window_mb.get('peak'))} "
            f"delta_end={_fmt_float(summary.server_rss_window_mb.get('delta_end'))} "
            f"delta_peak={_fmt_float(summary.server_rss_window_mb.get('delta_peak'))}"
        )
    if summary.server_rss_per_game_mb:
        print(
            "managed rss per successful game MB: "
            f"delta_end={_fmt_float(summary.server_rss_per_game_mb.get('delta_end_per_game'))} "
            f"delta_peak={_fmt_float(summary.server_rss_per_game_mb.get('delta_peak_per_game'))}"
        )
    if summary.failure_reasons:
        print("failure reasons:")
        for reason, count in sorted(summary.failure_reasons.items(), key=lambda item: (-item[1], item[0])):
            print(f"  {count}x {reason}")


def format_stats_line(stats: dict[str, float | int | None]) -> str:
    if not stats or int(stats.get("count", 0) or 0) == 0:
        return "count=0"

    def _fmt(value: float | int | None) -> str:
        if value is None:
            return "n/a"
        if isinstance(value, int):
            return str(value)
        return f"{value:.2f}"

    return (
        f"count={_fmt(stats.get('count'))} avg={_fmt(stats.get('avg'))} "
        f"min={_fmt(stats.get('min'))} p50={_fmt(stats.get('p50'))} "
        f"p95={_fmt(stats.get('p95'))} p99={_fmt(stats.get('p99'))} "
        f"max={_fmt(stats.get('max'))}"
    )


def _fmt_float(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, int):
        return str(value)
    return f"{value:.2f}"


def timeout_for_sweep(
    cfg: HarnessConfig,
    calibration_result: GameResult,
    timeout_per_game_sec: float,
    concurrency: int,
) -> float:
    if cfg.game_timeout_sec is not None:
        return timeout_per_game_sec
    return choose_timeout_seconds(
        single_game_seconds=calibration_result.duration_sec,
        concurrency=concurrency,
        multiplier=cfg.timeout_multiplier,
        min_timeout=cfg.timeout_min_sec,
        max_timeout=cfg.timeout_max_sec,
    )


def build_report(
    cfg: HarnessConfig,
    *,
    calibration_result: GameResult,
    timeout_per_game_sec: float,
    runtime_reset_results: list[dict[str, Any]],
    sweeps: list[RunSummary],
) -> dict[str, Any]:
    return {
        "config": {
            "base_url": cfg.base_url,
            "sweep_games": cfg.sweep_games,
            "concurrency_override": cfg.concurrency_override,
            "puppet_count": cfg.puppet_count,
            "cube_id": cfg.cube_id,
            "use_upgrades": cfg.use_upgrades,
            "disable_caps": cfg.disable_caps,
            "disable_ws_gzip": cfg.disable_ws_gzip,
            "mock_cube_data": cfg.mock_cube_data,
            "db_copy": cfg.db_copy,
            "seed": cfg.seed,
            "reset_runtime_between_sweeps": cfg.reset_runtime_between_sweeps,
            "fresh_server_per_sweep": cfg.fresh_server_per_sweep,
            "rss_sample_interval_sec": cfg.rss_sample_interval_sec,
            "ws_action_jitter_ms": cfg.ws_action_jitter_ms,
        },
        "calibration": asdict(calibration_result),
        "timeout_per_game_sec": timeout_per_game_sec,
        "runtime_resets": runtime_reset_results,
        "sweeps": [asdict(item) for item in sweeps],
    }


async def run_sweep(
    cfg: HarnessConfig,
    games: int,
    concurrency: int,
    timeout_per_game_sec: float,
    sampler: ProcessSampler | None,
) -> RunSummary:
    limits = httpx.Limits(
        max_connections=max(200, concurrency * 2),
        max_keepalive_connections=max(100, concurrency),
    )
    timeout = httpx.Timeout(30.0, connect=15.0, read=30.0, write=30.0, pool=30.0)

    start_mark = sampler.mark() if sampler else 0
    if sampler is not None:
        await sampler.sample_now()
    started = time.perf_counter()
    results: list[GameResult] = []
    semaphore = asyncio.Semaphore(concurrency)
    progress_every = max(1, games // 20)

    async with httpx.AsyncClient(base_url=cfg.base_url, timeout=timeout, limits=limits) as client:

        async def _worker(idx: int) -> GameResult:
            async with semaphore:
                return await run_one_game(client, cfg, idx, timeout_per_game_sec)

        tasks = [asyncio.create_task(_worker(idx)) for idx in range(games)]

        for completed, task in enumerate(asyncio.as_completed(tasks), start=1):
            result = await task
            results.append(result)
            if completed % progress_every == 0 or completed == games:
                failures = sum(1 for item in results if not item.success)
                print(f"[harness] progress {completed}/{games} completed (failures={failures})")

    wall_time = time.perf_counter() - started
    rss_stats = None
    rss_window = None
    if sampler is not None:
        await sampler.sample_now()
        rss_stats = sampler.slice_stats(start_mark)
        rss_window = sampler.slice_window(start_mark)
    summary = summarize_run(
        label=f"load-games-{games}",
        cfg=cfg,
        games=games,
        concurrency=concurrency,
        timeout_per_game_sec=timeout_per_game_sec,
        wall_time_sec=wall_time,
        results=results,
        server_rss_mb=rss_stats,
        server_rss_window_mb=rss_window,
    )
    print_summary(summary)
    return summary


async def calibrate_timeout(cfg: HarnessConfig, concurrency: int) -> tuple[float, GameResult]:
    calibration_timeout = cfg.game_timeout_sec or cfg.calibration_timeout_sec
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=20)
    timeout = httpx.Timeout(30.0, connect=15.0, read=30.0, write=30.0, pool=30.0)
    async with httpx.AsyncClient(base_url=cfg.base_url, timeout=timeout, limits=limits) as client:
        result = await run_one_game(client, cfg, game_index=0, timeout_sec=calibration_timeout)

    if not result.success:
        msg = result.error or "calibration game failed"
        raise RuntimeError(f"calibration failed: {msg}")

    chosen = cfg.game_timeout_sec
    if chosen is None:
        chosen = choose_timeout_seconds(
            single_game_seconds=result.duration_sec,
            concurrency=concurrency,
            multiplier=cfg.timeout_multiplier,
            min_timeout=cfg.timeout_min_sec,
            max_timeout=cfg.timeout_max_sec,
        )
    print(
        f"[harness] calibration complete: one game took {result.duration_sec:.2f}s; timeout/game set to {chosen:.1f}s"
    )
    return chosen, result


def parse_args(argv: list[str] | None = None) -> HarnessConfig:
    parser = argparse.ArgumentParser(
        description="Run concurrent end-to-end goldfish load tests against real game engine flows.",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Backend base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--games", type=int, default=10, help="Number of games to run for a single sweep")
    parser.add_argument("--sweep", default=None, help="Comma-separated game counts, e.g. 1,10,100,1000")
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

    args = parser.parse_args(argv)

    if args.games <= 0:
        raise ValueError("--games must be positive")
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

    sweep = parse_sweep(args.sweep, args.games)
    cfg = HarnessConfig(
        base_url=args.base_url.rstrip("/"),
        sweep_games=sweep,
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
    return cfg


async def run_harness(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.db_copy:
        if cfg.fresh_server_per_sweep:
            return await run_with_fresh_server_per_sweep(cfg)
        return await run_with_managed_server(cfg)
    return await run_against_existing_server(cfg)


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
    print(f"[harness] runtime reset complete: cleared_games={cleared_games} sessions_removed={sessions_removed}")
    return payload


async def run_with_managed_server(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.base_url != DEFAULT_BASE_URL:
        print(f"[harness] --db-copy uses a managed local server; ignoring --base-url={cfg.base_url}")

    async with ManagedServer(cfg) as managed:
        cfg.base_url = managed.base_url
        sampler = (
            ProcessSampler(managed.process.pid, interval_sec=cfg.rss_sample_interval_sec)
            if managed.process is not None
            else None
        )
        if sampler is not None:
            await sampler.start()
        try:
            report = await execute_sweeps(cfg, sampler, ops_token=managed.ops_token)
        finally:
            if sampler is not None:
                await sampler.stop()
        return report


async def run_with_fresh_server_per_sweep(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.base_url != DEFAULT_BASE_URL:
        print(f"[harness] --db-copy uses a managed local server; ignoring --base-url={cfg.base_url}")

    first_concurrency = cfg.concurrency_for(cfg.sweep_games[0])
    async with ManagedServer(cfg) as managed:
        cfg.base_url = managed.base_url
        timeout_per_game_sec, calibration_result = await calibrate_timeout(cfg, concurrency=first_concurrency)

    sweeps: list[RunSummary] = []
    for games in cfg.sweep_games:
        concurrency = cfg.concurrency_for(games)
        planned_timeout = timeout_for_sweep(cfg, calibration_result, timeout_per_game_sec, concurrency)

        async with ManagedServer(cfg) as managed:
            cfg.base_url = managed.base_url
            sampler = (
                ProcessSampler(managed.process.pid, interval_sec=cfg.rss_sample_interval_sec)
                if managed.process is not None
                else None
            )
            if sampler is not None:
                await sampler.start()
            try:
                sweep_summary = await run_sweep(
                    cfg=cfg,
                    games=games,
                    concurrency=concurrency,
                    timeout_per_game_sec=planned_timeout,
                    sampler=sampler,
                )
            finally:
                if sampler is not None:
                    await sampler.stop()
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
        print("[harness] note: --disable-caps cannot modify an already-running external server.")
    if cfg.disable_ws_gzip:
        print("[harness] note: --disable-ws-gzip cannot modify an already-running external server.")
    if cfg.mock_cube_data:
        print("[harness] note: --mock-cube-data only applies when harness manages the server process.")
    if cfg.fresh_server_per_sweep:
        print("[harness] note: --fresh-server-per-sweep requires --db-copy and is ignored for external servers.")
    if cfg.reset_runtime_between_sweeps and not cfg.ops_token:
        print("[harness] note: runtime reset requires --ops-token when targeting an external server.")
    return await execute_sweeps(cfg, sampler=None, ops_token=cfg.ops_token)


async def execute_sweeps(
    cfg: HarnessConfig,
    sampler: ProcessSampler | None,
    ops_token: str | None,
) -> dict[str, Any]:
    first_concurrency = cfg.concurrency_for(cfg.sweep_games[0])
    timeout_per_game_sec, calibration_result = await calibrate_timeout(cfg, concurrency=first_concurrency)

    sweeps: list[RunSummary] = []
    runtime_reset_results: list[dict[str, Any]] = []

    if cfg.reset_runtime_between_sweeps:
        if ops_token:
            reset = await clear_runtime_state(cfg.base_url, ops_token)
            runtime_reset_results.append({"label": "post-calibration", "result": reset})
        else:
            print("[harness] note: skipping post-calibration runtime reset; ops token unavailable.")

    for idx, games in enumerate(cfg.sweep_games):
        if idx > 0 and cfg.reset_runtime_between_sweeps:
            if ops_token:
                reset = await clear_runtime_state(cfg.base_url, ops_token)
                runtime_reset_results.append({"label": f"pre-sweep-{games}", "result": reset})
            else:
                print(f"[harness] note: skipping runtime reset before sweep {games}; ops token unavailable.")

        concurrency = cfg.concurrency_for(games)
        planned_timeout = timeout_for_sweep(cfg, calibration_result, timeout_per_game_sec, concurrency)

        sweep_summary = await run_sweep(
            cfg=cfg,
            games=games,
            concurrency=concurrency,
            timeout_per_game_sec=planned_timeout,
            sampler=sampler,
        )
        sweeps.append(sweep_summary)

    if cfg.reset_runtime_between_sweeps:
        if ops_token:
            reset = await clear_runtime_state(cfg.base_url, ops_token)
            runtime_reset_results.append({"label": "post-sweeps", "result": reset})
        else:
            print("[harness] note: skipping post-sweeps runtime reset; ops token unavailable.")

    return build_report(
        cfg,
        calibration_result=calibration_result,
        timeout_per_game_sec=timeout_per_game_sec,
        runtime_reset_results=runtime_reset_results,
        sweeps=sweeps,
    )


def write_json_report(report: dict[str, Any], output_path: str) -> None:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[harness] wrote json report: {path}")


async def main_async(argv: list[str] | None = None) -> int:
    try:
        cfg = parse_args(argv)
    except ValueError as exc:
        print(f"error: {exc}")
        return 2

    try:
        report = await run_harness(cfg)
    except Exception as exc:
        print(f"[harness] failed: {exc}")
        return 1

    if cfg.json_output:
        print(json.dumps(report, indent=2))
    if cfg.json_output_path:
        write_json_report(report, cfg.json_output_path)
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(main_async(argv))


if __name__ == "__main__":
    raise SystemExit(main())

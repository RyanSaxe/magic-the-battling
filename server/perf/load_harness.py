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
import statistics
import subprocess
import sys
import tempfile
import time
from collections import Counter
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
    db_copy: bool
    db_source: str | None
    backend_port: int
    startup_timeout_sec: float
    ops_token: str | None
    reset_runtime_between_sweeps: bool
    rss_sample_interval_sec: float
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
    base_url: str = DEFAULT_BASE_URL
    ops_token: str = ""

    async def __aenter__(self) -> ManagedServer:
        self.base_url = f"http://127.0.0.1:{self.config.backend_port}"
        env = os.environ.copy()
        self.ops_token = secrets.token_urlsafe(24)
        env["MTB_OPS_TOKEN"] = self.ops_token

        if self.config.db_copy:
            source_db = resolve_db_source(self.config.db_source)
            if not source_db.exists():
                msg = f"--db-copy database source does not exist: {source_db}"
                raise FileNotFoundError(msg)
            temp_dir = Path(tempfile.mkdtemp(prefix="mtb-load-db-"))
            temp_db = temp_dir / source_db.name
            shutil.copy2(source_db, temp_db)
            self.temp_db_dir = temp_dir
            env["DATABASE_PATH"] = str(temp_db)
            print(f"[harness] using DB copy: {temp_db} (source: {source_db})")

        if self.config.disable_caps:
            env.update(cap_overrides_for(self.config.max_requested_games))

        env["MTB_COMPRESS_WS"] = "0" if self.config.disable_ws_gzip else "1"

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


def resolve_db_source(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "data" / "mtb.db").resolve()


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
) -> float:
    concurrency_factor = max(1.0, min(5.0, math.sqrt(max(concurrency, 1) / 25.0)))
    computed = single_game_seconds * multiplier * concurrency_factor
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


async def recv_ws_message(ctx: PhaseContext) -> dict[str, Any]:
    raw = await asyncio.wait_for(ctx.ws.recv(), timeout=remaining_timeout(ctx.deadline))
    return decode_ws_message(raw)


async def send_ws_action(ws: Any, action: str, payload: dict[str, Any] | None = None) -> None:
    await ws.send(json.dumps({"action": action, "payload": payload or {}}))


async def wait_for_game_state(ctx: PhaseContext) -> dict[str, Any]:
    while True:
        message = await recv_ws_message(ctx)
        msg_type = message.get("type")
        payload = message.get("payload", {})

        if msg_type == "error":
            msg = payload.get("message", "Unknown game error")
            raise GameFlowError(str(msg))

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
        pending = [u for u in self_player.get("upgrades", []) if u.get("upgrade_target") is None]
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
        if msg_type == "game_state":
            return payload

        can_start = bool(payload.get("can_start", False))
        if not ready_sent:
            await send_ws_action(ctx.ws, "set_ready", {"is_ready": True})
            ready_sent = True
            continue

        if can_start and not start_sent:
            start_sent = True
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


async def run_one_game(
    client: httpx.AsyncClient,
    cfg: HarnessConfig,
    game_index: int,
    timeout_sec: float,
) -> GameResult:
    result = GameResult(index=game_index)
    game_started_at = time.perf_counter()
    player_name = f"PerfPlayer-{game_index:05d}-{cfg.seed}"

    ws = None
    try:
        create_started = time.perf_counter()
        response = await client.post("/api/games", json=build_create_game_payload(player_name, cfg))
        result.create_game_ms = (time.perf_counter() - create_started) * 1000.0
        response.raise_for_status()
        create_payload = response.json()

        game_id = str(create_payload["game_id"])
        session_id = str(create_payload["session_id"])
        result.game_id = game_id

        ws_uri = ws_url_for(cfg.base_url, game_id, session_id)
        ws_started = time.perf_counter()
        ws = await websockets.connect(ws_uri, max_size=None, open_timeout=30, close_timeout=5)
        result.ws_connect_ms = (time.perf_counter() - ws_started) * 1000.0

        deadline = time.monotonic() + timeout_sec
        rng = random.Random(cfg.seed + game_index)
        ctx = PhaseContext(ws=ws, deadline=deadline, result=result, rng=rng)

        state = await enter_game_from_lobby(ctx)
        state = await play_until_terminal(ctx, state)

        self_player = state.get("self_player") or {}
        phase = str(self_player.get("phase", ""))
        result.final_phase = phase
        result.final_stage = _to_int(self_player.get("stage"))
        result.final_round = _to_int(self_player.get("round"))
        result.success = phase in TERMINAL_PHASES
        if not result.success:
            result.error = f"terminal phase not reached (final phase: {phase})"

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
        "--rss-sample-interval-sec",
        type=float,
        default=0.25,
        help="Managed server RSS sample interval in seconds",
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
        db_copy=args.db_copy,
        db_source=args.db_source,
        backend_port=args.backend_port,
        startup_timeout_sec=args.startup_timeout_sec,
        ops_token=args.ops_token,
        reset_runtime_between_sweeps=args.reset_runtime_between_sweeps,
        rss_sample_interval_sec=args.rss_sample_interval_sec,
        json_output=args.json,
        json_output_path=args.json_output,
    )
    return cfg


async def run_harness(cfg: HarnessConfig) -> dict[str, Any]:
    if cfg.db_copy:
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


async def run_against_existing_server(cfg: HarnessConfig) -> dict[str, Any]:
    await wait_for_health(cfg.base_url, timeout_sec=30.0)
    if cfg.disable_caps:
        print("[harness] note: --disable-caps cannot modify an already-running external server.")
    if cfg.disable_ws_gzip:
        print("[harness] note: --disable-ws-gzip cannot modify an already-running external server.")
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
        sweep_summary = await run_sweep(
            cfg=cfg,
            games=games,
            concurrency=concurrency,
            timeout_per_game_sec=timeout_per_game_sec,
            sampler=sampler,
        )
        sweeps.append(sweep_summary)

    if cfg.reset_runtime_between_sweeps:
        if ops_token:
            reset = await clear_runtime_state(cfg.base_url, ops_token)
            runtime_reset_results.append({"label": "post-sweeps", "result": reset})
        else:
            print("[harness] note: skipping post-sweeps runtime reset; ops token unavailable.")

    report = {
        "config": {
            "base_url": cfg.base_url,
            "sweep_games": cfg.sweep_games,
            "concurrency_override": cfg.concurrency_override,
            "puppet_count": cfg.puppet_count,
            "cube_id": cfg.cube_id,
            "use_upgrades": cfg.use_upgrades,
            "disable_caps": cfg.disable_caps,
            "disable_ws_gzip": cfg.disable_ws_gzip,
            "db_copy": cfg.db_copy,
            "seed": cfg.seed,
            "reset_runtime_between_sweeps": cfg.reset_runtime_between_sweeps,
            "rss_sample_interval_sec": cfg.rss_sample_interval_sec,
        },
        "calibration": asdict(calibration_result),
        "timeout_per_game_sec": timeout_per_game_sec,
        "runtime_resets": runtime_reset_results,
        "sweeps": [asdict(item) for item in sweeps],
    }
    return report


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

"""Shared constants, protocols, errors, and dataclasses for the load harness."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    import random

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
    pass


class WebSocketProto(Protocol):
    async def send(self, message: str) -> None: ...

    async def recv(self) -> str | bytes: ...

    async def close(self) -> None: ...


@dataclass
class ActionClock:
    last_action_sent_at: float | None = None


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
    spectator_messages_received: int = 0
    spectator_latencies_ms: list[float] = field(default_factory=list)

    def record_action(self, action: str, latency_ms: float) -> None:
        self.actions_sent += 1
        self.action_latencies_ms.append(latency_ms)
        bucket = self.action_latencies_by_type_ms.setdefault(action, [])
        bucket.append(latency_ms)

    def record_spectator_message(self, latency_ms: float | None = None) -> None:
        self.spectator_messages_received += 1
        if latency_ms is not None:
            self.spectator_latencies_ms.append(latency_ms)


@dataclass
class RunSummary:
    label: str
    games: int
    concurrency: int
    idle_hot_games: int
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
    preload_server_status: dict[str, Any] | None = None
    preload_rss_window_mb: dict[str, float | int | None] | None = None
    scenario: str = "goldfish"
    players_per_game: int = 1
    spectators_per_game: int = 0
    spectator_messages_received: int = 0
    spectator_message_latency_ms: dict[str, float | int | None] | None = None


@dataclass
class HarnessConfig:
    base_url: str
    sweep_games: list[int]
    hot_game_counts: list[int]
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
    multiplayer_tables: list[int] = field(default_factory=list)
    players_per_table: int = 4
    spectators_per_game: int = 0
    max_p95_ms: float | None = None
    max_rss_mb: float | None = None

    @property
    def max_requested_games(self) -> int:
        all_counts = [*self.sweep_games, *self.multiplayer_tables]
        return max(all_counts) if all_counts else 1

    @property
    def max_requested_loaded_games(self) -> int:
        candidates: list[int] = [
            games + idle_hot_games for idle_hot_games in self.hot_game_counts for games in self.sweep_games
        ]
        candidates.extend(self.multiplayer_tables)
        return max(candidates) if candidates else 1

    @property
    def max_requested_ws_connections(self) -> int:
        candidates: list[int] = [
            games * (1 + self.spectators_per_game) + idle_hot_games
            for idle_hot_games in self.hot_game_counts
            for games in self.sweep_games
        ]
        candidates.extend(
            tables * (self.players_per_table + self.spectators_per_game) for tables in self.multiplayer_tables
        )
        return max(candidates) if candidates else 1

    def concurrency_for(self, games: int) -> int:
        if self.concurrency_override is None:
            return games
        return max(1, min(games, self.concurrency_override))


@dataclass
class PhaseContext:
    ws: WebSocketProto
    deadline: float
    result: GameResult
    rng: random.Random
    ws_action_jitter_ms: float = 0.0
    action_clock: ActionClock | None = None


@dataclass
class IdleHotGame:
    game_id: str
    session_id: str
    ws: WebSocketProto
    phase: str | None = None


def cap_overrides_for(max_games: int, *, max_ws_connections: int | None = None) -> dict[str, str]:
    scale = max(1, max_games)
    ws_scale = max(scale, max_ws_connections or 0)
    return {
        "MTB_MAX_HOT_GAMES": str(max(1_000, scale * 3)),
        "MTB_MAX_TOTAL_LOADED_GAMES_HARD": str(max(1_500, scale * 4)),
        "MTB_MAX_PENDING_GAMES": str(max(1_000, scale * 3)),
        "MTB_MAX_WS_CONNECTIONS": str(max(2_000, ws_scale * 4)),
        "MTB_MAX_SESSIONS_TOTAL": str(max(50_000, ws_scale * 20)),
    }

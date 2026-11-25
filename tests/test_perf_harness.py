import asyncio
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from scripts.fly_activity_report import format_human_report, summarize_logs
from server.perf.load_harness import (
    GameResult,
    HarnessConfig,
    cap_overrides_for,
    check_regression_thresholds,
    choose_timeout_seconds,
    main,
    main_async,
    parse_args,
    parse_hot_sweep,
    parse_sweep,
    print_summary,
    rss_window_dict,
    seed_puppet_histories,
    summarize_run,
)


def test_parse_sweep_uses_fallback_when_none() -> None:
    assert parse_sweep(None, 10) == [10]


def test_parse_sweep_preserves_order_and_deduplicates() -> None:
    assert parse_sweep("1,10,10,100,1,1000", 5) == [1, 10, 100, 1000]


def test_parse_sweep_rejects_non_positive() -> None:
    with pytest.raises(ValueError, match="positive"):
        parse_sweep("1,0,3", 5)


def test_parse_hot_sweep_uses_fallback_when_none() -> None:
    assert parse_hot_sweep(None, 25) == [25]


def test_parse_hot_sweep_allows_zero_and_deduplicates() -> None:
    assert parse_hot_sweep("0,50,50,100,0", 5) == [0, 50, 100]


def test_parse_hot_sweep_rejects_negative() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        parse_hot_sweep("0,-1,3", 5)


def test_timeout_scales_with_concurrency() -> None:
    low = choose_timeout_seconds(
        single_game_seconds=20.0,
        concurrency=10,
        multiplier=2.5,
        min_timeout=60.0,
        max_timeout=900.0,
    )
    high = choose_timeout_seconds(
        single_game_seconds=20.0,
        concurrency=1000,
        multiplier=2.5,
        min_timeout=60.0,
        max_timeout=900.0,
    )
    assert high > low


def test_timeout_respects_bounds() -> None:
    minimum = choose_timeout_seconds(
        single_game_seconds=1.0,
        concurrency=1,
        multiplier=1.0,
        min_timeout=30.0,
        max_timeout=120.0,
    )
    maximum = choose_timeout_seconds(
        single_game_seconds=200.0,
        concurrency=1000,
        multiplier=10.0,
        min_timeout=30.0,
        max_timeout=120.0,
    )
    assert minimum == 30.0
    assert maximum == 120.0


def test_cap_overrides_scale_with_games() -> None:
    small = cap_overrides_for(10)
    large = cap_overrides_for(1000)
    assert int(large["MTB_MAX_HOT_GAMES"]) > int(small["MTB_MAX_HOT_GAMES"])
    assert int(large["MTB_MAX_WS_CONNECTIONS"]) > int(small["MTB_MAX_WS_CONNECTIONS"])


def test_harness_config_scales_caps_for_combined_hot_and_active_games() -> None:
    cfg = HarnessConfig(
        base_url="http://127.0.0.1:8000",
        sweep_games=[50],
        hot_game_counts=[1000],
        concurrency_override=50,
        puppet_count=3,
        cube_id="auto",
        use_upgrades=True,
        seed=1337,
        game_timeout_sec=None,
        timeout_multiplier=2.5,
        timeout_min_sec=60.0,
        timeout_max_sec=900.0,
        calibration_timeout_sec=300.0,
        disable_caps=True,
        disable_ws_gzip=False,
        mock_cube_data=True,
        db_copy=False,
        db_source=None,
        backend_port=8000,
        startup_timeout_sec=90.0,
        ops_token=None,
        reset_runtime_between_sweeps=True,
        fresh_server_per_sweep=False,
        rss_sample_interval_sec=0.25,
        ws_action_jitter_ms=0.0,
        json_output=False,
        json_output_path=None,
    )

    assert cfg.max_requested_games == 50
    assert cfg.max_requested_loaded_games == 1050


def test_parse_args_disable_ws_gzip_flag() -> None:
    cfg = parse_args(["--games", "1", "--disable-ws-gzip"])
    assert cfg.disable_ws_gzip is True


def test_parse_args_hot_game_flags() -> None:
    cfg = parse_args(["--games", "10", "--hot-games", "50", "--hot-sweep", "0,50,100"])
    assert cfg.hot_game_counts == [0, 50, 100]


def test_parse_args_mock_cube_data_defaults_true() -> None:
    cfg = parse_args(["--games", "1"])
    assert cfg.mock_cube_data is True


def test_parse_args_real_cube_data_flag() -> None:
    cfg = parse_args(["--games", "1", "--real-cube-data"])
    assert cfg.mock_cube_data is False


def test_parse_args_runtime_reset_toggle() -> None:
    cfg = parse_args(["--games", "1", "--no-runtime-reset-between-sweeps"])
    assert cfg.reset_runtime_between_sweeps is False


def test_parse_args_fresh_server_per_sweep_requires_db_copy() -> None:
    with pytest.raises(ValueError, match="requires --db-copy"):
        parse_args(["--games", "1", "--fresh-server-per-sweep"])


def test_parse_args_fresh_server_per_sweep_flag() -> None:
    cfg = parse_args(["--games", "1", "--db-copy", "--fresh-server-per-sweep"])
    assert cfg.fresh_server_per_sweep is True


def test_parse_args_ws_action_jitter() -> None:
    cfg = parse_args(["--games", "1", "--ws-action-jitter-ms", "25"])
    assert cfg.ws_action_jitter_ms == 25.0


def test_rss_window_dict() -> None:
    window = rss_window_dict([100.0, 105.0, 103.0, 110.0])
    assert window["count"] == 4
    assert window["start"] == 100.0
    assert window["end"] == 110.0
    assert window["peak"] == 110.0
    assert window["delta_end"] == 10.0
    assert window["delta_peak"] == 10.0


def test_summarize_run_reports_rss_per_successful_game() -> None:
    cfg = HarnessConfig(
        base_url="http://127.0.0.1:8000",
        sweep_games=[10],
        hot_game_counts=[0],
        concurrency_override=10,
        puppet_count=3,
        cube_id="auto",
        use_upgrades=True,
        seed=1337,
        game_timeout_sec=None,
        timeout_multiplier=2.5,
        timeout_min_sec=60.0,
        timeout_max_sec=900.0,
        calibration_timeout_sec=300.0,
        disable_caps=True,
        disable_ws_gzip=False,
        mock_cube_data=True,
        db_copy=False,
        db_source=None,
        backend_port=8000,
        startup_timeout_sec=90.0,
        ops_token=None,
        reset_runtime_between_sweeps=True,
        fresh_server_per_sweep=False,
        rss_sample_interval_sec=0.25,
        ws_action_jitter_ms=0.0,
        json_output=False,
        json_output_path=None,
    )
    results = [
        GameResult(index=0, success=True, duration_sec=1.0, final_phase="winner"),
        GameResult(index=1, success=True, duration_sec=1.5, final_phase="winner"),
    ]
    summary = summarize_run(
        label="test",
        cfg=cfg,
        games=2,
        concurrency=2,
        idle_hot_games=0,
        timeout_per_game_sec=60.0,
        wall_time_sec=2.0,
        results=results,
        server_rss_mb=None,
        server_rss_window_mb={
            "count": 4,
            "start": 100.0,
            "end": 104.0,
            "peak": 106.0,
            "delta_end": 4.0,
            "delta_peak": 6.0,
        },
        preload_server_status=None,
        preload_rss_window_mb=None,
    )

    assert summary.server_rss_per_game_mb == {
        "count": 2,
        "delta_end_per_game": 2.0,
        "delta_peak_per_game": 3.0,
    }


def test_summarize_run_preserves_idle_hot_game_context() -> None:
    cfg = HarnessConfig(
        base_url="http://127.0.0.1:8000",
        sweep_games=[50],
        hot_game_counts=[100],
        concurrency_override=50,
        puppet_count=3,
        cube_id="auto",
        use_upgrades=True,
        seed=1337,
        game_timeout_sec=None,
        timeout_multiplier=2.5,
        timeout_min_sec=60.0,
        timeout_max_sec=900.0,
        calibration_timeout_sec=300.0,
        disable_caps=True,
        disable_ws_gzip=False,
        mock_cube_data=True,
        db_copy=False,
        db_source=None,
        backend_port=8000,
        startup_timeout_sec=90.0,
        ops_token=None,
        reset_runtime_between_sweeps=True,
        fresh_server_per_sweep=False,
        rss_sample_interval_sec=0.25,
        ws_action_jitter_ms=0.0,
        json_output=False,
        json_output_path=None,
    )
    results = [GameResult(index=0, success=True, duration_sec=1.0, final_phase="winner")]
    summary = summarize_run(
        label="test-hot",
        cfg=cfg,
        games=1,
        concurrency=1,
        idle_hot_games=100,
        timeout_per_game_sec=60.0,
        wall_time_sec=1.0,
        results=results,
        server_rss_mb=None,
        server_rss_window_mb=None,
        preload_server_status={"loaded_games": 100, "hot_games": 100},
        preload_rss_window_mb={
            "count": 2,
            "start": 100.0,
            "end": 140.0,
            "peak": 145.0,
            "delta_end": 40.0,
            "delta_peak": 45.0,
        },
    )

    assert summary.idle_hot_games == 100
    assert summary.preload_server_status == {"loaded_games": 100, "hot_games": 100}
    assert summary.preload_rss_window_mb == {
        "count": 2,
        "start": 100.0,
        "end": 140.0,
        "peak": 145.0,
        "delta_end": 40.0,
        "delta_peak": 45.0,
    }


def _init_seed_schema(db_path: Path) -> None:
    with closing(sqlite3.connect(str(db_path))) as conn:
        conn.executescript(
            """
            CREATE TABLE games (
                id TEXT PRIMARY KEY,
                config_json TEXT,
                shared INTEGER
            );

            CREATE TABLE player_game_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                player_name TEXT NOT NULL,
                battler_elo REAL NOT NULL,
                max_stage INTEGER NOT NULL,
                max_round INTEGER NOT NULL,
                final_placement INTEGER,
                is_puppet INTEGER
            );

            CREATE TABLE battle_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_history_id INTEGER NOT NULL,
                stage INTEGER NOT NULL,
                round INTEGER NOT NULL,
                hand_json TEXT NOT NULL,
                vanguard_json TEXT,
                basic_lands_json TEXT NOT NULL,
                applied_upgrades_json TEXT NOT NULL,
                treasures INTEGER NOT NULL,
                poison INTEGER,
                play_draw_preference TEXT,
                full_state_json TEXT NOT NULL
            );
            """
        )


def _insert_history(conn: sqlite3.Connection, *, game_id: str, config_json: str, player_name: str, elo: float) -> None:
    conn.execute("INSERT INTO games (id, config_json, shared) VALUES (?, ?, 0)", (game_id, config_json))
    cursor = conn.execute(
        """
        INSERT INTO player_game_history
          (game_id, player_name, battler_elo, max_stage, max_round, final_placement, is_puppet)
        VALUES (?, ?, ?, 6, 2, 2, 0)
        """,
        (game_id, player_name, elo),
    )
    assert cursor.lastrowid is not None
    history_id = int(cursor.lastrowid)
    conn.execute(
        """
        INSERT INTO battle_snapshots
          (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
           applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
        VALUES (?, 3, 1, ?, NULL, ?, ?, 1, 0, 'play', ?)
        """,
        (
            history_id,
            json.dumps([]),
            json.dumps(["Plains", "Island", "Swamp"]),
            json.dumps([]),
            json.dumps({"hand": [], "basic_lands": ["Plains", "Island", "Swamp"]}),
        ),
    )


def test_seed_puppet_histories_backfills_when_existing_histories_miss_target_elo(tmp_path: Path) -> None:
    db_path = tmp_path / "seed.db"
    _init_seed_schema(db_path)
    config_json = json.dumps({"use_upgrades": True, "use_vanguards": False, "cube_id": "auto"})

    with closing(sqlite3.connect(str(db_path))) as conn:
        for idx in range(25):
            _insert_history(
                conn,
                game_id=f"old-{idx}",
                config_json=config_json,
                player_name=f"ExistingPlayer{idx}",
                elo=1320.0,
            )
        conn.commit()

    seeded = seed_puppet_histories(
        db_path,
        cube_id="auto",
        use_upgrades=True,
        use_vanguards=False,
        min_histories=16,
        target_elo=1000.0,
    )
    assert seeded == 16

    seeded_again = seed_puppet_histories(
        db_path,
        cube_id="auto",
        use_upgrades=True,
        use_vanguards=False,
        min_histories=16,
        target_elo=1000.0,
    )
    assert seeded_again == 0


def test_main_logs_validation_error_to_stderr_not_stdout(
    capsys: pytest.CaptureFixture[str], caplog: pytest.LogCaptureFixture
) -> None:
    exit_code = main(["--games", "0"])
    captured = capsys.readouterr()
    assert exit_code == 2
    assert captured.out == ""
    assert "error: --games must be positive" in caplog.text


def test_print_summary_writes_structured_output_to_stdout(capsys: pytest.CaptureFixture[str]) -> None:
    cfg = parse_args(["--games", "1"])
    summary = summarize_run(
        label="stdout-check",
        cfg=cfg,
        games=1,
        concurrency=1,
        idle_hot_games=0,
        timeout_per_game_sec=60.0,
        wall_time_sec=1.0,
        results=[GameResult(index=0, success=True, duration_sec=1.0, final_phase="winner")],
        server_rss_mb=None,
        server_rss_window_mb=None,
        preload_server_status=None,
        preload_rss_window_mb=None,
    )
    print_summary(summary)
    captured = capsys.readouterr()
    assert "=== stdout-check ===" in captured.out
    assert "completed=1 succeeded=1 failed=0" in captured.out
    assert captured.err == ""


def test_fly_activity_report_compatibility_and_formatting() -> None:
    summary = summarize_logs(
        [{"timestamp": "2026-01-01T00:00:00Z", "level": "info", "message": "Game started: abc"}],
        source="fly",
        source_note="buffer note",
    )
    text = format_human_report(
        {
            "app": "magic-the-battling",
            "generated_utc": "2026-01-01T00:00:00Z",
            "inputs": {"hours": 24},
            "status": {"Hostname": "app.fly.dev", "Status": "running", "Version": 1, "PlatformVersion": "machines"},
            "machines": [],
            "checks_summary": {"total": 1, "status_counts": {"passing": 1}},
            "logs": {"requested_source": "fly", "primary_source": "fly", "summaries": {"fly": summary}},
            "risk_signals": ["No explicit error/exception lines were detected in fetched logs."],
        }
    )
    assert "Fly Activity Report | app=magic-the-battling" in text
    assert "Fly Buffer Log Summary" in text
    assert summary["event_counts"] == {"game_started": 1}


def test_parse_args_multiplayer_and_spectator_flags() -> None:
    cfg = parse_args(["--multiplayer-tables", "2,4", "--players-per-table", "4", "--spectators-per-game", "3"])
    assert cfg.multiplayer_tables == [2, 4]
    assert cfg.players_per_table == 4
    assert cfg.spectators_per_game == 3
    assert cfg.sweep_games == []
    assert cfg.max_requested_ws_connections == 4 * (4 + 3)


def test_parse_args_keeps_default_goldfish_sweep_when_games_and_multiplayer_omitted() -> None:
    cfg = parse_args([])
    assert cfg.sweep_games == [10]
    assert cfg.multiplayer_tables == []
    assert cfg.spectators_per_game == 0


def test_parse_args_validates_new_flags() -> None:
    with pytest.raises(ValueError, match="players-per-table"):
        parse_args(["--players-per-table", "1"])
    with pytest.raises(ValueError, match="spectators-per-game"):
        parse_args(["--spectators-per-game", "-1"])
    with pytest.raises(ValueError, match="max-p95-ms"):
        parse_args(["--max-p95-ms", "0"])
    with pytest.raises(ValueError, match="max-rss-mb"):
        parse_args(["--max-rss-mb", "-5"])


def test_check_regression_thresholds_detects_p95_and_rss_breaches() -> None:
    cfg = parse_args(["--games", "1", "--max-p95-ms", "50", "--max-rss-mb", "300"])
    report = {
        "sweeps": [
            {
                "label": "multiplayer-tables-2x4-spec-3",
                "action_latency_stats_ms": {"p95": 65.4},
                "spectator_message_latency_ms": {"p95": 72.1},
                "server_rss_window_mb": {"peak": 340.5},
            },
        ],
    }
    breaches = check_regression_thresholds(cfg, report)
    assert len(breaches) == 3
    assert "multiplayer-tables-2x4-spec-3" in breaches[0]
    assert "action p95=65.40ms > 50.00ms" in breaches[0]
    assert "spectator p95=72.10ms > 50.00ms" in breaches[1]
    assert "peak=340.50MB > 300.00MB" in breaches[2]


def test_main_async_exits_nonzero_and_logs_breach(caplog: pytest.LogCaptureFixture) -> None:
    async def fake_run_harness(_cfg: object) -> dict[str, object]:
        return {
            "sweeps": [
                {
                    "label": "load-games-10",
                    "action_latency_stats_ms": {"p95": 120.0},
                    "server_rss_window_mb": {"peak": 180.0},
                },
            ],
        }

    exit_code = asyncio.run(main_async(["--games", "10", "--max-p95-ms", "100"], runner=fake_run_harness))
    assert exit_code == 3
    assert "load-games-10" in caplog.text
    assert "action p95=120.00ms > 100.00ms" in caplog.text

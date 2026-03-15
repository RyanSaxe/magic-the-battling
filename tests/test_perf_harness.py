import json
import sqlite3
from contextlib import closing

import pytest

from server.perf.load_harness import (
    GameResult,
    HarnessConfig,
    cap_overrides_for,
    choose_timeout_seconds,
    parse_args,
    parse_hot_sweep,
    parse_sweep,
    rss_window_dict,
    seed_puppet_histories,
    summarize_run,
)


def test_parse_sweep_uses_fallback_when_none():
    assert parse_sweep(None, 10) == [10]


def test_parse_sweep_preserves_order_and_deduplicates():
    assert parse_sweep("1,10,10,100,1,1000", 5) == [1, 10, 100, 1000]


def test_parse_sweep_rejects_non_positive():
    with pytest.raises(ValueError, match="positive"):
        parse_sweep("1,0,3", 5)


def test_parse_hot_sweep_uses_fallback_when_none():
    assert parse_hot_sweep(None, 25) == [25]


def test_parse_hot_sweep_allows_zero_and_deduplicates():
    assert parse_hot_sweep("0,50,50,100,0", 5) == [0, 50, 100]


def test_parse_hot_sweep_rejects_negative():
    with pytest.raises(ValueError, match="non-negative"):
        parse_hot_sweep("0,-1,3", 5)


def test_timeout_scales_with_concurrency():
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


def test_timeout_respects_bounds():
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


def test_cap_overrides_scale_with_games():
    small = cap_overrides_for(10)
    large = cap_overrides_for(1000)
    assert int(large["MTB_MAX_HOT_GAMES"]) > int(small["MTB_MAX_HOT_GAMES"])
    assert int(large["MTB_MAX_WS_CONNECTIONS"]) > int(small["MTB_MAX_WS_CONNECTIONS"])


def test_harness_config_scales_caps_for_combined_hot_and_active_games():
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


def test_parse_args_disable_ws_gzip_flag():
    cfg = parse_args(["--games", "1", "--disable-ws-gzip"])
    assert cfg.disable_ws_gzip is True


def test_parse_args_hot_game_flags():
    cfg = parse_args(["--games", "10", "--hot-games", "50", "--hot-sweep", "0,50,100"])
    assert cfg.hot_game_counts == [0, 50, 100]


def test_parse_args_mock_cube_data_defaults_true():
    cfg = parse_args(["--games", "1"])
    assert cfg.mock_cube_data is True


def test_parse_args_real_cube_data_flag():
    cfg = parse_args(["--games", "1", "--real-cube-data"])
    assert cfg.mock_cube_data is False


def test_parse_args_runtime_reset_toggle():
    cfg = parse_args(["--games", "1", "--no-runtime-reset-between-sweeps"])
    assert cfg.reset_runtime_between_sweeps is False


def test_parse_args_fresh_server_per_sweep_requires_db_copy():
    with pytest.raises(ValueError, match="requires --db-copy"):
        parse_args(["--games", "1", "--fresh-server-per-sweep"])


def test_parse_args_fresh_server_per_sweep_flag():
    cfg = parse_args(["--games", "1", "--db-copy", "--fresh-server-per-sweep"])
    assert cfg.fresh_server_per_sweep is True


def test_parse_args_ws_action_jitter():
    cfg = parse_args(["--games", "1", "--ws-action-jitter-ms", "25"])
    assert cfg.ws_action_jitter_ms == 25.0


def test_rss_window_dict():
    window = rss_window_dict([100.0, 105.0, 103.0, 110.0])
    assert window["count"] == 4
    assert window["start"] == 100.0
    assert window["end"] == 110.0
    assert window["peak"] == 110.0
    assert window["delta_end"] == 10.0
    assert window["delta_peak"] == 10.0


def test_summarize_run_reports_rss_per_successful_game():
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


def test_summarize_run_preserves_idle_hot_game_context():
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


def _init_seed_schema(db_path):
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


def _insert_history(conn, *, game_id: str, config_json: str, player_name: str, elo: float):
    conn.execute("INSERT INTO games (id, config_json, shared) VALUES (?, ?, 0)", (game_id, config_json))
    cursor = conn.execute(
        """
        INSERT INTO player_game_history
          (game_id, player_name, battler_elo, max_stage, max_round, final_placement, is_puppet)
        VALUES (?, ?, ?, 6, 2, 2, 0)
        """,
        (game_id, player_name, elo),
    )
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


def test_seed_puppet_histories_backfills_when_existing_histories_miss_target_elo(tmp_path):
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

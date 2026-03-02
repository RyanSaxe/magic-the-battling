import pytest

from server.perf.load_harness import (
    cap_overrides_for,
    choose_timeout_seconds,
    parse_args,
    parse_sweep,
    rss_window_dict,
)


def test_parse_sweep_uses_fallback_when_none():
    assert parse_sweep(None, 10) == [10]


def test_parse_sweep_preserves_order_and_deduplicates():
    assert parse_sweep("1,10,10,100,1,1000", 5) == [1, 10, 100, 1000]


def test_parse_sweep_rejects_non_positive():
    with pytest.raises(ValueError, match="positive"):
        parse_sweep("1,0,3", 5)


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


def test_parse_args_disable_ws_gzip_flag():
    cfg = parse_args(["--games", "1", "--disable-ws-gzip"])
    assert cfg.disable_ws_gzip is True


def test_parse_args_runtime_reset_toggle():
    cfg = parse_args(["--games", "1", "--no-runtime-reset-between-sweeps"])
    assert cfg.reset_runtime_between_sweeps is False


def test_rss_window_dict():
    window = rss_window_dict([100.0, 105.0, 103.0, 110.0])
    assert window["count"] == 4
    assert window["start"] == 100.0
    assert window["end"] == 110.0
    assert window["peak"] == 110.0
    assert window["delta_end"] == 10.0
    assert window["delta_peak"] == 10.0

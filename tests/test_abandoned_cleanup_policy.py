from mtb.models.cards import build_synthetic_battler
from mtb.models.game import create_game, set_battler
from server.services.game_manager import GameManager


def _capture_delay(monkeypatch, manager: GameManager) -> list[float]:
    captured: list[float] = []

    def fake_schedule(game_id: str, delay: float = 300.0) -> None:
        assert isinstance(game_id, str)
        captured.append(delay)

    monkeypatch.setattr(manager, "_schedule_cleanup", fake_schedule)
    return captured


def test_pending_lobby_uses_short_abandoned_ttl(monkeypatch):
    manager = GameManager()
    pending = manager.create_game("Alice", "pid-alice", cube_id="test")
    captured = _capture_delay(monkeypatch, manager)

    manager.schedule_abandoned_cleanup(pending.game_id)

    assert captured == [900.0]


def test_multiplayer_started_uses_one_hour_ttl(monkeypatch):
    manager = GameManager()
    game_id = "multiplayer"
    game = create_game(["Alice", "Bob"], num_players=2)
    set_battler(game, build_synthetic_battler(60, 4, 0))
    manager._active_games[game_id] = game

    captured = _capture_delay(monkeypatch, manager)
    manager.schedule_abandoned_cleanup(game_id)

    assert captured == [3600.0]


def test_solo_started_uses_long_ttl(monkeypatch):
    manager = GameManager()
    game_id = "solo"
    game = create_game(["Alice"], num_players=1)
    set_battler(game, build_synthetic_battler(60, 4, 0))
    manager._active_games[game_id] = game
    assert len(game.players) == 1

    captured = _capture_delay(monkeypatch, manager)
    manager.schedule_abandoned_cleanup(game_id)

    assert captured == [86400.0]


def test_abandoned_ttl_env_overrides(monkeypatch):
    manager = GameManager()
    monkeypatch.setenv("MTB_PENDING_ABANDONED_TTL_SECONDS", "120")
    monkeypatch.setenv("MTB_MULTIPLAYER_ABANDONED_TTL_SECONDS", "180")
    monkeypatch.setenv("MTB_SOLO_ABANDONED_TTL_SECONDS", "240")

    pending = manager.create_game("Alice", "pid-alice", cube_id="test")
    captured = _capture_delay(monkeypatch, manager)
    manager.schedule_abandoned_cleanup(pending.game_id)
    assert captured[-1] == 120.0

    game_id = "multiplayer"
    multiplayer_game = create_game(["Alice", "Bob"], num_players=2)
    set_battler(multiplayer_game, build_synthetic_battler(60, 4, 0))
    manager._active_games[game_id] = multiplayer_game
    manager.schedule_abandoned_cleanup(game_id)
    assert captured[-1] == 180.0

    solo_id = "solo"
    solo_game = create_game(["Solo"], num_players=1)
    set_battler(solo_game, build_synthetic_battler(60, 4, 0))
    manager._active_games[solo_id] = solo_game
    manager.schedule_abandoned_cleanup(solo_id)
    assert captured[-1] == 240.0

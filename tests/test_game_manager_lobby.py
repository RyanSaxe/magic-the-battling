import asyncio
import json
from datetime import UTC, datetime
from typing import Any, cast

import pytest

import server.db.database as db
from mtb.models.cards import Battler
from mtb.models.game import BattleSnapshotData, create_game
from server.db.models import BattleSnapshot, GameRecord, PlayerGameHistory
from server.runtime_config import MAX_GAME_START_QUEUE
from server.services.game_manager import (
    BattlerLoading,
    BattlerMissing,
    BattlerReady,
    GameManager,
    LobbyStage,
    LobbyStartRefusedError,
)


class _FakeTask:
    def __init__(self) -> None:
        self.cancelled = False

    def cancel(self) -> bool:
        self.cancelled = True
        return True

    def done(self) -> bool:
        return self.cancelled


@pytest.fixture
def game_manager():
    return GameManager()


class TestCanRejoin:
    def test_can_rejoin_returns_false_for_nonexistent_game(self, game_manager):
        assert game_manager.can_rejoin("nonexistent_game", "Alice") is False

    def test_can_rejoin_returns_false_for_nonexistent_player(self, game_manager):
        game_manager._active_games["game1"] = create_game(["Alice"], num_players=1)

        assert game_manager.can_rejoin("game1", "Bob") is False

    def test_can_rejoin_returns_true_for_disconnected_player(self, game_manager):
        game_manager._active_games["game1"] = create_game(["Alice"], num_players=1)

        assert game_manager.can_rejoin("game1", "Alice", is_player_connected=lambda _g, _p: False) is True

    def test_can_rejoin_returns_false_for_connected_player(self, game_manager):
        game_manager._active_games["game1"] = create_game(["Alice"], num_players=1)
        game_manager._player_to_game["player_id_1"] = "game1"
        game_manager._player_id_to_name["player_id_1"] = "Alice"

        assert game_manager.can_rejoin("game1", "Alice", is_player_connected=lambda _g, _p: True) is False


class TestHotGamesTimezoneHandling:
    def test_hot_games_count_handles_naive_timestamp(self, game_manager):
        game_manager._active_games["game1"] = create_game(["Alice"], num_players=1)
        game_manager._last_human_activity["game1"] = datetime.now(UTC).replace(tzinfo=None)

        assert game_manager.hot_games_count() == 1


class TestGameStartQueueGuards:
    def test_can_accept_new_pending_game_rejects_when_start_queue_full(self, game_manager):
        game_manager._game_start_waiters = MAX_GAME_START_QUEUE

        allowed, reason = game_manager.can_accept_new_pending_game()

        assert allowed is False
        assert reason is not None
        assert "starting many games" in reason.lower()

    def test_start_is_refused_when_start_queue_full(self, game_manager):
        pending = game_manager.create_game(player_name="Host", player_id="host_pid")
        pending.target_player_count = 2
        joined = game_manager.join_game(pending.join_code, "Guest", "guest_pid")
        assert joined is not None
        pending.player_ready["host_pid"] = True
        pending.player_ready["guest_pid"] = True
        game_manager._game_start_waiters = MAX_GAME_START_QUEUE

        async def no_broadcast() -> None:
            pass

        with pytest.raises(LobbyStartRefusedError, match="starting many games"):
            asyncio.run(game_manager.start_lobby(pending.game_id, "host_pid", None, on_change=no_broadcast))
        assert pending.stage is LobbyStage.OPEN


class TestConstructedLobbyRules:
    def test_set_player_ready_requires_valid_constructed_battler(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")

        success, error = game_manager.set_player_ready(pending.game_id, "alice_pid", True)

        assert success is False
        assert error is not None
        assert "deck" in error.lower()

    def test_can_start_constructed_game_once_all_battlers_are_loaded(self, game_manager, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        pending.target_player_count = 2
        game_manager.join_game(pending.join_code, "Bob", "bob_pid")

        pending.player_battlers["alice_pid"] = BattlerReady(
            "alice_deck",
            Battler(cards=[card_factory(f"a{i}") for i in range(100)], upgrades=[], vanguards=[], elo=1150.0),
        )
        pending.player_battlers["bob_pid"] = BattlerReady(
            "bob_deck",
            Battler(cards=[card_factory(f"b{i}") for i in range(100)], upgrades=[], vanguards=[], elo=1250.0),
        )
        pending.player_ready["alice_pid"] = True
        pending.player_ready["bob_pid"] = True

        assert game_manager.start_rules(pending, "alice_pid") is None

    def test_get_lobby_state_includes_constructed_battler_status(self, game_manager, card_factory):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        pending.player_battlers["alice_pid"] = BattlerReady(
            "alice_deck",
            Battler(cards=[card_factory(f"a{i}") for i in range(100)], upgrades=[], vanguards=[]),
        )

        lobby = game_manager.get_lobby_state(pending.game_id)

        assert lobby is not None
        assert lobby.play_mode == "constructed"
        assert lobby.players[0].battler_id == "alice_deck"
        assert lobby.players[0].battler_status == "ready"
        assert lobby.target_player_count == 4

    def test_join_game_respects_target_player_cap(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=2)

        joined = game_manager.join_game(pending.join_code, "Bob", "bob_pid")
        blocked = game_manager.join_game(pending.join_code, "Charlie", "charlie_pid")

        assert joined is not None
        assert blocked is None

    def test_set_target_player_count_rejects_below_occupied_slots(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=4)
        game_manager.join_game(pending.join_code, "Bob", "bob_pid")

        success, error = game_manager.set_target_player_count(pending.game_id, "alice_pid", 1)

        assert success is False
        assert error is not None

    def test_set_target_player_count_updates_lobby_state(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", target_player_count=4)

        success, error = game_manager.set_target_player_count(pending.game_id, "alice_pid", 6)
        lobby = game_manager.get_lobby_state(pending.game_id)

        assert success is True
        assert error is None
        assert lobby is not None
        assert lobby.target_player_count == 6

    def test_clear_player_battler_resets_state_and_unreadies(self, game_manager):
        pending = game_manager.create_game(player_name="Alice", player_id="alice_pid", play_mode="constructed")
        loading_task = _FakeTask()
        pending.player_battlers["alice_pid"] = BattlerLoading("alice_deck", cast(Any, loading_task))
        pending.player_ready["alice_pid"] = True

        success, error = game_manager.clear_player_battler(pending.game_id, "alice_pid")

        assert success is True
        assert error is None
        assert loading_task.cancelled is True
        assert pending.player_battlers["alice_pid"] == BattlerMissing()
        assert pending.player_ready["alice_pid"] is False

    def test_start_loads_puppets_for_a_constructed_table(
        self, game_manager, mock_cube_data, test_db, card_factory, start_game_now
    ):
        with db.SessionLocal() as session:
            session.add(
                GameRecord(
                    id="hist-constructed",
                    cube_id="some_deck",
                    config_json=json.dumps({"use_upgrades": True, "use_vanguards": False, "play_mode": "constructed"}),
                )
            )
            history = PlayerGameHistory(
                game_id="hist-constructed",
                player_name="ConstructedVet",
                battler_elo=1234.0,
                max_stage=6,
                max_round=1,
            )
            session.add(history)
            session.flush()
            session.add(
                BattleSnapshot(
                    player_history_id=history.id,
                    stage=3,
                    round=1,
                    hand_json="[]",
                    basic_lands_json=json.dumps(["Plains", "Island", "Mountain"]),
                    applied_upgrades_json="[]",
                    treasures=1,
                    full_state_json=BattleSnapshotData(
                        hand=[card_factory("BotCard")],
                        vanguard=None,
                        basic_lands=["Plains", "Island", "Mountain"],
                        applied_upgrades=[],
                        treasures=1,
                    ).model_dump_json(),
                )
            )
            session.commit()

            pending = game_manager.create_game(
                player_name="Alice", player_id="alice_pid", play_mode="constructed", target_player_count=2
            )
            pending.puppet_count = 1
            pending.player_battlers["alice_pid"] = BattlerReady(
                "alice_deck",
                Battler(cards=[card_factory(f"a{i}") for i in range(100)], upgrades=[], vanguards=[], elo=1234.0),
            )

            game = start_game_now(game_manager, pending.game_id, session)

        assert game is not None
        assert [puppet.name for puppet in game.puppets] == ["ConstructedVet"]


class TestBattlerValidation:
    def test_load_battler_applies_legality_to_all_battlers(self, game_manager, monkeypatch, card_factory):
        monkeypatch.setattr(
            "mtb.utils.cubecobra.get_cube_data",
            lambda cube_id: [card_factory(f"card{i}") for i in range(99)],
        )

        with pytest.raises(ValueError, match="has 99 playable cards"):
            game_manager._load_battler("too_small", use_upgrades=False, use_vanguards=False, play_mode="constructed")

    def test_load_battler_applies_shared_bans_to_limited_battlers(self, game_manager, monkeypatch, card_factory):
        monkeypatch.setattr(
            "mtb.utils.cubecobra.get_cube_data",
            lambda cube_id: [card_factory(f"card{i}") for i in range(99)] + [card_factory("Unexpected Potential")],
        )

        with pytest.raises(ValueError, match="Unexpected Potential is banned"):
            game_manager._load_battler("limited_ban", use_upgrades=False, use_vanguards=False, play_mode="limited")

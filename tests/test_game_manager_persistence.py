import asyncio
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

import server.db.database as db
from mtb.models.cards import Battler, Card
from mtb.models.game import Game, Puppet, StaticOpponent, create_game, set_battler
from mtb.phases import battle
from server.db.models import ActiveGameSnapshot, GamePlayerRecord, GameRecord, PlayerGameHistory
from server.services.game_manager import GameManager


@pytest.fixture
def game_manager() -> GameManager:
    return GameManager()


class TestPersistPlacementOnElimination:
    def test_mid_game_elimination_persists_final_placement_poison_and_treasures(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        alice.treasures = 4
        alice.phase = "battle"
        bob.phase = "battle"
        charlie.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Plains", "Island", "Mountain"]
        charlie.chosen_basics = ["Plains", "Island", "Mountain"]
        battle.start(game, alice, opponent=bob)
        charlie.phase = "reward"

        with db.SessionLocal() as session:
            session.add(GameRecord(id="game1"))
            history = PlayerGameHistory(
                game_id="game1",
                player_name="Alice",
                battler_elo=1200.0,
                max_stage=3,
                max_round=1,
            )
            session.add(history)
            session.commit()
            history_id = history.id

            game_manager.handle_battle_submit_result(game, alice, result=bob.name, game_id="game1", db=session)
            game_manager.handle_battle_submit_result(game, bob, result=bob.name, game_id="game1", db=session)

        assert alice.phase == "eliminated"
        assert alice.placement == 3

        with db.SessionLocal() as session:
            saved = session.get(PlayerGameHistory, history_id)
            assert saved is not None
            assert saved.final_placement == 3
            assert saved.final_poison == alice.poison
            assert saved.final_treasures == 4

    def test_elimination_without_history_row_does_not_fail(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        alice.phase = "battle"
        bob.phase = "battle"
        charlie.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Plains", "Island", "Mountain"]
        charlie.chosen_basics = ["Plains", "Island", "Mountain"]
        battle.start(game, alice, opponent=bob)
        charlie.phase = "reward"

        with db.SessionLocal() as session:
            session.add(GameRecord(id="game1"))
            session.commit()

            game_manager.handle_battle_submit_result(game, alice, result=bob.name, game_id="game1", db=session)
            game_manager.handle_battle_submit_result(game, bob, result=bob.name, game_id="game1", db=session)

        assert alice.phase == "eliminated"


class TestSelfPlayerPlacement:
    def _make_card(self, name: str) -> Card:
        return Card(name=name, image_url="img", id=name, type_line="Creature")

    def test_get_game_state_includes_self_player_placement(self, game_manager: GameManager) -> None:
        cards = [self._make_card(f"c{i}") for i in range(50)]
        battler = Battler(cards=cards, upgrades=[], vanguards=[])

        game = create_game(["Alice"], num_players=1)
        set_battler(game, battler)
        game.puppets.append(Puppet(name="Bot", player_history_id=1, snapshots={}))

        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"

        alice = game.players[0]
        alice.placement = 2
        alice.phase = "game_over"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None
        assert state.self_player.placement == 2

    def test_placement_zero_before_game_over(self, game_manager: GameManager) -> None:
        cards = [self._make_card(f"c{i}") for i in range(50)]
        battler = Battler(cards=cards, upgrades=[], vanguards=[])

        game = create_game(["Alice"], num_players=1)
        set_battler(game, battler)

        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None
        assert state.self_player.placement == 0


class TestRestoreRecovery:
    def _make_battler(self) -> Battler:
        cards = [Card(name=f"c{i}", image_url="img", id=f"c{i}", type_line="Creature") for i in range(80)]
        return Battler(cards=cards, upgrades=[], vanguards=[])

    def _make_puppet_snapshot(self) -> StaticOpponent:
        return StaticOpponent(
            name="Bot",
            hand=[],
            sideboard=[],
            command_zone=[],
            upgrades=[],
            chosen_basics=["Plains", "Island", "Mountain"],
            treasures=1,
            hand_revealed=True,
            is_ghost=False,
            source_player_history_id=1,
        )

    def test_normalize_restored_game_rebinds_active_battle_players(self, game_manager: GameManager) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        set_battler(game, self._make_battler())
        alice, bob = game.players
        alice.phase = "battle"
        bob.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Plains", "Island", "Mountain"]
        battle.start(game, alice, opponent=bob)

        restored = Game.model_validate_json(game.model_dump_json())
        assert restored.active_battles
        restored_battle = restored.active_battles[0]
        assert restored_battle.player is not restored.players[0]
        assert restored_battle.opponent is not restored.players[1]

        changed = game_manager._normalize_restored_game(restored)  # noqa: SLF001 -- internal state inspected by test

        assert changed is True
        restored_battle = restored.active_battles[0]
        assert restored_battle.player is restored.players[0]
        assert restored_battle.opponent is restored.players[1]

    def test_restored_static_battle_submit_updates_canonical_player(self, game_manager: GameManager) -> None:
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)
        bot_for_round = puppet.get_opponent_for_round(alice.stage, alice.round)
        assert bot_for_round is not None
        battle.start(game, alice, opponent=bot_for_round)

        restored = Game.model_validate_json(game.model_dump_json())
        game_manager._normalize_restored_game(restored)  # noqa: SLF001 -- internal state inspected by test
        canonical_alice = restored.players[0]

        handled = game_manager.handle_battle_submit_result(restored, canonical_alice, result=canonical_alice.name)

        assert handled is True
        assert restored.active_battles == []
        assert canonical_alice.phase == "reward"

    def test_restore_all_snapshots_recovers_missing_static_battle(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)

        now = datetime.now(UTC)
        with db.SessionLocal() as session:
            session.add(GameRecord(id="g1"))
            session.add(GamePlayerRecord(game_id="g1", player_id="pid_alice", player_name="Alice", is_puppet=False))
            session.add(
                ActiveGameSnapshot(
                    game_id="g1",
                    state_json=game.snapshot_dump_json(),
                    last_human_activity_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        restored = asyncio.run(game_manager.restore_all_snapshots())
        assert restored == 1
        assert "g1" in game_manager.dirty_games

        state = game_manager.get_game_state("g1", "pid_alice")

        assert state is not None
        assert state.current_battle is not None
        assert state.current_battle.opponent_name == "Bot"

    def test_get_game_state_includes_catalog_delta_for_runtime_battle_cards(self, game_manager: GameManager) -> None:
        game = create_game(["Alice"], num_players=1)
        set_battler(game, self._make_battler())
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Swamp", "Forest", "Mountain"]
        alice.treasures = 1

        static_opponent = self._make_puppet_snapshot()
        puppet = Puppet(name="Bot", player_history_id=1, snapshots={"3_1": static_opponent})
        game.puppets.append(puppet)
        bot_for_round = puppet.get_opponent_for_round(alice.stage, alice.round)
        assert bot_for_round is not None
        battle.start(game, alice, opponent=bot_for_round)

        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")

        assert state is not None
        assert state.current_battle is not None
        assert state.catalog_delta["basic-swamp"].name == "Swamp"
        assert state.catalog_delta["basic-forest"].name == "Forest"
        assert state.catalog_delta["basic-mountain"].name == "Mountain"
        assert state.catalog_delta["treasure"].name == "Treasure"


class TestCleanupStaleGameRecords:
    def _create_game_record(self, session: Session, game_id: str, *, created_at: datetime) -> GameRecord:
        record = GameRecord(id=game_id, created_at=created_at)
        session.add(record)
        session.commit()
        return record

    def _create_snapshot(self, session: Session, game_id: str, *, last_activity: datetime) -> ActiveGameSnapshot:
        snapshot = ActiveGameSnapshot(
            game_id=game_id,
            state_json="{}",
            last_human_activity_at=last_activity,
            updated_at=last_activity,
        )
        session.add(snapshot)
        session.commit()
        return snapshot

    def test_skips_game_with_recent_activity(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        session = db.SessionLocal()
        old_time = datetime.now(UTC) - timedelta(hours=72)
        recent_time = datetime.now(UTC) - timedelta(hours=1)
        self._create_game_record(session, "active_game", created_at=old_time)
        self._create_snapshot(session, "active_game", last_activity=recent_time)
        session.close()

        cleaned = game_manager.cleanup_stale_game_records(max_age_hours=48)

        assert cleaned == 0
        session = db.SessionLocal()
        record = session.query(GameRecord).filter(GameRecord.id == "active_game").first()
        assert record is not None
        assert record.ended_at is None
        snapshot = session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id == "active_game").first()
        assert snapshot is not None
        session.close()

    def test_cleans_game_without_snapshot(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        session = db.SessionLocal()
        old_time = datetime.now(UTC) - timedelta(hours=72)
        self._create_game_record(session, "abandoned_game", created_at=old_time)
        session.close()

        cleaned = game_manager.cleanup_stale_game_records(max_age_hours=48)

        assert cleaned == 1
        session = db.SessionLocal()
        record = session.query(GameRecord).filter(GameRecord.id == "abandoned_game").first()
        assert record is not None
        assert record.ended_at is not None
        session.close()

    def test_cleans_game_with_old_activity(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        session = db.SessionLocal()
        old_time = datetime.now(UTC) - timedelta(hours=72)
        self._create_game_record(session, "stale_game", created_at=old_time)
        self._create_snapshot(session, "stale_game", last_activity=old_time)
        session.close()

        cleaned = game_manager.cleanup_stale_game_records(max_age_hours=48)

        assert cleaned == 1
        session = db.SessionLocal()
        record = session.query(GameRecord).filter(GameRecord.id == "stale_game").first()
        assert record is not None
        assert record.ended_at is not None
        snapshot = session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id == "stale_game").first()
        assert snapshot is None
        session.close()

    def test_removes_old_snapshot_of_a_game_already_marked_ended(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        session = db.SessionLocal()
        old_time = datetime.now(UTC) - timedelta(hours=72)
        record = self._create_game_record(session, "paused_game", created_at=old_time)
        record.ended_at = old_time
        session.commit()
        self._create_snapshot(session, "paused_game", last_activity=old_time)
        session.close()

        cleaned = game_manager.cleanup_stale_game_records(max_age_hours=48)

        assert cleaned == 1
        session = db.SessionLocal()
        assert session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id == "paused_game").first() is None
        session.close()

    def test_keeps_a_game_that_is_loaded_in_memory(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        session = db.SessionLocal()
        old_time = datetime.now(UTC) - timedelta(hours=72)
        self._create_game_record(session, "loaded_game", created_at=old_time)
        self._create_snapshot(session, "loaded_game", last_activity=old_time)
        session.close()
        game_manager.active_games["loaded_game"] = create_game(["Alice"], num_players=1)

        cleaned = game_manager.cleanup_stale_game_records(max_age_hours=48)

        assert cleaned == 0
        session = db.SessionLocal()
        assert session.query(ActiveGameSnapshot).filter(ActiveGameSnapshot.game_id == "loaded_game").first()
        session.close()


class TestFinishedGameSnapshots:
    def test_finished_game_snapshot_is_not_written_again(
        self, game_manager: GameManager, mock_cube_data: None, *, test_db: None, start_game_now: Callable[..., Game]
    ) -> None:
        _ = (mock_cube_data, test_db)
        pending = game_manager.create_game("Alice", "pid-a", cube_id="test", target_player_count=2)
        game_manager.join_game(pending.join_code, "Bob", player_id="pid-b")
        game_id = pending.game_id
        session = db.SessionLocal()
        game = start_game_now(game_manager, game_id, db=session)
        game_manager.persist_all_games()

        game_manager.complete_game(game_id, game.players[0], db=session)
        # ws.handle_message marks the game dirty after the action that ended it, and shutdown flushes every game
        game_manager.mark_game_dirty(game_id)
        game_manager.persist_dirty_games()
        game_manager.persist_all_games()

        session.expire_all()
        assert session.get(ActiveGameSnapshot, game_id) is None
        session.close()


class TestRoundTablePairing:
    def test_build_odds_survive_a_restart_and_name_every_opponent_the_round_can_draw(
        self, game_manager: GameManager, mock_cube_data: None, *, test_db: None, start_game_now: Callable[..., Game]
    ) -> None:
        _ = (mock_cube_data, test_db)
        player_ids = [f"pid-{i}" for i in range(6)]
        pending = game_manager.create_game("P0", player_ids[0], cube_id="test", target_player_count=6)
        for i, player_id in enumerate(player_ids[1:], start=1):
            game_manager.join_game(pending.join_code, f"P{i}", player_id=player_id)
        game_id = pending.game_id
        session = db.SessionLocal()
        start_game_now(game_manager, game_id, db=session)

        def shown_odds() -> dict[str, dict[str, float]]:
            odds = {}
            for player_id in player_ids:
                state = game_manager.get_game_state(game_id, player_id)
                assert state is not None
                odds[state.self_player.name] = {
                    p.name: p.pairing_probability for p in state.players if p.pairing_probability
                }
            return odds

        before_restart = shown_odds()
        assert all(len(odds) == 3 for odds in before_restart.values())
        game_manager.persist_all_games()

        opponents_drawn: set[tuple[str, str]] = set()
        for _ in range(20):
            game_manager.cleanup_game(game_id, preserve_snapshot=True)
            assert game_manager.restore_game_from_snapshot(game_id)
            assert shown_odds() == before_restart

            game = game_manager.get_game(game_id)
            assert game is not None
            for player in game.players:
                player.hand, player.sideboard = player.sideboard[:3], player.sideboard[3:]
                basics = ["Plains", "Island", "Swamp"]
                assert game_manager.handle_build_ready(game, player, basics=basics, game_id=game_id, db=None) is None
            for b in game.active_battles:
                opponents_drawn.update({(b.player.name, b.opponent.name), (b.opponent.name, b.player.name)})

        assert all(opponent in before_restart[player] for player, opponent in opponents_drawn)
        assert len(opponents_drawn) > 6
        session.close()

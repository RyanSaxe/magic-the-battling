import json
from collections.abc import Callable

import pytest
from conftest import setup_battle_ready
from sqlalchemy.orm import Session

import server.db.database as db
from pitfight.models.cards import Card
from pitfight.models.game import BattleSnapshotData, LastBattleResult, Puppet, StaticOpponent, create_game
from pitfight.phases import battle
from pitfight.phases.elimination import eliminate_puppet
from server.db.models import BattleSnapshot, GameRecord, PlayerGameHistory
from server.services.game_manager import GameManager


@pytest.fixture
def game_manager() -> GameManager:
    return GameManager()


def _seed_historical_run(
    session: Session,
    *,
    game_id: str,
    player_name: str,
    battler_elo: float = 1200.0,
    cube_id: str = "test_cube",
    play_mode: str = "limited",
    basics: list[str] | None = None,
    stage: int = 3,
    round_num: int = 1,
) -> PlayerGameHistory:
    session.add(
        GameRecord(
            id=game_id,
            cube_id=cube_id,
            config_json=json.dumps(
                {
                    "use_upgrades": True,
                    "use_vanguards": False,
                    "cube_id": cube_id,
                    "play_mode": play_mode,
                }
            ),
        )
    )
    history = PlayerGameHistory(
        game_id=game_id,
        player_name=player_name,
        battler_elo=battler_elo,
        max_stage=6,
        max_round=1,
    )
    session.add(history)
    session.flush()
    chosen_basics = basics or ["Plains", "Island", "Mountain"]
    session.add(
        BattleSnapshot(
            player_history_id=history.id,
            stage=stage,
            round=round_num,
            hand_json="[]",
            basic_lands_json=json.dumps(chosen_basics),
            applied_upgrades_json="[]",
            treasures=1,
            full_state_json=BattleSnapshotData(
                hand=[],
                vanguard=None,
                basic_lands=chosen_basics,
                applied_upgrades=[],
                treasures=1,
            ).model_dump_json(),
        )
    )
    session.commit()
    return history


class TestHistoricalPuppetSelection:
    def test_load_fake_players_randomizes_within_elo_range(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            for i in range(10):
                _seed_historical_run(session, game_id=f"g{i}", player_name=f"Player{i}", battler_elo=1200.0 + i * 10)

            orderings: set[tuple[int, ...]] = set()
            for _ in range(10):
                game = create_game(["Human"], num_players=1)
                game_manager.load_fake_players_for_game(
                    session,
                    game,
                    count=3,
                    target_elo=1200.0,
                    use_upgrades=True,
                    use_vanguards=False,
                    cube_id="test_cube",
                )
                orderings.add(tuple(p.player_history_id for p in game.puppets))

        assert len(orderings) > 1, "Expected varied puppet selection across calls"

    def test_load_fake_players_filters_by_elo_range(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            in_range_ids = {
                _seed_historical_run(session, game_id="g1", player_name="InRange1", battler_elo=1100.0).id,
                _seed_historical_run(session, game_id="g2", player_name="InRange2", battler_elo=1300.0).id,
                _seed_historical_run(session, game_id="g3", player_name="InRange3", battler_elo=1200.0).id,
            }
            out_of_range_ids = {
                _seed_historical_run(session, game_id="g4", player_name="OutOfRange1", battler_elo=800.0).id,
                _seed_historical_run(session, game_id="g5", player_name="OutOfRange2", battler_elo=1500.0).id,
            }

            game = create_game(["Human"], num_players=1)
            game_manager.load_fake_players_for_game(
                session,
                game,
                count=10,
                target_elo=1200.0,
                use_upgrades=True,
                use_vanguards=False,
                cube_id="test_cube",
            )

        loaded_ids = {p.player_history_id for p in game.puppets}
        assert loaded_ids == in_range_ids
        assert loaded_ids.isdisjoint(out_of_range_ids)

    def test_load_fake_players_treats_legacy_draft_mode_as_limited(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            history = _seed_historical_run(session, game_id="legacy", player_name="LegacyLimited", play_mode="draft")

            game = create_game(["Human"], num_players=1)
            game_manager.load_fake_players_for_game(
                session,
                game,
                count=1,
                target_elo=1200.0,
                use_upgrades=True,
                use_vanguards=False,
                cube_id="test_cube",
                play_mode="limited",
            )

        assert [p.player_history_id for p in game.puppets] == [history.id]

    def test_load_fake_players_skips_suspicious_names(self, game_manager: GameManager, test_db: None) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            for idx, bad_name in enumerate(["", "A", "1", "123", "test", "Test", "testing", "asdf", "qwerty", "aaa"]):
                _seed_historical_run(session, game_id=f"bad_{idx}", player_name=bad_name)
            good_names = ["Alice", "Bob123", "Player1", "xXDragonSlayerXx"]
            for idx, good_name in enumerate(good_names):
                _seed_historical_run(session, game_id=f"good_{idx}", player_name=good_name)

            game = create_game(["Human"], num_players=1)
            game_manager.load_fake_players_for_game(
                session,
                game,
                count=10,
                target_elo=1200.0,
                use_upgrades=True,
                use_vanguards=False,
                cube_id="test_cube",
            )

        assert {p.name for p in game.puppets} == set(good_names)

    def test_load_fake_players_skips_triple_same_basic_and_missing_opening_snapshot(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            _seed_historical_run(
                session, game_id="triple", player_name="TriplePlains", basics=["Plains", "Plains", "Plains"]
            )
            _seed_historical_run(session, game_id="missing_r1", player_name="MissingR1", stage=3, round_num=2)
            _seed_historical_run(
                session, game_id="two_same", player_name="TwoSame", basics=["Plains", "Plains", "Island"]
            )
            _seed_historical_run(
                session, game_id="three_diff", player_name="ThreeDiff", basics=["Plains", "Island", "Mountain"]
            )

            game = create_game(["Human"], num_players=1)
            game_manager.load_fake_players_for_game(
                session,
                game,
                count=10,
                target_elo=1200.0,
                use_upgrades=True,
                use_vanguards=False,
                cube_id="test_cube",
            )

        assert {p.name for p in game.puppets} == {"TwoSame", "ThreeDiff"}

    def test_bot_names_are_made_unique_when_colliding_with_human_or_other_bots(
        self, game_manager: GameManager, test_db: None
    ) -> None:
        _ = test_db
        with db.SessionLocal() as session:
            _seed_historical_run(session, game_id="ryan_1", player_name="Ryan")
            for i in range(3):
                _seed_historical_run(session, game_id=f"bob_{i}", player_name="Bob")

            game = create_game(["Ryan"], num_players=1)
            game_manager.load_fake_players_for_game(
                session,
                game,
                count=4,
                target_elo=1200.0,
                use_upgrades=True,
                use_vanguards=False,
                cube_id="test_cube",
            )

        names = [fp.name for fp in game.puppets]
        assert len(names) == len(set(names)) == 4
        assert set(names) == {"Ryan (2)", "Bob", "Bob (2)", "Bob (3)"}


class TestPuppetTableBehavior:
    def test_an_out_puppets_row_stops_at_the_round_it_went_out(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = "build"
        alice.hand = [card_factory(f"hand-{i}") for i in range(alice.hand_size)]
        game.puppets = [
            Puppet(
                name=name,
                player_history_id=history_id,
                snapshots={
                    f"3_{round_num}": StaticOpponent(
                        name=name, hand=[], treasures=round_num + 1, source_player_history_id=history_id
                    )
                    for round_num in (1, 2, 3)
                },
            )
            for history_id, name in enumerate(["Out", "Bot", "Other"], start=1)
        ]
        out = game.puppets[0]
        game_manager.handle_build_ready(game, alice, basics=["Plains", "Island", "Mountain"])
        game.active_battles.clear()
        out.last_battle_result = LastBattleResult(opponent_name="Alice", winner_name="Alice")
        eliminate_puppet(game, out)

        alice.round = 3
        setup_battle_ready(alice)
        ghost = out.get_opponent_for_round(3, 3)
        assert ghost is not None
        battle.start(game, alice, opponent=ghost)
        game_manager.handle_battle_submit_result(game, alice, result=out.name, game_id="g1")
        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None

        row = next(player for player in state.players if player.name == "Out")
        assert (row.treasures, row.last_result) == (2, "loss")

    def test_a_puppets_ghost_fights_with_the_build_it_went_out_with(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase, alice.round = "build", 3
        bob.phase, bob.round = "build", 2
        game.puppets = [
            Puppet(
                name=name,
                player_history_id=history_id,
                snapshots={
                    f"3_{round_num}": StaticOpponent(name=name, hand=[card_factory(f"{name}-{round_num}")])
                    for round_num in (1, 2, 3)
                },
                last_played_round=(3, 2),
            )
            for history_id, name in enumerate(["Out", "Bot"], start=1)
        ]
        eliminate_puppet(game, game.puppets[0])
        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"
        game_manager.player_to_game["pid_bob"] = "g1"
        game_manager.player_id_to_name["pid_bob"] = "Bob"

        seats = battle.get_round_table(game).seats
        alice_state = game_manager.get_game_state("g1", "pid_alice")
        bob_state = game_manager.get_game_state("g1", "pid_bob")
        assert alice_state is not None
        assert bob_state is not None

        assert [card.id for card in seats["Out"].hand] == ["Out-2"]
        assert [card.id for card in seats["Bot"].hand] == ["Bot-3"]
        alice_scouted = next(player for player in alice_state.players if player.name == "Out")
        assert [card.id for card in alice_scouted.most_recently_revealed_cards] == ["Out-2"]
        bob_scouted = next(player for player in bob_state.players if player.name == "Out")
        assert [card.id for card in bob_scouted.most_recently_revealed_cards] == ["Out-1"]

    def test_a_puppets_row_shows_the_furthest_rounds_treasures_and_the_cards_seen_in_your_round(
        self, game_manager: GameManager, card_factory: Callable[..., Card]
    ) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase, alice.round = "draft", 2
        bob.phase, bob.round = "draft", 3
        game.puppets = [
            Puppet(
                name="Bot",
                player_history_id=1,
                snapshots={
                    f"3_{round_num}": StaticOpponent(
                        name="Bot",
                        hand=[card_factory(f"hand-{round_num}")],
                        sideboard=[card_factory(f"sideboard-{round_num}")],
                        treasures=round_num + 1,
                    )
                    for round_num in (1, 2, 3)
                },
            )
        ]
        game_manager.active_games["g1"] = game
        game_manager.player_to_game["pid_alice"] = "g1"
        game_manager.player_id_to_name["pid_alice"] = "Alice"

        state = game_manager.get_game_state("g1", "pid_alice")
        assert state is not None

        row = next(player for player in state.players if player.name == "Bot")
        assert row.treasures == 4
        assert [card.id for card in row.most_recently_revealed_cards] == ["hand-1"]
        assert [card.id for card in row.full_sideboard] == ["sideboard-2"]

    def test_a_puppet_that_is_out_takes_no_more_poison(self, game_manager: GameManager) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        puppets = [
            Puppet(
                name=name,
                player_history_id=history_id,
                snapshots={"3_1": StaticOpponent(name=name, hand=[], source_player_history_id=history_id)},
            )
            for history_id, name in enumerate(["Ghost", "Bot", "Other"], start=1)
        ]
        ghost = puppets[0]
        ghost.poison = 10
        ghost.is_eliminated = True
        game.puppets.extend(puppets)
        game.most_recent_ghost_puppet = ghost
        opponent = ghost.get_opponent_for_round(3, 1)
        assert opponent is not None
        battle.start(game, alice, opponent=opponent)

        game_manager.handle_battle_submit_result(game, alice, result=alice.name, game_id="g1")

        assert ghost.poison == 10
        assert alice.battle_resolution is not None
        shown = alice.battle_resolution.opponent_side
        assert (shown.starting_poison, shown.ending_poison) == (10, 11)

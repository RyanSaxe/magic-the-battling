"""Pure unit tests for centralized phase transitions and round resolution."""

from __future__ import annotations

import random
from typing import get_args

import pytest
from conftest import setup_battle_ready

from pitfight.models.cards import Card
from pitfight.models.game import BattleSnapshotData, Game, Player, Puppet, StaticOpponent, create_game
from pitfight.models.types import Phase
from pitfight.phases import battle, elimination
from pitfight.phases.round_resolution import (
    LEGAL_PHASE_TRANSITIONS,
    InvalidPhaseTransitionError,
    finalize_game_over,
    resolve_battle,
    resolve_end_of_round,
    resolve_reward_done,
    transition_phase,
)

ALL_PHASES: tuple[Phase, ...] = get_args(Phase)
TERMINAL_PHASES: frozenset[Phase] = frozenset({"eliminated", "winner", "game_over"})


def _make_puppet(
    name: str,
    *,
    history_id: int,
    stage: int = 3,
    round_num: int = 1,
) -> tuple[Puppet, StaticOpponent]:
    snapshot = BattleSnapshotData(
        hand=[Card(name=f"{name}-card", image_url="test", id=f"{name}-card", type_line="Creature")],
        vanguard=None,
        basic_lands=["Plains", "Island", "Swamp"],
        applied_upgrades=[],
        treasures=0,
    )
    static_opp = StaticOpponent.from_snapshot(snapshot, name, history_id=history_id)
    puppet = Puppet(
        name=name,
        player_history_id=history_id,
        snapshots={f"{stage}_{round_num}": static_opp},
        stage=stage,
        round=round_num,
    )
    return puppet, static_opp


def _setup_pvp_battle(
    game: Game,
    p1: Player,
    *,
    p2: Player,
    winner_name: str,
    sudden_death: bool = False,
) -> battle.Battle:
    setup_battle_ready(p1)
    setup_battle_ready(p2)
    p1.hand = [Card(name="p1-card", image_url="test", id="p1-card", type_line="Creature")]
    p2.hand = [Card(name="p2-card", image_url="test", id="p2-card", type_line="Creature")]
    active = battle.start(game, p1, opponent=p2)
    active.is_sudden_death = sudden_death
    battle.submit_result(active, p1, winner_name=winner_name)
    battle.submit_result(active, p2, winner_name=winner_name)
    return active


def _setup_static_battle(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    winner_name: str,
    sudden_death: bool = False,
) -> battle.Battle:
    setup_battle_ready(player)
    player.hand = [Card(name="human-card", image_url="test", id="human-card", type_line="Creature")]
    active = battle.start(game, player, opponent=opponent)
    active.is_sudden_death = sudden_death
    battle.submit_result(active, player, winner_name=winner_name)
    return active


class TestPhaseTransitions:
    def test_transition_table_covers_every_declared_phase(self) -> None:
        assert set(LEGAL_PHASE_TRANSITIONS) == set(ALL_PHASES)

    @pytest.mark.parametrize(
        ("source", "target"),
        [(source, target) for source, targets in LEGAL_PHASE_TRANSITIONS.items() for target in sorted(targets)],
    )
    def test_every_legal_transition_succeeds(self, source: Phase, target: Phase) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = source

        result = transition_phase(alice, target)

        assert result == target
        assert alice.phase == target

    @pytest.mark.parametrize(
        ("source", "target"),
        [
            (source, target)
            for source in ALL_PHASES
            for target in ALL_PHASES
            if target not in LEGAL_PHASE_TRANSITIONS[source]
        ],
    )
    def test_every_illegal_transition_raises_without_mutating_phase(self, source: Phase, target: Phase) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = source

        with pytest.raises(InvalidPhaseTransitionError, match=f"{source} -> {target}"):
            transition_phase(alice, target)

        assert alice.phase == source

    def test_terminal_phases_have_no_outgoing_transitions(self) -> None:
        for phase in TERMINAL_PHASES:
            assert LEGAL_PHASE_TRANSITIONS[phase] == frozenset()


class TestSameRoundPlacementTieBreak:
    def test_less_poison_ranks_higher_regardless_of_elimination_order(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, _charlie, _dave = game.players
        alice.poison = 13
        bob.poison = 10

        elimination.eliminate_player(game, bob, round_num=2, stage_num=3)
        elimination.eliminate_player(game, alice, round_num=2, stage_num=3)

        assert bob.placement == 3
        assert alice.placement == 4

    def test_equal_poison_breaks_tie_by_join_order_regardless_of_exit_order(self) -> None:
        game_ab = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice_ab, bob_ab = game_ab.players[0], game_ab.players[1]
        alice_ab.poison = 11
        bob_ab.poison = 11
        elimination.eliminate_player(game_ab, alice_ab, round_num=2, stage_num=3)
        elimination.eliminate_player(game_ab, bob_ab, round_num=2, stage_num=3)

        game_ba = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice_ba, bob_ba = game_ba.players[0], game_ba.players[1]
        alice_ba.poison = 11
        bob_ba.poison = 11
        elimination.eliminate_player(game_ba, bob_ba, round_num=2, stage_num=3)
        elimination.eliminate_player(game_ba, alice_ba, round_num=2, stage_num=3)

        assert (alice_ab.placement, bob_ab.placement) == (3, 4)
        assert (alice_ba.placement, bob_ba.placement) == (3, 4)

    def test_human_and_puppet_same_round_tie_break_uses_poison_then_join_order(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice = game.players[0]
        puppet_a, _ = _make_puppet("BotA", history_id=1)
        puppet_b, _ = _make_puppet("BotB", history_id=2)
        game.puppets.extend([puppet_a, puppet_b])

        alice.poison = 11
        puppet_a.poison = 11
        puppet_b.poison = 10
        puppet_a.last_played_round = (3, 2)
        puppet_b.last_played_round = (3, 2)

        elimination.eliminate_puppet(game, puppet_a)
        elimination.eliminate_player(game, alice, round_num=2, stage_num=3)
        elimination.eliminate_puppet(game, puppet_b)

        assert puppet_b.placement == 2
        assert alice.placement == 3
        assert puppet_a.placement == 4

    def test_sudden_death_loser_keeps_sudden_death_placement(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        charlie.poison = 14
        elimination.eliminate_player(game, charlie, round_num=1, stage_num=3)

        alice.poison = 10
        bob.poison = 9
        alice.in_sudden_death = True
        elimination.eliminate_player(game, alice, round_num=1, stage_num=3)

        assert charlie.placement == 3
        assert alice.placement == 2
        assert alice.in_sudden_death is False


class TestPuppetGhostFreeze:
    def test_eliminate_puppet_freezes_last_played_round_when_unset(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        puppet, _ = _make_puppet("GhostBot", history_id=1, stage=4, round_num=2)
        puppet.poison = 12
        game.puppets.append(puppet)

        assert puppet.last_played_round is None

        elimination.eliminate_puppet(game, puppet)

        assert puppet.is_eliminated is True
        assert puppet.last_played_round == (4, 2)
        assert game.most_recent_ghost_puppet is puppet
        assert game.most_recent_ghost is None

    def test_eliminate_puppet_preserves_existing_last_played_round_and_clears_ghost_on_even(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        puppet, _ = _make_puppet("GhostBot", history_id=1, stage=4, round_num=3)
        puppet.last_played_round = (4, 1)
        puppet.poison = 10
        game.puppets.append(puppet)

        elimination.eliminate_puppet(game, puppet)

        assert puppet.last_played_round == (4, 1)
        assert game.most_recent_ghost_puppet is None
        assert game.most_recent_ghost is None


class TestSuddenDeathResolution:
    def test_finale_pvp_mutual_lethal_enters_sudden_death(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 9
        bob.poison = 9
        active = _setup_pvp_battle(game, alice, p2=bob, winner_name="draw")

        outcome = resolve_battle(game, active)

        assert outcome.status == "sudden_death"
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.in_sudden_death is True
        assert bob.in_sudden_death is True
        assert alice.poison == game.config.poison_to_lose - 1
        assert bob.poison == game.config.poison_to_lose - 1
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is True

    def test_ongoing_sudden_death_pvp_non_lethal_loops_back_to_build(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 4
        bob.poison = 4
        alice.in_sudden_death = True
        bob.in_sudden_death = True
        active = _setup_pvp_battle(game, alice, p2=bob, winner_name="Alice", sudden_death=True)

        outcome = resolve_battle(game, active)

        assert outcome.status is None
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.is_sudden_death is True
        assert alice.battle_resolution.continue_sudden_death is True

    def test_finale_pvp_sudden_death_decisive_win_ends_game(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 9
        bob.poison = 9
        alice.in_sudden_death = True
        bob.in_sudden_death = True
        active = _setup_pvp_battle(game, alice, p2=bob, winner_name="Alice", sudden_death=True)

        outcome = resolve_battle(game, active)

        assert outcome.status == "game_over"
        assert outcome.winner is alice
        assert outcome.eliminated == (bob,)
        assert alice.phase == "winner"
        assert alice.placement == 1
        assert bob.phase == "eliminated"
        assert bob.placement == 2

    def test_finale_vs_puppet_mutual_lethal_enters_sudden_death(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        puppet, static_opp = _make_puppet("Bot", history_id=1)
        game.puppets.append(puppet)
        alice.poison = 9
        puppet.poison = 9
        active = _setup_static_battle(game, alice, opponent=static_opp, winner_name="draw")

        outcome = resolve_battle(game, active)

        assert outcome.status == "sudden_death"
        assert alice.phase == "build"
        assert alice.in_sudden_death is True
        assert puppet.in_sudden_death is True
        assert alice.poison == game.config.poison_to_lose - 1
        assert puppet.poison == game.config.poison_to_lose - 1
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is True

    def test_non_finale_three_at_lethal_eliminates_highest_poison_and_starts_sudden_death(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 11
        charlie.poison = 14
        for player in game.players:
            player.phase = "awaiting_elimination"

        outcome = resolve_end_of_round(game, rng=random.Random(0))  # noqa: S311 -- non-cryptographic game RNG

        assert outcome.status == "sudden_death"
        assert outcome.eliminated == (charlie,)
        assert charlie.phase == "eliminated"
        assert charlie.placement == 3
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.in_sudden_death is True
        assert bob.in_sudden_death is True
        assert alice.poison == game.config.poison_to_lose - 1
        assert bob.poison == game.config.poison_to_lose - 1

    def test_non_finale_mutual_lethal_sets_awaiting_and_does_not_flag_continue_sudden_death(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players
        alice.poison = 9
        bob.poison = 9
        charlie.poison = 2
        dave.poison = 2
        for player in game.players:
            setup_battle_ready(player)
        active_ab = _setup_pvp_battle(game, alice, p2=bob, winner_name="draw")
        _setup_pvp_battle(game, charlie, p2=dave, winner_name="Charlie")

        outcome = resolve_battle(game, active_ab)

        assert outcome.status is None
        assert alice.phase == "awaiting_elimination"
        assert bob.phase == "awaiting_elimination"
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is False

    def test_puppet_vs_puppet_sudden_death_is_deterministic_with_rng(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 4
        alice.phase = "draft"
        bot_a, _ = _make_puppet("BotA", history_id=1)
        bot_b, _ = _make_puppet("BotB", history_id=2)
        bot_a.poison = 10
        bot_b.poison = 10
        game.puppets.extend([bot_a, bot_b])

        outcome = resolve_end_of_round(game, rng=random.Random(7))  # noqa: S311 -- non-cryptographic game RNG

        assert outcome.status is None
        assert outcome.check_round_start is True
        assert len(outcome.eliminated) == 1
        eliminated_bot = outcome.eliminated[0]
        survivor_bot = bot_b if eliminated_bot is bot_a else bot_a
        assert isinstance(eliminated_bot, Puppet)
        assert eliminated_bot.is_eliminated is True
        assert eliminated_bot.placement == 3
        assert survivor_bot.is_eliminated is False
        assert survivor_bot.poison == game.config.poison_to_lose - 1


class TestGameOverAndRewardResolution:
    def test_finalize_game_over_ranks_winner_and_remaining_participants(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        puppet, _ = _make_puppet("Bot", history_id=1)
        game.puppets.append(puppet)

        alice.phase = "reward"
        bob.phase = "draft"
        charlie.phase = "eliminated"
        charlie.placement = 4
        bob.poison = 6
        puppet.poison = 6

        finalize_game_over(game, alice)

        assert alice.phase == "winner"
        assert alice.placement == 1
        assert bob.phase == "game_over"
        assert bob.placement == 2
        assert puppet.placement == 3
        assert charlie.phase == "eliminated"
        assert charlie.placement == 4

    def test_finalize_game_over_with_no_winner_ranks_live_puppets_from_first(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot_a, _ = _make_puppet("BotA", history_id=1)
        bot_b, _ = _make_puppet("BotB", history_id=2)
        game.puppets.extend([bot_a, bot_b])

        alice.phase = "eliminated"
        alice.placement = 3
        bot_a.poison = 7
        bot_b.poison = 4

        finalize_game_over(game, None)

        assert alice.phase == "eliminated"
        assert bot_b.placement == 1
        assert bot_a.placement == 2

    def test_resolve_reward_done_advances_puppet_and_triggers_game_over(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        puppet, _ = _make_puppet("Bot", history_id=1, stage=3, round_num=1)
        game.puppets.append(puppet)

        alice.phase = "reward"
        alice.last_opponent_name = puppet.name
        puppet.poison = 10

        outcome = resolve_reward_done(game, alice)

        assert outcome.status == "game_over"
        assert outcome.winner is alice
        assert outcome.eliminated == (puppet,)
        assert alice.phase == "winner"
        assert alice.placement == 1
        assert puppet.is_eliminated is True
        assert puppet.placement == 2
        assert puppet.round == 2

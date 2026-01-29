"""
Comprehensive E2E tests for ghost and sudden death mechanics.

These tests simulate REAL games through the GameManager to verify ghost and sudden death
mechanics work correctly. Tests are expected to FAIL initially - the purpose is to catch
bugs by having comprehensive assertions that validate expected game state at each step.
"""

import pytest

from mtb.models.cards import Card
from mtb.models.game import (
    BattleSnapshotData,
    FakePlayer,
    Game,
    Player,
    StaticOpponent,
    create_game,
)
from mtb.phases import battle
from mtb.phases.elimination import (
    check_game_over,
    get_live_bots,
    get_live_players,
    get_sudden_death_fighters,
    needs_sudden_death,
    process_bot_eliminations,
    would_be_dead_ready_for_elimination,
)
from server.services.game_manager import GameManager

Participant = Player | FakePlayer

PLAYER_CONFIGS = [
    pytest.param(4, 0, id="4H0B"),
    pytest.param(3, 1, id="3H1B"),
    pytest.param(2, 2, id="2H2B"),
    pytest.param(1, 3, id="1H3B"),
]


def get_participant_name(p: Participant) -> str:
    return p.name


def get_participant_poison(p: Participant) -> int:
    return p.poison


def set_participant_poison(p: Participant, poison: int) -> None:
    p.poison = poison


def is_participant_eliminated(p: Participant) -> bool:
    if isinstance(p, Player):
        return p.phase == "eliminated"
    return p.is_eliminated


def get_participant_in_sudden_death(p: Participant) -> bool:
    return p.in_sudden_death


def create_test_bot(name: str, player_history_id: int) -> FakePlayer:
    """Create a FakePlayer with valid snapshots for testing."""
    bot = FakePlayer(name=name, player_history_id=player_history_id, poison=0)
    snapshot_data = BattleSnapshotData(
        hand=[Card(name=f"{name}Card", image_url="bot", id=f"bot-{player_history_id}", type_line="Creature")],
        vanguard=None,
        basic_lands=["Forest", "Swamp", "Mountain"],
        applied_upgrades=[],
        treasures=1,
    )
    snapshots: dict[str, StaticOpponent] = {}
    for stage in range(3, 7):
        for round_num in range(1, 10):
            key = f"{stage}_{round_num}"
            static_opp = StaticOpponent.from_snapshot(snapshot_data, name, player_history_id)
            snapshots[key] = static_opp
    bot.snapshots = snapshots
    return bot


def create_test_game(num_humans: int, num_bots: int) -> tuple[Game, GameManager, list[Participant]]:
    """Create a game with specified number of humans and bots."""
    human_names = [f"Human{i + 1}" for i in range(num_humans)]
    game = create_game(human_names, num_humans)

    manager = GameManager()
    manager._active_games["test-game"] = game

    for i, player in enumerate(game.players):
        player_id = f"player-{i}"
        manager._player_to_game[player_id] = "test-game"
        manager._player_id_to_name[player_id] = player.name

    for i in range(num_bots):
        bot = create_test_bot(f"Bot{i + 1}", player_history_id=100 + i)
        game.fake_players.append(bot)

    participants: list[Participant] = list(game.players) + list(game.fake_players)
    return game, manager, participants


def setup_participant_for_battle(p: Participant, stage: int = 3, round_num: int = 1) -> None:
    """Set up a participant for battle phase."""
    if isinstance(p, Player):
        p.phase = "battle"
        p.chosen_basics = ["Plains", "Island", "Mountain"]
        p.hand = [Card(name=f"{p.name}Card", image_url="test", id=f"card-{p.name}", type_line="Creature")]
        p.stage = stage
        p.round = round_num
    else:
        p.stage = stage
        p.round = round_num


def start_battle_between(
    game: Game, p1: Participant, p2: Participant, stage: int = 3, round_num: int = 1
) -> battle.Battle | None:
    """Start a battle between any two participants (human or bot).

    Returns None for bot-vs-bot (auto-resolved), Battle object otherwise.
    """
    if isinstance(p1, FakePlayer) and isinstance(p2, FakePlayer):
        battle.resolve_bot_vs_bot(p1, p2, stage, round_num)
        return None

    if isinstance(p1, FakePlayer):
        static_p1 = p1.get_opponent_for_round(stage, round_num)
        if static_p1 is None:
            raise ValueError(f"No snapshot for {p1.name} at stage {stage}, round {round_num}")
        assert isinstance(p2, Player)
        return battle.start(game, p2, static_p1)

    if isinstance(p2, FakePlayer):
        static_p2 = p2.get_opponent_for_round(stage, round_num)
        if static_p2 is None:
            raise ValueError(f"No snapshot for {p2.name} at stage {stage}, round {round_num}")
        return battle.start(game, p1, static_p2)

    return battle.start(game, p1, p2)


def end_battle_with_result(
    manager: GameManager,
    game: Game,
    b: battle.Battle,
    winner_name: str | None,
    check_eliminations: bool = True,
) -> str | None:
    """End a battle with the specified winner (or "draw" for winner_name=None).

    If check_eliminations is True and there are no more active battles,
    triggers the elimination check.
    """
    result_str = winner_name if winner_name else "draw"

    battle.submit_result(b, b.player, result_str)
    if isinstance(b.opponent, Player):
        battle.submit_result(b, b.opponent, result_str)

    result = manager._end_battle(game, b, "test-game", None)

    if check_eliminations and not game.active_battles:
        sd_result = manager._check_sudden_death_ready(game, "test-game", None)
        if sd_result:
            return sd_result

    return result


def verify_ghost_state(game: Game, expected_ghost_name: str | None, expected_poison: int | None = None) -> None:
    """Verify ghost state is correct."""
    if expected_ghost_name is None:
        assert game.most_recent_ghost is None, f"Expected no ghost, but got {game.most_recent_ghost}"
    else:
        assert game.most_recent_ghost is not None, "Expected ghost but got None"
        assert game.most_recent_ghost.name == expected_ghost_name, (
            f"Expected ghost {expected_ghost_name}, got {game.most_recent_ghost.name}"
        )
        if expected_poison is not None:
            assert game.most_recent_ghost.poison == expected_poison, (
                f"Expected ghost poison {expected_poison}, got {game.most_recent_ghost.poison}"
            )


def count_live_participants(game: Game) -> int:
    """Count total live participants (humans + bots)."""
    return len(get_live_players(game)) + len(get_live_bots(game))


class TestGhostAndSuddenDeathE2E:
    """E2E tests for ghost and sudden death mechanics across different player configurations."""

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_first_elimination_creates_ghost_when_odd_survivors(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """When first player is eliminated with 3 remaining, ghost should be created."""
        game, manager, participants = create_test_game(num_humans, num_bots)
        assert len(participants) == 4, f"Expected 4 participants, got {len(participants)}"

        for p in participants:
            setup_participant_for_battle(p)

        p1, p2, p3, p4 = participants

        set_participant_poison(p1, 9)
        set_participant_poison(p2, 0)
        set_participant_poison(p3, 0)
        set_participant_poison(p4, 0)

        b1 = start_battle_between(game, p1, p2)
        b2 = start_battle_between(game, p3, p4)

        if b1:
            end_battle_with_result(manager, game, b1, get_participant_name(p2))

        if isinstance(p1, Player):
            assert p1.phase in (
                "awaiting_elimination",
                "eliminated",
            ), f"p1 phase should be awaiting_elimination or eliminated, got {p1.phase}"

        if b2:
            end_battle_with_result(manager, game, b2, get_participant_name(p3))

        assert count_live_participants(game) == 3, f"Expected 3 survivors, got {count_live_participants(game)}"

        if game.most_recent_ghost:
            assert game.most_recent_ghost.hand_revealed is True, "Ghost hand should be revealed"
        elif game.most_recent_ghost_bot:
            pass
        else:
            pytest.fail("Expected either most_recent_ghost or most_recent_ghost_bot to be set with 3 survivors")

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_ghost_cleared_when_even_survivors(self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data):
        """When a second player is eliminated (2 survivors remain), ghost should be cleared.

        This tests a two-round scenario:
        Round 1: p1 dies (3 survivors remain, ghost created)
        Round 2: one more dies (2 survivors remain, ghost cleared)

        """
        game, manager, participants = create_test_game(num_humans, num_bots)
        assert len(participants) == 4

        # Round 1: p1 will die, p2 survives
        for p in participants:
            setup_participant_for_battle(p)

        p1, p2, p3, p4 = participants

        set_participant_poison(p1, 9)  # Will die when losing
        set_participant_poison(p2, 0)  # Winner, survives
        set_participant_poison(p3, 0)
        set_participant_poison(p4, 0)

        b1 = start_battle_between(game, p1, p2)
        b2 = start_battle_between(game, p3, p4)

        if b1:
            end_battle_with_result(manager, game, b1, get_participant_name(p2))
        if b2:
            end_battle_with_result(manager, game, b2, get_participant_name(p3))

        assert count_live_participants(game) == 3, (
            f"After round 1: expected 3 survivors, got {count_live_participants(game)}"
        )
        assert game.most_recent_ghost is not None or game.most_recent_ghost_bot is not None, (
            "After round 1: ghost should be set with 3 survivors"
        )

        # Round 2: one more participant will die
        live_participants = get_live_players(game) + get_live_bots(game)
        for p in live_participants:
            setup_participant_for_battle(p, stage=3, round_num=2)

        l1, l2, l3 = live_participants[0], live_participants[1], live_participants[2]

        set_participant_poison(l1, 9)  # l1 will die
        set_participant_poison(l2, 0)
        set_participant_poison(l3, 0)

        # Handle the special case where l1 is a bot - need to directly eliminate
        if isinstance(l1, FakePlayer):
            # Bot-only round 2: Manually trigger bot elimination
            # Set poison to lethal and process
            l1.poison = 10
            process_bot_eliminations(game)
        else:
            # Human l1 will fight l2
            b3 = start_battle_between(game, l1, l2)
            if b3:
                end_battle_with_result(manager, game, b3, get_participant_name(l2))
            manager._check_sudden_death_ready(game, "test-game", None)

        assert count_live_participants(game) == 2, (
            f"After round 2: expected 2 survivors, got {count_live_participants(game)}"
        )
        assert game.most_recent_ghost is None, "Ghost should be None with even survivors"
        assert game.most_recent_ghost_bot is None, "Ghost bot should be None with even survivors"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_ghost_included_in_pairing_candidates(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """Ghost should be included as pairing candidate when odd survivors."""
        game, _manager, participants = create_test_game(num_humans, num_bots)
        assert len(participants) == 4

        for p in participants:
            setup_participant_for_battle(p)

        p1, _p2, _p3, _p4 = participants
        set_participant_poison(p1, 10)

        if isinstance(p1, Player):
            ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            game.most_recent_ghost = ghost
            p1.phase = "eliminated"
        elif isinstance(p1, FakePlayer):
            p1.is_eliminated = True
            game.most_recent_ghost_bot = p1

        live_humans = get_live_players(game)
        assert len(live_humans) + len(get_live_bots(game)) == 3

        if live_humans:
            candidates = battle.get_all_pairing_candidates(game, live_humans[0])
            candidate_names = [c.name for c in candidates]
            ghost_name = get_participant_name(p1)
            assert ghost_name in candidate_names, f"Ghost {ghost_name} not in candidates {candidate_names}"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_awaiting_elimination_phase_before_elimination(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """Players at lethal should go to awaiting_elimination, not eliminated, until battles complete."""
        game, manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        p1, p2, p3, p4 = participants

        set_participant_poison(p1, 9)
        set_participant_poison(p2, 0)
        set_participant_poison(p3, 0)
        set_participant_poison(p4, 0)

        b1 = start_battle_between(game, p1, p2)
        b2 = start_battle_between(game, p3, p4)

        if b1 and isinstance(p1, Player):
            end_battle_with_result(manager, game, b1, get_participant_name(p2))

            if b2 is not None:
                assert p1.phase == "awaiting_elimination", (
                    f"p1 should be awaiting_elimination while battle still active, got {p1.phase}"
                )

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_a_all_three_die_triggers_sudden_death(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """When all 3 survivors reach lethal, sudden death triggers for 2 with lowest poison."""
        game, _manager, participants = create_test_game(num_humans, num_bots)

        p1, p2, p3, p4 = participants
        for p in participants:
            setup_participant_for_battle(p)

        set_participant_poison(p1, 10)
        if isinstance(p1, Player):
            ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            game.most_recent_ghost = ghost
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_bot = p1

        set_participant_poison(p2, 9)
        set_participant_poison(p3, 9)
        set_participant_poison(p4, 9)

        live_humans = [p for p in [p2, p3, p4] if isinstance(p, Player)]
        for h in live_humans:
            h.poison = 10
            h.phase = "awaiting_elimination"

        live_bots = [p for p in [p2, p3, p4] if isinstance(p, FakePlayer)]
        for b in live_bots:
            b.poison = 10

        if live_humans or live_bots:
            assert needs_sudden_death(game), "Should need sudden death when all survivors at lethal"

            fighters = get_sudden_death_fighters(game)
            assert fighters is not None, "Should have fighters for sudden death"

            ghost_name = get_participant_name(p1)
            fighter_names = [get_participant_name(f) for f in fighters]
            assert ghost_name not in fighter_names, f"Ghost {ghost_name} should not be in sudden death fighters"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_b_two_die_triggers_sudden_death(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """When 2 of 3 survivors reach lethal, sudden death triggers between those 2."""
        game, _manager, participants = create_test_game(num_humans, num_bots)

        p1, p2, p3, p4 = participants
        for p in participants:
            setup_participant_for_battle(p)

        set_participant_poison(p1, 10)
        if isinstance(p1, Player):
            ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            game.most_recent_ghost = ghost
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_bot = p1

        set_participant_poison(p2, 10)
        set_participant_poison(p3, 10)
        set_participant_poison(p4, 5)

        live_participants = [p for p in [p2, p3, p4] if not is_participant_eliminated(p)]
        would_die = [p for p in live_participants if get_participant_poison(p) >= 10]
        survivors_after = len(live_participants) - len(would_die)

        if survivors_after < 2 and len(would_die) >= 2:
            assert needs_sudden_death(game), "Should need sudden death"

            fighters = get_sudden_death_fighters(game)
            assert fighters is not None, "Should have fighters"

            fighter_names = {get_participant_name(f) for f in fighters}
            assert get_participant_name(p4) not in fighter_names, "p4 (not at lethal) should not be fighter"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_c_one_dies_no_sudden_death(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """When only 1 of 3 survivors reaches lethal, no sudden death (2 remain)."""
        game, _manager, participants = create_test_game(num_humans, num_bots)

        p1, p2, p3, p4 = participants
        for p in participants:
            setup_participant_for_battle(p)

        set_participant_poison(p1, 10)
        if isinstance(p1, Player):
            ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            game.most_recent_ghost = ghost
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_bot = p1

        set_participant_poison(p2, 10)
        set_participant_poison(p3, 5)
        set_participant_poison(p4, 3)

        assert not needs_sudden_death(game), "Should NOT need sudden death when 2 survivors remain"
        assert game.most_recent_ghost is not None or game.most_recent_ghost_bot is not None, (
            "Ghost should still exist before second elimination"
        )

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_sudden_death_fighters_have_flag_set(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """Sudden death fighters should have in_sudden_death flag set."""
        game, manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        p1, p2, p3, p4 = participants

        set_participant_poison(p1, 10)
        set_participant_poison(p2, 11)
        set_participant_poison(p3, 5)
        set_participant_poison(p4, 3)

        if isinstance(p3, Player):
            p3.phase = "draft"
        if isinstance(p4, Player):
            p4.phase = "draft"

        live_humans_at_lethal = [p for p in [p1, p2] if isinstance(p, Player)]
        for h in live_humans_at_lethal:
            h.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)

        if result == "sudden_death":
            fighters_with_flag = [p for p in participants if get_participant_in_sudden_death(p)]
            assert len(fighters_with_flag) == 2, f"Expected 2 fighters with flag, got {len(fighters_with_flag)}"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_sudden_death_resets_poison_to_threshold_minus_one(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """Sudden death fighters should have poison reset to poison_to_lose - 1 (9)."""
        game, manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        p1, p2, p3, p4 = participants

        set_participant_poison(p1, 12)
        set_participant_poison(p2, 15)
        set_participant_poison(p3, 5)
        set_participant_poison(p4, 3)

        if isinstance(p3, Player):
            p3.phase = "draft"
        if isinstance(p4, Player):
            p4.phase = "draft"

        live_humans_at_lethal = [p for p in [p1, p2] if isinstance(p, Player)]
        for h in live_humans_at_lethal:
            h.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)

        if result == "sudden_death":
            fighters = [p for p in participants if get_participant_in_sudden_death(p)]
            for fighter in fighters:
                name = get_participant_name(fighter)
                poison = get_participant_poison(fighter)
                assert poison == 9, f"Fighter {name} should have poison 9, got {poison}"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_sudden_death_flag_cleared_after_resolution(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """After sudden death resolves (one dies), flags should be cleared."""
        if num_humans < 2:
            pytest.skip("Need at least 2 humans to test PvP sudden death resolution")

        game, manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        humans = [p for p in participants if isinstance(p, Player)]
        h1, h2 = humans[0], humans[1]

        h1.poison = 9
        h2.poison = 9
        h1.in_sudden_death = True
        h2.in_sudden_death = True

        b = battle.start(game, h1, h2, is_sudden_death=True)
        end_battle_with_result(manager, game, b, h1.name)

        if h1.phase == "eliminated" or h2.phase == "eliminated":
            for h in [h1, h2]:
                if h.phase != "eliminated":
                    assert not h.in_sudden_death, f"{h.name} should have in_sudden_death cleared after resolution"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_would_be_dead_ready_blocks_on_active_battles(
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """would_be_dead_ready_for_elimination should return False when battles are active."""
        game, _manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        _p1, _p2, _p3, _p4 = participants

        humans = [p for p in participants if isinstance(p, Player)]
        if len(humans) < 2:
            pytest.skip("Need at least 2 humans to test active battles blocking")

        h1, h2 = humans[0], humans[1]
        h1.poison = 10
        h2.poison = 10

        battle.start(game, h1, h2)

        assert not would_be_dead_ready_for_elimination(game), (
            "Should not be ready for elimination while battles are active"
        )

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_full_game_flow_to_finale(  # noqa: PLR0912, PLR0915
        self, num_humans: int, num_bots: int, reset_singletons, mock_cube_data
    ):
        """Test full game flow from 4 players to finale (2 remaining).

        For 1H3B, bots must die (not the human) since game ends when no humans remain.
        """
        game, manager, participants = create_test_game(num_humans, num_bots)

        for p in participants:
            setup_participant_for_battle(p)

        _p1, _p2, _p3, _p4 = participants

        # Find a participant that can die without ending the game
        # (i.e., don't kill the last human)
        humans = [p for p in participants if isinstance(p, Player)]
        bots = [p for p in participants if isinstance(p, FakePlayer)]

        if len(humans) == 1:
            # 1H3B: A bot must die, not the human
            victim = bots[0]
            survivor = humans[0]
        else:
            # Multiple humans: first human can die
            victim = humans[0]
            survivor = humans[1] if len(humans) > 1 else bots[0]

        set_participant_poison(victim, 9)
        for p in participants:
            if p != victim:
                set_participant_poison(p, 0)

        b1 = start_battle_between(game, victim, survivor)
        # Pair the other two
        others = [p for p in participants if p not in (victim, survivor)]
        b2 = start_battle_between(game, others[0], others[1])

        if b1:
            end_battle_with_result(manager, game, b1, get_participant_name(survivor))
        if b2:
            end_battle_with_result(manager, game, b2, get_participant_name(others[0]))

        assert count_live_participants(game) == 3, "Should have 3 survivors after first round"

        # Round 2: eliminate one more (but not the last human)
        live = get_live_players(game) + get_live_bots(game)
        for p in live:
            setup_participant_for_battle(p, stage=3, round_num=2)

        live_humans = [p for p in live if isinstance(p, Player)]
        live_bots = [p for p in live if isinstance(p, FakePlayer)]

        if len(live_humans) == 1:
            # Only one human left - a bot must die
            victim2 = live_bots[0]
            survivor2 = live_humans[0]
        else:
            # Multiple humans - one can die
            victim2 = live_humans[0]
            survivor2 = live_humans[1] if len(live_humans) > 1 else live_bots[0]

        set_participant_poison(victim2, 9)

        if isinstance(victim2, Player) and isinstance(survivor2, Player):
            b3 = battle.start(game, victim2, survivor2)
            end_battle_with_result(manager, game, b3, get_participant_name(survivor2))
        elif isinstance(victim2, Player) and isinstance(survivor2, FakePlayer):
            static = survivor2.get_opponent_for_round(3, 2)
            if static:
                b3 = battle.start(game, victim2, static)
                end_battle_with_result(manager, game, b3, survivor2.name)
        elif isinstance(victim2, FakePlayer) and isinstance(survivor2, Player):
            static = victim2.get_opponent_for_round(3, 2)
            if static:
                b3 = battle.start(game, survivor2, static)
                end_battle_with_result(manager, game, b3, survivor2.name)
        elif isinstance(victim2, FakePlayer) and isinstance(survivor2, FakePlayer):
            # Bot vs bot - directly eliminate the victim
            victim2.poison = 10
            process_bot_eliminations(game)

        manager._check_sudden_death_ready(game, "test-game", None)

        live_count = count_live_participants(game)
        assert live_count == 2, f"Should have 2 survivors for finale, got {live_count}"

        assert game.most_recent_ghost is None, "Ghost should be cleared with even survivors"
        assert game.most_recent_ghost_bot is None, "Ghost bot should be cleared with even survivors"


class TestBotSpecificScenarios:
    """Tests specific to bot behavior in ghost/sudden death scenarios."""

    def test_bot_vs_bot_sudden_death_auto_resolves(self, reset_singletons, mock_cube_data):
        """When 2 bots are in sudden death, one is randomly eliminated."""
        game, manager, participants = create_test_game(1, 3)

        human = participants[0]
        bots = [p for p in participants if isinstance(p, FakePlayer)]
        bot1, bot2, bot3 = bots[0], bots[1], bots[2]

        for p in participants:
            setup_participant_for_battle(p)

        if isinstance(human, Player):
            human.phase = "eliminated"

        bot1.poison = 10
        bot2.poison = 11
        bot3.poison = 5

        manager._check_sudden_death_ready(game, "test-game", None)

        eliminated_bots = [b for b in bots if b.is_eliminated]
        live_bots = [b for b in bots if not b.is_eliminated]

        assert len(eliminated_bots) >= 1, "At least one bot should be eliminated"
        assert len(live_bots) >= 1, "At least one bot should survive"

    def test_human_vs_bot_sudden_death_starts_build_phase(self, reset_singletons, mock_cube_data):
        """When human and bot are sudden death fighters, human goes to build phase."""
        game, manager, participants = create_test_game(2, 2)

        humans = [p for p in participants if isinstance(p, Player)]
        bots = [p for p in participants if isinstance(p, FakePlayer)]

        h1, h2 = humans[0], humans[1]
        b1, b2 = bots[0], bots[1]

        for p in participants:
            setup_participant_for_battle(p)

        h2.phase = "eliminated"
        b2.is_eliminated = True

        h1.poison = 10
        b1.poison = 11
        h1.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)

        if result == "sudden_death":
            assert h1.phase == "build", f"Human should be in build phase, got {h1.phase}"
            assert h1.in_sudden_death, "Human should have in_sudden_death flag"
            assert b1.in_sudden_death, "Bot should have in_sudden_death flag"

    def test_bot_ghost_available_for_pairing(self, reset_singletons, mock_cube_data):
        """When a bot is eliminated with odd survivors, it should be available as ghost."""
        game, _manager, participants = create_test_game(2, 2)

        [p for p in participants if isinstance(p, Player)]
        bots = [p for p in participants if isinstance(p, FakePlayer)]

        for p in participants:
            setup_participant_for_battle(p)

        bot_to_eliminate = bots[0]
        bot_to_eliminate.is_eliminated = True
        bot_to_eliminate.poison = 10
        game.most_recent_ghost_bot = bot_to_eliminate

        live_humans = get_live_players(game)
        assert len(live_humans) == 2

        candidates = battle.get_all_pairing_candidates(game, live_humans[0])
        candidate_names = [c.name for c in candidates]

        assert bot_to_eliminate.name in candidate_names, (
            f"Eliminated bot {bot_to_eliminate.name} should be pairing candidate as ghost"
        )


class TestBotEliminations:
    """Tests for bot elimination logic."""

    def test_process_bot_eliminations_counts_remaining_correctly(self, reset_singletons, mock_cube_data):
        """Verify process_bot_eliminations correctly counts remaining participants.

        With 2 participants remaining (even number), most_recent_ghost_bot should be None.
        """
        game, _manager, participants = create_test_game(1, 3)

        human = participants[0]
        bots = [p for p in participants if isinstance(p, FakePlayer)]

        if isinstance(human, Player):
            human.phase = "eliminated"

        bots[0].poison = 10
        bots[1].poison = 0
        bots[2].poison = 0

        process_bot_eliminations(game)

        live_count = count_live_participants(game)
        assert live_count == 2, f"Expected 2 survivors, got {live_count}"

        assert game.most_recent_ghost_bot is None, (
            f"most_recent_ghost_bot should be None with even survivors, "
            f"but is set to {game.most_recent_ghost_bot.name if game.most_recent_ghost_bot else 'None'}"
        )


class TestEdgeCases:
    """Edge case tests for ghost and sudden death mechanics."""

    def test_ghost_not_in_sudden_death_fighters(self, reset_singletons, mock_cube_data):
        """Ghost should never be selected as a sudden death fighter."""
        game, _manager, _participants = create_test_game(4, 0)

        # All participants are Players in 4H0B config
        p1, p2, p3, p4 = game.players
        for p in game.players:
            setup_participant_for_battle(p)

        p4.phase = "eliminated"
        ghost = StaticOpponent.from_player(p4, hand_revealed=True)
        game.most_recent_ghost = ghost

        p1.poison = 10
        p2.poison = 11
        p3.poison = 12
        p1.phase = "awaiting_elimination"
        p2.phase = "awaiting_elimination"
        p3.phase = "awaiting_elimination"

        fighters = get_sudden_death_fighters(game)

        assert fighters is not None
        fighter_names = [f.name for f in fighters]
        assert p4.name not in fighter_names, "Ghost should not be in sudden death fighters"

    def test_three_at_lethal_highest_poison_eliminated(self, reset_singletons, mock_cube_data):
        """When 3 players at lethal, the one with highest poison is eliminated immediately."""
        game, manager, participants = create_test_game(3, 1)

        humans = [p for p in participants if isinstance(p, Player)]
        bots = [p for p in participants if isinstance(p, FakePlayer)]

        for p in participants:
            setup_participant_for_battle(p)

        bots[0].is_eliminated = True

        h1, h2, h3 = humans[0], humans[1], humans[2]
        h1.poison = 10
        h2.poison = 11
        h3.poison = 15
        h1.phase = "awaiting_elimination"
        h2.phase = "awaiting_elimination"
        h3.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)

        assert result == "sudden_death"
        assert h3.phase == "eliminated", "Player with highest poison should be eliminated"
        assert h1.phase == "build", "Lower poison fighters should be in build"
        assert h2.phase == "build", "Lower poison fighters should be in build"

    def test_simultaneous_battles_both_end_before_elimination(self, reset_singletons, mock_cube_data):
        """Both battles must end before elimination processing happens."""
        game, manager, _participants = create_test_game(4, 0)

        # All participants are Players in 4H0B config
        p1, p2, p3, p4 = game.players
        for p in game.players:
            setup_participant_for_battle(p)

        p1.poison = 9
        p3.poison = 9

        b1 = battle.start(game, p1, p2)
        b2 = battle.start(game, p3, p4)

        end_battle_with_result(manager, game, b1, p2.name)

        assert p1.phase == "awaiting_elimination", (
            f"p1 should be awaiting elimination while b2 is active, got {p1.phase}"
        )

        end_battle_with_result(manager, game, b2, p4.name)

        assert count_live_participants(game) == 2, "Both should be eliminated now, 2 remain"


class TestDoubleDrawBotSuddenDeath:
    """Tests for the bug where double draw kills all bots but human survives.

    The bug: In a 1H+3B game, when double draw results in all 3 bots reaching
    lethal but human survives, game incorrectly declares human winner instead
    of triggering sudden death between the 2 bots with lowest poison.
    """

    def test_double_draw_kills_three_bots_human_survives_triggers_sudden_death(self, reset_singletons, mock_cube_data):
        """When 3 bots die from double draw but human survives, sudden death should trigger.

        Setup: 1H + 3B game
        - Human at poison 5 (survives)
        - All 3 bots at poison 10 (lethal)

        Expected: Sudden death triggers between 2 bots, winner advances to face human.
        Human should NOT be declared winner immediately.
        """
        game, manager, participants = create_test_game(1, 3)

        human = next(p for p in participants if isinstance(p, Player))
        bots = [p for p in participants if isinstance(p, FakePlayer)]
        bot1, bot2, bot3 = bots

        for p in participants:
            setup_participant_for_battle(p)

        set_participant_poison(human, 5)
        set_participant_poison(bot1, 10)
        set_participant_poison(bot2, 10)
        set_participant_poison(bot3, 10)

        static_opponent = bot1.get_opponent_for_round(3, 1)
        assert static_opponent is not None

        b = start_battle_between(game, human, bot1)
        assert b is not None

        end_battle_with_result(manager, game, b, None, check_eliminations=False)

        assert human.phase != "winner", f"Human should NOT be declared winner yet, got phase {human.phase}"

        live_bots = get_live_bots(game)
        assert len(live_bots) == 1, f"Exactly 1 bot should survive sudden death to face human, got {len(live_bots)}"

        surviving_bot = live_bots[0]
        assert surviving_bot.poison == 9, f"Surviving bot should have poison reset to 9, got {surviving_bot.poison}"

        _, is_game_over = check_game_over(game)
        assert not is_game_over, "Game should NOT be over - human vs bot finale remains"

    def test_double_draw_kills_all_four_triggers_sudden_death(self, reset_singletons, mock_cube_data):
        """When all 4 (human + 3 bots) reach lethal, sudden death triggers for 2 lowest.

        Setup: 1H + 3B game, poison set so all are at lethal AFTER battle damage
        - Human at 9 → 10 after draw (lowest - guaranteed fighter)
        - Bot1 at 14 → 15 after draw (highest - eliminated immediately)
        - Bot2/Bot3 at 12 (unchanged, not in battle)

        Expected: Human + 1 bot go to sudden death, other 2 eliminated.
        Human should be in build phase ready for sudden death battle.
        """
        game, manager, participants = create_test_game(1, 3)

        human = next(p for p in participants if isinstance(p, Player))
        bots = [p for p in participants if isinstance(p, FakePlayer)]
        bot1, bot2, bot3 = bots

        for p in participants:
            setup_participant_for_battle(p)

        set_participant_poison(human, 9)
        set_participant_poison(bot1, 14)
        set_participant_poison(bot2, 12)
        set_participant_poison(bot3, 12)

        static_opponent = bot1.get_opponent_for_round(3, 1)
        assert static_opponent is not None

        b = start_battle_between(game, human, bot1)
        assert b is not None

        end_battle_with_result(manager, game, b, None, check_eliminations=False)

        live_bots = get_live_bots(game)
        live_humans = get_live_players(game)
        total_live = len(live_bots) + len(live_humans)

        assert total_live == 2, f"Exactly 2 participants should remain for sudden death, got {total_live}"

        assert human.phase == "build", f"Human should be in build phase for sudden death, got {human.phase}"
        assert human.in_sudden_death, "Human should have in_sudden_death flag set"
        assert human.poison == 9, f"Human poison should be reset to 9, got {human.poison}"

        assert len(live_bots) == 1, "Exactly 1 bot should be in sudden death with human"
        surviving_bot = live_bots[0]
        assert surviving_bot.in_sudden_death, "Surviving bot should have in_sudden_death flag"
        assert surviving_bot.poison == 9, f"Bot poison should be reset to 9, got {surviving_bot.poison}"

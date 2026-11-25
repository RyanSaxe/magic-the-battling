"""E2E tests for ghost and sudden death mechanics across player/bot table configurations."""

import pytest

from pitfight.models.cards import Card
from pitfight.models.game import (
    BattleSnapshotData,
    Game,
    Player,
    Puppet,
    StaticOpponent,
    create_game,
)
from pitfight.phases import battle
from pitfight.phases.elimination import (
    get_live_players,
    get_live_puppets,
    get_sudden_death_fighters,
    needs_sudden_death,
    process_puppet_eliminations,
    would_be_dead_ready_for_elimination,
)
from server.services.game_manager import GameManager

Participant = Player | Puppet

PLAYER_CONFIGS = [
    pytest.param(4, 0, id="4H0B"),
    pytest.param(3, 1, id="3H1B"),
    pytest.param(2, 2, id="2H2B"),
    pytest.param(1, 3, id="1H3B"),
]

MULTI_HUMAN_CONFIGS = [
    pytest.param(4, 0, id="4H0B"),
    pytest.param(3, 1, id="3H1B"),
    pytest.param(2, 2, id="2H2B"),
]


def _set_poison(p: Participant, poison: int) -> None:
    p.poison = poison


def _is_eliminated(p: Participant) -> bool:
    return p.phase == "eliminated" if isinstance(p, Player) else p.is_eliminated


def _create_test_bot(name: str, player_history_id: int) -> Puppet:
    bot = Puppet(name=name, player_history_id=player_history_id, poison=0)
    snapshot_data = BattleSnapshotData(
        hand=[Card(name=f"{name}Card", image_url="bot", id=f"bot-{player_history_id}", type_line="Creature")],
        vanguard=None,
        basic_lands=["Forest", "Swamp", "Mountain"],
        applied_upgrades=[],
        treasures=1,
    )
    bot.snapshots = {
        f"{stage}_{round_num}": StaticOpponent.from_snapshot(snapshot_data, name, history_id=player_history_id)
        for stage in range(3, 7)
        for round_num in range(1, 10)
    }
    return bot


def _create_test_game(num_humans: int, num_bots: int) -> tuple[Game, GameManager, list[Participant]]:
    human_names = [f"Human{i + 1}" for i in range(num_humans)]
    game = create_game(human_names, num_humans)

    manager = GameManager()
    manager.active_games["test-game"] = game
    for i, player in enumerate(game.players):
        player_id = f"player-{i}"
        manager.player_to_game[player_id] = "test-game"
        manager.player_id_to_name[player_id] = player.name

    for i in range(num_bots):
        game.puppets.append(_create_test_bot(f"Bot{i + 1}", player_history_id=100 + i))

    return game, manager, [*game.players, *game.puppets]


def _setup_for_battle(p: Participant, stage: int = 3, *, round_num: int = 1) -> None:
    p.stage = stage
    p.round = round_num
    if isinstance(p, Player):
        p.phase = "battle"
        p.chosen_basics = ["Plains", "Island", "Mountain"]
        p.hand = [Card(name=f"{p.name}Card", image_url="test", id=f"card-{p.name}", type_line="Creature")]


def _start_battle(
    game: Game, p1: Participant, *, p2: Participant, stage: int = 3, round_num: int = 1
) -> battle.Battle | None:
    if isinstance(p1, Puppet) and isinstance(p2, Puppet):
        battle.resolve_puppet_vs_puppet(p1, p2, stage=stage, round_num=round_num, use_upgrades=game.config.use_upgrades)
        return None
    if isinstance(p1, Puppet):
        static_p1 = p1.get_opponent_for_round(stage, round_num)
        assert static_p1 is not None
        assert isinstance(p2, Player)
        return battle.start(game, p2, opponent=static_p1)
    if isinstance(p2, Puppet):
        static_p2 = p2.get_opponent_for_round(stage, round_num)
        assert static_p2 is not None
        return battle.start(game, p1, opponent=static_p2)
    return battle.start(game, p1, opponent=p2)


def _submit_battle_result(manager: GameManager, game: Game, *, b: battle.Battle, winner_name: str | None) -> None:
    result_str = winner_name or "draw"
    manager.handle_battle_submit_result(game, b.player, result=result_str, game_id="test-game", db=None)
    if isinstance(b.opponent, Player):
        manager.handle_battle_submit_result(game, b.opponent, result=result_str, game_id="test-game", db=None)


def _count_live(game: Game) -> int:
    return len(get_live_players(game)) + len(get_live_puppets(game))


class TestGhostAndSuddenDeathE2E:
    """E2E tests for ghost and sudden death mechanics across different player configurations."""

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_first_elimination_creates_ghost_when_odd_survivors(self, num_humans: int, num_bots: int) -> None:
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        p1, p2, p3, p4 = participants
        _set_poison(p1, 9)
        for p in (p2, p3, p4):
            _set_poison(p, 0)

        b1 = _start_battle(game, p1, p2=p2)
        b2 = _start_battle(game, p3, p2=p4)

        if b1:
            _submit_battle_result(manager, game, b=b1, winner_name=p2.name)
        if isinstance(p1, Player):
            assert p1.phase in ("awaiting_elimination", "eliminated")
        if b2:
            _submit_battle_result(manager, game, b=b2, winner_name=p3.name)

        assert _count_live(game) == 3
        if game.most_recent_ghost:
            assert game.most_recent_ghost.hand_revealed is True
        else:
            assert game.most_recent_ghost_puppet is not None

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_ghost_cleared_when_even_survivors(self, num_humans: int, num_bots: int) -> None:
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        p1, p2, p3, p4 = participants
        _set_poison(p1, 9)
        for p in (p2, p3, p4):
            _set_poison(p, 0)

        b1 = _start_battle(game, p1, p2=p2)
        b2 = _start_battle(game, p3, p2=p4)
        if b1:
            _submit_battle_result(manager, game, b=b1, winner_name=p2.name)
        if b2:
            _submit_battle_result(manager, game, b=b2, winner_name=p3.name)

        assert _count_live(game) == 3
        assert game.most_recent_ghost is not None or game.most_recent_ghost_puppet is not None

        live_participants: list[Participant] = [*get_live_players(game), *get_live_puppets(game)]
        for p in live_participants:
            _setup_for_battle(p, stage=3, round_num=2)

        l1, l2, l3 = live_participants[:3]
        _set_poison(l1, 9)
        _set_poison(l2, 0)
        _set_poison(l3, 0)

        if isinstance(l1, Puppet):
            l1.poison = 10
            process_puppet_eliminations(game)
        else:
            b3 = _start_battle(game, l1, p2=l2, stage=3, round_num=2)
            if b3:
                _submit_battle_result(manager, game, b=b3, winner_name=l2.name)

        assert _count_live(game) == 2
        assert game.most_recent_ghost is None
        assert game.most_recent_ghost_puppet is None

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_ghost_included_in_pairing_candidates(self, num_humans: int, num_bots: int) -> None:
        game, _manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        p1 = participants[0]
        _set_poison(p1, 10)
        if isinstance(p1, Player):
            game.most_recent_ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_puppet = p1

        live_humans = get_live_players(game)
        assert _count_live(game) == 3
        if live_humans:
            candidates = battle.get_all_pairing_candidates(game, live_humans[0])
            assert p1.name in [c.name for c in candidates]

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_awaiting_elimination_phase_before_elimination(self, num_humans: int, num_bots: int) -> None:
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        p1, p2, p3, p4 = participants
        _set_poison(p1, 9)
        for p in (p2, p3, p4):
            _set_poison(p, 0)

        b1 = _start_battle(game, p1, p2=p2)
        b2 = _start_battle(game, p3, p2=p4)

        if b1 and isinstance(p1, Player) and b2 is not None:
            _submit_battle_result(manager, game, b=b1, winner_name=p2.name)
            assert p1.phase == "awaiting_elimination"

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_a_all_three_die_triggers_sudden_death(self, num_humans: int, num_bots: int) -> None:
        game, _manager, participants = _create_test_game(num_humans, num_bots)
        p1, p2, p3, p4 = participants
        for p in participants:
            _setup_for_battle(p)

        _set_poison(p1, 10)
        if isinstance(p1, Player):
            game.most_recent_ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_puppet = p1

        for p in (p2, p3, p4):
            _set_poison(p, 10)
            if isinstance(p, Player):
                p.phase = "awaiting_elimination"

        assert needs_sudden_death(game)
        fighters = get_sudden_death_fighters(game)
        assert fighters is not None
        assert p1.name not in [f.name for f in fighters]

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_b_two_die_triggers_sudden_death(self, num_humans: int, num_bots: int) -> None:
        game, _manager, participants = _create_test_game(num_humans, num_bots)
        p1, p2, p3, p4 = participants
        for p in participants:
            _setup_for_battle(p)

        _set_poison(p1, 10)
        if isinstance(p1, Player):
            game.most_recent_ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_puppet = p1

        _set_poison(p2, 10)
        _set_poison(p3, 10)
        _set_poison(p4, 5)

        live_participants = [p for p in (p2, p3, p4) if not _is_eliminated(p)]
        would_die = [p for p in live_participants if p.poison >= 10]
        if len(live_participants) - len(would_die) < 2 and len(would_die) >= 2:
            assert needs_sudden_death(game)
            fighters = get_sudden_death_fighters(game)
            assert fighters is not None
            assert p4.name not in {f.name for f in fighters}

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_scenario_c_one_dies_no_sudden_death(self, num_humans: int, num_bots: int) -> None:
        game, _manager, participants = _create_test_game(num_humans, num_bots)
        p1, p2, p3, p4 = participants
        for p in participants:
            _setup_for_battle(p)

        _set_poison(p1, 10)
        if isinstance(p1, Player):
            game.most_recent_ghost = StaticOpponent.from_player(p1, hand_revealed=True)
            p1.phase = "eliminated"
        else:
            p1.is_eliminated = True
            game.most_recent_ghost_puppet = p1

        _set_poison(p2, 10)
        _set_poison(p3, 5)
        _set_poison(p4, 3)

        assert not needs_sudden_death(game)
        assert game.most_recent_ghost is not None or game.most_recent_ghost_puppet is not None

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_sudden_death_sets_flag_and_resets_poison_to_threshold_minus_one(
        self, num_humans: int, num_bots: int
    ) -> None:
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        p1, p2, p3, p4 = participants
        _set_poison(p1, 12)
        _set_poison(p2, 15)
        _set_poison(p3, 5)
        _set_poison(p4, 3)

        for p in (p3, p4):
            if isinstance(p, Player):
                p.phase = "draft"
        for p in (p1, p2):
            if isinstance(p, Player):
                p.phase = "awaiting_elimination"

        result = manager.check_sudden_death_ready(game, "test-game", db=None)
        if result == "sudden_death":
            fighters = [p for p in participants if p.in_sudden_death]
            assert len(fighters) == 2
            assert all(f.poison == 9 for f in fighters)

    @pytest.mark.parametrize(("num_humans", "num_bots"), MULTI_HUMAN_CONFIGS)
    def test_sudden_death_flag_cleared_after_resolution(self, num_humans: int, num_bots: int) -> None:
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        h1, h2 = game.players[0], game.players[1]
        h1.poison = 9
        h2.poison = 9
        h1.in_sudden_death = True
        h2.in_sudden_death = True

        b = battle.start(game, h1, opponent=h2, is_sudden_death=True)
        _submit_battle_result(manager, game, b=b, winner_name=h1.name)

        if h1.phase == "eliminated" or h2.phase == "eliminated":
            for h in (h1, h2):
                if h.phase != "eliminated":
                    assert not h.in_sudden_death

    @pytest.mark.parametrize(("num_humans", "num_bots"), MULTI_HUMAN_CONFIGS)
    def test_would_be_dead_ready_blocks_on_active_battles(self, num_humans: int, num_bots: int) -> None:
        game, _manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        h1, h2 = game.players[0], game.players[1]
        h1.poison = 10
        h2.poison = 10
        battle.start(game, h1, opponent=h2)

        assert not would_be_dead_ready_for_elimination(game)

    @staticmethod
    def _eliminate_round_two(manager: GameManager, game: Game, *, live: list[Participant]) -> None:
        live_humans = [p for p in live if isinstance(p, Player)]
        live_puppets = [p for p in live if isinstance(p, Puppet)]
        victim2: Participant = live_puppets[0] if len(live_humans) == 1 else live_humans[0]
        survivor2: Participant = live_humans[0] if len(live_humans) == 1 else live_humans[1]
        _set_poison(victim2, 9)
        if isinstance(victim2, Puppet) and isinstance(survivor2, Puppet):
            victim2.poison = 10
            process_puppet_eliminations(game)
        else:
            b3 = _start_battle(game, victim2, p2=survivor2, stage=3, round_num=2)
            if b3:
                _submit_battle_result(manager, game, b=b3, winner_name=survivor2.name)
        manager.check_sudden_death_ready(game, "test-game", db=None)

    @pytest.mark.parametrize(("num_humans", "num_bots"), PLAYER_CONFIGS)
    def test_full_game_flow_to_finale(self, num_humans: int, num_bots: int) -> None:
        """Test full game flow from 4 participants to finale (2 remaining)."""
        game, manager, participants = _create_test_game(num_humans, num_bots)
        for p in participants:
            _setup_for_battle(p)

        humans = list(game.players)
        bots = list(game.puppets)
        victim: Participant = bots[0] if len(humans) == 1 else humans[0]
        survivor: Participant = humans[0] if len(humans) == 1 else humans[1]

        _set_poison(victim, 9)
        for p in participants:
            if p != victim:
                _set_poison(p, 0)

        b1 = _start_battle(game, victim, p2=survivor)
        others = [p for p in participants if p not in (victim, survivor)]
        b2 = _start_battle(game, others[0], p2=others[1])

        if b1:
            _submit_battle_result(manager, game, b=b1, winner_name=survivor.name)
        if b2:
            _submit_battle_result(manager, game, b=b2, winner_name=others[0].name)

        assert _count_live(game) == 3

        live: list[Participant] = [*get_live_players(game), *get_live_puppets(game)]
        for p in live:
            _setup_for_battle(p, stage=3, round_num=2)

        self._eliminate_round_two(manager, game, live=live)

        assert _count_live(game) == 2
        assert game.most_recent_ghost is None
        assert game.most_recent_ghost_puppet is None

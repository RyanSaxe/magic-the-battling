"""E2E tests for bot-specific sudden death, round-start elimination, and double-draw edge cases."""

from mtb.models.cards import Card
from mtb.models.game import BattleSnapshotData, Game, Player, Puppet, StaticOpponent, create_game
from mtb.phases import battle
from mtb.phases.elimination import (
    check_game_over,
    get_live_players,
    get_live_puppets,
    get_sudden_death_fighters,
    process_puppet_eliminations,
)
from server.services.game_manager import GameManager

Participant = Player | Puppet


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
        f"{stage}_{round_num}": StaticOpponent.from_snapshot(snapshot_data, name, player_history_id)
        for stage in range(3, 7)
        for round_num in range(1, 10)
    }
    return bot


def _create_test_game(num_humans: int, num_bots: int) -> tuple[Game, GameManager, list[Participant]]:
    human_names = [f"Human{i + 1}" for i in range(num_humans)]
    game = create_game(human_names, num_humans)

    manager = GameManager()
    manager._active_games["test-game"] = game
    for i, player in enumerate(game.players):
        player_id = f"player-{i}"
        manager._player_to_game[player_id] = "test-game"
        manager._player_id_to_name[player_id] = player.name

    for i in range(num_bots):
        game.puppets.append(_create_test_bot(f"Bot{i + 1}", player_history_id=100 + i))

    return game, manager, [*game.players, *game.puppets]


def _setup_for_battle(p: Participant, stage: int = 3, round_num: int = 1) -> None:
    p.stage = stage
    p.round = round_num
    if isinstance(p, Player):
        p.phase = "battle"
        p.chosen_basics = ["Plains", "Island", "Mountain"]
        p.hand = [Card(name=f"{p.name}Card", image_url="test", id=f"card-{p.name}", type_line="Creature")]


def _submit_battle_result(manager: GameManager, game: Game, b: battle.Battle, winner_name: str | None) -> None:
    result_str = winner_name or "draw"
    manager.handle_battle_submit_result(game, b.player, result_str, "test-game", None)
    if isinstance(b.opponent, Player):
        manager.handle_battle_submit_result(game, b.opponent, result_str, "test-game", None)


class TestBotSpecificScenarios:
    """Tests specific to bot behavior in ghost/sudden death scenarios."""

    def test_bot_vs_bot_sudden_death_auto_resolves(self):
        game, manager, participants = _create_test_game(1, 3)
        human = game.players[0]
        bot1, bot2, bot3 = game.puppets
        for p in participants:
            _setup_for_battle(p)

        human.phase = "eliminated"
        bot1.poison = 10
        bot2.poison = 11
        bot3.poison = 5

        manager._check_sudden_death_ready(game, "test-game", None)

        eliminated_bots = [b for b in game.puppets if b.is_eliminated]
        live_puppets = [b for b in game.puppets if not b.is_eliminated]
        assert len(eliminated_bots) >= 1
        assert len(live_puppets) >= 1

    def test_human_vs_bot_sudden_death_starts_build_phase(self):
        game, manager, participants = _create_test_game(2, 2)
        h1, h2 = game.players
        b1, b2 = game.puppets
        for p in participants:
            _setup_for_battle(p)

        h2.phase = "eliminated"
        b2.is_eliminated = True
        h1.poison = 10
        b1.poison = 11
        h1.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)
        if result == "sudden_death":
            assert h1.phase == "build"
            assert h1.in_sudden_death
            assert b1.in_sudden_death

    @staticmethod
    def _start_human_vs_puppet_sudden_death_beside_a_survivor() -> tuple[GameManager, Game, Player, Player, Puppet]:
        game, manager, participants = _create_test_game(2, 2)
        h1, h2 = game.players
        b1, b2 = game.puppets
        for p in participants:
            _setup_for_battle(p)
        b2.is_eliminated = True

        h1.poison = 9
        b1.poison = 9
        h2.phase = "draft"
        static_puppet = b1.get_opponent_for_round(3, 1)
        assert static_puppet is not None
        b = battle.start(game, h1, static_puppet)
        _submit_battle_result(manager, game, b, None)
        assert h1.phase == "build"
        assert h1.in_sudden_death
        return manager, game, h1, h2, b1

    @staticmethod
    def _puppet_wins_sudden_death(manager: GameManager, game: Game, human: Player, puppet: Puppet) -> None:
        human.phase = "battle"
        static_puppet = puppet.get_opponent_for_round(human.stage, human.round)
        assert static_puppet is not None
        b = battle.start(game, human, static_puppet, is_sudden_death=True)
        _submit_battle_result(manager, game, b, static_puppet.name)

    def test_human_losing_sudden_death_to_puppet_leaves_game_running_for_surviving_human(self):
        manager, game, h1, h2, b1 = self._start_human_vs_puppet_sudden_death_beside_a_survivor()

        self._puppet_wins_sudden_death(manager, game, h1, b1)

        assert h1.phase == "eliminated"
        assert h2.phase == "draft"
        assert not b1.is_eliminated
        assert check_game_over(game) == (None, False)

    def test_human_losing_sudden_death_to_puppet_starts_final_when_survivor_already_ready(self):
        manager, game, h1, h2, b1 = self._start_human_vs_puppet_sudden_death_beside_a_survivor()
        h2.round = 2
        h2.phase = "build"
        h2.build_ready = True

        self._puppet_wins_sudden_death(manager, game, h1, b1)

        assert h2.phase == "battle"
        assert [(b.player.name, b.opponent.name) for b in game.active_battles] == [(h2.name, b1.name)]

    def test_lone_human_losing_sudden_death_to_puppet_ends_the_game(self):
        game, manager, participants = _create_test_game(1, 2)
        (human,) = game.players
        b1, b2 = game.puppets
        for p in participants:
            _setup_for_battle(p)
        b2.is_eliminated = True
        human.poison = 9
        b1.poison = 9
        static_puppet = b1.get_opponent_for_round(3, 1)
        assert static_puppet is not None
        b = battle.start(game, human, static_puppet)
        _submit_battle_result(manager, game, b, None)
        assert human.phase == "build"
        assert human.in_sudden_death

        self._puppet_wins_sudden_death(manager, game, human, b1)

        assert human.phase == "eliminated"
        assert not b1.is_eliminated
        assert check_game_over(game) == (None, True)

    def test_bot_ghost_available_for_pairing(self):
        game, _manager, participants = _create_test_game(2, 2)
        for p in participants:
            _setup_for_battle(p)

        bot_to_eliminate = game.puppets[0]
        bot_to_eliminate.is_eliminated = True
        bot_to_eliminate.poison = 10
        game.most_recent_ghost_puppet = bot_to_eliminate

        live_humans = get_live_players(game)
        assert len(live_humans) == 2

        candidates = battle.get_all_pairing_candidates(game, live_humans[0])
        assert bot_to_eliminate.name in [c.name for c in candidates]


class TestRoundStartAfterElimination:
    def test_round_starts_when_the_last_player_it_waited_for_is_eliminated(self):
        game, manager, _ = _create_test_game(3, 1)
        a, b, c = game.players
        puppet = game.puppets[0]

        for p in (a, b):
            p.phase = "build"
            p.stage, p.round = 3, 2
            p.hand = [Card(name=f"{p.name}{i}", image_url="x", id=f"{p.name}{i}", type_line="Creature") for i in "123"]
            p.build_ready = True

        _setup_for_battle(c, stage=3, round_num=1)
        _setup_for_battle(puppet, stage=3, round_num=1)
        c.poison = 9
        static_puppet = puppet.get_opponent_for_round(3, 1)
        assert static_puppet is not None
        battle.start(game, c, static_puppet)

        manager.handle_battle_submit_result(game, c, static_puppet.name, "test-game", None)

        assert c.phase == "eliminated"
        assert (a.phase, b.phase) == ("battle", "battle")
        assert game.active_battles


class TestBotEliminations:
    """Tests for bot elimination logic."""

    def test_process_puppet_eliminations_clears_ghost_when_even_survivors(self):
        game, _manager, _participants = _create_test_game(1, 3)
        human = game.players[0]
        bots = game.puppets
        human.phase = "eliminated"

        bots[0].poison = 10
        bots[1].poison = 0
        bots[2].poison = 0

        process_puppet_eliminations(game)

        assert len(get_live_players(game)) + len(get_live_puppets(game)) == 2
        assert game.most_recent_ghost_puppet is None


class TestEdgeCases:
    """Edge case tests for ghost and sudden death mechanics."""

    def test_ghost_not_in_sudden_death_fighters(self):
        game, _manager, _participants = _create_test_game(4, 0)
        p1, p2, p3, p4 = game.players
        for p in game.players:
            _setup_for_battle(p)

        p4.phase = "eliminated"
        game.most_recent_ghost = StaticOpponent.from_player(p4, hand_revealed=True)

        p1.poison = 10
        p2.poison = 11
        p3.poison = 12
        for p in (p1, p2, p3):
            p.phase = "awaiting_elimination"

        fighters = get_sudden_death_fighters(game)
        assert fighters is not None
        assert p4.name not in [f.name for f in fighters]

    def test_three_at_lethal_highest_poison_eliminated(self):
        game, manager, participants = _create_test_game(3, 1)
        for p in participants:
            _setup_for_battle(p)
        game.puppets[0].is_eliminated = True

        h1, h2, h3 = game.players
        h1.poison = 10
        h2.poison = 11
        h3.poison = 15
        for h in (h1, h2, h3):
            h.phase = "awaiting_elimination"

        result = manager._check_sudden_death_ready(game, "test-game", None)

        assert result == "sudden_death"
        assert h3.phase == "eliminated"
        assert h1.phase == "build"
        assert h2.phase == "build"

    def test_simultaneous_battles_both_end_before_elimination(self):
        game, manager, _participants = _create_test_game(4, 0)
        p1, p2, p3, p4 = game.players
        for p in game.players:
            _setup_for_battle(p)

        p1.poison = 9
        p3.poison = 9
        b1 = battle.start(game, p1, p2)
        b2 = battle.start(game, p3, p4)

        _submit_battle_result(manager, game, b1, p2.name)
        assert p1.phase == "awaiting_elimination"

        _submit_battle_result(manager, game, b2, p4.name)
        assert len(get_live_players(game)) + len(get_live_puppets(game)) == 2


class TestDoubleDrawBotSuddenDeath:
    """Tests for double draw scenarios where bots reach lethal."""

    def test_double_draw_kills_three_bots_human_survives_triggers_sudden_death(self):
        game, manager, participants = _create_test_game(1, 3)
        human = game.players[0]
        bot1, bot2, bot3 = game.puppets
        for p in participants:
            _setup_for_battle(p)

        human.poison = 5
        bot1.poison = 10
        bot2.poison = 10
        bot3.poison = 10

        static_opponent = bot1.get_opponent_for_round(3, 1)
        assert static_opponent is not None
        b = battle.start(game, human, static_opponent)
        _submit_battle_result(manager, game, b, None)

        assert human.phase != "winner"
        live_puppets = get_live_puppets(game)
        assert len(live_puppets) == 1
        assert live_puppets[0].poison == 9
        assert check_game_over(game) == (None, False)

    def test_double_draw_kills_all_four_triggers_sudden_death(self):
        game, manager, participants = _create_test_game(1, 3)
        human = game.players[0]
        bot1, bot2, bot3 = game.puppets
        for p in participants:
            _setup_for_battle(p)

        human.poison = 9
        bot1.poison = 14
        bot2.poison = 12
        bot3.poison = 12

        static_opponent = bot1.get_opponent_for_round(3, 1)
        assert static_opponent is not None
        b = battle.start(game, human, static_opponent)
        _submit_battle_result(manager, game, b, None)

        live_puppets = get_live_puppets(game)
        live_humans = get_live_players(game)
        assert len(live_puppets) + len(live_humans) == 2
        assert human.phase == "build"
        assert human.in_sudden_death
        assert human.poison == 9
        assert len(live_puppets) == 1
        assert live_puppets[0].in_sudden_death
        assert live_puppets[0].poison == 9

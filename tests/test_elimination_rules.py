from conftest import setup_battle_ready

from mtb.models.cards import Battler, Card
from mtb.models.game import DraftState, Puppet, StaticOpponent, create_game
from mtb.phases import battle, elimination
from server.services.game_manager import GameManager


def _make_card(name: str) -> Card:
    return Card(name=name, image_url="test", id=name, type_line="Creature")


class TestGhostMechanics:
    def test_player_becomes_ghost_at_poison_threshold(self):
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players

        alice.poison = 10
        bob.poison = 5
        charlie.poison = 3
        dave.poison = 2

        eliminated = elimination.process_eliminations(game, round_num=5, stage_num=3)

        assert len(eliminated) == 1
        assert alice in eliminated
        assert alice.phase == "eliminated"
        assert game.most_recent_ghost is not None
        assert game.most_recent_ghost.name == alice.name

    def test_ghost_cleared_when_remaining_players_even(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 5
        charlie.poison = 3

        eliminated = elimination.process_eliminations(game, round_num=5, stage_num=3)

        assert len(eliminated) == 1
        assert alice in eliminated
        assert game.most_recent_ghost is None

    def test_ghost_excluded_from_normal_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"
        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        candidates = battle.get_all_pairing_candidates(game, bob)

        assert alice not in candidates
        assert charlie in candidates

    def test_ghost_excluded_from_can_start_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"
        bob.phase = "battle"
        charlie.phase = "battle"

        assert battle.can_start_pairing(game, 1, game.config.starting_stage) is True

    def test_ghost_not_paired_until_player_is_lone_remaining(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"
        game.most_recent_ghost = StaticOpponent.from_player(alice, hand_revealed=True)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        battle.start(game, bob, charlie)

        assert battle.find_opponent(game, bob) is None
        assert battle.find_opponent(game, charlie) is None
        assert battle.find_opponent(game, alice) is None

    def test_start_battle_allows_ghost_opponent(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        bob.phase = "eliminated"
        ghost = StaticOpponent.from_player(bob, hand_revealed=True)
        ghost.chosen_basics = ["Plains", "Island", "Mountain"]
        game.most_recent_ghost = ghost
        setup_battle_ready(alice)

        b = battle.start(game, alice, ghost)
        assert b.player is alice
        assert b.opponent is ghost


class TestSuddenDeath:
    def test_no_sudden_death_when_survivors_gte_2(self):
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players

        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        dave.poison = 3

        assert elimination.needs_sudden_death(game) is False

        eliminated = elimination.process_eliminations(game, round_num=5, stage_num=3)

        assert len(eliminated) == 2
        assert alice in eliminated
        assert bob in eliminated
        assert charlie.phase != "eliminated"
        assert dave.phase != "eliminated"

    def test_sudden_death_triggers_when_multiple_deaths_would_skip_finale(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5

        assert elimination.needs_sudden_death(game) is True

    def test_setup_sudden_death_resets_poison(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        alice.poison = 12
        bob.poison = 15

        elimination.setup_sudden_death_battle(game, alice, bob)

        assert alice.poison == 9
        assert bob.poison == 9

    def test_would_be_dead_returns_players_at_threshold(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 9
        charlie.poison = 15

        would_die = elimination.get_would_be_dead(game)

        assert alice in would_die
        assert charlie in would_die
        assert bob not in would_die

    def test_get_live_players_excludes_ghosts(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"

        live = elimination.get_live_players(game)

        assert alice not in live
        assert bob in live
        assert charlie in live


class TestSuddenDeathFighters:
    def test_get_fighters_returns_none_when_not_needed(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 5
        charlie.poison = 3

        assert elimination.get_sudden_death_fighters(game) is None

    def test_get_fighters_returns_both_when_two_would_die(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 11
        charlie.poison = 5

        fighters = elimination.get_sudden_death_fighters(game)

        assert fighters is not None
        assert alice in fighters
        assert bob in fighters

    def test_get_fighters_two_lowest_poison_fight_with_three(self):
        """When 3+ players at lethal, the 2 with lowest poison fight."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 11
        charlie.poison = 12

        fighters = elimination.get_sudden_death_fighters(game)

        assert fighters is not None
        assert alice in fighters
        assert bob in fighters
        assert charlie not in fighters


class TestFinale:
    def test_game_ends_when_1_player_remains(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        alice.poison = 10
        bob.poison = 5

        eliminated = elimination.process_eliminations(game, round_num=10, stage_num=3)

        assert len(eliminated) == 1
        assert alice in eliminated
        assert bob.phase != "eliminated"

        live = elimination.get_live_players(game)
        assert len(live) == 1
        assert bob in live

    def test_finale_triggers_sudden_death_on_mutual_kill(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        alice.poison = 10
        bob.poison = 10

        assert elimination.needs_sudden_death(game) is True

    def test_eliminate_player_sets_all_fields(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, _bob = game.players

        elimination.eliminate_player(game, alice, round_num=7, stage_num=4)

        assert alice.phase == "eliminated"
        assert alice.elimination_round == 7
        assert alice.elimination_stage == 4
        assert game.most_recent_ghost is not None
        assert game.most_recent_ghost.name == alice.name
        assert isinstance(game.most_recent_ghost, StaticOpponent)


class TestWouldBeDeadReadyForElimination:
    def test_returns_true_when_no_would_be_dead(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 5
        bob.poison = 3

        assert elimination.would_be_dead_ready_for_elimination(game) is True

    def test_returns_true_when_all_would_be_dead_in_draft(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 10
        bob.poison = 10
        alice.phase = "draft"
        bob.phase = "draft"

        assert elimination.would_be_dead_ready_for_elimination(game) is True

    def test_returns_true_when_all_would_be_dead_in_awaiting_elimination(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 10
        bob.poison = 10
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"

        assert elimination.would_be_dead_ready_for_elimination(game) is True

    def test_returns_false_when_some_in_reward(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 10
        bob.poison = 10
        alice.phase = "draft"
        bob.phase = "reward"

        assert elimination.would_be_dead_ready_for_elimination(game) is False

    def test_returns_false_when_some_in_battle(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 10
        bob.poison = 10
        alice.phase = "draft"
        bob.phase = "battle"

        assert elimination.would_be_dead_ready_for_elimination(game) is False

    def test_would_be_dead_returns_false_with_active_battles(self):
        """would_be_dead_ready_for_elimination returns False when battles are in progress."""
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players

        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        dave.poison = 3

        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, alice, bob)
        battle.start(game, charlie, dave)

        b = game.active_battles[0]
        battle.submit_result(b, alice, "draw")
        battle.submit_result(b, bob, "draw")
        battle.end(game, b)

        assert len(game.active_battles) == 1
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        assert elimination.would_be_dead_ready_for_elimination(game) is False


class TestEliminationFlow:
    def test_survivor_goes_directly_to_draft(self, card_factory):
        """A player not at lethal poison should go to draft after reward."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 5
        bob.poison = 3
        charlie.poison = 10
        alice.phase = "reward"
        bob.phase = "battle"
        charlie.phase = "battle"

        cards = [card_factory(f"c{i}") for i in range(20)]
        game.battler = Battler(cards=cards, upgrades=[], vanguards=[])
        game.draft_state = DraftState(packs=[])

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["alice_id"] = "Alice"
        manager._player_to_game["alice_id"] = "test"

        result = manager.handle_reward_done(game, alice)

        assert result is None
        assert alice.phase == "draft"
        assert "Alice" in game.draft_state.current_packs

    def test_single_lethal_player_eliminated_after_active_battles_complete(self):
        """A lethal player waits in awaiting_elimination while other battles run, then is eliminated."""
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players
        alice.poison = 9
        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, alice, bob)
        battle.start(game, charlie, dave)

        manager = GameManager()
        manager._active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, bob.name, "test")
        manager.handle_battle_submit_result(game, bob, bob.name, "test")
        assert alice.phase == "awaiting_elimination"

        manager.handle_battle_submit_result(game, charlie, charlie.name, "test")
        manager.handle_battle_submit_result(game, dave, charlie.name, "test")
        assert alice.phase == "eliminated"

    def test_sudden_death_triggered_when_both_lethal_ready(self):
        """When both lethal players finish battle, sudden death starts for both."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        bob.poison = 9
        charlie.poison = 5
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)
        alice.hand = [_make_card("Test1")]
        bob.hand = [_make_card("Test2")]

        battle.start(game, alice, bob)
        charlie.phase = "draft"
        manager = GameManager()
        manager._active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, "draw", "test")
        manager.handle_battle_submit_result(game, bob, "draw", "test")

        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.poison == 9
        assert bob.poison == 9
        assert alice.in_sudden_death is True
        assert bob.in_sudden_death is True
        assert len(game.active_battles) == 0

    def test_three_player_sudden_death_two_lowest_fight(self):
        """When 3 players reach lethal, the 2 lowest poison fight and highest is eliminated."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        bob.poison = 10
        charlie.poison = 11
        for p in game.players:
            setup_battle_ready(p)
            p.hand = [_make_card(f"Card-{p.name}")]

        ghost = StaticOpponent(name="Ghost", hand=[_make_card("GhostCard")], chosen_basics=["Plains"] * 3)
        battle.start(game, alice, bob)
        battle.start(game, charlie, ghost)

        manager = GameManager()
        manager._active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, "draw", "test")
        manager.handle_battle_submit_result(game, bob, "draw", "test")
        manager.handle_battle_submit_result(game, charlie, ghost.name, "test")

        assert alice.phase == "build"
        assert bob.phase == "build"
        assert charlie.phase == "eliminated"
        assert len(game.active_battles) == 0


class TestCompleteGamePlacement:
    """Regression tests: remaining participants ranked by poison, not all tied."""

    def test_complete_game_ranks_puppets_by_poison_no_winner(self):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = "eliminated"
        alice.placement = 4

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=7)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=3)
        bot3 = Puppet(name="Bot3", player_history_id=3, poison=5)
        game.puppets.extend([bot1, bot2, bot3])

        manager = GameManager()
        manager._active_games["test"] = game
        manager.complete_game("test", winner=None)

        assert bot2.placement == 1
        assert bot3.placement == 2
        assert bot1.placement == 3

    def test_complete_game_ranks_remaining_by_poison_with_winner(self):
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=7)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=3)
        game.puppets.extend([bot1, bot2])

        manager = GameManager()
        manager._active_games["test"] = game
        manager.complete_game("test", winner=alice)

        assert alice.placement == 1
        assert bot2.placement == 2
        assert bot1.placement == 3


def test_less_poison_places_higher_in_a_round_and_sudden_death_places_its_loser():
    game = create_game(["Alice", "Bob", "Cara", "Dan"], num_players=4)
    game.config.use_upgrades = False
    alice, bob, cara, dan = game.players
    low, high = (
        Puppet(name=name, player_history_id=history_id, poison=poison, last_played_round=(3, 1))
        for history_id, (name, poison) in enumerate([("Low", 10), ("High", 12)], start=1)
    )
    game.puppets.extend([low, high])
    elimination.eliminate_puppet(game, low)
    elimination.eliminate_puppet(game, high)
    assert (low.placement, high.placement) == (5, 6)

    alice.round = 2
    for p, poison in ((bob, 9), (cara, 10), (dan, 11)):
        p.poison = poison
        setup_battle_ready(p)
        p.hand = [_make_card(f"Card-{p.name}")]

    setup_battle_ready(alice)
    alice.round = 1
    ghost = StaticOpponent(name="Ghost", hand=[_make_card("GhostCard")], chosen_basics=["Plains"] * 3)
    battle.start(game, bob, cara)
    battle.start(game, dan, ghost)
    alice.phase, alice.round = "draft", 2

    manager = GameManager()
    manager.handle_battle_submit_result(game, bob, "draw", "g1")
    manager.handle_battle_submit_result(game, cara, "draw", "g1")
    manager.handle_battle_submit_result(game, dan, ghost.name, "g1")
    assert (low.placement, dan.placement, high.placement) == (4, 5, 6)

    bob.vanquishers = 4
    setup_battle_ready(bob)
    setup_battle_ready(cara)
    battle.start(game, bob, cara, is_sudden_death=True)
    manager.handle_battle_submit_result(game, bob, bob.name, "g1")
    manager.handle_battle_submit_result(game, cara, bob.name, "g1")

    assert cara.poison > high.poison
    assert (cara.placement, low.placement, dan.placement, high.placement) == (3, 4, 5, 6)
    assert not cara.in_sudden_death

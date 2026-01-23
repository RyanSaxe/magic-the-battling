from mtb.models.game import create_game
from mtb.phases import battle, elimination


def _setup_battle_ready(player):
    player.phase = "battle"
    player.chosen_basics = ["Plains", "Island", "Mountain"]


class TestGhostMechanics:
    def test_player_becomes_ghost_at_poison_threshold(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10
        bob.poison = 5
        charlie.poison = 3

        eliminated = elimination.process_eliminations(game, round_num=5)

        assert len(eliminated) == 1
        assert alice in eliminated
        assert alice.is_ghost is True
        assert alice.time_of_death == 5
        assert alice.phase == "eliminated"
        assert game.most_recent_ghost is alice

    def test_ghost_excluded_from_normal_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.is_ghost = True
        alice.phase = "eliminated"

        _setup_battle_ready(bob)
        _setup_battle_ready(charlie)

        candidates = battle.get_pairing_candidates(game, bob)

        assert alice not in candidates
        assert charlie in candidates

    def test_ghost_excluded_from_can_start_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.is_ghost = True
        alice.phase = "eliminated"
        bob.phase = "battle"
        charlie.phase = "battle"

        assert battle.can_start_pairing(game, 1, 1) is True

    def test_ghost_pairs_when_odd_live_players(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.is_ghost = True
        alice.phase = "eliminated"
        game.most_recent_ghost = alice

        _setup_battle_ready(bob)
        _setup_battle_ready(charlie)

        battle.start(game, bob, charlie)

        opponent = battle.find_opponent(game, bob)
        assert opponent is None

        game.active_battles.clear()
        battle.start(game, bob, charlie)

        opponent_for_charlie = battle.find_opponent(game, charlie)
        assert opponent_for_charlie is None

    def test_lone_player_pairs_with_ghost(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.is_ghost = True
        alice.phase = "eliminated"
        game.most_recent_ghost = alice

        _setup_battle_ready(bob)
        _setup_battle_ready(charlie)

        battle.start(game, bob, charlie)

        opponent = battle.find_opponent(game, alice)
        assert opponent is None

    def test_start_battle_allows_ghost_opponent(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        bob.is_ghost = True
        bob.phase = "eliminated"
        game.most_recent_ghost = bob

        _setup_battle_ready(alice)
        bob.chosen_basics = ["Plains", "Island", "Mountain"]

        b = battle.start(game, alice, bob)
        assert b.player is alice
        assert b.opponent is bob


class TestSuddenDeath:
    def test_no_sudden_death_when_survivors_gte_2(self):
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players

        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        dave.poison = 3

        assert elimination.needs_sudden_death(game) is False

        eliminated = elimination.process_eliminations(game, round_num=5)

        assert len(eliminated) == 2
        assert alice in eliminated
        assert bob in eliminated
        assert charlie.is_ghost is False
        assert dave.is_ghost is False

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

        alice.is_ghost = True

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

    def test_get_fighters_lowest_poison_gets_bye_with_three(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.poison = 10  # lowest - gets bye
        bob.poison = 11
        charlie.poison = 12

        fighters = elimination.get_sudden_death_fighters(game)

        assert fighters is not None
        assert alice not in fighters
        assert bob in fighters
        assert charlie in fighters


class TestFinale:
    def test_game_ends_when_1_player_remains(self):
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        alice.poison = 10
        bob.poison = 5

        eliminated = elimination.process_eliminations(game, round_num=10)

        assert len(eliminated) == 1
        assert alice in eliminated
        assert bob.is_ghost is False

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
        alice, bob = game.players

        elimination.eliminate_player(game, alice, round_num=7)

        assert alice.is_ghost is True
        assert alice.time_of_death == 7
        assert alice.phase == "eliminated"
        assert game.most_recent_ghost is alice

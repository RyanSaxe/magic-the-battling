from unittest.mock import MagicMock

from conftest import setup_battle_ready

from mtb.models.cards import Card
from mtb.models.game import BattleSnapshotData, DraftState, FakePlayer, StaticOpponent, create_game
from mtb.phases import battle, elimination, reward
from server.db.models import PlayerGameHistory
from server.services.game_manager import GameManager


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
        assert alice.phase == "eliminated"
        assert game.most_recent_ghost is not None
        assert game.most_recent_ghost.name == alice.name

    def test_ghost_excluded_from_normal_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"

        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        candidates = battle.get_pairing_candidates(game, bob)

        assert alice not in candidates
        assert charlie in candidates

    def test_ghost_excluded_from_can_start_pairing(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"
        bob.phase = "battle"
        charlie.phase = "battle"

        assert battle.can_start_pairing(game, 1, game.config.starting_stage) is True

    def test_ghost_pairs_when_odd_live_players(self):
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        alice.phase = "eliminated"
        ghost = StaticOpponent.from_player(alice, hand_revealed=True)
        game.most_recent_ghost = ghost

        setup_battle_ready(bob)
        setup_battle_ready(charlie)

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

        alice.phase = "eliminated"
        ghost = StaticOpponent.from_player(alice, hand_revealed=True)
        game.most_recent_ghost = ghost

        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        battle.start(game, bob, charlie)

        opponent = battle.find_opponent(game, alice)
        assert opponent is None

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

        eliminated = elimination.process_eliminations(game, round_num=5)

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

        elimination.eliminate_player(game, alice, round_num=7)

        assert alice.phase == "eliminated"
        assert game.most_recent_ghost is not None
        assert game.most_recent_ghost.name == alice.name
        assert isinstance(game.most_recent_ghost, StaticOpponent)


class TestBotBattleFlow:
    """Tests for full battle flow against bots."""

    def test_player_loses_to_bot_takes_poison(self):
        """When player loses to bot, player should take poison and bot should not."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        alice.hand = [Card(name="Test", image_url="test", id="test", type_line="Creature")]

        snapshot = BattleSnapshotData(
            hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
            vanguard=None,
            basic_lands=["Forest", "Swamp", "Mountain"],
            applied_upgrades=[],
            treasures=1,
        )
        static_opp = StaticOpponent.from_snapshot(snapshot, "BotPlayer", 1)
        bot = FakePlayer(
            name="BotPlayer (Bot)",
            player_history_id=1,
            snapshots={"3_1": static_opp},
        )
        game.fake_players.append(bot)

        b = battle.start(game, alice, static_opp)

        battle.submit_result(b, alice, static_opp.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is None
        assert result.loser is alice

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        reward.start_vs_static(game, alice, static_opp, result)

        assert alice.poison > initial_alice_poison
        assert bot.poison == initial_bot_poison
        assert alice.last_battle_result.winner_name == static_opp.name

    def test_player_wins_against_bot_bot_takes_poison(self):
        """When player wins against bot, bot should take poison."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = "battle"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        alice.hand = [Card(name="Test", image_url="test", id="test", type_line="Creature")]

        snapshot = BattleSnapshotData(
            hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
            vanguard=None,
            basic_lands=["Forest", "Swamp", "Mountain"],
            applied_upgrades=[],
            treasures=1,
        )
        static_opp = StaticOpponent.from_snapshot(snapshot, "BotPlayer", 1)
        bot = FakePlayer(
            name="BotPlayer (Bot)",
            player_history_id=1,
            snapshots={"3_1": static_opp},
        )
        game.fake_players.append(bot)

        b = battle.start(game, alice, static_opp)

        battle.submit_result(b, alice, alice.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is alice
        assert result.loser is None

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        reward.start_vs_static(game, alice, static_opp, result)

        assert alice.poison == initial_alice_poison
        assert bot.poison > initial_bot_poison
        assert alice.last_battle_result.winner_name == alice.name


class TestUniquePlayerNames:
    """Tests for unique player name handling."""

    def test_bot_names_are_made_unique_when_colliding_with_player(self):
        """When historical player name matches human player, bot name should be unique."""
        manager = GameManager()
        game = create_game(["Ryan"], num_players=1)

        mock_history = MagicMock(spec=PlayerGameHistory)
        mock_history.player_name = "Ryan"
        mock_history.id = 1
        mock_history.snapshots = []

        existing_names = {p.name for p in game.players}
        fake_player = manager._load_fake_player(MagicMock(), mock_history, existing_names)

        assert fake_player.name != "Ryan"
        assert fake_player.name == "Ryan (Bot)"
        assert fake_player.name not in existing_names

    def test_multiple_bots_with_same_historical_name_get_unique_names(self):
        """When multiple bots are based on same historical player, names should be unique."""
        manager = GameManager()
        game = create_game(["Alice"], num_players=1)

        existing_names = {p.name for p in game.players}

        for i in range(3):
            mock_history = MagicMock(spec=PlayerGameHistory)
            mock_history.player_name = "Bob"
            mock_history.id = i + 1
            mock_history.snapshots = []

            fake_player = manager._load_fake_player(MagicMock(), mock_history, existing_names)
            existing_names.add(fake_player.name)
            game.fake_players.append(fake_player)

        names = [fp.name for fp in game.fake_players]
        assert len(names) == len(set(names))
        assert "Bob (Bot)" in names
        assert "Bob (Bot) (2)" in names
        assert "Bob (Bot) (3)" in names

    def test_human_named_like_bot_still_gets_unique_bot_name(self):
        """When human is named 'Ryan (Bot)', a bot from Ryan still gets unique name."""
        manager = GameManager()
        game = create_game(["Ryan (Bot)"], num_players=1)

        mock_history = MagicMock(spec=PlayerGameHistory)
        mock_history.player_name = "Ryan"
        mock_history.id = 1
        mock_history.snapshots = []

        existing_names = {p.name for p in game.players}
        fake_player = manager._load_fake_player(MagicMock(), mock_history, existing_names)

        assert fake_player.name != "Ryan (Bot)"
        assert fake_player.name == "Ryan (Bot) (2)"


class TestBotGameOver:
    """Tests for game over conditions when playing against bots."""

    def test_game_continues_when_human_and_bot_both_alive(self):
        """When 1 human and 1 bot are both alive, game should continue."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = FakePlayer(name="Bot", player_history_id=1, snapshots={})
        game.fake_players.append(bot)

        alice.poison = 5
        bot.poison = 3

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is False
        assert winner is None

    def test_human_wins_when_bot_eliminated(self):
        """When the only bot is eliminated, the human wins."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = FakePlayer(name="Bot", player_history_id=1, snapshots={}, is_eliminated=True)
        game.fake_players.append(bot)

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is alice

    def test_game_over_no_winner_when_human_eliminated(self):
        """When the human is eliminated (becomes ghost), game ends with no winner."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = FakePlayer(name="Bot", player_history_id=1, snapshots={})
        game.fake_players.append(bot)

        alice.phase = "eliminated"
        alice.poison = 10

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is None

    def test_bot_elimination_via_poison(self):
        """Bot should be eliminated when poison >= threshold."""
        game = create_game(["Alice"], num_players=1)

        bot = FakePlayer(name="Bot", player_history_id=1, snapshots={}, poison=10)
        game.fake_players.append(bot)

        eliminated = elimination.process_bot_eliminations(game)

        assert len(eliminated) == 1
        assert bot.is_eliminated is True

    def test_bot_not_eliminated_below_threshold(self):
        """Bot should not be eliminated when poison < threshold."""
        game = create_game(["Alice"], num_players=1)

        bot = FakePlayer(name="Bot", player_history_id=1, snapshots={}, poison=9)
        game.fake_players.append(bot)

        eliminated = elimination.process_bot_eliminations(game)

        assert len(eliminated) == 0
        assert bot.is_eliminated is False


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


class TestEliminationFlow:
    def test_survivor_goes_directly_to_draft(self):
        """A player not at lethal poison should go to draft after reward."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 5
        bob.poison = 3
        charlie.poison = 10
        alice.phase = "reward"
        bob.phase = "battle"
        charlie.phase = "battle"
        game.draft_state = DraftState(packs=[])

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["alice_id"] = "Alice"
        manager._player_to_game["alice_id"] = "test"

        result = manager.handle_reward_done(game, alice)

        assert result is None
        assert alice.phase == "draft"

    def test_single_lethal_player_eliminated_immediately(self):
        """When only one player is at lethal and there are survivors, eliminate immediately."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 3
        charlie.poison = 5
        alice.phase = "reward"
        bob.phase = "draft"
        charlie.phase = "draft"

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["alice_id"] = "Alice"
        manager._player_to_game["alice_id"] = "test"

        result = manager.handle_reward_done(game, alice)

        assert result is None
        assert alice.phase == "eliminated"

    def test_awaiting_elimination_when_one_lethal_finishes_first(self):
        """When sudden death needed but other lethal player still in battle/reward, wait."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        alice.phase = "reward"
        bob.phase = "battle"
        charlie.phase = "draft"

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["alice_id"] = "Alice"
        manager._player_to_game["alice_id"] = "test"

        result = manager.handle_reward_done(game, alice)

        assert result is None
        assert alice.phase == "awaiting_elimination"

    def test_sudden_death_triggered_when_both_lethal_ready(self):
        """When both lethal players have finished reward, start sudden death."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 11
        charlie.poison = 5
        alice.phase = "awaiting_elimination"
        bob.phase = "reward"
        charlie.phase = "draft"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Forest", "Swamp", "Mountain"]
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bob.hand = [Card(name="Test2", image_url="test", id="t2", type_line="Creature")]

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["bob_id"] = "Bob"
        manager._player_to_game["bob_id"] = "test"

        result = manager.handle_reward_done(game, bob)

        assert result == "sudden_death"
        assert alice.phase == "battle"
        assert bob.phase == "battle"
        assert alice.poison == 9
        assert bob.poison == 9
        assert len(game.active_battles) == 1

    def test_three_player_sudden_death_lowest_gets_bye(self):
        """When 3 players would die, lowest poison gets bye, other two fight."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10  # lowest - gets bye
        bob.poison = 11
        charlie.poison = 12
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        charlie.phase = "reward"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Forest", "Swamp", "Mountain"]
        charlie.chosen_basics = ["Mountain", "Mountain", "Mountain"]
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bob.hand = [Card(name="Test2", image_url="test", id="t2", type_line="Creature")]
        charlie.hand = [Card(name="Test3", image_url="test", id="t3", type_line="Creature")]

        manager = GameManager()
        manager._active_games["test"] = game
        manager._player_id_to_name["charlie_id"] = "Charlie"
        manager._player_to_game["charlie_id"] = "test"

        result = manager.handle_reward_done(game, charlie)

        assert result == "sudden_death"
        assert bob.phase == "battle"
        assert charlie.phase == "battle"
        assert alice.phase == "awaiting_elimination"
        assert len(game.active_battles) == 1
        battle_players = {game.active_battles[0].player.name, game.active_battles[0].opponent.name}
        assert battle_players == {"Bob", "Charlie"}

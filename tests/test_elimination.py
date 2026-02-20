from unittest.mock import MagicMock

from conftest import setup_battle_ready

from mtb.models.cards import Battler, Card
from mtb.models.game import BattleSnapshotData, DraftState, Puppet, StaticOpponent, create_game
from mtb.phases import battle, elimination, reward
from server.db.models import PlayerGameHistory
from server.services.game_manager import GameManager


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

        alice.poison = 10  # lowest - fights
        bob.poison = 11  # second lowest - fights
        charlie.poison = 12  # highest - eliminated

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
        bot = Puppet(
            name="BotPlayer (Bot)",
            player_history_id=1,
            snapshots={"3_1": static_opp},
        )
        game.puppets.append(bot)

        b = battle.start(game, alice, static_opp)

        battle.submit_result(b, alice, static_opp.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is None
        assert result.loser is alice

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        # battle.end() no longer sets phase - must set manually for legacy reward.start_vs_static
        alice.phase = "reward"
        reward.start_vs_static(game, alice, static_opp, result)

        assert alice.poison > initial_alice_poison
        assert bot.poison == initial_bot_poison
        assert alice.last_battle_result is not None
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
        bot = Puppet(
            name="BotPlayer (Bot)",
            player_history_id=1,
            snapshots={"3_1": static_opp},
        )
        game.puppets.append(bot)

        b = battle.start(game, alice, static_opp)

        battle.submit_result(b, alice, alice.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is alice
        assert result.loser is None

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        # battle.end() no longer sets phase - must set manually for legacy reward.start_vs_static
        alice.phase = "reward"
        reward.start_vs_static(game, alice, static_opp, result)

        assert alice.poison == initial_alice_poison
        assert bot.poison > initial_bot_poison
        assert alice.last_battle_result is not None
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
        assert fake_player.name == "Ryan (2)"
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
            game.puppets.append(fake_player)

        names = [fp.name for fp in game.puppets]
        assert len(names) == len(set(names))
        assert "Bob" in names
        assert "Bob (2)" in names
        assert "Bob (3)" in names

    def test_human_named_like_bot_still_gets_unique_bot_name(self):
        """When human has same name as bot source, bot gets unique name."""
        manager = GameManager()
        game = create_game(["Ryan"], num_players=1)

        mock_history = MagicMock(spec=PlayerGameHistory)
        mock_history.player_name = "Ryan"
        mock_history.id = 1
        mock_history.snapshots = []

        existing_names = {p.name for p in game.players}
        fake_player = manager._load_fake_player(MagicMock(), mock_history, existing_names)

        assert fake_player.name != "Ryan"
        assert fake_player.name == "Ryan (2)"


class TestBotGameOver:
    """Tests for game over conditions when playing against bots."""

    def test_game_continues_when_human_and_bot_both_alive(self):
        """When 1 human and 1 bot are both alive, game should continue."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = Puppet(name="Bot", player_history_id=1, snapshots={})
        game.puppets.append(bot)

        alice.poison = 5
        bot.poison = 3

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is False
        assert winner is None

    def test_human_wins_when_bot_eliminated(self):
        """When the only bot is eliminated, the human wins."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, is_eliminated=True)
        game.puppets.append(bot)

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is alice

    def test_game_over_no_winner_when_human_eliminated(self):
        """When the human is eliminated (becomes ghost), game ends with no winner."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = Puppet(name="Bot", player_history_id=1, snapshots={})
        game.puppets.append(bot)

        alice.phase = "eliminated"
        alice.poison = 10

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is None

    def test_bot_elimination_via_poison(self):
        """Bot should be eliminated when poison >= threshold."""
        game = create_game(["Alice"], num_players=1)

        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, poison=10)
        game.puppets.append(bot)

        eliminated = elimination.process_puppet_eliminations(game)

        assert len(eliminated) == 1
        assert bot.is_eliminated is True

    def test_bot_not_eliminated_below_threshold(self):
        """Bot should not be eliminated when poison < threshold."""
        game = create_game(["Alice"], num_players=1)

        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, poison=9)
        game.puppets.append(bot)

        eliminated = elimination.process_puppet_eliminations(game)

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

    def test_single_lethal_player_goes_to_awaiting_elimination(self):
        """When a lethal player finishes battle, they go to awaiting_elimination.

        In the new flow, elimination happens at battle end (_end_battle) not at
        reward end. Players who are at lethal skip reward and go straight to
        awaiting_elimination. The actual elimination happens when _check_sudden_death_ready
        is called and determines no sudden death is needed.
        """
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 3
        charlie.poison = 5

        # Set up alice to be in awaiting_elimination (as would happen after battle)
        alice.phase = "awaiting_elimination"
        bob.phase = "draft"
        charlie.phase = "draft"

        manager = GameManager()
        manager._active_games["test"] = game

        # Trigger the check - in the real flow this happens via _end_battle
        result = manager._check_sudden_death_ready(game, "test", None)

        # With 2 survivors (bob/charlie), alice should be eliminated
        assert result is None
        assert alice.phase == "eliminated"

    def test_awaiting_elimination_when_one_lethal_in_battle(self):
        """When sudden death may be needed but other players still in battle, wait.

        In the new flow, lethal players skip rewards and go to awaiting_elimination.
        The check for sudden death only proceeds when all potential fighters are ready.
        """
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        alice.phase = "awaiting_elimination"
        bob.phase = "battle"  # Still in battle
        charlie.phase = "draft"

        manager = GameManager()
        manager._active_games["test"] = game

        # Check should return None since bob is still in battle
        result = manager._check_sudden_death_ready(game, "test", None)

        assert result is None
        assert alice.phase == "awaiting_elimination"

    def test_sudden_death_triggered_when_both_lethal_ready(self):
        """When both lethal players are in awaiting_elimination, start sudden death."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 11
        charlie.poison = 5
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        charlie.phase = "draft"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Forest", "Swamp", "Mountain"]
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bob.hand = [Card(name="Test2", image_url="test", id="t2", type_line="Creature")]

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "sudden_death"
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.poison == 9
        assert bob.poison == 9
        assert len(game.active_battles) == 0

    def test_three_player_sudden_death_two_lowest_fight(self):
        """When 3 players would die, 2 lowest poison fight, highest eliminated."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10  # lowest - fights
        bob.poison = 11  # second lowest - fights
        charlie.poison = 12  # highest - eliminated immediately
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        charlie.phase = "awaiting_elimination"
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Forest", "Swamp", "Mountain"]
        charlie.chosen_basics = ["Mountain", "Mountain", "Mountain"]
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bob.hand = [Card(name="Test2", image_url="test", id="t2", type_line="Creature")]
        charlie.hand = [Card(name="Test3", image_url="test", id="t3", type_line="Creature")]

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "sudden_death"
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert charlie.phase == "eliminated"
        assert len(game.active_battles) == 0


class TestFinaleVsBot:
    """Tests for finale scenarios against bots."""

    def test_finale_vs_bot_player_wins_bot_not_eliminated(self):
        """In finale vs bot, if player wins but bot isn't at lethal, game continues."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = Puppet(name="BotPlayer", player_history_id=1, poison=5)
        game.puppets.append(bot)

        snapshot = BattleSnapshotData(
            hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
            vanguard=None,
            basic_lands=["Forest", "Swamp", "Mountain"],
            applied_upgrades=[],
            treasures=1,
        )
        static_opp = StaticOpponent.from_snapshot(snapshot, "BotPlayer", 1)

        setup_battle_ready(alice)
        b = battle.start(game, alice, static_opp)
        battle.submit_result(b, alice, alice.name)
        result = battle.end(game, b)
        assert result.winner is alice

        manager = GameManager()
        manager._active_games["test"] = game

        end_result = manager._handle_post_battle_static(game, alice, static_opp, result, False, "test", None)

        # Bot took damage but not eliminated (started at 5, took ~1-2 damage)
        assert bot.poison > 5
        assert bot.poison < 10
        assert not bot.is_eliminated
        # Game should NOT be over - player goes to reward phase
        assert end_result is None
        assert alice.phase == "reward"

    def test_finale_vs_bot_mutual_lethal_triggers_sudden_death(self):
        """In finale vs bot, if both at lethal (draw), sudden death triggers."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 9  # Will go to 10+ with bot damage

        bot = Puppet(name="BotPlayer", player_history_id=1, poison=9)
        game.puppets.append(bot)

        snapshot = BattleSnapshotData(
            hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
            vanguard=None,
            basic_lands=["Forest", "Swamp", "Mountain"],
            applied_upgrades=[],
            treasures=1,
        )
        static_opp = StaticOpponent.from_snapshot(snapshot, "BotPlayer", 1)
        static_opp.upgrades = [Card(name="Upgrade", image_url="u", id="u", type_line="Upgrade")]

        setup_battle_ready(alice)
        b = battle.start(game, alice, static_opp)
        # Report a draw
        battle.submit_result(b, alice, "draw")
        result = battle.end(game, b)
        assert result.is_draw

        # Manually set poison to simulate draw damage for both at lethal
        alice.poison = 10
        bot.poison = 10

        manager = GameManager()
        manager._active_games["test"] = game

        # Simulate poison already applied, recheck with both at lethal
        end_result = manager._handle_post_battle_static(game, alice, static_opp, result, False, "test", None)

        # Should trigger sudden death
        assert end_result == "sudden_death"
        assert alice.phase == "build"
        assert alice.poison == 9  # Reset for sudden death
        assert bot.poison == 9  # Reset for sudden death
        assert len(game.active_battles) == 0


class TestDrawWithOneSurvivor:
    """Tests for draw battles where one player survives and one is eliminated."""

    def test_draw_survivor_sees_draw_in_last_battle_result(self):
        """When draw results in one player at lethal, survivor's result shows is_draw=True."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players

        # Alice has high poison, will go to lethal in draw
        alice.poison = 8
        bob.poison = 2
        charlie.poison = 0  # Not involved in this battle

        # All players need to be in battle phase for pairing to work
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        b = battle.start(game, alice, bob)
        # Both players report a draw
        battle.submit_result(b, alice, "draw")
        battle.submit_result(b, bob, "draw")
        result = battle.end(game, b)
        assert result.is_draw

        manager = GameManager()
        manager._active_games["test"] = game

        # After a draw, both took poison
        # Alice: 8 + ~1 (from bob's damage) = 9 or more depending on damage calc
        # Let's manually set to test the scenario
        alice.poison = 10  # At lethal
        bob.poison = 5  # Not at lethal

        manager._handle_post_battle_pvp(game, alice, bob, result, False, "test", None)

        # Alice goes to awaiting_elimination first, then gets eliminated since 2 survivors remain
        # (bob + charlie means no sudden death needed)
        assert alice.phase == "eliminated"
        assert bob.phase == "reward"

        # Bob's last_battle_result should show it was a draw
        assert bob.last_battle_result is not None
        assert bob.last_battle_result.is_draw is True
        assert bob.last_battle_result.winner_name is None
        assert bob.last_battle_result.opponent_name == alice.name


class TestSuddenDeathRegressions:
    """Regression tests for sudden death bugs."""

    def test_sudden_death_pvp_draw_loops_back_to_build(self):
        """When both players are at lethal after a sudden death battle, loop back to build."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players

        alice.poison = 9
        bob.poison = 9
        alice.in_sudden_death = True
        bob.in_sudden_death = True

        setup_battle_ready(alice)
        setup_battle_ready(bob)

        b = battle.start(game, alice, bob, is_sudden_death=True)
        battle.submit_result(b, alice, "draw")
        battle.submit_result(b, bob, "draw")
        result = battle.end(game, b)
        assert result.is_draw

        alice.poison = 10
        bob.poison = 10

        manager = GameManager()
        manager._active_games["test"] = game

        end_result = manager._handle_pvp_finale(
            game,
            alice,
            bob,
            result,
            is_draw=True,
            winner_name=None,
            p1_poison=1,
            p2_poison=1,
            poison_dealt=0,
            player_at_lethal=True,
            opponent_at_lethal=True,
            was_sudden_death=True,
            game_id="test",
            db=None,
        )

        assert end_result is None
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.poison == 9
        assert bob.poison == 9
        assert alice.in_sudden_death is True
        assert bob.in_sudden_death is True

    def test_sudden_death_pve_draw_loops_back_to_build(self):
        """When player and bot are both at lethal after sudden death, loop back to build."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]

        bot = Puppet(name="BotPlayer", player_history_id=1, poison=9)
        game.puppets.append(bot)

        snapshot = BattleSnapshotData(
            hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
            vanguard=None,
            basic_lands=["Forest", "Swamp", "Mountain"],
            applied_upgrades=[],
            treasures=1,
        )
        static_opp = StaticOpponent.from_snapshot(snapshot, "BotPlayer", 1)

        alice.in_sudden_death = True
        setup_battle_ready(alice)

        b = battle.start(game, alice, static_opp, is_sudden_death=True)
        battle.submit_result(b, alice, "draw")
        result = battle.end(game, b)
        assert result.is_draw

        alice.poison = 10
        bot.poison = 10

        manager = GameManager()
        manager._active_games["test"] = game

        end_result = manager._handle_post_battle_static(game, alice, static_opp, result, True, "test", None)

        assert end_result is None
        assert alice.phase == "build"
        assert alice.poison == 9
        assert bot.poison == 9
        assert alice.in_sudden_death is True

    def test_would_be_dead_returns_false_with_active_battles(self):
        """would_be_dead_ready_for_elimination returns False when battles are in progress."""
        game = create_game(["Alice", "Bob", "Charlie", "Dave"], num_players=4)
        alice, bob, charlie, dave = game.players

        alice.poison = 10
        bob.poison = 10
        charlie.poison = 5
        dave.poison = 3

        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)
        setup_battle_ready(dave)

        battle.start(game, alice, bob)
        battle.start(game, charlie, dave)

        # End alice vs bob battle (both at lethal)
        b = game.active_battles[0]
        battle.submit_result(b, alice, "draw")
        battle.submit_result(b, bob, "draw")
        battle.end(game, b)

        # charlie vs dave battle still active
        assert len(game.active_battles) == 1
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        assert elimination.would_be_dead_ready_for_elimination(game) is False


class TestBotSuddenDeath:
    """Tests for sudden death calculations that include bots."""

    def test_needs_sudden_death_includes_bots(self):
        """1 human + 2 bots at lethal with 0 survivors → needs sudden death."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=11)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=12)
        game.puppets.extend([bot1, bot2])

        assert elimination.needs_sudden_death(game) is True

    def test_no_sudden_death_when_enough_survivors(self):
        """1 human at lethal + 2 bots alive → no sudden death (2 survivors remain)."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=5)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=3)
        game.puppets.extend([bot1, bot2])

        assert elimination.needs_sudden_death(game) is False

    def test_get_sudden_death_fighters_selects_from_mixed_pool(self):
        """Human(10), Bot1(11), Bot2(12) → fighters are Human + Bot1."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=11)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=12)
        game.puppets.extend([bot1, bot2])

        fighters = elimination.get_sudden_death_fighters(game)
        assert fighters is not None
        fighter_names = {fighters[0].name, fighters[1].name}
        assert "Alice" in fighter_names
        assert "Bot1" in fighter_names
        assert "Bot2" not in fighter_names

    def test_bot_vs_bot_sudden_death_auto_resolves(self):
        """2 bots at lethal → one randomly eliminated, other survives."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.phase = "eliminated"

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=10)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=11)
        game.puppets.extend([bot1, bot2])

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "game_over"
        eliminated = [b for b in [bot1, bot2] if b.is_eliminated]
        survivors = [b for b in [bot1, bot2] if not b.is_eliminated]
        assert len(eliminated) == 1
        assert len(survivors) == 1
        assert survivors[0].poison == 9

    def test_human_vs_bot_sudden_death_starts_from_build(self):
        """Human and bot at lethal → human goes to build with in_sudden_death."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10
        alice.phase = "awaiting_elimination"
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=11)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=12)
        game.puppets.extend([bot1, bot2])

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "sudden_death"
        assert alice.phase == "build"
        assert alice.in_sudden_death is True
        assert alice.poison == 9
        assert bot1.in_sudden_death is True
        assert bot1.poison == 9
        assert bot2.is_eliminated is True

    def test_bots_not_eliminated_before_sudden_death_check(self):
        """Bots at lethal should not be eliminated before _check_sudden_death_ready runs."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10
        alice.phase = "awaiting_elimination"
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        alice.chosen_basics = ["Plains", "Island", "Mountain"]

        bot1 = Puppet(name="Bot1", player_history_id=1, poison=11)
        game.puppets.append(bot1)

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "sudden_death"
        assert not bot1.is_eliminated
        assert bot1.in_sudden_death is True
        assert alice.in_sudden_death is True

    def test_sudden_death_fighters_phase_is_build(self):
        """After _check_sudden_death_ready, all human fighters should be in build phase."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 10
        bob.poison = 11
        charlie.poison = 5
        alice.phase = "awaiting_elimination"
        bob.phase = "awaiting_elimination"
        charlie.phase = "draft"
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bob.hand = [Card(name="Test2", image_url="test", id="t2", type_line="Creature")]
        alice.chosen_basics = ["Plains", "Island", "Mountain"]
        bob.chosen_basics = ["Forest", "Swamp", "Mountain"]

        manager = GameManager()
        manager._active_games["test"] = game

        result = manager._check_sudden_death_ready(game, "test", None)

        assert result == "sudden_death"
        assert alice.phase == "build"
        assert bob.phase == "build"
        assert len(game.active_battles) == 0

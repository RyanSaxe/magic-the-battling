from conftest import setup_battle_ready

from mtb.models.cards import Card
from mtb.models.game import BattleSnapshotData, LastBattleResult, Puppet, StaticOpponent, create_game
from mtb.phases import battle, elimination, reward
from server.services.game_manager import GameManager


def _make_bot_snapshot() -> BattleSnapshotData:
    return BattleSnapshotData(
        hand=[Card(name="BotCard", image_url="bot", id="bot", type_line="Creature")],
        vanguard=None,
        basic_lands=["Forest", "Swamp", "Mountain"],
        applied_upgrades=[],
        treasures=1,
    )


class TestBotBattleFlow:
    """Tests for full battle flow against bots."""

    def test_player_loses_to_bot_takes_poison(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.hand = [Card(name="Test", image_url="test", id="test", type_line="Creature")]

        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)
        bot = Puppet(name="BotPlayer (Bot)", player_history_id=1, snapshots={"3_1": static_opp})
        game.puppets.append(bot)

        b = battle.start(game, alice, opponent=static_opp)
        battle.submit_result(b, alice, winner_name=static_opp.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is None
        assert result.loser is alice

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        alice.phase = "reward"
        reward.start_vs_static(game, alice, opponent=static_opp, result=result)

        assert alice.poison > initial_alice_poison
        assert bot.poison == initial_bot_poison
        assert alice.last_battle_result is not None
        assert alice.last_battle_result.winner_name == static_opp.name

    def test_player_wins_against_bot_bot_takes_poison(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.hand = [Card(name="Test", image_url="test", id="test", type_line="Creature")]

        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)
        bot = Puppet(name="BotPlayer (Bot)", player_history_id=1, snapshots={"3_1": static_opp})
        game.puppets.append(bot)

        b = battle.start(game, alice, opponent=static_opp)
        battle.submit_result(b, alice, winner_name=alice.name)
        assert battle.results_agreed(b)

        result = battle.end(game, b)
        assert result.winner is alice
        assert result.loser is None

        initial_alice_poison = alice.poison
        initial_bot_poison = bot.poison

        alice.phase = "reward"
        reward.start_vs_static(game, alice, opponent=static_opp, result=result)

        assert alice.poison == initial_alice_poison
        assert bot.poison > initial_bot_poison
        assert alice.last_battle_result is not None
        assert alice.last_battle_result.winner_name == alice.name


class TestBotGameOver:
    """Tests for game over conditions when playing against bots."""

    def test_game_continues_when_human_and_bot_both_alive(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="Bot", player_history_id=1, snapshots={})
        game.puppets.append(bot)
        alice.poison = 5
        bot.poison = 3

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is False
        assert winner is None

    def test_human_wins_when_bot_eliminated(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, is_eliminated=True)
        game.puppets.append(bot)

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is alice

    def test_game_over_no_winner_when_human_eliminated(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="Bot", player_history_id=1, snapshots={})
        game.puppets.append(bot)
        alice.phase = "eliminated"
        alice.poison = 10

        winner, is_game_over = elimination.check_game_over(game)

        assert is_game_over is True
        assert winner is None

    def test_bot_elimination_via_poison(self) -> None:
        game = create_game(["Alice"], num_players=1)
        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, poison=10)
        game.puppets.append(bot)

        eliminated = elimination.process_puppet_eliminations(game)

        assert len(eliminated) == 1
        assert bot.is_eliminated is True

    def test_bot_not_eliminated_below_threshold(self) -> None:
        game = create_game(["Alice"], num_players=1)
        bot = Puppet(name="Bot", player_history_id=1, snapshots={}, poison=9)
        game.puppets.append(bot)

        eliminated = elimination.process_puppet_eliminations(game)

        assert len(eliminated) == 0
        assert bot.is_eliminated is False


class TestFinaleVsBot:
    """Tests for finale scenarios against bots."""

    def test_the_puppet_that_loses_the_final_shows_that_it_lost(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="BotPlayer", player_history_id=1, poison=game.config.poison_to_lose - 1)
        bot.last_battle_result = LastBattleResult(opponent_name="Carol", winner_name=bot.name)
        game.puppets.append(bot)
        setup_battle_ready(alice)
        battle.start(game, alice, opponent=StaticOpponent.from_snapshot(_make_bot_snapshot(), bot.name, history_id=1))
        manager = GameManager()
        manager.active_games["test"] = game
        manager.player_to_game["pid_alice"] = "test"
        manager.player_id_to_name["pid_alice"] = alice.name

        assert manager.handle_battle_submit_result(game, alice, result=alice.name, game_id="test")

        state = manager.get_game_state("test", "pid_alice")
        assert state is not None
        assert state.self_player.phase == "winner"
        assert next(p for p in state.players if p.name == bot.name).last_result == "loss"

    def test_finale_vs_bot_player_wins_bot_not_eliminated(self) -> None:
        """In finale vs bot, if player wins but bot isn't at lethal, game continues."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="BotPlayer", player_history_id=1, poison=5)
        game.puppets.append(bot)
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)

        setup_battle_ready(alice)
        battle.start(game, alice, opponent=static_opp)

        manager = GameManager()
        manager.active_games["test"] = game

        assert manager.handle_battle_submit_result(game, alice, result=alice.name, game_id="test")

        assert bot.poison > 5
        assert bot.poison < 10
        assert not bot.is_eliminated
        assert alice.phase == "reward"

    def test_finale_vs_bot_mutual_lethal_triggers_sudden_death(self) -> None:
        """In finale vs bot, if both reach lethal on a draw, sudden death triggers."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 9
        bot = Puppet(name="BotPlayer", player_history_id=1, poison=9)
        game.puppets.append(bot)
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)

        setup_battle_ready(alice)
        battle.start(game, alice, opponent=static_opp)

        manager = GameManager()
        manager.active_games["test"] = game

        assert manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")

        assert alice.phase == "build"
        assert alice.poison == 9
        assert bot.poison == 9
        assert alice.in_sudden_death is True
        assert bot.in_sudden_death is True
        assert len(game.active_battles) == 0


class TestDrawWithOneSurvivor:
    """Tests for draw battles where one player survives and one is eliminated."""

    def test_draw_survivor_sees_draw_in_last_battle_result(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        bob.poison = 2
        charlie.poison = 0
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        battle.start(game, alice, opponent=bob)
        charlie.phase = "draft"
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")
        manager.handle_battle_submit_result(game, bob, result="draw", game_id="test")

        assert alice.phase == "eliminated"
        assert bob.phase == "reward"
        assert bob.last_battle_result is not None
        assert bob.last_battle_result.is_draw is True
        assert bob.last_battle_result.winner_name is None
        assert bob.last_battle_result.opponent_name == alice.name


class TestSuddenDeathRegressions:
    """Regression tests for sudden death bugs."""

    def test_non_finale_mutual_lethal_keeps_death_animation_payload(self) -> None:
        """A later sudden-death transition must not rewrite this battle's death payload."""
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        alice.poison = 9
        bob.poison = 9
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)

        battle.start(game, alice, opponent=bob)
        charlie.phase = "draft"
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")
        manager.handle_battle_submit_result(game, bob, result="draw", game_id="test")

        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.battle_resolution is not None
        assert bob.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is False
        assert bob.battle_resolution.continue_sudden_death is False
        assert alice.battle_resolution.your_side.show_death_animation is True
        assert alice.battle_resolution.opponent_side.show_death_animation is True
        assert bob.battle_resolution.your_side.show_death_animation is True
        assert bob.battle_resolution.opponent_side.show_death_animation is True

    def test_sudden_death_pvp_draw_loops_back_to_build(self) -> None:
        """When both players are at lethal after a sudden death battle, loop back to build."""
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.poison = 9
        bob.poison = 9
        alice.in_sudden_death = True
        bob.in_sudden_death = True
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        battle.start(game, alice, opponent=bob, is_sudden_death=True)
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")
        manager.handle_battle_submit_result(game, bob, result="draw", game_id="test")

        assert alice.phase == "build"
        assert bob.phase == "build"
        assert alice.poison == 9
        assert bob.poison == 9
        assert alice.in_sudden_death is True
        assert bob.in_sudden_death is True
        assert alice.battle_resolution is not None
        assert bob.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is True
        assert bob.battle_resolution.continue_sudden_death is True
        assert alice.battle_resolution.your_side.show_death_animation is True
        assert alice.battle_resolution.opponent_side.show_death_animation is True
        assert bob.battle_resolution.your_side.show_death_animation is True
        assert bob.battle_resolution.opponent_side.show_death_animation is True

    def test_sudden_death_pve_draw_loops_back_to_build(self) -> None:
        """When player and bot are both at lethal after sudden death, loop back to build."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 9
        alice.in_sudden_death = True
        bot = Puppet(name="BotPlayer", player_history_id=1, poison=9, in_sudden_death=True)
        game.puppets.append(bot)
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)
        setup_battle_ready(alice)

        battle.start(game, alice, opponent=static_opp, is_sudden_death=True)
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")

        assert alice.phase == "build"
        assert alice.poison == 9
        assert bot.poison == 9
        assert alice.in_sudden_death is True
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.continue_sudden_death is True
        assert alice.battle_resolution.your_side.show_death_animation is True
        assert alice.battle_resolution.opponent_side.show_death_animation is True

    def test_non_finale_bot_death_keeps_death_animation_payload(self) -> None:
        """Bot/ghost deaths should animate even when the game is not over."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        bot = Puppet(name="BotPlayer", player_history_id=1, poison=9)
        extra_bot = Puppet(name="OtherBot", player_history_id=2, poison=0)
        game.puppets.extend([bot, extra_bot])
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "BotPlayer", history_id=1)

        setup_battle_ready(alice)
        battle.start(game, alice, opponent=static_opp)
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result=alice.name, game_id="test")

        assert alice.phase == "reward"
        assert bot.is_eliminated is True
        assert alice.battle_resolution is not None
        assert alice.battle_resolution.opponent_side.show_death_animation is True


class TestBotSuddenDeath:
    """Tests for sudden death calculations that include bots."""

    def test_needs_sudden_death_includes_bots(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10
        bot1 = Puppet(name="Bot1", player_history_id=1, poison=11)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=12)
        game.puppets.extend([bot1, bot2])

        assert elimination.needs_sudden_death(game) is True

    def test_no_sudden_death_when_enough_survivors(self) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 10
        bot1 = Puppet(name="Bot1", player_history_id=1, poison=5)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=3)
        game.puppets.extend([bot1, bot2])

        assert elimination.needs_sudden_death(game) is False

    def test_get_sudden_death_fighters_selects_from_mixed_pool(self) -> None:
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

    def test_bot_vs_bot_sudden_death_auto_resolves(self) -> None:
        """2 bots at lethal when human is eliminated -> one randomly eliminated, other survives."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 12
        bot1 = Puppet(name="Bot1", player_history_id=1, poison=10)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=11)
        game.puppets.extend([bot1, bot2])
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "Bot1", history_id=1)

        setup_battle_ready(alice)
        battle.start(game, alice, opponent=static_opp)
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result=static_opp.name, game_id="test")

        assert alice.phase == "eliminated"
        eliminated = [b for b in (bot1, bot2) if b.is_eliminated]
        survivors = [b for b in (bot1, bot2) if not b.is_eliminated]
        assert len(eliminated) == 1
        assert len(survivors) == 1
        assert survivors[0].poison == 9

    def test_human_vs_bot_sudden_death_starts_from_build(self) -> None:
        """Human and bot at lethal -> human goes to build with in_sudden_death, third bot eliminated."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        alice.poison = 9
        alice.hand = [Card(name="Test1", image_url="test", id="t1", type_line="Creature")]
        bot1 = Puppet(name="Bot1", player_history_id=1, poison=9)
        bot2 = Puppet(name="Bot2", player_history_id=2, poison=12)
        game.puppets.extend([bot1, bot2])
        static_opp = StaticOpponent.from_snapshot(_make_bot_snapshot(), "Bot1", history_id=1)

        setup_battle_ready(alice)
        battle.start(game, alice, opponent=static_opp)
        manager = GameManager()
        manager.active_games["test"] = game

        manager.handle_battle_submit_result(game, alice, result="draw", game_id="test")

        assert alice.phase == "build"
        assert alice.in_sudden_death is True
        assert alice.poison == 9
        assert bot1.in_sudden_death is True
        assert bot1.poison == 9
        assert not bot1.is_eliminated
        assert bot2.is_eliminated is True

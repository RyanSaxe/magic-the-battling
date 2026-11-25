from collections.abc import Callable

import pytest
from conftest import setup_battle_ready

from mtb.models.cards import Card
from mtb.models.game import LastBattleResult, Puppet, StaticOpponent, create_game
from mtb.phases import battle
from server.services.game_manager import GameManager


def test_can_start_pairing() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    starting_stage = game.config.starting_stage

    alice.phase = "build"
    bob.phase = "battle"
    assert not battle.can_start_pairing(game, 1, stage=starting_stage)

    alice.phase = "battle"
    assert battle.can_start_pairing(game, 1, stage=starting_stage)

    alice.round = 2
    assert not battle.can_start_pairing(game, 1, stage=starting_stage)


def test_find_opponent_returns_candidate() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "battle"

    opponent = battle.find_opponent(game, alice)

    assert opponent is bob


def test_find_opponent_returns_none_when_not_all_ready() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "build"

    opponent = battle.find_opponent(game, alice)

    assert opponent is None


def test_start_battle_creates_zones(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    alice.hand = [card_factory("a1"), card_factory("a2")]
    alice.sideboard = [card_factory("a3")]
    alice.treasures = 2

    b = battle.start(game, alice, opponent=bob)

    assert b.player is alice
    assert b.opponent is bob
    assert b.coin_flip_name in (alice.name, bob.name)
    # 3 lands + 2 treasures = 5 cards on battlefield
    assert len(b.player_zones.battlefield) == 5
    lands = [c for c in b.player_zones.battlefield if "Land" in c.type_line]
    treasures = [c for c in b.player_zones.battlefield if "Treasure" in c.type_line]
    assert len(lands) == 3
    assert len(treasures) == 2
    assert len(b.player_zones.hand) == 2
    assert len(b.player_zones.sideboard) == 1
    assert b.player_zones.treasures == 2


def test_higher_poison_player_goes_first() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    alice.poison = 5
    bob.poison = 2
    b = battle.start(game, alice, opponent=bob)
    assert b.coin_flip_name == alice.name

    game.active_battles.clear()

    alice.poison = 2
    bob.poison = 5
    b = battle.start(game, alice, opponent=bob)
    assert b.coin_flip_name == bob.name


def test_puppet_falls_back_to_the_latest_earlier_round_past_stage_9() -> None:
    puppet = Puppet(
        name="Bot1",
        player_history_id=1,
        snapshots={key: StaticOpponent(name=key, hand=[], chosen_basics=[]) for key in ("3_1", "9_3", "10_1", "10_2")},
    )

    after_last = puppet.get_opponent_for_round(10, 3)
    between = puppet.get_opponent_for_round(5, 2)

    assert after_last is not None
    assert between is not None
    assert (after_last.name, between.name) == ("10_2", "3_1")


def test_higher_poison_bot_goes_first(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])

    fake = Puppet(name="Bot1", player_history_id=1)
    snapshot = StaticOpponent(
        name="Bot1",
        hand=[card_factory("card1")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )
    fake.snapshots[f"{alice.stage}_1"] = snapshot
    fake.poison = 5
    game.puppets.append(fake)

    alice.poison = 2
    opponent = fake.get_opponent_for_round(alice.stage, 1)
    assert opponent is not None
    b = battle.start(game, alice, opponent=opponent)
    assert b.coin_flip_name == "Bot1"


def test_start_battle_wrong_phase_raises() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    alice.phase = "draft"
    bob.phase = "battle"

    with pytest.raises(ValueError, match=r".+"):
        battle.start(game, alice, opponent=bob)


def test_start_battle_not_all_ready_raises() -> None:
    game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
    alice, bob, charlie = game.players
    alice.phase = "battle"
    bob.phase = "battle"
    charlie.phase = "build"
    alice.chosen_basics = ["Plains", "Plains", "Plains"]
    bob.chosen_basics = ["Island", "Island", "Island"]

    with pytest.raises(ValueError, match=r".+"):
        battle.start(game, alice, opponent=bob)


def test_is_in_active_battle() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    assert not battle.is_in_active_battle(game, alice)

    battle.start(game, alice, opponent=bob)

    assert battle.is_in_active_battle(game, alice)
    assert battle.is_in_active_battle(game, bob)


def test_results_agreed_when_both_match() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    assert battle.results_agreed(b)
    result = battle.get_result(b)
    assert result is not None
    assert result.winner is alice
    assert result.loser is bob
    assert not result.is_draw


def test_results_not_agreed_when_different() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Bob")

    assert not battle.results_agreed(b)


def test_end_battle_caps_treasures() -> None:
    """battle.end() syncs zones and caps treasures but does NOT set phases."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])
    alice.treasures = 10
    bob.treasures = 3

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    result = battle.end(game, b)

    assert result.winner is alice
    assert result.loser is bob
    assert alice.treasures == game.config.max_treasures
    assert bob.treasures == 3
    assert alice.phase == "battle"
    assert bob.phase == "battle"


def test_end_battle_tracks_revealed_cards(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, opponent=bob)
    battle.move_zone(b, alice, card=creature, from_zone="hand", to_zone="battlefield")
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_bounced_card_still_revealed(card_factory: Callable[..., Card]) -> None:
    """A card played then bounced to hand should still appear in revealed cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, opponent=bob)
    battle.move_zone(b, alice, card=creature, from_zone="hand", to_zone="battlefield")
    battle.move_zone(b, alice, card=creature, from_zone="battlefield", to_zone="hand")
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_sideboard_fetch_to_hand_not_revealed(card_factory: Callable[..., Card]) -> None:
    """A card fetched from sideboard to hand should NOT appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Instant")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, opponent=bob)
    battle.move_zone(b, alice, card=wish_target, from_zone="sideboard", to_zone="hand")
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    battle.end(game, b)

    assert wish_target not in alice.most_recently_revealed_cards


def test_sideboard_fetch_to_battlefield_revealed(card_factory: Callable[..., Card]) -> None:
    """A card fetched from sideboard to a revealed zone should appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    wish_target = card_factory("WishTarget", "Creature")
    alice.sideboard = [wish_target]

    b = battle.start(game, alice, opponent=bob)
    battle.move_zone(b, alice, card=wish_target, from_zone="sideboard", to_zone="battlefield")
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    battle.end(game, b)

    assert wish_target in alice.most_recently_revealed_cards


def test_hand_to_command_zone_revealed(card_factory: Callable[..., Card]) -> None:
    """A card moved from hand to command zone should appear in most_recently_revealed_cards."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    creature = card_factory("Creature", "Creature")
    alice.hand = [creature]

    b = battle.start(game, alice, opponent=bob)
    battle.move_zone(b, alice, card=creature, from_zone="hand", to_zone="command_zone")
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")

    battle.end(game, b)

    assert creature in alice.most_recently_revealed_cards


def test_end_battle_not_agreed_raises() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name="Alice")

    with pytest.raises(ValueError, match=r".+"):
        battle.end(game, b)


def test_end_battle_preserves_hand_and_sideboard(card_factory: Callable[..., Card]) -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    hand_card = card_factory("hand_card")
    sideboard_card = card_factory("sideboard_card")
    alice.hand = [hand_card]
    alice.sideboard = [sideboard_card]

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name="Alice")
    battle.submit_result(b, bob, winner_name="Alice")
    battle.end(game, b)

    assert hand_card in alice.hand
    assert sideboard_card in alice.sideboard
    assert hand_card not in alice.sideboard
    assert sideboard_card not in alice.hand


def test_submit_result_accepts_draw() -> None:
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name=battle.DRAW_RESULT)
    battle.submit_result(b, bob, winner_name=battle.DRAW_RESULT)

    assert battle.results_agreed(b)
    result = battle.get_result(b)
    assert result is not None
    assert result.is_draw
    assert result.winner is None
    assert result.loser is None


def test_end_battle_with_draw_returns_draw_result() -> None:
    """battle.end() returns draw result but does NOT set phases."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    b = battle.start(game, alice, opponent=bob)
    battle.submit_result(b, alice, winner_name=battle.DRAW_RESULT)
    battle.submit_result(b, bob, winner_name=battle.DRAW_RESULT)

    result = battle.end(game, b)

    assert result.is_draw
    assert alice.phase == "battle"
    assert bob.phase == "battle"


def test_unpaired_puppets_deal_fibonacci_damage_without_upgrades(
    card_factory: Callable[..., Card], monkeypatch: pytest.MonkeyPatch
) -> None:
    game = create_game(["Alice"], num_players=1)
    game.config.use_upgrades = False
    stage_6_hand = [card_factory(f"c{i}") for i in range(6)]
    bot1 = Puppet(name="Bot1", player_history_id=1, snapshots={"6_1": StaticOpponent(name="Bot1", hand=stage_6_hand)})
    bot2 = Puppet(name="Bot2", player_history_id=2, snapshots={"6_1": StaticOpponent(name="Bot2", hand=stage_6_hand)})
    game.puppets = [bot1, bot2]
    monkeypatch.setattr(battle.random, "choices", lambda *_args, **_kwargs: ["bot1_wins"])

    battle.resolve_unpaired_bot_battles(
        game, set(), stage=6, round_num=1, num_rounds_per_stage=game.config.num_rounds_per_stage
    )

    assert bot2.poison == 3


def test_companion_starts_battle_in_exile_and_preserves_selection(card_factory: Callable[..., Card]) -> None:
    """Build command-zone cards should appear in battle exile without losing selection state."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice, ["Plains", "Plains", "Plains"])
    setup_battle_ready(bob, ["Island", "Island", "Island"])

    companion = card_factory("Companion", "Creature", oracle_text="Companion — test")
    alice.command_zone = [companion]

    b = battle.start(game, alice, opponent=bob)

    assert companion in alice.command_zone
    assert companion in b.player_zones.exile
    assert companion not in b.player_zones.command_zone


def test_companion_filtered_from_sideboard_in_battle(card_factory: Callable[..., Card]) -> None:
    """Companion should only appear in exile during battle, not sideboard."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    companion = card_factory("Lurrus")
    other_sideboard = card_factory("SideboardCard")
    alice.command_zone = [companion]
    alice.sideboard = [companion, other_sideboard]

    b = battle.start(game, alice, opponent=bob)

    assert companion in b.player_zones.exile
    assert companion not in b.player_zones.sideboard
    assert other_sideboard in b.player_zones.sideboard
    assert len(b.player_zones.sideboard) == 1


def test_companion_filtered_from_sideboard_vs_static_opponent(card_factory: Callable[..., Card]) -> None:
    """Companion should move to exile and be filtered from sideboard for static opponents too."""
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    companion = card_factory("Kaheera")
    other_sideboard = card_factory("SideboardCard")

    static_opp = StaticOpponent(
        name="Bot1",
        hand=[card_factory("BotCard")],
        chosen_basics=["Plains", "Island", "Mountain"],
        command_zone=[companion],
        sideboard=[companion, other_sideboard],
    )
    fake = Puppet(name="Bot1", player_history_id=1)
    fake.snapshots[f"{alice.stage}_1"] = static_opp
    game.puppets.append(fake)

    b = battle.start(game, alice, opponent=static_opp)

    assert companion in b.opponent_zones.exile
    assert companion not in b.opponent_zones.sideboard
    assert other_sideboard in b.opponent_zones.sideboard
    assert len(b.opponent_zones.sideboard) == 1


def test_companion_preserved_in_sideboard_after_battle(card_factory: Callable[..., Card]) -> None:
    """Companion should be restored to sideboard after battle ends."""
    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    setup_battle_ready(alice)
    setup_battle_ready(bob)

    companion = card_factory("Lurrus")
    other_sideboard = card_factory("SideboardCard")
    alice.command_zone = [companion]
    alice.sideboard = [companion, other_sideboard]

    b = battle.start(game, alice, opponent=bob)

    assert companion not in b.player_zones.sideboard
    assert companion in b.player_zones.submitted_cards

    battle.submit_result(b, alice, winner_name=alice.name)
    battle.submit_result(b, bob, winner_name=alice.name)
    battle.end(game, b)

    assert companion in alice.sideboard
    assert other_sideboard in alice.sideboard


def test_pass_turn_for_static_opponent(card_factory: Callable[..., Card]) -> None:
    """Player should be able to pass the static opponent's turn on their behalf."""
    game = create_game(["Alice"], num_players=1)
    alice = game.players[0]
    setup_battle_ready(alice)

    static_opp = StaticOpponent(
        name="Bot",
        hand=[card_factory("card1")],
        chosen_basics=["Plains", "Island", "Mountain"],
    )

    b = battle.start(game, alice, opponent=static_opp)
    manager = GameManager()

    if b.current_turn_name == alice.name:
        assert manager.handle_battle_pass_turn(game, alice) is True
        assert b.current_turn_name == "Bot"

    assert b.current_turn_name == "Bot"
    assert manager.handle_battle_pass_turn(game, alice) is True
    assert b.current_turn_name == alice.name


class TestPlayDrawPreference:
    def test_pvp_winner_prefers_play(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 5
        bob.poison = 0
        alice.play_draw_preference = "play"

        b = battle.start(game, alice, opponent=bob)
        assert b.coin_flip_name == alice.name
        assert b.on_the_play_name == alice.name

    def test_pvp_winner_prefers_draw(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 5
        bob.poison = 0
        alice.play_draw_preference = "draw"

        b = battle.start(game, alice, opponent=bob)
        assert b.coin_flip_name == alice.name
        assert b.on_the_play_name == bob.name

    def test_pvp_none_preference_defaults_to_play(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 5
        bob.poison = 0
        alice.play_draw_preference = None

        b = battle.start(game, alice, opponent=bob)
        assert b.coin_flip_name == alice.name
        assert b.on_the_play_name == alice.name

    def test_vs_static_bot_wins_with_play(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.poison = 0

        static_opp = StaticOpponent(
            name="Bot",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
            poison=5,
            play_draw_preference="play",
        )

        b = battle.start(game, alice, opponent=static_opp)
        assert b.coin_flip_name == "Bot"
        assert b.on_the_play_name == "Bot"

    def test_vs_static_bot_wins_with_draw(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.poison = 0

        static_opp = StaticOpponent(
            name="Bot",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
            poison=5,
            play_draw_preference="draw",
        )

        b = battle.start(game, alice, opponent=static_opp)
        assert b.coin_flip_name == "Bot"
        assert b.on_the_play_name == alice.name

    def test_vs_static_bot_wins_with_none_is_random(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.poison = 0

        static_opp = StaticOpponent(
            name="Bot",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
            poison=5,
            play_draw_preference=None,
        )

        b = battle.start(game, alice, opponent=static_opp)
        assert b.coin_flip_name == "Bot"
        assert b.on_the_play_name in (alice.name, "Bot")

    def test_human_wins_vs_static_with_preference(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.poison = 5
        alice.play_draw_preference = "draw"

        static_opp = StaticOpponent(
            name="Bot",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
            poison=0,
        )

        b = battle.start(game, alice, opponent=static_opp)
        assert b.coin_flip_name == alice.name
        assert b.on_the_play_name == "Bot"

    def test_on_the_play_name_always_set(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        b = battle.start(game, alice, opponent=bob)
        assert b.on_the_play_name is not None

    def test_current_turn_name_equals_on_the_play_name(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.play_draw_preference = "play"

        b = battle.start(game, alice, opponent=bob)
        assert b.current_turn_name == b.on_the_play_name


class TestFinalsCoinFlip:
    def test_finals_game1_uses_poison(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 5
        bob.poison = 2

        b = battle.start(game, alice, opponent=bob)

        assert b.coin_flip_name == alice.name

    def test_finals_loser_gets_coin_flip(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 2
        bob.poison = 5
        alice.last_battle_result = LastBattleResult(opponent_name="Bob", winner_name="Bob")

        b = battle.start(game, alice, opponent=bob)

        assert b.coin_flip_name == alice.name

    def test_finals_draw_falls_back_to_poison(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        alice.poison = 2
        bob.poison = 5
        alice.last_battle_result = LastBattleResult(opponent_name="Bob", winner_name=None, is_draw=True)

        b = battle.start(game, alice, opponent=bob)

        assert b.coin_flip_name == bob.name

    def test_non_finals_ignores_last_result(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)
        setup_battle_ready(charlie)
        alice.poison = 2
        bob.poison = 5
        alice.last_battle_result = LastBattleResult(opponent_name="Bob", winner_name="Bob")

        b = battle.start(game, alice, opponent=bob)

        assert b.coin_flip_name == bob.name

    def test_finals_vs_static_loser_gets_coin_flip(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.poison = 2

        fake = Puppet(name="Bot1", player_history_id=1)
        snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
            poison=5,
        )
        fake.snapshots[f"{alice.stage}_1"] = snapshot
        game.puppets.append(fake)

        alice.last_battle_result = LastBattleResult(opponent_name="Bot1", winner_name="Bot1")

        opponent = fake.get_opponent_for_round(alice.stage, 1)
        assert opponent is not None
        b = battle.start(game, alice, opponent=opponent)

        assert b.coin_flip_name == alice.name

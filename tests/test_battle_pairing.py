import os
import random
import subprocess
import sys
from collections import Counter
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from conftest import setup_battle_ready

from mtb.models.cards import Card
from mtb.models.game import Game, Player, Puppet, StaticOpponent, create_game
from mtb.phases import battle
from server.services.game.view_builder import build_puppet_view


class TestPairingProbabilities:
    def test_get_pairing_probabilities_single_candidate(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        setup_battle_ready(bob)

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {"Bob": 1.0}

    def test_get_pairing_probabilities_three_candidates(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie", "Diana"], num_players=4)
        alice, _bob, _charlie, _diana = game.players
        for p in game.players:
            setup_battle_ready(p)

        probs = battle.get_pairing_probabilities(game, alice)

        assert len(probs) == 3
        assert alice.name not in probs
        total = sum(probs.values())
        assert abs(total - 1.0) < 0.001

    def test_get_pairing_probabilities_prior_opponent_weighted_down(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie", "Diana"], num_players=4)
        alice, bob, _charlie, _diana = game.players
        alice.last_opponent_name = "Bob"
        bob.last_opponent_name = "Alice"
        for p in game.players:
            setup_battle_ready(p)

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == pytest.approx({"Bob": 0.1, "Charlie": 0.45, "Diana": 0.45})

    def test_get_pairing_probabilities_works_across_phases(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase = "battle"
        bob.phase = "build"

        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {"Bob": 1.0}

    def test_get_pairing_probabilities_returns_empty_when_in_active_battle(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, _charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, alice, opponent=bob)
        probs = battle.get_pairing_probabilities(game, alice)

        assert probs == {}


class TestUnifiedPairingCandidates:
    def test_get_all_pairing_candidates_includes_live_players(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, _bob, _charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        candidates = battle.get_all_pairing_candidates(game, alice)

        names = {c.name for c in candidates}
        assert names == {"Bob", "Charlie"}

    def test_get_all_pairing_candidates_excludes_players_in_active_battle(self) -> None:
        game = create_game(["Alice", "Bob", "Charlie"], num_players=3)
        alice, bob, charlie = game.players
        for p in game.players:
            setup_battle_ready(p)

        battle.start(game, bob, opponent=charlie)
        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 0

    def test_get_all_pairing_candidates_includes_fake_players(self, card_factory: Callable[..., Card]) -> None:
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        fake = Puppet(name="Bot1", player_history_id=1)
        snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("card1")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        fake.snapshots[f"{alice.stage}_1"] = snapshot
        game.puppets.append(fake)

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 1
        assert isinstance(candidates[0], StaticOpponent)
        assert candidates[0].name == "Bot1"

    def test_get_all_pairing_candidates_includes_ghost(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        setup_battle_ready(alice)
        bob.phase = "eliminated"
        ghost = StaticOpponent.from_player(bob, hand_revealed=True)
        game.most_recent_ghost = ghost

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert len(candidates) == 1
        assert candidates[0] is ghost

    def test_get_all_pairing_candidates_excludes_self_as_ghost(self) -> None:
        game = create_game(["Alice", "Bob"], num_players=2)
        alice, bob = game.players
        alice.phase = "eliminated"
        ghost = StaticOpponent.from_player(alice, hand_revealed=True)
        game.most_recent_ghost = ghost
        setup_battle_ready(bob)

        candidates = battle.get_all_pairing_candidates(game, alice)

        assert ghost not in candidates

    def test_fake_player_snapshot_uses_stage_for_lookup(self, card_factory: Callable[..., Card]) -> None:
        """Snapshots are keyed by stage and round, not hand_size."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)

        fake = Puppet(name="Bot1", player_history_id=1)
        early_snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("early_card")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        later_snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("later_card")],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        fake.snapshots["3_1"] = early_snapshot
        fake.snapshots["4_1"] = later_snapshot
        game.puppets.append(fake)

        candidates = battle.get_all_pairing_candidates(game, alice)
        assert candidates[0].hand[0].name == "early_card"

        alice.stage = 4
        candidates = battle.get_all_pairing_candidates(game, alice)
        assert candidates[0].hand[0].name == "later_card"

    def test_fake_player_revealed_cards_includes_companion(self, card_factory: Callable[..., Card]) -> None:
        """Fake player's revealed cards should include companion from command_zone."""
        game = create_game(["Alice"], num_players=1)
        alice = game.players[0]
        setup_battle_ready(alice)
        alice.stage = 4
        alice.round = 1

        companion = card_factory("Lurrus", oracle_text="Companion — test")
        creature = card_factory("Grizzly Bears")
        prior_snapshot = StaticOpponent(
            name="Bot1",
            hand=[creature],
            command_zone=[companion],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        current_snapshot = StaticOpponent(
            name="Bot1",
            hand=[card_factory("current_card")],
            command_zone=[companion],
            chosen_basics=["Plains", "Island", "Mountain"],
        )
        fake = Puppet(name="Bot1", player_history_id=1)
        fake.snapshots["3_3"] = prior_snapshot
        fake.snapshots["4_1"] = current_snapshot
        game.puppets.append(fake)

        player_view = build_puppet_view(fake, alice, probabilities={})

        revealed_ids = {card.id for card in player_view.most_recently_revealed_cards}
        assert creature.id in revealed_ids
        assert companion.id in revealed_ids


def _table_game(*, humans: int, puppets: int, ghost: str | None, history: bool) -> Game:
    """Build a game whose next round seats ``humans`` players, ``puppets`` puppets and an optional ghost."""
    game = create_game([f"H{i}" for i in range(humans)], num_players=humans)
    for player in game.players:
        setup_battle_ready(player)
    for i in range(puppets):
        snapshot = StaticOpponent(name=f"Bot{i}", hand=[], source_player_history_id=i + 1)
        game.puppets.append(Puppet(name=f"Bot{i}", player_history_id=i + 1, snapshots={"3_1": snapshot}))
    seat_names = [p.name for p in game.players] + [fp.name for fp in game.puppets]
    if ghost == "human":
        game.most_recent_ghost = StaticOpponent(name="Ghost", hand=[])
        seat_names.append("Ghost")
    elif ghost == "puppet":
        snapshot = StaticOpponent(name="GhostBot", hand=[], source_player_history_id=99)
        game.most_recent_ghost_puppet = Puppet(
            name="GhostBot", player_history_id=99, is_eliminated=True, snapshots={"3_1": snapshot}
        )
        seat_names.append("GhostBot")
    if history:
        last_opponent = {}
        for a, b in zip(seat_names[::2], seat_names[1::2], strict=True):
            last_opponent[a], last_opponent[b] = b, a
        for player in game.players:
            player.last_opponent_name = last_opponent[player.name]
    return game


def _tables() -> Iterator[object]:
    for live in range(2, 10):
        for humans in sorted({live, 1, (live + 1) // 2}):
            puppets = live - humans
            ghost = None if live % 2 == 0 else "human" if humans % 2 else "puppet"
            for history in (False, True):
                parts = [f"{humans}h", f"{puppets}p", f"{ghost}-ghost" if ghost else "", "history" if history else ""]
                yield pytest.param(humans, puppets, ghost, history, id="-".join(filter(None, parts)))


class TestRoundTable:
    @pytest.mark.parametrize(("humans", "puppets", "ghost", "history"), list(_tables()))
    def test_every_player_sees_the_odds_the_guide_describes(
        self, humans: int, puppets: int, *, ghost: str | None, history: bool
    ) -> None:
        game = _table_game(humans=humans, puppets=puppets, ghost=ghost, history=history)
        seats = battle.get_round_table(game).seats

        for player in game.players:
            odds = battle.get_pairing_probabilities(game, player)
            last_opponent = player.last_opponent_name
            assert sum(odds.values()) == pytest.approx(1.0)
            if len(seats) == 2:
                assert list(odds.values()) == [1.0]
            elif len(seats) == 4 and last_opponent is not None:
                assert odds[last_opponent] == pytest.approx(0.1)
                assert sorted(odds.values()) == pytest.approx([0.1, 0.45, 0.45])
            elif len(seats) == 4:
                assert sorted(odds.values()) == pytest.approx([1 / 3] * 3)
            else:
                assert len(odds) == 3
                assert last_opponent not in odds
                assert list(odds.values()) == pytest.approx([1 / 3] * 3)

    @pytest.mark.parametrize(("humans", "puppets", "ghost", "history"), list(_tables()))
    def test_simulated_rounds_draw_each_opponent_at_the_shown_odds(
        self, humans: int, puppets: int, *, ghost: str | None, history: bool
    ) -> None:
        game = _table_game(humans=humans, puppets=puppets, ghost=ghost, history=history)
        table = battle.get_round_table(game)
        rounds = 20_000
        rng = random.Random(f"{humans}-{puppets}-{ghost}-{history}")  # noqa: S311 -- non-cryptographic game RNG
        faced: dict[str, Counter[str]] = {player.name: Counter() for player in game.players}

        for _ in range(rounds):
            for player, opponent in table.draw_battles(rng):
                faced[player.name][opponent.name] += 1
                if isinstance(opponent, Player):
                    faced[opponent.name][player.name] += 1

        for player in game.players:
            odds = battle.get_pairing_probabilities(game, player)
            assert set(faced[player.name]) <= set(odds)
            for name, odd in odds.items():
                assert faced[player.name][name] / rounds == pytest.approx(odd, abs=0.015)

    def test_four_seats_with_one_repeat_pair_give_the_other_pair_ten_percent_too(self) -> None:
        game = create_game(["A", "B", "C", "D"], num_players=4)
        a, b, c, _d = game.players
        for player in game.players:
            setup_battle_ready(player)
        a.last_opponent_name, b.last_opponent_name = "B", "A"

        assert battle.get_pairing_probabilities(game, a) == pytest.approx({"B": 0.1, "C": 0.45, "D": 0.45})
        assert battle.get_pairing_probabilities(game, c) == pytest.approx({"D": 0.1, "A": 0.45, "B": 0.45})

    def test_round_table_is_the_same_after_a_restart(self) -> None:
        script = """
from mtb.models.game import create_game
from mtb.phases import battle

game = create_game([f"P{i}" for i in range(8)], num_players=8)
for player in game.players:
    player.phase = "battle"
print(battle.get_round_table(game).pairings)
"""
        repo_root = Path(__file__).resolve().parents[1]
        tables = {
            subprocess.run(  # noqa: S603 -- trusted local subprocess args
                [sys.executable, "-c", script],
                cwd=repo_root,
                env={**os.environ, "PYTHONHASHSEED": hash_seed},
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            for hash_seed in ("0", "1", "2")
        }

        assert len(tables) == 1

"""Write active game snapshots, in the format the current code saves, to tests/fixtures/active_game_snapshots.

The files stand in for the games in progress when a deploy restarts the server, so the tests and the
image boot check can show that a change still restores them. Regenerate them only when production
already writes the new format:

    uv run python tests/fixtures/write_active_game_snapshots.py
"""

import json
import random
from collections.abc import Callable
from pathlib import Path

from mtb.models.cards import Battler, Card
from mtb.models.game import Game, Puppet, StaticOpponent, create_game, set_battler
from mtb.phases import battle, build, draft, reward

FIXTURES_DIR = Path(__file__).parent / "active_game_snapshots"
BASICS = ["Plains", "Island", "Mountain"]


def _card(index: int, type_line: str = "Creature") -> Card:
    card_id = f"fixture-card-{index:03d}"
    return Card(
        name=f"Fixture Card {index}",
        image_url=f"https://example.invalid/{card_id}.jpg",
        id=card_id,
        type_line=type_line,
    )


def _new_game(player_names: list[str]) -> Game:
    game = create_game(player_names, num_players=len(player_names))
    upgrades = [_card(900 + index, "Conspiracy") for index in range(4)]
    set_battler(game, Battler(cards=[_card(index) for index in range(120)], upgrades=upgrades, vanguards=[]))
    return game


def _ready_for_battle(game: Game) -> None:
    for player in game.players:
        for _ in range(game.config.starting_stage):
            build.move_card(player, player.sideboard[0], "sideboard", "hand")
        build.set_ready(game, player, BASICS, "play")
        player.phase = "battle"


def build_phase() -> Game:
    return _new_game(["Alice", "Bob"])


def battle_phase() -> Game:
    game = _new_game(["Alice", "Bob"])
    _ready_for_battle(game)
    alice, bob = game.players
    battle.start(game, alice, bob)
    return game


def draft_phase() -> Game:
    game = battle_phase()
    alice, bob = game.players
    finished = game.active_battles[0]
    battle.submit_result(finished, alice, alice.name)
    battle.submit_result(finished, bob, alice.name)
    result = battle.end(game, finished)
    for player in game.players:
        player.phase = "reward"
    reward.start(game, result.winner, result.loser)
    for player in game.players:
        reward.end_for_player(game, player)
    draft.start(game)
    for player in game.players:
        draft.deal_pack_to_player(game, player)
    return game


def puppet_battle_phase() -> Game:
    game = _new_game(["Alice"])
    _ready_for_battle(game)
    alice = game.players[0]
    opponent = StaticOpponent(
        name="Puppet",
        hand=[_card(500 + index) for index in range(3)],
        sideboard=[_card(510 + index) for index in range(5)],
        chosen_basics=BASICS,
        treasures=1,
        hand_revealed=True,
        is_ghost=False,
        source_player_history_id=1,
    )
    game.puppets.append(Puppet(name="Puppet", player_history_id=1, snapshots={"3_1": opponent}))
    battle.start(game, alice, opponent)
    return game


GAMES: dict[str, Callable[[], Game]] = {
    "build_phase": build_phase,
    "draft_phase": draft_phase,
    "battle_phase": battle_phase,
    "puppet_battle_phase": puppet_battle_phase,
}


def main() -> None:
    random.seed(0)
    FIXTURES_DIR.mkdir(exist_ok=True)
    for name, make_game in GAMES.items():
        path = FIXTURES_DIR / f"{name}.json"
        # The card registry is built from a set, so sorting keeps its order the same on every run.
        snapshot = json.loads(make_game().snapshot_dump_json())
        path.write_text(json.dumps(snapshot, sort_keys=True) + "\n")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()

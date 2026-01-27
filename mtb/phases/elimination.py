from mtb.models.game import FakePlayer, Game, Player, StaticOpponent


def get_live_players(game: Game) -> list[Player]:
    return [p for p in game.players if p.phase != "eliminated"]


def get_live_bots(game: Game) -> list[FakePlayer]:
    return [f for f in game.fake_players if not f.is_eliminated]


def get_would_be_dead(game: Game) -> list[Player]:
    return [p for p in get_live_players(game) if p.poison >= game.config.poison_to_lose]


def eliminate_player(game: Game, player: Player, round_num: int) -> None:
    ghost_opponent = StaticOpponent.from_player(player, hand_revealed=True)
    player.phase = "eliminated"
    game.most_recent_ghost = ghost_opponent
    game.most_recent_ghost_bot = None


def would_be_dead_ready_for_elimination(game: Game) -> bool:
    """Check if all would-be-dead players have finished reward (not in battle/reward phase)."""
    would_die = get_would_be_dead(game)
    if not would_die:
        return True
    return all(p.phase in ("draft", "awaiting_elimination") for p in would_die)


def needs_sudden_death(game: Game) -> bool:
    would_die = get_would_be_dead(game)
    live = get_live_players(game)
    survivors = len(live) - len(would_die)
    return survivors < 2 and len(would_die) >= 2


def get_sudden_death_fighters(game: Game) -> tuple[Player, Player] | None:
    """Returns the two players who should fight in sudden death, or None if not needed."""
    if not needs_sudden_death(game):
        return None

    would_die = get_would_be_dead(game)
    would_die_sorted = sorted(would_die, key=lambda p: p.poison)

    if len(would_die_sorted) == 2:
        return would_die_sorted[0], would_die_sorted[1]
    else:
        # Lowest poison gets bye, next two fight
        return would_die_sorted[1], would_die_sorted[2]


def setup_sudden_death_battle(game: Game, player1: Player, player2: Player) -> None:
    """Reset both players' poison to threshold - 1 for sudden death."""
    player1.poison = game.config.poison_to_lose - 1
    player2.poison = game.config.poison_to_lose - 1


def process_eliminations(game: Game, round_num: int) -> list[Player]:
    """Eliminate all players at or above poison threshold. Call after reward phase."""
    eliminated: list[Player] = []
    would_die = get_would_be_dead(game)

    for player in would_die:
        eliminate_player(game, player, round_num)
        eliminated.append(player)

    return eliminated


def process_bot_eliminations(game: Game) -> list[FakePlayer]:
    """Eliminate bots at or above poison threshold."""
    eliminated: list[FakePlayer] = []
    for fake in game.fake_players:
        if not fake.is_eliminated and fake.poison >= game.config.poison_to_lose:
            fake.is_eliminated = True
            eliminated.append(fake)
            game.most_recent_ghost = None
            game.most_recent_ghost_bot = fake
    return eliminated


def check_game_over(game: Game) -> tuple[Player | None, bool]:
    """
    Check if game is over. Returns (winner, is_game_over).

    Game over conditions:
    - 0 humans alive -> game over, no winner (None, True)
    - 1 human alive + 0 bots alive -> human wins (winner, True)
    - 2+ humans alive -> game continues (None, False)
    - 1 human alive + bots still alive -> game continues (None, False)
    """
    live_humans = get_live_players(game)
    live_bots = get_live_bots(game)

    if len(live_humans) == 0:
        return (None, True)
    elif len(live_humans) == 1 and len(live_bots) == 0:
        return (live_humans[0], True)
    else:
        return (None, False)

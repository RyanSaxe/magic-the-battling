from mtb.models.game import Game, Player


def get_live_players(game: Game) -> list[Player]:
    return [p for p in game.players if not p.is_ghost]


def get_would_be_dead(game: Game) -> list[Player]:
    return [p for p in get_live_players(game) if p.poison >= game.config.poison_to_lose]


def eliminate_player(game: Game, player: Player, round_num: int) -> None:
    player.is_ghost = True
    player.time_of_death = round_num
    player.phase = "eliminated"
    game.most_recent_ghost = player


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

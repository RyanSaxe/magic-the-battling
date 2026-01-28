import random

from mtb.models.game import FakePlayer, Game, Player, StaticOpponent

Participant = Player | FakePlayer


def get_live_players(game: Game) -> list[Player]:
    return [p for p in game.players if p.phase != "eliminated"]


def get_live_bots(game: Game) -> list[FakePlayer]:
    return [f for f in game.fake_players if not f.is_eliminated]


def get_would_be_dead(game: Game) -> list[Player]:
    return [p for p in get_live_players(game) if p.poison >= game.config.poison_to_lose]


def get_would_be_dead_bots(game: Game) -> list[FakePlayer]:
    return [f for f in get_live_bots(game) if f.poison >= game.config.poison_to_lose]


def eliminate_bot(game: Game, bot: FakePlayer) -> None:
    bot.is_eliminated = True
    remaining = len(get_live_players(game)) + len(get_live_bots(game))
    bot.placement = remaining + 1
    game.most_recent_ghost = None
    if remaining % 2 == 0:
        game.most_recent_ghost_bot = None
    else:
        game.most_recent_ghost_bot = bot


def eliminate_player(game: Game, player: Player, round_num: int, stage_num: int) -> None:
    ghost_opponent = StaticOpponent.from_player(player, hand_revealed=True)
    player.phase = "eliminated"
    player.elimination_round = round_num
    player.elimination_stage = stage_num
    game.most_recent_ghost_bot = None

    remaining_alive = len(get_live_players(game)) + len(get_live_bots(game))
    player.placement = remaining_alive + 1

    if remaining_alive % 2 == 0:
        game.most_recent_ghost = None
    else:
        game.most_recent_ghost = ghost_opponent


def would_be_dead_ready_for_elimination(game: Game) -> bool:
    """Check if all would-be-dead players have finished reward (not in battle/reward phase)."""
    if game.active_battles:
        return False
    would_die = get_would_be_dead(game)
    if not would_die:
        return True
    return all(p.phase in ("draft", "awaiting_elimination") for p in would_die)


def needs_sudden_death(game: Game) -> bool:
    would_die_humans = get_would_be_dead(game)
    would_die_bots = get_would_be_dead_bots(game)
    total_would_die = len(would_die_humans) + len(would_die_bots)

    live = get_live_players(game)
    live_bots = get_live_bots(game)
    survivors = (len(live) + len(live_bots)) - total_would_die

    return survivors < 2 and total_would_die >= 2


def get_sudden_death_fighters(game: Game) -> tuple[Participant, Participant] | None:
    """Returns the two participants who should fight in sudden death, or None if not needed.

    Selects the 2 participants with lowest poison. Ties are broken randomly.
    Any other participants at lethal are eliminated immediately (no byes).
    """
    if not needs_sudden_death(game):
        return None

    would_die: list[Participant] = list(get_would_be_dead(game)) + list(get_would_be_dead_bots(game))
    fighters = select_sudden_death_fighters(would_die)
    return fighters[0], fighters[1]


def select_sudden_death_fighters(participants_at_lethal: list[Participant]) -> list[Participant]:
    """Select 2 participants for sudden death: lowest poison, ties broken randomly."""
    if len(participants_at_lethal) == 2:
        return participants_at_lethal

    shuffled = participants_at_lethal.copy()
    random.shuffle(shuffled)
    sorted_by_poison = sorted(shuffled, key=lambda p: p.poison)

    return sorted_by_poison[:2]


def setup_sudden_death_battle(game: Game, p1: Participant, p2: Participant) -> None:
    """Reset both participants' poison to threshold - 1 for sudden death."""
    p1.poison = game.config.poison_to_lose - 1
    p2.poison = game.config.poison_to_lose - 1


def process_eliminations(game: Game, round_num: int, stage_num: int) -> list[Player]:
    """Eliminate all players at or above poison threshold. Call after reward phase."""
    eliminated: list[Player] = []
    would_die = get_would_be_dead(game)

    for player in would_die:
        eliminate_player(game, player, round_num, stage_num)
        eliminated.append(player)

    return eliminated


def process_bot_eliminations(game: Game) -> list[FakePlayer]:
    """Eliminate bots at or above poison threshold."""
    eliminated: list[FakePlayer] = []
    for fake in game.fake_players:
        if not fake.is_eliminated and fake.poison >= game.config.poison_to_lose:
            eliminate_bot(game, fake)
            eliminated.append(fake)
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

import logging
import random

from mtb.models.game import Game, Player, Puppet, StaticOpponent

logger = logging.getLogger(__name__)

Participant = Player | Puppet


def get_live_players(game: Game) -> list[Player]:
    return [p for p in game.players if p.phase != "eliminated"]


def get_live_puppets(game: Game) -> list[Puppet]:
    return [f for f in game.puppets if not f.is_eliminated]


def get_would_be_dead(game: Game) -> list[Player]:
    return [p for p in get_live_players(game) if p.poison >= game.config.poison_to_lose]


def get_would_be_dead_puppets(game: Game) -> list[Puppet]:
    return [f for f in get_live_puppets(game) if f.poison >= game.config.poison_to_lose]


def _update_ghosts(game: Game, ghost: StaticOpponent | None, ghost_puppet: Puppet | None, remaining: int) -> None:
    game.most_recent_ghost = ghost if remaining % 2 != 0 else None
    game.most_recent_ghost_puppet = ghost_puppet if remaining % 2 != 0 else None


def eliminate_puppet(game: Game, puppet: Puppet) -> None:
    puppet.is_eliminated = True
    remaining = len(get_live_players(game)) + len(get_live_puppets(game))
    puppet.placement = remaining + 1
    logger.info("Puppet eliminated: name=%s placement=%d poison=%d", puppet.name, puppet.placement, puppet.poison)
    _update_ghosts(game, None, puppet, remaining)


def eliminate_player(game: Game, player: Player, round_num: int, stage_num: int) -> None:
    ghost_opponent = StaticOpponent.from_player(player, hand_revealed=True)
    player.phase = "eliminated"
    player.elimination_round = round_num
    player.elimination_stage = stage_num

    remaining_alive = len(get_live_players(game)) + len(get_live_puppets(game))
    player.placement = remaining_alive + 1
    logger.info(
        "Player eliminated: name=%s placement=%d poison=%d round=%d stage=%d",
        player.name,
        player.placement,
        player.poison,
        round_num,
        stage_num,
    )
    _update_ghosts(game, ghost_opponent, None, remaining_alive)


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
    would_die_puppets = get_would_be_dead_puppets(game)
    total_would_die = len(would_die_humans) + len(would_die_puppets)

    live = get_live_players(game)
    live_puppets = get_live_puppets(game)
    survivors = (len(live) + len(live_puppets)) - total_would_die

    return survivors < 2 and total_would_die >= 2


def get_sudden_death_fighters(game: Game) -> tuple[Participant, Participant] | None:
    """Returns the two participants who should fight in sudden death, or None if not needed.

    Selects the 2 participants with lowest poison. Ties are broken randomly.
    Any other participants at lethal are eliminated immediately (no byes).
    """
    if not needs_sudden_death(game):
        return None

    would_die: list[Participant] = list(get_would_be_dead(game)) + list(get_would_be_dead_puppets(game))
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


def process_puppet_eliminations(game: Game) -> list[Puppet]:
    """Eliminate puppets at or above poison threshold."""
    eliminated: list[Puppet] = []
    for puppet in game.puppets:
        if not puppet.is_eliminated and puppet.poison >= game.config.poison_to_lose:
            eliminate_puppet(game, puppet)
            eliminated.append(puppet)
    return eliminated


def check_game_over(game: Game) -> tuple[Player | None, bool]:
    """
    Check if game is over. Returns (winner, is_game_over).

    Game over conditions:
    - 0 humans alive -> game over, no winner (None, True)
    - 1 human alive + 0 puppets alive -> human wins (winner, True)
    - 2+ humans alive -> game continues (None, False)
    - 1 human alive + puppets still alive -> game continues (None, False)
    """
    live_humans = get_live_players(game)
    live_puppets = get_live_puppets(game)

    if len(live_humans) == 0:
        return (None, True)
    elif len(live_humans) == 1 and len(live_puppets) == 0:
        return (live_humans[0], True)
    else:
        return (None, False)

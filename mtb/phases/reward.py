import random

from mtb.models.cards import Card
from mtb.models.game import Game, Player


def is_stage_increasing(player: Player) -> bool:
    return player.round % player.game.config.num_rounds_per_stage == 0


def count_applied_upgrades(player: Player) -> int:
    return sum(1 for u in player.upgrades if u.upgrade_target is not None)


def apply_poison(winner: Player, loser: Player) -> int:
    poison = 1 + count_applied_upgrades(winner)
    loser.poison += poison
    return poison


def award_random_card(game: Game, player: Player) -> Card | None:
    if game.battler is None or not game.battler.cards:
        return None

    card = random.choice(game.battler.cards)
    game.battler.cards.remove(card)
    player.sideboard.append(card)
    return card


def pick_upgrade(game: Game, player: Player, upgrade: Card) -> None:
    if upgrade not in game.available_upgrades:
        raise ValueError("Upgrade not available in this game")

    player.upgrades.append(upgrade.model_copy())


def apply_upgrade_to_card(player: Player, upgrade: Card, target: Card) -> None:
    if upgrade not in player.upgrades:
        raise ValueError("Player does not have this upgrade")

    if upgrade.upgrade_target is not None:
        raise ValueError("Upgrade has already been applied")

    if target not in player.hand and target not in player.sideboard:
        raise ValueError("Target card not in player's hand or sideboard")

    upgrade.upgrade_target = target


def start(game: Game, winner: Player | None, loser: Player | None, is_draw: bool = False) -> None:
    if is_draw:
        if winner is None or loser is None:
            raise ValueError("Both players must be provided for a draw")
        _start_draw(game, winner, loser)
    else:
        if winner is None or loser is None:
            raise ValueError("Winner and loser must be provided")
        _start_with_result(game, winner, loser)


def _start_draw(game: Game, player1: Player, player2: Player) -> None:
    for player in (player1, player2):
        if not player.is_ghost and player.phase != "reward":
            raise ValueError(f"{player.name} is not in reward phase")

    other = {player1.name: player2, player2.name: player1}
    for player in (player1, player2):
        if player.is_ghost:
            continue
        poison = 1 + count_applied_upgrades(other[player.name])
        player.poison += poison
        player.treasures += 1
        if is_stage_increasing(player):
            player.vanquishers += 1
        else:
            award_random_card(game, player)


def _start_with_result(game: Game, winner: Player, loser: Player) -> None:
    if not winner.is_ghost and winner.phase != "reward":
        raise ValueError("Winner is not in reward phase")
    if not loser.is_ghost and loser.phase != "reward":
        raise ValueError("Loser is not in reward phase")

    apply_poison(winner, loser)

    for player in (winner, loser):
        if player.is_ghost:
            continue
        player.treasures += 1
        if is_stage_increasing(player):
            player.vanquishers += 1
        else:
            award_random_card(game, player)


def end_for_player(game: Game, player: Player, upgrade_choice: Card | None = None) -> None:
    if player.phase != "reward":
        raise ValueError("Player is not in reward phase")

    if is_stage_increasing(player):
        if upgrade_choice is None:
            raise ValueError("Must provide upgrade choice when stage is increasing")
        pick_upgrade(game, player, upgrade_choice)
        player.stage += 1

    player.round += 1
    player.phase = "draft"
    player.chosen_basics = []

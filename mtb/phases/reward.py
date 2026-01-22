import random

from mtb.models.cards import Card

if False:  # TYPE_CHECKING
    from mtb.models.game import Game, Player


def is_stage_increasing(player: "Player") -> bool:
    return player.round % player.game.config.num_rounds_per_stage == 0


def count_applied_upgrades(player: "Player") -> int:
    return sum(1 for u in player.upgrades if u.upgrade_target is not None)


def apply_poison(winner: "Player", loser: "Player") -> int:
    poison = 1 + count_applied_upgrades(winner)
    loser.poison += poison
    return poison


def award_treasure(player: "Player") -> None:
    player.treasures += 1


def award_random_card(game: "Game", player: "Player") -> Card | None:
    if game.battler is None or not game.battler.cards:
        return None

    card = random.choice(game.battler.cards)
    game.battler.cards.remove(card)
    player.sideboard.append(card)
    return card


def award_vanquisher(player: "Player") -> None:
    player.vanquishers += 1


def pick_upgrade(game: "Game", player: "Player", upgrade: Card) -> None:
    if upgrade not in game.available_upgrades:
        raise ValueError("Upgrade not available in this game")

    player.upgrades.append(upgrade.model_copy())


def apply_upgrade_to_card(player: "Player", upgrade: Card, target: Card) -> None:
    if upgrade not in player.upgrades:
        raise ValueError("Player does not have this upgrade")

    if upgrade.upgrade_target is not None:
        raise ValueError("Upgrade has already been applied")

    if target not in player.hand and target not in player.sideboard:
        raise ValueError("Target card not in player's hand or sideboard")

    upgrade.upgrade_target = target


def start_reward(game: "Game", winner: "Player", loser: "Player") -> None:
    if winner.phase != "reward":
        raise ValueError("Winner is not in reward phase")
    if loser.phase != "reward":
        raise ValueError("Loser is not in reward phase")

    apply_poison(winner, loser)

    award_treasure(winner)
    award_treasure(loser)

    if is_stage_increasing(winner):
        award_vanquisher(winner)
        award_vanquisher(loser)
    else:
        award_random_card(game, winner)
        award_random_card(game, loser)


def end_reward_for_player(game: "Game", player: "Player", upgrade_choice: Card | None = None) -> None:
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

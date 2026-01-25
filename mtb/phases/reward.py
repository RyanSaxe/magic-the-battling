import random

from mtb.models.cards import Card
from mtb.models.game import Game, LastBattleResult, Player, StaticOpponent
from mtb.phases.battle import BattleResult


def is_stage_increasing(player: Player) -> bool:
    return player.round % player.game.config.num_rounds_per_stage == 0


def count_applied_upgrades(player: Player) -> int:
    return sum(1 for u in player.upgrades if u.upgrade_target is not None)


def _fibonacci(n: int) -> int:
    if n <= 1:
        return 1
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return a


def calculate_damage(player: Player) -> int:
    if player.game.config.use_upgrades:
        return 1 + count_applied_upgrades(player)
    else:
        return _fibonacci(player.hand_size - 2)


def apply_poison(winner: Player, loser: Player) -> int:
    poison = calculate_damage(winner)
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
        opponent = other[player.name]
        poison = calculate_damage(opponent)
        player.poison += poison
        player.treasures += 1
        vanquisher_gained = is_stage_increasing(player)
        card_gained = None
        if vanquisher_gained:
            player.vanquishers += 1
        else:
            card_gained = award_random_card(game, player)

        player.last_battle_result = LastBattleResult(
            opponent_name=opponent.name,
            winner_name=None,
            is_draw=True,
            poison_dealt=0,
            poison_taken=poison,
            treasures_gained=1,
            card_gained=card_gained,
            vanquisher_gained=vanquisher_gained,
        )


def _calculate_static_opponent_damage(opponent: StaticOpponent) -> int:
    applied_upgrades = sum(1 for u in opponent.upgrades if u.upgrade_target is not None)
    return 1 + applied_upgrades


def start_vs_static(game: Game, player: Player, opponent: StaticOpponent, result: BattleResult) -> None:
    if player.phase != "reward":
        raise ValueError("Player is not in reward phase")

    player_won = result.winner is not None and result.winner.name == player.name
    is_draw = result.is_draw

    poison_dealt = 0
    poison_taken = 0

    if player_won:
        poison_dealt = calculate_damage(player)
    elif is_draw:
        poison_taken = _calculate_static_opponent_damage(opponent)
        player.poison += poison_taken
    else:
        poison_taken = _calculate_static_opponent_damage(opponent)
        player.poison += poison_taken

    player.treasures += 1
    vanquisher_gained = is_stage_increasing(player)
    card_gained = None
    if vanquisher_gained:
        player.vanquishers += 1
    else:
        card_gained = award_random_card(game, player)

    winner_name: str | None
    if player_won:
        winner_name = player.name
    elif is_draw:
        winner_name = None
    else:
        winner_name = opponent.name

    player.last_battle_result = LastBattleResult(
        opponent_name=opponent.name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
        treasures_gained=1,
        card_gained=card_gained,
        vanquisher_gained=vanquisher_gained,
    )


def _start_with_result(game: Game, winner: Player, loser: Player) -> None:
    if not winner.is_ghost and winner.phase != "reward":
        raise ValueError("Winner is not in reward phase")
    if not loser.is_ghost and loser.phase != "reward":
        raise ValueError("Loser is not in reward phase")

    poison_dealt = apply_poison(winner, loser)

    for player in (winner, loser):
        if player.is_ghost:
            continue

        is_winner = player.name == winner.name
        opponent = loser if is_winner else winner

        player.treasures += 1
        vanquisher_gained = is_stage_increasing(player)
        card_gained = None
        if vanquisher_gained:
            player.vanquishers += 1
        else:
            card_gained = award_random_card(game, player)

        player.last_battle_result = LastBattleResult(
            opponent_name=opponent.name,
            winner_name=winner.name,
            is_draw=False,
            poison_dealt=poison_dealt if is_winner else 0,
            poison_taken=0 if is_winner else poison_dealt,
            treasures_gained=1,
            card_gained=card_gained,
            vanquisher_gained=vanquisher_gained,
        )


def end_for_player(game: Game, player: Player, upgrade_choice: Card | None = None) -> None:
    if player.phase != "reward":
        raise ValueError("Player is not in reward phase")

    if is_stage_increasing(player):
        if game.config.use_upgrades and len(game.available_upgrades) > 0:
            if upgrade_choice is None:
                raise ValueError("Must provide upgrade choice when stage is increasing")
            pick_upgrade(game, player, upgrade_choice)
        player.stage += 1
        player.round = 1
    else:
        player.round += 1
    player.phase = "draft"
    player.chosen_basics = []

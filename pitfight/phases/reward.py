"""Post-battle poison calculation, reward distribution, and upgrade application."""

import random
from uuid import uuid4

from pitfight.models.cards import Card
from pitfight.models.game import BattleResolutionEvent, Game, LastBattleResult, Player, StaticOpponent
from pitfight.phases.battle import BattleResult


def is_stage_increasing(player: Player) -> bool:
    return player.round % player.game.config.num_rounds_per_stage == 0


def _submitted_damage_cards(player: Player | StaticOpponent) -> list[Card]:
    return [*player.hand, *player.command_zone]


def is_applied_upgrade(upgrade: Card) -> bool:
    return upgrade.upgrade_target is not None


def is_revealed_applied_upgrade(upgrade: Card) -> bool:
    return is_applied_upgrade(upgrade) and upgrade.is_revealed


def get_submitted_upgrade_source_ids(player: Player | StaticOpponent) -> list[str]:
    source_ids: list[str] = []
    revealed_applied_upgrades = [upgrade for upgrade in player.upgrades if is_revealed_applied_upgrade(upgrade)]
    upgrade_targets = {
        upgrade.upgrade_target.id: upgrade.upgrade_target
        for upgrade in revealed_applied_upgrades
        if upgrade.upgrade_target is not None
    }

    for card in _submitted_damage_cards(player):
        target = upgrade_targets.get(card.id)
        if target is None:
            continue
        source_ids.extend(
            upgrade.upgrade_target.id
            for upgrade in revealed_applied_upgrades
            if upgrade.upgrade_target is not None and upgrade.upgrade_target.id == target.id
        )

    return source_ids


def count_applied_upgrades(player: Player | StaticOpponent) -> int:
    return len(get_submitted_upgrade_source_ids(player))


def _fibonacci(n: int) -> int:
    if n <= 1:
        return 1
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return a


def _stage(player: Player | StaticOpponent) -> int:
    # A static opponent's hand was submitted at its own stage, when hand size equalled stage.
    if isinstance(player, StaticOpponent):
        return len(player.hand)
    return player.hand_size


def calculate_damage(player: Player | StaticOpponent, *, use_upgrades: bool) -> int:
    if use_upgrades:
        return 1 + count_applied_upgrades(player)
    return _fibonacci(_stage(player) - 2)


def build_damage_events(player: Player | StaticOpponent, *, use_upgrades: bool) -> list[BattleResolutionEvent]:
    damage = calculate_damage(player, use_upgrades=use_upgrades)
    if damage <= 0:
        return []

    if use_upgrades:
        return [
            BattleResolutionEvent(event_type="base_increment"),
            *(
                BattleResolutionEvent(event_type="upgrade_beam", source_card_id=source_id)
                for source_id in get_submitted_upgrade_source_ids(player)
            ),
        ]

    return [BattleResolutionEvent(event_type="base_increment") for _ in range(damage)]


def apply_poison(winner: Player, loser: Player) -> int:
    poison = calculate_damage(winner, use_upgrades=winner.game.config.use_upgrades)
    loser.poison += poison
    return poison


def award_random_card(game: Game, player: Player) -> Card | None:
    battler = player.battler or game.battler
    if battler is None:
        return None
    # The first player to continue packs the cube, so packs not yet dealt hold most of what's left to draw from.
    packs = game.draft_state.undealt_packs(player) if game.draft_state else []
    piles = [battler.cards, *packs]
    if not any(piles):
        return None

    index = random.choices(range(len(piles)), weights=[len(pile) for pile in piles])[0]  # noqa: S311 -- non-cryptographic game RNG
    card = piles[index].pop(random.randrange(len(piles[index])))  # noqa: S311 -- non-cryptographic game RNG
    if index > 0:
        # A pack is never dealt short: a loose card fills the gap, and with none the rest of the pack becomes loose.
        if battler.cards:
            piles[index].append(battler.cards.pop(random.randrange(len(battler.cards))))  # noqa: S311 -- non-cryptographic game RNG
        else:
            battler.cards.extend(packs.pop(index - 1))
    player.sideboard.append(card)
    return card


def pick_upgrade(game: Game, player: Player, *, upgrade: Card) -> None:
    if upgrade not in game.available_upgrades:
        msg = "Upgrade not available in this game"
        raise ValueError(msg)

    copy = upgrade.model_copy()
    copy.id = f"{copy.id.rsplit('-', 1)[0]}-{uuid4().hex[:8]}"
    player.upgrades.append(copy)


def apply_upgrade_to_card(player: Player, upgrade: Card, *, target: Card) -> None:
    if upgrade not in player.upgrades:
        msg = "Player does not have this upgrade"
        raise ValueError(msg)

    if is_applied_upgrade(upgrade):
        msg = "Upgrade has already been applied"
        raise ValueError(msg)

    if target not in player.hand and target not in player.sideboard:
        msg = "Target card not in player's hand or sideboard"
        raise ValueError(msg)

    upgrade.upgrade_target = target
    upgrade.is_revealed = False


def reveal_upgrade(player: Player, upgrade: Card) -> None:
    if upgrade not in player.upgrades:
        msg = "Player does not have this upgrade"
        raise ValueError(msg)
    if not is_applied_upgrade(upgrade):
        msg = "Upgrade has not been applied"
        raise ValueError(msg)
    upgrade.is_revealed = True


def _award_rewards(
    game: Game,
    player: Player,
    *,
    opponent_name: str,
    winner_name: str | None,
    is_draw: bool,
    poison_dealt: int,
    poison_taken: int,
) -> None:
    player.treasures += 1
    vanquisher_gained = is_stage_increasing(player)
    card_gained = None
    if vanquisher_gained:
        player.vanquishers += 1
    else:
        card_gained = award_random_card(game, player)

    player.last_battle_result = LastBattleResult(
        opponent_name=opponent_name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
        treasures_gained=1,
        card_gained=card_gained,
        vanquisher_gained=vanquisher_gained,
        pre_battle_treasures=player.pre_battle_treasures,
    )


def start(game: Game, winner: Player | None, *, loser: Player | None, is_draw: bool = False) -> None:
    if is_draw:
        if winner is None or loser is None:
            msg = "Both players must be provided for a draw"
            raise ValueError(msg)
        _start_draw(game, winner, player2=loser)
    else:
        if winner is None or loser is None:
            msg = "Winner and loser must be provided"
            raise ValueError(msg)
        _start_with_result(game, winner, loser=loser)


def _start_draw(game: Game, player1: Player, *, player2: Player) -> None:
    for player in (player1, player2):
        if player.phase != "reward":
            msg = f"{player.name} is not in reward phase"
            raise ValueError(msg)

    other = {player1.name: player2, player2.name: player1}
    for player in (player1, player2):
        opponent = other[player.name]
        poison_taken = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
        poison_dealt = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        player.poison += poison_taken
        _award_rewards(
            game,
            player,
            opponent_name=opponent.name,
            winner_name=None,
            is_draw=True,
            poison_dealt=poison_dealt,
            poison_taken=poison_taken,
        )


def apply_bot_poison(game: Game, opponent: StaticOpponent, *, poison: int) -> None:
    for fake in game.puppets:
        if fake.player_history_id == opponent.source_player_history_id:
            if not fake.is_eliminated:
                fake.poison += poison
            break


def _record_bot_result(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    player_won: bool,
    is_draw: bool,
    poison_dealt: int,
    poison_taken: int,
) -> None:
    winner_name: str | None
    if player_won:
        winner_name = player.name
    elif is_draw:
        winner_name = None
    else:
        winner_name = opponent.name

    for fake in game.puppets:
        if fake.player_history_id == opponent.source_player_history_id:
            if fake.is_eliminated:
                return
            fake.last_battle_result = LastBattleResult(
                opponent_name=player.name,
                winner_name=winner_name,
                is_draw=is_draw,
                poison_dealt=poison_taken,
                poison_taken=poison_dealt,
            )
            break


def apply_poison_pvp(game: Game, player: Player, *, opponent: Player, is_draw: bool, winner_name: str | None) -> dict:
    """Apply poison for PvP battle. Returns poison info dict."""
    if is_draw:
        p1_poison = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
        p2_poison = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        player.poison += p1_poison
        opponent.poison += p2_poison
        return {
            "is_draw": True,
            "player_poison_taken": p1_poison,
            "opponent_poison_taken": p2_poison,
        }

    if winner_name == player.name:
        poison = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        opponent.poison += poison
        return {"winner": player, "loser": opponent, "poison": poison}
    poison = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
    player.poison += poison
    return {"winner": opponent, "loser": player, "poison": poison}


def apply_poison_static(
    game: Game, player: Player, *, opponent: StaticOpponent, player_won: bool, is_draw: bool
) -> dict:
    """Apply poison and record the puppet's result for a static opponent battle. Returns poison info dict."""
    poison_dealt = 0
    poison_taken = 0

    if player_won:
        poison_dealt = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        apply_bot_poison(game, opponent, poison=poison_dealt)
    elif is_draw:
        poison_dealt = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        apply_bot_poison(game, opponent, poison=poison_dealt)
        poison_taken = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
        player.poison += poison_taken
    else:
        poison_taken = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
        player.poison += poison_taken

    _record_bot_result(
        game,
        player,
        opponent=opponent,
        player_won=player_won,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
    )

    return {"poison_dealt": poison_dealt, "poison_taken": poison_taken}


def start_rewards_only(game: Game, winner: Player, *, loser: Player, poison_dealt: int) -> None:
    """Start reward phase for PvP - poison already applied, just do rewards."""
    for player in (winner, loser):
        if player.phase != "reward":
            msg = f"{player.name} is not in reward phase"
            raise ValueError(msg)

    for player in (winner, loser):
        is_winner = player.name == winner.name
        opponent = loser if is_winner else winner
        _award_rewards(
            game,
            player,
            opponent_name=opponent.name,
            winner_name=winner.name,
            is_draw=False,
            poison_dealt=poison_dealt if is_winner else 0,
            poison_taken=0 if is_winner else poison_dealt,
        )


def start_rewards_draw(game: Game, player1: Player, *, player2: Player, p1_poison: int, p2_poison: int) -> None:
    """Start reward phase for PvP draw - poison already applied, just do rewards."""
    for player in (player1, player2):
        if player.phase != "reward":
            msg = f"{player.name} is not in reward phase"
            raise ValueError(msg)

    poison_taken_lookup = {player1.name: p1_poison, player2.name: p2_poison}
    other = {player1.name: player2, player2.name: player1}

    for player in (player1, player2):
        opponent = other[player.name]
        poison_taken = poison_taken_lookup[player.name]
        poison_dealt = poison_taken_lookup[opponent.name]
        _award_rewards(
            game,
            player,
            opponent_name=opponent.name,
            winner_name=None,
            is_draw=True,
            poison_dealt=poison_dealt,
            poison_taken=poison_taken,
        )


def start_rewards_single(
    game: Game,
    player: Player,
    *,
    opponent_name: str,
    won: bool,
    poison_dealt: int,
    poison_taken: int,
    is_draw: bool = False,
) -> None:
    """Start reward phase for a single player (when other player is at lethal)."""
    if player.phase != "reward":
        msg = f"{player.name} is not in reward phase"
        raise ValueError(msg)

    winner_name = None if is_draw else player.name if won else opponent_name

    _award_rewards(
        game,
        player,
        opponent_name=opponent_name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
    )


def start_vs_static_rewards_only(
    game: Game,
    player: Player,
    *,
    opponent: StaticOpponent,
    player_won: bool,
    is_draw: bool,
    poison_dealt: int,
    poison_taken: int,
) -> None:
    """Start reward phase for static opponent - poison already applied, just do rewards."""
    if player.phase != "reward":
        msg = "Player is not in reward phase"
        raise ValueError(msg)

    winner_name: str | None
    if player_won:
        winner_name = player.name
    elif is_draw:
        winner_name = None
    else:
        winner_name = opponent.name

    _award_rewards(
        game,
        player,
        opponent_name=opponent.name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
    )


def set_last_battle_result_no_rewards(
    player: Player, opponent_name: str, *, winner_name: str | None, is_draw: bool, poison_dealt: int, poison_taken: int
) -> None:
    """Set last_battle_result for a player who won't get rewards (lethal/finale)."""
    player.last_battle_result = LastBattleResult(
        opponent_name=opponent_name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
        treasures_gained=0,
        card_gained=None,
        vanquisher_gained=False,
        pre_battle_treasures=player.pre_battle_treasures,
    )


def start_vs_static(game: Game, player: Player, *, opponent: StaticOpponent, result: BattleResult) -> None:
    """Legacy function - applies poison AND rewards.

    For new flow, use apply_poison_static + start_vs_static_rewards_only.
    """
    if player.phase != "reward":
        msg = "Player is not in reward phase"
        raise ValueError(msg)

    player_won = result.winner is not None and result.winner.name == player.name
    is_draw = result.is_draw

    winner_name: str | None
    if player_won:
        winner_name = player.name
    elif is_draw:
        winner_name = None
    else:
        winner_name = opponent.name

    poison_dealt = 0
    poison_taken = 0

    if player_won:
        poison_dealt = calculate_damage(player, use_upgrades=game.config.use_upgrades)
        apply_bot_poison(game, opponent, poison=poison_dealt)
    else:
        poison_taken = calculate_damage(opponent, use_upgrades=game.config.use_upgrades)
        player.poison += poison_taken
        if is_draw:
            apply_bot_poison(game, opponent, poison=calculate_damage(player, use_upgrades=game.config.use_upgrades))

    _award_rewards(
        game,
        player,
        opponent_name=opponent.name,
        winner_name=winner_name,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
    )

    _record_bot_result(
        game,
        player,
        opponent=opponent,
        player_won=player_won,
        is_draw=is_draw,
        poison_dealt=poison_dealt,
        poison_taken=poison_taken,
    )


def _start_with_result(game: Game, winner: Player, *, loser: Player) -> None:
    if winner.phase != "reward":
        msg = "Winner is not in reward phase"
        raise ValueError(msg)
    if loser.phase != "reward":
        msg = "Loser is not in reward phase"
        raise ValueError(msg)

    poison_dealt = apply_poison(winner, loser)

    for player in (winner, loser):
        is_winner = player.name == winner.name
        opponent = loser if is_winner else winner
        _award_rewards(
            game,
            player,
            opponent_name=opponent.name,
            winner_name=winner.name,
            is_draw=False,
            poison_dealt=poison_dealt if is_winner else 0,
            poison_taken=0 if is_winner else poison_dealt,
        )


def end_for_player(game: Game, player: Player, *, upgrade_choice: Card | None = None) -> None:
    if player.phase != "reward":
        msg = "Player is not in reward phase"
        raise ValueError(msg)

    if is_stage_increasing(player):
        if game.config.use_upgrades and len(game.available_upgrades) > 0:
            if upgrade_choice is None:
                msg = "Must provide upgrade choice when stage is increasing"
                raise ValueError(msg)
            pick_upgrade(game, player, upgrade=upgrade_choice)
        player.stage += 1
        player.round = 1
    else:
        player.round += 1
    player.phase = "draft"
    player.chosen_basics = []

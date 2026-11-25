"""Draft-phase pack dealing, swapping, rolling, and completion."""

import random

from pitfight.models.cards import Battler, Card
from pitfight.models.game import Config, DraftState, Game, Player
from pitfight.models.types import CardDestination
from pitfight.phases import build
from pitfight.phases.round_resolution import transition_phase


def _get_player_collection(player: Player, destination: CardDestination) -> list[Card]:
    match destination:
        case "hand":
            return player.hand
        case "sideboard":
            return player.sideboard
        case "upgrades":
            return player.upgrades


def _get_player_battler(player: Player) -> Battler:
    if player.battler is not None:
        return player.battler
    if player.game.battler is not None:
        return player.game.battler
    msg = f"Player {player.name} has no battler"
    raise ValueError(msg)


def _create_packs_from_cards(cards: list[Card], pack_size: int) -> tuple[list[list[Card]], list[Card]]:
    num_full_packs = len(cards) // pack_size
    pack_cards = cards[: num_full_packs * pack_size]
    leftover_cards = cards[num_full_packs * pack_size :]
    packs = [pack_cards[i : i + pack_size] for i in range(0, len(pack_cards), pack_size)]
    return packs, leftover_cards


def _create_shared_packs_from_battler(game: Game) -> None:
    if game.battler is None:
        msg = "Game has no shared battler"
        raise ValueError(msg)
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    cards = game.battler.cards.copy()
    random.shuffle(cards)
    packs, leftover_cards = _create_packs_from_cards(cards, game.config.pack_size)
    game.battler.cards = leftover_cards
    game.draft_state.packs.extend(packs)


def _create_player_packs_from_battler(game: Game, player: Player) -> None:
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    battler = _get_player_battler(player)
    cards = battler.cards.copy()
    random.shuffle(cards)
    packs, leftover_cards = _create_packs_from_cards(cards, game.config.pack_size)
    battler.cards = leftover_cards
    queue = game.draft_state.player_packs.setdefault(player.name, [])
    queue.extend(packs)


def _get_pack_queue(game: Game, player: Player) -> list[list[Card]]:
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)
    return game.draft_state.undealt_packs(player)


def cards_needed_for_first_draft(config: Config, num_players: int) -> int:
    # Everyone can be holding a pack at once, after their starting pool and the first fight's loot card.
    loot_cards = 1
    return num_players * (config.starting_pool_size + loot_cards + config.pack_size)


def start(game: Game) -> None:
    """Initialize draft state for the next draft phase."""
    if game.draft_state is not None:
        msg = "Draft already in progress"
        raise ValueError(msg)

    game.draft_state = DraftState(packs=[])
    if game.config.play_mode == "limited":
        _create_shared_packs_from_battler(game)


def deal_pack_to_player(game: Game, player: Player) -> list[Card]:
    """Deal a pack to a specific player entering draft phase."""
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    queue = _get_pack_queue(game, player)
    if not queue:
        if game.config.play_mode == "limited":
            _create_shared_packs_from_battler(game)
        else:
            _create_player_packs_from_battler(game, player)

    if not queue:
        msg = "No cards available to create packs"
        raise ValueError(msg)

    pack = queue.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def deal_pack(game: Game, player: Player) -> list[Card] | None:
    """Legacy function - deals a pack if available, returns None otherwise."""
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    queue = _get_pack_queue(game, player)
    if not queue:
        return None

    pack = queue.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def roll(game: Game, player: Player) -> list[Card]:
    """Roll a new pack by returning the current pack to the player's battler."""
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)
    if player.treasures <= 0:
        msg = "Player has no treasures to spend"
        raise ValueError(msg)

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        msg = "Player has no current pack"
        raise ValueError(msg)

    _get_player_battler(player).cards.extend(current_pack)
    player.treasures -= 1

    return deal_pack_to_player(game, player)


def swap(
    game: Game,
    player: Player,
    *,
    pack_card: Card,
    player_card: Card,
    destination: CardDestination,
) -> None:
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        msg = "Player has no current pack"
        raise ValueError(msg)

    if pack_card not in current_pack:
        msg = "Card not in player's current pack"
        raise ValueError(msg)

    player_collection = _get_player_collection(player, destination)
    if player_card not in player_collection:
        msg = f"Card not in player's {destination}"
        raise ValueError(msg)

    pack_idx = current_pack.index(pack_card)
    player_idx = player_collection.index(player_card)

    current_pack[pack_idx] = player_card
    player_collection[player_idx] = pack_card

    if player.command_zone and any(c.id == player_card.id for c in player.command_zone):
        player.command_zone.clear()


def end_for_player(game: Game, player: Player) -> None:
    """End draft for a player, returning their current pack to their battler."""
    if player.phase != "draft":
        msg = "Player is not in draft phase"
        raise ValueError(msg)
    if game.draft_state is None:
        msg = "No draft in progress"
        raise ValueError(msg)

    current_pack = game.draft_state.current_packs.pop(player.name, None)
    if current_pack:
        _get_player_battler(player).cards.extend(current_pack)

    transition_phase(player, "build")
    build.populate_hand(player)


def _return_undealt_packs(game: Game) -> None:
    if game.draft_state is None:
        return
    if game.config.play_mode == "limited":
        if game.battler is not None:
            for pack in game.draft_state.packs:
                game.battler.cards.extend(pack)
        return
    for player_name, packs in game.draft_state.player_packs.items():
        player = next((candidate for candidate in game.players if candidate.name == player_name), None)
        if player is None or player.battler is None:
            continue
        for pack in packs:
            player.battler.cards.extend(pack)


def cleanup_draft(game: Game) -> None:
    if game.draft_state is None:
        return

    _return_undealt_packs(game)

    for player_name, pack in game.draft_state.current_packs.items():
        player = next((candidate for candidate in game.players if candidate.name == player_name), None)
        if player is None:
            continue
        _get_player_battler(player).cards.extend(pack)

    game.draft_state = None

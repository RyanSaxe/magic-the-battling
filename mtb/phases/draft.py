import random

from mtb.models.cards import Card
from mtb.models.game import DraftState, Game, Player
from mtb.models.types import CardDestination
from mtb.phases import build


def _get_player_collection(player: Player, destination: CardDestination) -> list[Card]:
    match destination:
        case "hand":
            return player.hand
        case "sideboard":
            return player.sideboard
        case "upgrades":
            return player.upgrades


def start(game: Game) -> None:
    """Initialize draft state by creating packs from battler.cards.

    Does NOT deal packs to players - use deal_pack_to_player() when players
    individually enter draft phase.
    """
    if game.battler is None:
        raise ValueError("Game has no battler; cannot start draft")
    if game.draft_state is not None:
        raise ValueError("Draft already in progress")

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pack_size = game.config.pack_size
    num_full_packs = len(cards) // pack_size
    pack_cards = cards[: num_full_packs * pack_size]
    leftover_cards = cards[num_full_packs * pack_size :]
    packs = [pack_cards[i : i + pack_size] for i in range(0, len(pack_cards), pack_size)]

    game.battler.cards = leftover_cards
    game.draft_state = DraftState(packs=packs)


def _create_packs_from_battler(game: Game) -> None:
    """Create new packs from battler.cards when draft runs out."""
    if game.battler is None:
        raise ValueError("Game has no battler")
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pack_size = game.config.pack_size
    num_full_packs = len(cards) // pack_size
    pack_cards = cards[: num_full_packs * pack_size]
    leftover_cards = cards[num_full_packs * pack_size :]

    packs = [pack_cards[i : i + pack_size] for i in range(0, len(pack_cards), pack_size)]

    game.battler.cards = leftover_cards
    game.draft_state.packs.extend(packs)


def deal_pack_to_player(game: Game, player: Player) -> list[Card]:
    """Deal a pack to a specific player entering draft phase.

    If no packs are available, creates more from battler.cards.
    """
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if not game.draft_state.packs:
        _create_packs_from_battler(game)

    if not game.draft_state.packs:
        raise ValueError("No cards available to create packs")

    pack = game.draft_state.packs.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def deal_pack(game: Game, player: Player) -> list[Card] | None:
    """Legacy function - deals a pack if available, returns None otherwise."""
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if not game.draft_state.packs:
        return None

    pack = game.draft_state.packs.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def roll(game: Game, player: Player) -> list[Card]:
    """Roll a new pack by returning the current pack to battler.

    Always succeeds - creates more packs from battler.cards if needed.
    """
    if game.draft_state is None:
        raise ValueError("No draft in progress")
    if game.battler is None:
        raise ValueError("Game has no battler")
    if player.treasures <= 0:
        raise ValueError("Player has no treasures to spend")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    # Return rolled pack directly to battler
    game.battler.cards.extend(current_pack)
    player.treasures -= 1

    # deal_pack_to_player always succeeds (creates packs if needed)
    return deal_pack_to_player(game, player)


def swap(
    game: Game,
    player: Player,
    pack_card: Card,
    player_card: Card,
    destination: CardDestination,
) -> None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    if pack_card not in current_pack:
        raise ValueError("Card not in player's current pack")

    player_collection = _get_player_collection(player, destination)
    if player_card not in player_collection:
        raise ValueError(f"Card not in player's {destination}")

    pack_idx = current_pack.index(pack_card)
    player_idx = player_collection.index(player_card)

    current_pack[pack_idx] = player_card
    player_collection[player_idx] = pack_card


def end_for_player(game: Game, player: Player) -> None:
    """End draft for a player, returning their pack to battler.

    Cleanup happens at pairing time via cleanup_draft(), not here.
    """
    if player.phase != "draft":
        raise ValueError("Player is not in draft phase")
    if game.draft_state is None:
        raise ValueError("No draft in progress")
    if game.battler is None:
        raise ValueError("Game has no battler")

    current_pack = game.draft_state.current_packs.pop(player.name, None)
    if current_pack:
        game.battler.cards.extend(current_pack)

    player.phase = "build"
    build.populate_hand(player)


def cleanup_draft(game: Game) -> None:
    """Clean up draft state. Called at pairing time."""
    if game.draft_state is None:
        return
    if game.battler is None:
        return

    # Return all undrafted packs
    for pack in game.draft_state.packs:
        game.battler.cards.extend(pack)

    # Return any orphan current_packs (shouldn't happen, but defensive)
    for pack in game.draft_state.current_packs.values():
        game.battler.cards.extend(pack)

    game.draft_state = None

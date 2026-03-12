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


def _get_player_battler(player: Player):
    if player.battler is not None:
        return player.battler
    if player.game.battler is not None:
        return player.game.battler
    raise ValueError(f"Player {player.name} has no battler")


def _create_packs_from_cards(cards: list[Card], pack_size: int) -> tuple[list[list[Card]], list[Card]]:
    num_full_packs = len(cards) // pack_size
    pack_cards = cards[: num_full_packs * pack_size]
    leftover_cards = cards[num_full_packs * pack_size :]
    packs = [pack_cards[i : i + pack_size] for i in range(0, len(pack_cards), pack_size)]
    return packs, leftover_cards


def _create_shared_packs_from_battler(game: Game) -> None:
    if game.battler is None:
        raise ValueError("Game has no shared battler")
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    cards = game.battler.cards.copy()
    random.shuffle(cards)
    packs, leftover_cards = _create_packs_from_cards(cards, game.config.pack_size)
    game.battler.cards = leftover_cards
    game.draft_state.packs.extend(packs)


def _create_player_packs_from_battler(game: Game, player: Player) -> None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    battler = _get_player_battler(player)
    cards = battler.cards.copy()
    random.shuffle(cards)
    packs, leftover_cards = _create_packs_from_cards(cards, game.config.pack_size)
    battler.cards = leftover_cards
    queue = game.draft_state.player_packs.setdefault(player.name, [])
    queue.extend(packs)


def _get_pack_queue(game: Game, player: Player) -> list[list[Card]]:
    if game.draft_state is None:
        raise ValueError("No draft in progress")
    if game.config.play_mode == "draft":
        return game.draft_state.packs
    return game.draft_state.player_packs.setdefault(player.name, [])


def start(game: Game) -> None:
    """Initialize draft state for the next draft phase."""
    if game.draft_state is not None:
        raise ValueError("Draft already in progress")

    game.draft_state = DraftState(packs=[])
    if game.config.play_mode == "draft":
        _create_shared_packs_from_battler(game)


def deal_pack_to_player(game: Game, player: Player) -> list[Card]:
    """Deal a pack to a specific player entering draft phase."""
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    queue = _get_pack_queue(game, player)
    if not queue:
        if game.config.play_mode == "draft":
            _create_shared_packs_from_battler(game)
        else:
            _create_player_packs_from_battler(game, player)

    if not queue:
        raise ValueError("No cards available to create packs")

    pack = queue.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def deal_pack(game: Game, player: Player) -> list[Card] | None:
    """Legacy function - deals a pack if available, returns None otherwise."""
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    queue = _get_pack_queue(game, player)
    if not queue:
        return None

    pack = queue.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def roll(game: Game, player: Player) -> list[Card]:
    """Roll a new pack by returning the current pack to the player's battler."""
    if game.draft_state is None:
        raise ValueError("No draft in progress")
    if player.treasures <= 0:
        raise ValueError("Player has no treasures to spend")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    _get_player_battler(player).cards.extend(current_pack)
    player.treasures -= 1

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

    if player.command_zone and any(c.id == player_card.id for c in player.command_zone):
        player.command_zone.clear()


def end_for_player(game: Game, player: Player) -> None:
    """End draft for a player, returning their current pack to their battler."""
    if player.phase != "draft":
        raise ValueError("Player is not in draft phase")
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.pop(player.name, None)
    if current_pack:
        _get_player_battler(player).cards.extend(current_pack)

    player.phase = "build"
    build.populate_hand(player)


def cleanup_draft(game: Game) -> None:
    """Clean up draft state. Called at pairing time."""
    if game.draft_state is None:
        return

    if game.config.play_mode == "draft":
        if game.battler is not None:
            for pack in game.draft_state.packs:
                game.battler.cards.extend(pack)
    else:
        for player_name, packs in game.draft_state.player_packs.items():
            player = next((candidate for candidate in game.players if candidate.name == player_name), None)
            if player is None or player.battler is None:
                continue
            for pack in packs:
                player.battler.cards.extend(pack)

    for player_name, pack in game.draft_state.current_packs.items():
        player = next((candidate for candidate in game.players if candidate.name == player_name), None)
        if player is None:
            continue
        _get_player_battler(player).cards.extend(pack)

    game.draft_state = None

import random

from mtb.models.cards import Card
from mtb.models.game import DraftState, Game, Player
from mtb.models.types import CardDestination


def start(game: Game) -> None:
    if game.battler is None:
        raise ValueError("Game has no battler; cannot start draft")
    if game.draft_state is not None:
        raise ValueError("Draft already in progress")

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pack_size = game.config.pack_size
    packs = [cards[i : i + pack_size] for i in range(0, len(cards), pack_size)]

    game.battler.cards = []
    game.draft_state = DraftState(packs=packs)

    for player in game.players:
        deal_pack(game, player)


def deal_pack(game: Game, player: Player) -> list[Card] | None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if not game.draft_state.packs:
        return None

    pack = game.draft_state.packs.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def roll(game: Game, player: Player) -> list[Card] | None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if player.treasures <= 0:
        raise ValueError("Player has no treasures to spend")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    game.draft_state.discard.extend(current_pack)
    player.treasures -= 1

    return deal_pack(game, player)


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

    player_collection = getattr(player, destination)
    if player_card not in player_collection:
        raise ValueError(f"Card not in player's {destination}")

    current_pack.remove(pack_card)
    current_pack.append(player_card)

    player_collection.remove(player_card)
    player_collection.append(pack_card)


def take(game: Game, player: Player, pack_card: Card, destination: CardDestination) -> None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    if pack_card not in current_pack:
        raise ValueError("Card not in player's current pack")

    current_pack.remove(pack_card)
    player_collection = getattr(player, destination)
    player_collection.append(pack_card)


def end_for_player(game: Game, player: Player) -> None:
    if player.phase != "draft":
        raise ValueError("Player is not in draft phase")
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.pop(player.name, None)
    if current_pack:
        game.draft_state.discard.extend(current_pack)

    player.phase = "build"

    if not game.draft_state.current_packs:
        _cleanup_draft(game)


def _cleanup_draft(game: Game) -> None:
    if game.draft_state is None:
        return

    remaining_cards: list[Card] = []

    for pack in game.draft_state.packs:
        remaining_cards.extend(pack)

    remaining_cards.extend(game.draft_state.discard)

    if game.battler is not None:
        game.battler.cards = remaining_cards

    game.draft_state = None

from mtb.models.cards import Card
from mtb.models.game import Game, Player
from mtb.models.types import BuildSource
from mtb.phases.elimination import get_live_players
from mtb.phases.reward import apply_upgrade_to_card

VALID_BASICS = frozenset(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"])


def _get_build_collection(player: Player, zone: BuildSource) -> list[Card]:
    return player.hand if zone == "hand" else player.sideboard


def move_card(player: Player, card: Card, source: BuildSource, destination: BuildSource) -> None:
    if source == destination:
        return

    source_collection = _get_build_collection(player, source)
    if card not in source_collection:
        raise ValueError(f"Card not in player's {source}")

    source_collection.remove(card)
    destination_collection = _get_build_collection(player, destination)
    destination_collection.append(card)


def swap_card(
    player: Player,
    card_a: Card,
    source_a: BuildSource,
    card_b: Card,
    source_b: BuildSource,
) -> None:
    if source_a == source_b:
        raise ValueError("Cannot swap cards within the same zone")

    collection_a = _get_build_collection(player, source_a)
    collection_b = _get_build_collection(player, source_b)

    if card_a not in collection_a:
        raise ValueError(f"Card not in player's {source_a}")
    if card_b not in collection_b:
        raise ValueError(f"Card not in player's {source_b}")

    idx_a = collection_a.index(card_a)
    idx_b = collection_b.index(card_b)

    collection_a[idx_a] = card_b
    collection_b[idx_b] = card_a


def set_ready(game: Game, player: Player, basics: list[str]) -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")

    if len(basics) != game.config.num_basics:
        raise ValueError(f"Must choose exactly {game.config.num_basics} basic lands")

    for basic in basics:
        if basic not in VALID_BASICS:
            raise ValueError(f"Invalid basic land: {basic}")

    if len(player.hand) > player.hand_size:
        raise ValueError(f"Hand size exceeds maximum of {player.hand_size}")

    player.chosen_basics = basics
    player.build_ready = True


def unready(player: Player) -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")
    player.build_ready = False


def all_ready(game: Game) -> bool:
    live_players = get_live_players(game)
    return all(p.build_ready for p in live_players if p.phase == "build")


def submit(game: Game, player: Player, basics: list[str]) -> None:
    set_ready(game, player, basics)
    player.phase = "battle"


def populate_hand(player: Player) -> None:
    """Populate hand with previous battle cards, then fill remaining slots by ELO."""
    player.populate_hand()


__all__ = [
    "VALID_BASICS",
    "move_card",
    "swap_card",
    "set_ready",
    "unready",
    "all_ready",
    "submit",
    "populate_hand",
    "apply_upgrade_to_card",
]

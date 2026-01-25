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


def apply_previous_defaults(player: Player) -> None:
    """Move cards from previous hand to current hand, set previous basics."""
    for card_id in player.previous_hand_ids:
        card = next((c for c in player.sideboard if c.id == card_id), None)
        if card:
            player.sideboard.remove(card)
            player.hand.append(card)
    player.chosen_basics = player.previous_basics.copy()


__all__ = [
    "VALID_BASICS",
    "move_card",
    "set_ready",
    "unready",
    "all_ready",
    "submit",
    "apply_previous_defaults",
    "apply_upgrade_to_card",
]

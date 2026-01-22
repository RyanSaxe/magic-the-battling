from mtb.models.cards import Card
from mtb.models.game import Game, Player
from mtb.models.types import BuildSource

VALID_BASICS = frozenset(["Plains", "Island", "Swamp", "Mountain", "Forest"])


def move_card(player: Player, card: Card, source: BuildSource, destination: BuildSource) -> None:
    if source == destination:
        return

    source_collection = getattr(player, source)
    if card not in source_collection:
        raise ValueError(f"Card not in player's {source}")

    source_collection.remove(card)
    destination_collection = getattr(player, destination)
    destination_collection.append(card)


def submit(game: Game, player: Player, basics: list[str]) -> None:
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
    player.phase = "battle"

from mtb.models.cards import Card
from mtb.models.game import Game, Player
from mtb.models.types import BuildSource

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


def apply_previous_defaults(player: Player) -> None:
    """Move cards from previous hand to current hand, set previous basics."""
    for card_id in player.previous_hand_ids:
        card = next((c for c in player.sideboard if c.id == card_id), None)
        if card:
            player.sideboard.remove(card)
            player.hand.append(card)
    player.chosen_basics = player.previous_basics.copy()


def apply_upgrade_to_card(player: Player, upgrade: Card, target: Card) -> None:
    if upgrade not in player.upgrades:
        raise ValueError("Player does not have this upgrade")

    if upgrade.upgrade_target is not None:
        raise ValueError("Upgrade has already been applied")

    if target not in player.hand and target not in player.sideboard:
        raise ValueError("Target card not in player's hand or sideboard")

    upgrade.upgrade_target = target

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

    if source == "sideboard" and any(c.id == card.id for c in player.command_zone):
        player.command_zone.clear()


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

    if (source_a == "sideboard" and any(c.id == card_a.id for c in player.command_zone)) or (
        source_b == "sideboard" and any(c.id == card_b.id for c in player.command_zone)
    ):
        player.command_zone.clear()


def set_ready(game: Game, player: Player, basics: list[str], play_draw_preference: str = "play") -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")

    if play_draw_preference not in ("play", "draw"):
        raise ValueError(f"Invalid play/draw preference: {play_draw_preference}")

    if len(basics) != game.config.num_basics:
        raise ValueError(f"Must choose exactly {game.config.num_basics} basic lands")

    for basic in basics:
        if basic not in VALID_BASICS:
            raise ValueError(f"Invalid basic land: {basic}")

    if len(player.hand) > player.hand_size:
        raise ValueError(f"Hand size exceeds maximum of {player.hand_size}")

    player.chosen_basics = basics
    player.build_ready = True
    player.play_draw_preference = play_draw_preference


def unready(player: Player) -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")
    player.build_ready = False
    player.play_draw_preference = None


def all_ready(game: Game) -> bool:
    """Check if all live players are synchronized and ready for battle.

    Returns True only when:
    - No active battles in progress (ghosts/bots mid-battle)
    - ALL live players are in build phase
    - ALL live players are at the same round and stage
    - ALL live players have build_ready=True
    """
    if game.active_battles:
        return False

    live_players = get_live_players(game)
    if not live_players:
        return False

    first = live_players[0]
    for p in live_players:
        if p.phase != "build":
            return False
        if p.round != first.round or p.stage != first.stage:
            return False
        if not p.build_ready:
            return False
    return True


def populate_hand(player: Player) -> None:
    player.populate_hand()


def set_companion(player: Player, card: Card) -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")

    if not card.is_companion:
        raise ValueError(f"{card.name} is not a companion")

    if card not in player.sideboard:
        raise ValueError(f"{card.name} is not in player's sideboard")

    player.command_zone.clear()
    player.command_zone.append(card.model_copy())


def remove_companion(player: Player) -> None:
    if player.phase != "build":
        raise ValueError("Player is not in build phase")

    if not player.command_zone:
        raise ValueError("No companion in command zone")

    player.command_zone.clear()


__all__ = [
    "VALID_BASICS",
    "move_card",
    "swap_card",
    "set_ready",
    "unready",
    "all_ready",
    "populate_hand",
    "apply_upgrade_to_card",
    "set_companion",
    "remove_companion",
]

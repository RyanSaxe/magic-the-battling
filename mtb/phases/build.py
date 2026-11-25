"""Build-phase hand/sideboard/companion/basics management and ready checks."""

from mtb.models.cards import Card
from mtb.models.game import Game, Player
from mtb.models.types import BuildSource
from mtb.phases.elimination import get_live_players
from mtb.phases.reward import apply_upgrade_to_card

VALID_BASICS = frozenset(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"])


def _get_build_collection(player: Player, zone: BuildSource) -> list[Card]:
    return player.hand if zone == "hand" else player.sideboard


def move_card(
    player: Player, card: Card, *, source: BuildSource, destination: BuildSource, slot: int | None = None
) -> None:
    if source == destination:
        return

    if (
        destination == "hand"
        and slot is not None
        and (not isinstance(slot, int) or isinstance(slot, bool) or not 0 <= slot < player.hand_size)
    ):
        msg = f"No hand slot {slot}"
        raise ValueError(msg)

    if source == "sideboard" and destination == "hand" and len(player.hand) >= player.hand_size:
        msg = f"Hand is full ({player.hand_size})"
        raise ValueError(msg)

    source_collection = _get_build_collection(player, source)
    if card not in source_collection:
        msg = f"Card not in player's {source}"
        raise ValueError(msg)

    slots = player.slotted_hand()
    source_collection.remove(card)
    destination_collection = _get_build_collection(player, destination)
    destination_collection.append(card)

    if destination == "hand":
        # Two quick taps can name the same slot. The card already there keeps it.
        if slot is None or slots[slot] is not None:
            slot = slots.index(None)
        slots[slot] = card.id
    else:
        slots = [None if card_id == card.id else card_id for card_id in slots]
    player.hand_slots = slots

    if source == "sideboard" and any(c.id == card.id for c in player.command_zone):
        player.command_zone.clear()


def swap_card(
    player: Player,
    card_a: Card,
    *,
    source_a: BuildSource,
    card_b: Card,
    source_b: BuildSource,
) -> None:
    if source_a == source_b:
        msg = "Cannot swap cards within the same zone"
        raise ValueError(msg)

    collection_a = _get_build_collection(player, source_a)
    collection_b = _get_build_collection(player, source_b)

    if card_a not in collection_a:
        msg = f"Card not in player's {source_a}"
        raise ValueError(msg)
    if card_b not in collection_b:
        msg = f"Card not in player's {source_b}"
        raise ValueError(msg)

    idx_a = collection_a.index(card_a)
    idx_b = collection_b.index(card_b)

    slots = player.slotted_hand()
    collection_a[idx_a] = card_b
    collection_b[idx_b] = card_a
    swapped = {card_a.id: card_b.id, card_b.id: card_a.id}
    player.hand_slots = [swapped.get(card_id, card_id) if card_id else None for card_id in slots]

    if (source_a == "sideboard" and any(c.id == card_a.id for c in player.command_zone)) or (
        source_b == "sideboard" and any(c.id == card_b.id for c in player.command_zone)
    ):
        player.command_zone.clear()


def set_basics(game: Game, player: Player, *, basics: list[str]) -> None:
    if player.phase != "build":
        msg = "Player is not in build phase"
        raise ValueError(msg)

    if player.build_ready:
        msg = "Cannot change basic lands while ready"
        raise ValueError(msg)

    if len(basics) > game.config.num_basics:
        msg = f"Cannot choose more than {game.config.num_basics} basic lands"
        raise ValueError(msg)

    for basic in basics:
        if basic not in VALID_BASICS:
            msg = f"Invalid basic land: {basic}"
            raise ValueError(msg)

    player.chosen_basics = list(basics)


def _validate_ready_basics(game: Game, basics: list[str]) -> None:
    if len(basics) != game.config.num_basics:
        msg = f"Must choose exactly {game.config.num_basics} basic lands"
        raise ValueError(msg)

    for basic in basics:
        if basic not in VALID_BASICS:
            msg = f"Invalid basic land: {basic}"
            raise ValueError(msg)


def set_ready(
    game: Game,
    player: Player,
    *,
    basics: list[str],
    play_draw_preference: str = "play",
    hand_order: list[str] | None = None,
) -> None:
    if player.phase != "build":
        msg = "Player is not in build phase"
        raise ValueError(msg)

    if play_draw_preference not in ("play", "draw"):
        msg = f"Invalid play/draw preference: {play_draw_preference}"
        raise ValueError(msg)

    _validate_ready_basics(game, basics)

    if len(player.hand) != player.hand_size:
        msg = f"Hand must have exactly {player.hand_size} cards"
        raise ValueError(msg)

    if hand_order is not None:
        hand_ids = {c.id for c in player.hand}
        order_ids = set(hand_order)
        if order_ids == hand_ids and len(hand_order) == len(player.hand):
            id_to_card = {c.id: c for c in player.hand}
            player.hand[:] = [id_to_card[cid] for cid in hand_order]

    player.chosen_basics = basics
    player.build_ready = True
    player.play_draw_preference = play_draw_preference


def unready(player: Player) -> None:
    if player.phase != "build":
        msg = "Player is not in build phase"
        raise ValueError(msg)
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
        msg = "Player is not in build phase"
        raise ValueError(msg)

    if not card.is_companion:
        msg = f"{card.name} is not a companion"
        raise ValueError(msg)

    if card not in player.sideboard:
        msg = f"{card.name} is not in player's sideboard"
        raise ValueError(msg)

    player.command_zone.clear()
    player.command_zone.append(card.model_copy())


def remove_companion(player: Player) -> None:
    if player.phase != "build":
        msg = "Player is not in build phase"
        raise ValueError(msg)

    if not player.command_zone:
        msg = "No companion in command zone"
        raise ValueError(msg)

    player.command_zone.clear()


__all__ = [
    "VALID_BASICS",
    "all_ready",
    "apply_upgrade_to_card",
    "move_card",
    "populate_hand",
    "remove_companion",
    "set_companion",
    "set_ready",
    "swap_card",
    "unready",
]

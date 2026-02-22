import random
from collections.abc import Callable
from typing import NamedTuple
from uuid import uuid4

from mtb.models.cards import Card
from mtb.models.game import Battle, Game, LastBattleResult, Player, Puppet, StaticOpponent, Zones
from mtb.models.types import ZoneName
from mtb.phases.elimination import get_live_players

PairingCandidate = Player | StaticOpponent

BASIC_LAND_IMAGES = {
    "Plains": "https://cards.scryfall.io/large/front/1/d/1d7dba1c-a702-43c0-8fca-e47bbad4a00f.jpg",
    "Island": "https://cards.scryfall.io/large/front/0/c/0c4eaecf-dd4c-45ab-9b50-2abe987d35d4.jpg",
    "Swamp": "https://cards.scryfall.io/large/front/8/3/8365ab45-6d78-47ad-a6ed-282069b0fabc.jpg",
    "Mountain": "https://cards.scryfall.io/large/front/4/2/42232ea6-e31d-46a6-9f94-b2ad2416d79b.jpg",
    "Forest": "https://cards.scryfall.io/large/front/1/9/19e71532-3f79-4fec-974f-b0e85c7fe701.jpg",
    "Wastes": "https://cards.scryfall.io/large/front/6/4/643d0ee1-016c-4ea8-b469-3599ae7532e6.jpg",
}

TREASURE_TOKEN_IMAGE = "https://cards.scryfall.io/large/front/f/a/fa8bbe0c-3813-4e3f-9bcf-cffe4fed6341.jpg"
REPEAT_OPPONENT_WEIGHT = 0.1


class BattleResult(NamedTuple):
    winner: Player | None
    loser: Player | None
    is_draw: bool


def _create_basic_land(name: str) -> Card:
    return Card(
        name=name,
        image_url=BASIC_LAND_IMAGES.get(name, f"basic/{name.lower()}.jpg"),
        id=f"basic-{name.lower()}-{uuid4().hex[:8]}",
        type_line="Basic Land",
    )


def _create_treasure_token() -> Card:
    return Card(
        name="Treasure",
        image_url=TREASURE_TOKEN_IMAGE,
        id=f"treasure-{uuid4().hex[:8]}",
        type_line="Token Artifact — Treasure",
    )


def _tag_cards_with_owner(cards: list[Card], owner_name: str) -> list[Card]:
    for card in cards:
        card.original_owner = owner_name
    return cards


def _create_zones(player: Player | StaticOpponent) -> Zones:
    basics = [_create_basic_land(name) for name in player.chosen_basics]
    treasures = [_create_treasure_token() for _ in range(player.treasures)]
    command_zone_ids = {c.id for c in player.command_zone}
    sideboard_display = [c for c in player.sideboard if c.id not in command_zone_ids]
    submitted = player.hand + player.sideboard
    revealed_card_ids = [c.id for c in player.command_zone]

    _tag_cards_with_owner(player.hand, player.name)
    _tag_cards_with_owner(player.sideboard, player.name)
    _tag_cards_with_owner(player.command_zone, player.name)

    return Zones(
        battlefield=basics + treasures,
        hand=player.hand.copy(),
        sideboard=sideboard_display,
        command_zone=player.command_zone.copy(),
        upgrades=player.upgrades.copy(),
        treasures=player.treasures,
        submitted_cards=submitted,
        original_hand_ids=[c.id for c in player.hand],
        revealed_card_ids=revealed_card_ids,
    )


def is_in_active_battle(game: Game, player: Player) -> bool:
    return any(player.name in (battle.player.name, battle.opponent.name) for battle in game.active_battles)


def can_start_pairing(game: Game, round_num: int, stage: int) -> bool:
    live_players = get_live_players(game)
    for player in live_players:
        if player.round != round_num or player.stage != stage:
            return False
        if player.phase != "battle":
            return False
    return True


def _is_opponent_in_active_battle(game: Game, opponent_name: str) -> bool:
    return any(
        (isinstance(b.opponent, StaticOpponent) and b.opponent.name == opponent_name)
        or (isinstance(b.opponent, Player) and b.opponent.name == opponent_name)
        for b in game.active_battles
    )


def get_all_pairing_candidates(game: Game, player: Player) -> list[PairingCandidate]:
    candidates: list[PairingCandidate] = [
        p
        for p in game.players
        if p.name != player.name
        and p.phase == "battle"
        and p.round == player.round
        and p.stage == player.stage
        and not is_in_active_battle(game, p)
    ]

    for fp in game.puppets:
        if fp.is_eliminated:
            continue
        if _is_opponent_in_active_battle(game, fp.name):
            continue
        static_opp = fp.get_opponent_for_round(player.stage, player.round)
        if static_opp:
            candidates.append(static_opp)

    if game.most_recent_ghost is not None:
        ghost = game.most_recent_ghost
        if ghost.name != player.name and not _is_opponent_in_active_battle(game, ghost.name):
            candidates.append(ghost)

    if game.most_recent_ghost_puppet is not None:
        ghost_puppet = game.most_recent_ghost_puppet
        if not _is_opponent_in_active_battle(game, ghost_puppet.name):
            static_opp = ghost_puppet.get_opponent_for_round(player.stage, player.round)
            if static_opp:
                candidates.append(static_opp)

    return candidates


def get_available_fake_players(game: Game) -> list[Puppet]:
    in_battle_names = {b.opponent.name for b in game.active_battles if isinstance(b.opponent, StaticOpponent)}
    available = []
    for fp in game.puppets:
        if fp.name in in_battle_names:
            continue
        if not fp.snapshots:
            continue
        if not fp.is_eliminated or (game.most_recent_ghost_puppet and fp.name == game.most_recent_ghost_puppet.name):
            available.append(fp)
    return available


def resolve_puppet_vs_puppet(bot1: Puppet, bot2: Puppet, stage: int, round_num: int) -> None:
    """Auto-resolve puppet vs puppet battle with random outcome."""
    snap1 = bot1.get_opponent_for_round(stage, round_num)
    snap2 = bot2.get_opponent_for_round(stage, round_num)

    if not snap1 or not snap2:
        return

    dmg1 = 1 + sum(1 for u in snap1.upgrades if u.upgrade_target)
    dmg2 = 1 + sum(1 for u in snap2.upgrades if u.upgrade_target)

    outcome = random.choice(["bot1_wins", "bot2_wins", "draw"])
    if outcome == "bot1_wins":
        bot2.poison += dmg1
        bot1.last_battle_result = LastBattleResult(opponent_name=bot2.name, winner_name=bot1.name, poison_dealt=dmg1)
        bot2.last_battle_result = LastBattleResult(opponent_name=bot1.name, winner_name=bot1.name, poison_taken=dmg1)
    elif outcome == "bot2_wins":
        bot1.poison += dmg2
        bot1.last_battle_result = LastBattleResult(opponent_name=bot2.name, winner_name=bot2.name, poison_taken=dmg2)
        bot2.last_battle_result = LastBattleResult(opponent_name=bot1.name, winner_name=bot2.name, poison_dealt=dmg2)
    else:
        bot1.poison += dmg2
        bot2.poison += dmg1
        bot1.last_battle_result = LastBattleResult(
            opponent_name=bot2.name, winner_name=None, is_draw=True, poison_dealt=dmg1, poison_taken=dmg2
        )
        bot2.last_battle_result = LastBattleResult(
            opponent_name=bot1.name, winner_name=None, is_draw=True, poison_dealt=dmg2, poison_taken=dmg1
        )


def resolve_unpaired_bot_battles(
    game: Game, paired_bot_names: set[str], stage: int, round_num: int, num_rounds_per_stage: int
) -> None:
    """Pair and resolve battles between puppets that weren't paired with live players."""
    unpaired_bots = [fp for fp in game.puppets if not fp.is_eliminated and fp.name not in paired_bot_names]

    while len(unpaired_bots) >= 2:
        bot1 = unpaired_bots.pop(0)
        bot2 = unpaired_bots.pop(0)
        resolve_puppet_vs_puppet(bot1, bot2, stage, round_num)

    for fp in game.puppets:
        if not fp.is_eliminated and fp.name not in paired_bot_names:
            _advance_puppet_round(fp, num_rounds_per_stage)


def _advance_puppet_round(bot: Puppet, num_rounds_per_stage: int) -> None:
    """Advance a puppet's round/stage counters."""
    if bot.round >= num_rounds_per_stage:
        bot.stage += 1
        bot.round = 1
    else:
        bot.round += 1


def get_viable_candidates(player: Player, all_candidates: list[PairingCandidate]) -> list[PairingCandidate]:
    if len(all_candidates) <= 3:
        return all_candidates

    seed = hash((player.name, player.round, player.stage))
    rng = random.Random(seed)
    return rng.sample(all_candidates, 3)


def find_opponent(game: Game, player: Player) -> PairingCandidate | None:
    if not can_start_pairing(game, player.round, player.stage):
        return None

    if is_in_active_battle(game, player):
        return None

    all_candidates = get_all_pairing_candidates(game, player)
    if not all_candidates:
        return None

    viable = get_viable_candidates(player, all_candidates)
    return weighted_random_opponent(player, viable)


def _compute_weights(player: Player, candidates: list[PairingCandidate]) -> list[float]:
    if len(candidates) == 1:
        return [1.0]

    weights: list[float] = []
    last_opponent = player.last_opponent_name
    has_last_opponent = any(c.name == last_opponent for c in candidates)

    for candidate in candidates:
        if candidate.name == last_opponent:
            weights.append(REPEAT_OPPONENT_WEIGHT)
        elif has_last_opponent:
            equal_share = (1.0 - REPEAT_OPPONENT_WEIGHT) / (len(candidates) - 1)
            weights.append(equal_share)
        else:
            weights.append(1.0 / len(candidates))

    return weights


def weighted_random_opponent(player: Player, candidates: list[PairingCandidate]) -> PairingCandidate:
    if len(candidates) == 1:
        return candidates[0]

    weights = _compute_weights(player, candidates)
    return random.choices(candidates, weights=weights, k=1)[0]


def get_potential_pairing_candidates(game: Game, player: Player) -> list[PairingCandidate]:
    """Get candidates based on round/stage match only, ignoring phase requirements."""
    candidates: list[PairingCandidate] = [
        p
        for p in game.players
        if p.name != player.name and p.phase != "eliminated" and p.round == player.round and p.stage == player.stage
    ]

    for fp in game.puppets:
        if fp.is_eliminated:
            continue
        static_opp = fp.get_opponent_for_round(player.stage, player.round)
        if static_opp:
            candidates.append(static_opp)

    if game.most_recent_ghost is not None:
        ghost = game.most_recent_ghost
        if ghost.name != player.name:
            candidates.append(ghost)

    if game.most_recent_ghost_puppet is not None:
        ghost_puppet = game.most_recent_ghost_puppet
        static_opp = ghost_puppet.get_opponent_for_round(player.stage, player.round)
        if static_opp:
            candidates.append(static_opp)

    return candidates


def get_pairing_probabilities(game: Game, player: Player) -> dict[str, float]:
    if is_in_active_battle(game, player):
        return {}

    all_candidates = get_potential_pairing_candidates(game, player)
    if not all_candidates:
        return {}

    viable = get_viable_candidates(player, all_candidates)
    weights = _compute_weights(player, viable)

    return {candidate.name: weight for candidate, weight in zip(viable, weights, strict=True)}


def pass_turn(battle: Battle, player: Player) -> bool:
    """Pass turn to opponent. Returns True if successful."""
    if battle.current_turn_name != player.name:
        return False
    if player.name == battle.player.name:
        battle.current_turn_name = battle.opponent.name
    else:
        battle.current_turn_name = battle.player.name
    return True


def start(game: Game, player: Player, opponent: Player | StaticOpponent, is_sudden_death: bool = False) -> Battle:
    if isinstance(opponent, StaticOpponent):
        return _start_vs_static(game, player, opponent, is_sudden_death)
    return _start_vs_player(game, player, opponent, is_sudden_death)


def _start_vs_static(game: Game, player: Player, opponent: StaticOpponent, is_sudden_death: bool) -> Battle:
    if not is_sudden_death and player.phase != "battle":
        raise ValueError("Player is not in battle phase")

    opponent_poison = opponent.poison
    if player.poison > opponent_poison:
        coin_flip_name = player.name
    elif opponent_poison > player.poison:
        coin_flip_name = opponent.name
    else:
        coin_flip_name = random.choice([player.name, opponent.name])

    winner_pref = player.play_draw_preference if coin_flip_name == player.name else opponent.play_draw_preference
    if winner_pref == "draw":
        loser_name = opponent.name if coin_flip_name == player.name else player.name
        on_the_play_name = loser_name
    elif winner_pref == "play" or (winner_pref is None and coin_flip_name == player.name):
        on_the_play_name = coin_flip_name
    else:
        on_the_play_name = random.choice([player.name, opponent.name])
    current_turn_name = on_the_play_name

    player.previous_hand_ids = [c.id for c in player.hand]
    player.previous_basics = player.chosen_basics.copy()
    player.pre_battle_treasures = player.treasures

    battle = Battle(
        player=player,
        opponent=opponent,
        coin_flip_name=coin_flip_name,
        on_the_play_name=on_the_play_name,
        current_turn_name=current_turn_name,
        player_zones=_create_zones(player),
        opponent_zones=_create_zones(opponent),
        player_life=game.config.starting_life,
        opponent_life=game.config.starting_life,
        is_sudden_death=is_sudden_death,
    )

    game.active_battles.append(battle)
    player.last_opponent_name = opponent.name

    return battle


def _start_vs_player(game: Game, player: Player, opponent: Player, is_sudden_death: bool) -> Battle:
    if not is_sudden_death:
        if player.phase != "battle":
            raise ValueError("Player is not in battle phase")
        if opponent.phase != "battle":
            raise ValueError("Opponent is not in battle phase")
        if not can_start_pairing(game, player.round, player.stage):
            raise ValueError("Cannot start pairing yet - not all players are ready")

    opponent_poison = opponent.poison
    if player.poison > opponent_poison:
        coin_flip_name = player.name
    elif opponent_poison > player.poison:
        coin_flip_name = opponent.name
    else:
        coin_flip_name = random.choice([player.name, opponent.name])

    winner_pref = player.play_draw_preference if coin_flip_name == player.name else opponent.play_draw_preference
    if winner_pref == "draw":
        loser_name = opponent.name if coin_flip_name == player.name else player.name
        on_the_play_name = loser_name
    else:
        on_the_play_name = coin_flip_name
    current_turn_name = on_the_play_name

    player.previous_hand_ids = [c.id for c in player.hand]
    player.previous_basics = player.chosen_basics.copy()
    player.pre_battle_treasures = player.treasures
    opponent.previous_hand_ids = [c.id for c in opponent.hand]
    opponent.previous_basics = opponent.chosen_basics.copy()
    opponent.pre_battle_treasures = opponent.treasures

    battle = Battle(
        player=player,
        opponent=opponent,
        coin_flip_name=coin_flip_name,
        on_the_play_name=on_the_play_name,
        current_turn_name=current_turn_name,
        player_zones=_create_zones(player),
        opponent_zones=_create_zones(opponent),
        player_life=game.config.starting_life,
        opponent_life=game.config.starting_life,
        is_sudden_death=is_sudden_death,
    )

    game.active_battles.append(battle)
    player.last_opponent_name = opponent.name
    opponent.last_opponent_name = player.name

    return battle


def get_zones_for_player(battle: Battle, player: Player | StaticOpponent) -> Zones:
    if player.name == battle.player.name:
        return battle.player_zones
    elif player.name == battle.opponent.name:
        return battle.opponent_zones
    else:
        raise ValueError("Player is not in this battle")


REVEALED_ZONES: set[ZoneName] = {"battlefield", "graveyard", "exile", "command_zone"}


def move_zone(
    battle: Battle, player: Player | StaticOpponent, card: Card, from_zone: ZoneName, to_zone: ZoneName
) -> None:
    if from_zone == to_zone:
        return

    zones = get_zones_for_player(battle, player)

    source = zones.get_zone(from_zone)
    if card not in source:
        raise ValueError(f"Card not in {from_zone}")

    source.remove(card)
    destination = zones.get_zone(to_zone)
    destination.append(card)

    if to_zone in REVEALED_ZONES and _is_revealed_card(card) and card.id not in zones.revealed_card_ids:
        zones.revealed_card_ids.append(card.id)


DRAW_RESULT = "draw"


def submit_result(battle: Battle, player: Player, winner_name: str) -> None:
    if player.name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Player is not in this battle")

    if winner_name != DRAW_RESULT and winner_name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Winner must be one of the players in the battle or 'draw'")

    battle.result_submissions[player.name] = winner_name

    if isinstance(battle.opponent, StaticOpponent):
        battle.result_submissions[battle.opponent.name] = winner_name


def results_agreed(battle: Battle) -> bool:
    is_static = isinstance(battle.opponent, StaticOpponent)
    required_count = 1 if is_static else 2

    if len(battle.result_submissions) < required_count:
        return False

    if is_static:
        return True

    results = list(battle.result_submissions.values())
    return results[0] == results[1]


def get_result(battle: Battle) -> BattleResult | None:
    if not results_agreed(battle):
        return None

    winner_name = next(iter(battle.result_submissions.values()))

    if winner_name == DRAW_RESULT:
        return BattleResult(winner=None, loser=None, is_draw=True)

    if winner_name == battle.player.name:
        loser = None if isinstance(battle.opponent, StaticOpponent) else battle.opponent
        return BattleResult(battle.player, loser, is_draw=False)

    winner = None if isinstance(battle.opponent, StaticOpponent) else battle.opponent
    return BattleResult(winner, battle.player, is_draw=False)


def _sync_zones_to_player(zones: Zones, player: Player, max_treasures: int) -> None:
    original_hand_ids = set(zones.original_hand_ids)
    player.hand = [c for c in zones.submitted_cards if c.id in original_hand_ids]
    player.sideboard = [c for c in zones.submitted_cards if c.id not in original_hand_ids]
    player.upgrades = list(zones.upgrades)
    treasure_count = sum(1 for c in zones.battlefield if "Treasure" in c.type_line)
    player.treasures = min(treasure_count, max_treasures)


def end(game: Game, battle: Battle) -> BattleResult:
    if isinstance(battle.opponent, StaticOpponent):
        return _end_vs_static(game, battle, battle.opponent)
    assert isinstance(battle.opponent, Player)
    return _end_vs_player(game, battle, battle.opponent)


def _end_vs_static(game: Game, battle: Battle, opponent: StaticOpponent) -> BattleResult:
    if battle.player.phase != "battle":
        raise ValueError("Player is not in battle phase")

    result = get_result(battle)
    if result is None:
        raise ValueError("Players have not agreed on the result")

    _sync_zones_to_player(battle.player_zones, battle.player, game.config.max_treasures)

    battle.player.most_recently_revealed_cards = _collect_revealed_cards(
        battle.player_zones, battle.opponent_zones, battle.player.name
    )

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return result


def _is_revealed_card(card: Card) -> bool:
    return not card.type_line.startswith("Basic Land") and not card.type_line.startswith("Token")


def _collect_revealed_cards(owner_zones: Zones, other_zones: Zones, owner_name: str) -> list[Card]:
    all_cards = (
        owner_zones.hand
        + owner_zones.sideboard
        + owner_zones.battlefield
        + owner_zones.graveyard
        + owner_zones.exile
        + owner_zones.command_zone
        + other_zones.hand
        + other_zones.sideboard
        + other_zones.battlefield
        + other_zones.graveyard
        + other_zones.exile
        + other_zones.command_zone
    )
    return [
        c
        for c in all_cards
        if c.id in owner_zones.revealed_card_ids and (c.original_owner is None or c.original_owner == owner_name)
    ]


def _handle_tap(zones: Zones, card_id: str, _data: dict) -> bool:
    if card_id not in zones.tapped_card_ids:
        zones.tapped_card_ids.append(card_id)
    return True


def _handle_untap(zones: Zones, card_id: str, _data: dict) -> bool:
    if card_id in zones.tapped_card_ids:
        zones.tapped_card_ids.remove(card_id)
    return True


def _handle_toggle(attr: str) -> "CardStateHandler":
    def handler(zones: Zones, card_id: str, _data: dict) -> bool:
        id_list = getattr(zones, attr)
        if card_id in id_list:
            id_list.remove(card_id)
        else:
            id_list.append(card_id)
        return True

    return handler


def _handle_face_down(zones: Zones, card_id: str, _data: dict) -> bool:
    if card_id in zones.face_down_card_ids:
        zones.face_down_card_ids.remove(card_id)
    else:
        zones.face_down_card_ids.append(card_id)
        if card_id not in zones.revealed_card_ids:
            zones.revealed_card_ids.append(card_id)
    return True


def _handle_counter(zones: Zones, card_id: str, data: dict) -> bool:
    counter_type = data.get("counter_type", "+1/+1")
    delta = data.get("delta", 1)
    if card_id not in zones.counters:
        zones.counters[card_id] = {}
    current = zones.counters[card_id].get(counter_type, 0)
    new_count = max(0, current + delta)
    if new_count == 0:
        zones.counters[card_id].pop(counter_type, None)
        if not zones.counters[card_id]:
            zones.counters.pop(card_id, None)
    else:
        zones.counters[card_id][counter_type] = new_count
    return True


def _handle_attach(zones: Zones, card_id: str, data: dict) -> bool:
    parent_id = data.get("parent_id")
    if not parent_id:
        return False
    if parent_id not in zones.attachments:
        zones.attachments[parent_id] = []
    if card_id not in zones.attachments[parent_id]:
        zones.attachments[parent_id].append(card_id)
    return True


def _handle_detach(zones: Zones, card_id: str, _data: dict) -> bool:
    for parent_id, children in list(zones.attachments.items()):
        if card_id in children:
            children.remove(card_id)
            if not children:
                zones.attachments.pop(parent_id, None)
            break
    return True


def _handle_spawn(zones: Zones, _card_id: str, data: dict) -> bool:
    token_data = data.get("token")
    if not token_data:
        return False
    token = Card(
        id=f"token-{uuid4().hex[:8]}",
        name=token_data.get("name", "Token"),
        image_url=token_data.get("image_url", ""),
        type_line=token_data.get("type_line", "Token Creature"),
    )
    zones.spawned_tokens.append(token)
    zones.battlefield.append(token)
    return True


def _handle_create_treasure(zones: Zones, _card_id: str, _data: dict) -> bool:
    treasure = _create_treasure_token()
    zones.spawned_tokens.append(treasure)
    zones.battlefield.append(treasure)
    return True


CardStateHandler = Callable[[Zones, str, dict], bool]

_CARD_STATE_HANDLERS: dict[str, CardStateHandler] = {
    "tap": _handle_tap,
    "untap": _handle_untap,
    "flip": _handle_toggle("flipped_card_ids"),
    "face_down": _handle_face_down,
    "counter": _handle_counter,
    "attach": _handle_attach,
    "detach": _handle_detach,
    "spawn": _handle_spawn,
    "create_treasure": _handle_create_treasure,
}


_SEARCHABLE_ZONES: list[ZoneName] = ["battlefield", "hand", "graveyard", "exile", "sideboard", "command_zone"]


def get_zones_for_card(battle: Battle, player: Player, card_id: str) -> tuple[Zones, bool]:
    """Find zones containing card. Returns (zones, is_opponent_zones).

    Searches player's zones first, then opponent zones.
    Raises ValueError if card not found.
    """
    player_zones = get_zones_for_player(battle, player)

    for zone_name in _SEARCHABLE_ZONES:
        zone_cards = player_zones.get_zone(zone_name)
        if any(c.id == card_id for c in zone_cards):
            return player_zones, False

    if any(c.id == card_id for c in player_zones.spawned_tokens):
        return player_zones, False

    opp_zones = battle.opponent_zones if player.name == battle.player.name else battle.player_zones
    for zone_name in _SEARCHABLE_ZONES:
        if any(c.id == card_id for c in opp_zones.get_zone(zone_name)):
            return opp_zones, True
    if any(c.id == card_id for c in opp_zones.spawned_tokens):
        return opp_zones, True

    raise ValueError(f"Card {card_id} not found")


_ACTIONS_WITHOUT_CARD = {"spawn", "create_treasure"}


def update_card_state(
    battle: Battle,
    player: Player,
    action_type: str,
    card_id: str,
    data: dict | None = None,
) -> bool:
    handler = _CARD_STATE_HANDLERS.get(action_type)
    if not handler:
        return False

    # Actions like spawn/create_treasure don't need an existing card
    if action_type in _ACTIONS_WITHOUT_CARD:
        for_opponent = (data or {}).get("for_opponent", False)
        if for_opponent:
            is_player_side = player.name == battle.player.name
            zones = battle.opponent_zones if is_player_side else battle.player_zones
        else:
            zones = get_zones_for_player(battle, player)
    else:
        try:
            zones, _ = get_zones_for_card(battle, player, card_id)
        except ValueError:
            return False

    return handler(zones, card_id, data or {})


def _end_vs_player(game: Game, battle: Battle, opponent: Player) -> BattleResult:
    if battle.player.phase != "battle":
        raise ValueError("Player is not in battle phase")
    if opponent.phase != "battle":
        raise ValueError("Opponent is not in battle phase")

    result = get_result(battle)
    if result is None:
        raise ValueError("Players have not agreed on the result")

    _sync_zones_to_player(battle.player_zones, battle.player, game.config.max_treasures)
    _sync_zones_to_player(battle.opponent_zones, opponent, game.config.max_treasures)

    battle.player.most_recently_revealed_cards = _collect_revealed_cards(
        battle.player_zones, battle.opponent_zones, battle.player.name
    )
    opponent.most_recently_revealed_cards = _collect_revealed_cards(
        battle.opponent_zones, battle.player_zones, opponent.name
    )

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return result

import random
from collections.abc import Callable
from typing import NamedTuple, TypeGuard, cast
from uuid import uuid4

from mtb.models.cards import Card
from mtb.models.game import Battle, FakePlayer, Game, Player, StaticOpponent, Zones
from mtb.models.types import ZoneName
from mtb.phases.elimination import get_live_players

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


def _create_zones_for_player(player: Player) -> Zones:
    basics = [_create_basic_land(name) for name in player.chosen_basics]
    treasures = [_create_treasure_token() for _ in range(player.treasures)]
    submitted = player.hand + player.sideboard
    return Zones(
        battlefield=basics + treasures,
        hand=player.hand.copy(),
        sideboard=player.sideboard.copy(),
        upgrades=player.upgrades.copy(),
        treasures=player.treasures,
        submitted_cards=submitted,
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


def get_pairing_candidates(game: Game, player: Player) -> list[Player]:
    return [
        p
        for p in game.players
        if p.name != player.name
        and not p.is_ghost
        and p.phase == "battle"
        and p.round == player.round
        and p.stage == player.stage
        and not is_in_active_battle(game, p)
    ]


def get_available_fake_players(game: Game) -> list[FakePlayer]:
    in_battle_names = {b.opponent.name for b in game.active_battles if isinstance(b.opponent, StaticOpponent)}
    return [fp for fp in game.fake_players if fp.name not in in_battle_names and not fp.is_eliminated]


def find_opponent(game: Game, player: Player) -> Player | StaticOpponent | None:
    if not can_start_pairing(game, player.round, player.stage):
        return None

    if is_in_active_battle(game, player):
        return None

    candidates = get_pairing_candidates(game, player)
    if candidates:
        return weighted_random_opponent(player, candidates)

    available_fakes = get_available_fake_players(game)
    if available_fakes:
        fake = random.choice(available_fakes)
        static_opp = fake.get_opponent_for_round(player.stage, player.round)
        if static_opp:
            return static_opp

    live_players = get_live_players(game)
    unpaired_live = [p for p in live_players if not is_in_active_battle(game, p)]
    if len(unpaired_live) == 1 and game.most_recent_ghost is not None:
        return game.most_recent_ghost

    return None


def weighted_random_opponent(player: Player, candidates: list[Player]) -> Player:
    if len(candidates) == 1:
        return candidates[0]

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

    return random.choices(candidates, weights=weights, k=1)[0]


def _create_zones_for_static_opponent(opponent: StaticOpponent) -> Zones:
    basics = [_create_basic_land(name) for name in opponent.chosen_basics]
    treasures = [_create_treasure_token() for _ in range(opponent.treasures)]
    submitted = opponent.hand + opponent.sideboard
    return Zones(
        battlefield=basics + treasures,
        hand=opponent.hand.copy(),
        sideboard=opponent.sideboard.copy(),
        upgrades=opponent.upgrades.copy(),
        treasures=opponent.treasures,
        submitted_cards=submitted,
    )


def _is_static_opponent(opponent: Player | StaticOpponent) -> TypeGuard[StaticOpponent]:
    return isinstance(opponent, StaticOpponent)


def start(game: Game, player: Player, opponent: Player | StaticOpponent, is_sudden_death: bool = False) -> Battle:
    if _is_static_opponent(opponent):
        return _start_vs_static(game, player, opponent, is_sudden_death)
    return _start_vs_player(game, player, cast(Player, opponent), is_sudden_death)


def _start_vs_static(game: Game, player: Player, opponent: StaticOpponent, is_sudden_death: bool) -> Battle:
    if not is_sudden_death and player.phase != "battle":
        raise ValueError("Player is not in battle phase")

    opponent_poison = opponent.poison
    if player.poison > opponent_poison:
        coin_flip_name = player.name
    else:
        coin_flip_name = random.choice([player.name, opponent.name])

    player.previous_hand_ids = [c.id for c in player.hand]
    player.previous_basics = player.chosen_basics.copy()

    battle = Battle(
        player=player,
        opponent=opponent,
        coin_flip_name=coin_flip_name,
        player_zones=_create_zones_for_player(player),
        opponent_zones=_create_zones_for_static_opponent(opponent),
        player_life=game.config.starting_life,
        opponent_life=game.config.starting_life,
    )

    game.active_battles.append(battle)
    player.last_opponent_name = opponent.name

    return battle


def _start_vs_player(game: Game, player: Player, opponent: Player, is_sudden_death: bool) -> Battle:
    if not is_sudden_death:
        if player.phase != "battle":
            raise ValueError("Player is not in battle phase")
        if not opponent.is_ghost and opponent.phase != "battle":
            raise ValueError("Opponent is not in battle phase")
        if not opponent.is_ghost and not can_start_pairing(game, player.round, player.stage):
            raise ValueError("Cannot start pairing yet - not all players are ready")

    opponent_poison = opponent.poison
    if player.poison > opponent_poison:
        coin_flip_name = player.name
    else:
        coin_flip_name = random.choice([player.name, opponent.name])

    player.previous_hand_ids = [c.id for c in player.hand]
    player.previous_basics = player.chosen_basics.copy()

    if not opponent.is_ghost:
        opponent.previous_hand_ids = [c.id for c in opponent.hand]
        opponent.previous_basics = opponent.chosen_basics.copy()

    battle = Battle(
        player=player,
        opponent=opponent,
        coin_flip_name=coin_flip_name,
        player_zones=_create_zones_for_player(player),
        opponent_zones=_create_zones_for_player(opponent),
        player_life=game.config.starting_life,
        opponent_life=game.config.starting_life,
    )

    game.active_battles.append(battle)
    player.last_opponent_name = opponent.name
    opponent.last_opponent_name = player.name

    return battle


def get_zones_for_player(battle: Battle, player: Player) -> Zones:
    if player.name == battle.player.name:
        return battle.player_zones
    elif player.name == battle.opponent.name:
        return battle.opponent_zones
    else:
        raise ValueError("Player is not in this battle")


def move_zone(battle: Battle, player: Player, card: Card, from_zone: ZoneName, to_zone: ZoneName) -> None:
    if from_zone == to_zone:
        return

    zones = get_zones_for_player(battle, player)

    source = zones.get_zone(from_zone)
    if card not in source:
        raise ValueError(f"Card not in {from_zone}")

    source.remove(card)
    destination = zones.get_zone(to_zone)
    destination.append(card)


DRAW_RESULT = "draw"


def submit_result(battle: Battle, player: Player, winner_name: str) -> None:
    if player.name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Player is not in this battle")

    if winner_name != DRAW_RESULT and winner_name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Winner must be one of the players in the battle or 'draw'")

    battle.result_submissions[player.name] = winner_name

    if _is_static_opponent(battle.opponent):
        battle.result_submissions[battle.opponent.name] = winner_name


def results_agreed(battle: Battle) -> bool:
    is_static = _is_static_opponent(battle.opponent)
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
        loser = None if _is_static_opponent(battle.opponent) else cast(Player, battle.opponent)
        return BattleResult(battle.player, loser, is_draw=False)

    winner = None if _is_static_opponent(battle.opponent) else cast(Player, battle.opponent)
    return BattleResult(winner, battle.player, is_draw=False)


def _sync_zones_to_player(zones: Zones, player: Player, max_treasures: int) -> None:
    player.hand = []
    player.sideboard = list(zones.submitted_cards)
    player.upgrades = list(zones.upgrades)
    treasure_count = sum(1 for c in zones.battlefield if "Treasure" in c.type_line)
    player.treasures = min(treasure_count, max_treasures)


def end(game: Game, battle: Battle) -> BattleResult:
    if _is_static_opponent(battle.opponent):
        return _end_vs_static(game, battle, battle.opponent)
    return _end_vs_player(game, battle, cast(Player, battle.opponent))


def _end_vs_static(game: Game, battle: Battle, opponent: StaticOpponent) -> BattleResult:
    if battle.player.phase != "battle":
        raise ValueError("Player is not in battle phase")

    result = get_result(battle)
    if result is None:
        raise ValueError("Players have not agreed on the result")

    _sync_zones_to_player(battle.player_zones, battle.player, game.config.max_treasures)

    revealed = battle.player_zones.battlefield + battle.player_zones.graveyard + battle.player_zones.exile
    battle.player.most_recently_revealed_cards = [c for c in revealed if _is_revealed_card(c)]

    battle.player.phase = "reward"

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return result


def _is_revealed_card(card: Card) -> bool:
    return not card.type_line.startswith("Basic Land") and not card.type_line.startswith("Token")


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


CardStateHandler = Callable[[Zones, str, dict], bool]

_CARD_STATE_HANDLERS: dict[str, CardStateHandler] = {
    "tap": _handle_tap,
    "untap": _handle_untap,
    "flip": _handle_toggle("flipped_card_ids"),
    "face_down": _handle_toggle("face_down_card_ids"),
    "counter": _handle_counter,
    "attach": _handle_attach,
    "detach": _handle_detach,
    "spawn": _handle_spawn,
}


def update_card_state(
    battle: Battle,
    player: Player,
    action_type: str,
    card_id: str,
    data: dict | None = None,
) -> bool:
    zones = get_zones_for_player(battle, player)
    handler = _CARD_STATE_HANDLERS.get(action_type)
    if not handler:
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

    revealed = battle.player_zones.battlefield + battle.player_zones.graveyard + battle.player_zones.exile
    battle.player.most_recently_revealed_cards = [c for c in revealed if _is_revealed_card(c)]

    opp_revealed = battle.opponent_zones.battlefield + battle.opponent_zones.graveyard + battle.opponent_zones.exile
    opponent.most_recently_revealed_cards = [c for c in opp_revealed if _is_revealed_card(c)]

    battle.player.phase = "reward"
    opponent.phase = "reward"

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return result

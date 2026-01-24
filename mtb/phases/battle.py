import random
from typing import NamedTuple
from uuid import uuid4

from mtb.models.cards import Card
from mtb.models.game import Battle, Game, Player, Zones
from mtb.models.types import ZoneName

BASIC_LAND_IMAGES = {
    "Plains": "https://cards.scryfall.io/large/front/1/d/1d7dba1c-a702-43c0-8fca-e47bbad4a00f.jpg",
    "Island": "https://cards.scryfall.io/large/front/0/c/0c4eaecf-dd4c-45ab-9b50-2abe987d35d4.jpg",
    "Swamp": "https://cards.scryfall.io/large/front/8/3/8365ab45-6d78-47ad-a6ed-282069b0fabc.jpg",
    "Mountain": "https://cards.scryfall.io/large/front/4/2/42232ea6-e31d-46a6-9f94-b2ad2416d79b.jpg",
    "Forest": "https://cards.scryfall.io/large/front/1/9/19e71532-3f79-4fec-974f-b0e85c7fe701.jpg",
    "Wastes": "https://cards.scryfall.io/large/front/6/4/643d0ee1-016c-4ea8-b469-3599ae7532e6.jpg",
}

TREASURE_TOKEN_IMAGE = "https://cards.scryfall.io/large/front/f/a/fa8bbe0c-3813-4e3f-9bcf-cffe4fed6341.jpg"


class BattleResult(NamedTuple):
    winner: Player | None
    loser: Player | None
    is_draw: bool


def _create_basic_land(name: str) -> Card:
    return Card(
        name=name,
        image_url=BASIC_LAND_IMAGES.get(name, f"basic/{name.lower()}.jpg"),
        id=f"basic-{name.lower()}",
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


def get_live_players(game: Game) -> list[Player]:
    return [p for p in game.players if not p.is_ghost]


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


def find_opponent(game: Game, player: Player) -> Player | None:
    if not can_start_pairing(game, player.round, player.stage):
        return None

    if is_in_active_battle(game, player):
        return None

    candidates = get_pairing_candidates(game, player)
    if not candidates:
        live_players = get_live_players(game)
        unpaired_live = [p for p in live_players if not is_in_active_battle(game, p)]
        if len(unpaired_live) == 1 and game.most_recent_ghost is not None:
            return game.most_recent_ghost
        return None

    return weighted_random_opponent(player, candidates)


def weighted_random_opponent(player: Player, candidates: list[Player]) -> Player:
    if len(candidates) == 1:
        return candidates[0]

    weights: list[float] = []
    last_opponent = player.last_opponent_name

    has_last_opponent = any(c.name == last_opponent for c in candidates)

    for candidate in candidates:
        if candidate.name == last_opponent:
            weights.append(0.1)
        elif has_last_opponent:
            equal_share = 0.9 / (len(candidates) - 1)
            weights.append(equal_share)
        else:
            weights.append(1.0 / len(candidates))

    return random.choices(candidates, weights=weights, k=1)[0]


def start(game: Game, player: Player, opponent: Player, is_sudden_death: bool = False) -> Battle:
    if not is_sudden_death:
        if player.phase != "battle":
            raise ValueError("Player is not in battle phase")
        if not opponent.is_ghost and opponent.phase != "battle":
            raise ValueError("Opponent is not in battle phase")
        if not opponent.is_ghost and not can_start_pairing(game, player.round, player.stage):
            raise ValueError("Cannot start pairing yet - not all players are ready")

    # player with higher poison goes first
    if player.poison > opponent.poison:
        coin_flip = player
    else:
        coin_flip = random.choice([player, opponent])

    for p in (player, opponent):
        if not p.is_ghost:
            p.previous_hand_ids = [c.id for c in p.hand]
            p.previous_basics = p.chosen_basics.copy()

    battle = Battle(
        player=player,
        opponent=opponent,
        coin_flip=coin_flip,
        player_zones=_create_zones_for_player(player),
        opponent_zones=_create_zones_for_player(opponent),
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


def results_agreed(battle: Battle) -> bool:
    if len(battle.result_submissions) != 2:
        return False

    results = list(battle.result_submissions.values())
    return results[0] == results[1]


def get_result(battle: Battle) -> BattleResult | None:
    if not results_agreed(battle):
        return None

    winner_name = next(iter(battle.result_submissions.values()))

    if winner_name == DRAW_RESULT:
        return BattleResult(winner=None, loser=None, is_draw=True)

    if winner_name == battle.player.name:
        return BattleResult(battle.player, battle.opponent, is_draw=False)
    return BattleResult(battle.opponent, battle.player, is_draw=False)


def _sync_zones_to_player(zones: Zones, player: Player, max_treasures: int) -> None:
    player.hand = []
    player.sideboard = list(zones.submitted_cards)
    player.upgrades = list(zones.upgrades)
    treasure_count = sum(1 for c in zones.battlefield if "Treasure" in c.type_line)
    player.treasures = min(treasure_count, max_treasures)


def end(game: Game, battle: Battle) -> BattleResult:
    if battle.player.phase != "battle":
        raise ValueError("Player is not in battle phase")
    if battle.opponent.phase != "battle":
        raise ValueError("Opponent is not in battle phase")

    result = get_result(battle)
    if result is None:
        raise ValueError("Players have not agreed on the result")

    _sync_zones_to_player(battle.player_zones, battle.player, game.config.max_treasures)
    _sync_zones_to_player(battle.opponent_zones, battle.opponent, game.config.max_treasures)

    for player, zones in [(battle.player, battle.player_zones), (battle.opponent, battle.opponent_zones)]:
        revealed = zones.battlefield + zones.graveyard + zones.exile
        player.most_recently_revealed_cards = [c for c in revealed if not c.type_line.startswith("Basic Land")]

    battle.player.phase = "reward"
    battle.opponent.phase = "reward"

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return result

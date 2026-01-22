import random

from mtb.models.cards import Card
from mtb.models.types import ZoneName

if False:  # TYPE_CHECKING
    from mtb.models.game import Battle, Game, Player, Zones


def _create_basic_land(name: str) -> Card:
    return Card(
        name=name,
        image_url=f"basic/{name.lower()}.jpg",
        id=f"basic-{name.lower()}",
        type_line="Basic Land",
    )


def _create_zones_for_player(player: "Player") -> "Zones":
    from mtb.models.game import Zones

    basics = [_create_basic_land(name) for name in player.chosen_basics]
    return Zones(
        battlefield=basics,
        hand=player.hand.copy(),
        sideboard=player.sideboard.copy(),
        upgrades=player.upgrades.copy(),
        treasures=player.treasures,
    )


def is_in_active_battle(game: "Game", player: "Player") -> bool:
    for battle in game.active_battles:
        if player.name in (battle.player.name, battle.opponent.name):
            return True
    return False


def can_start_pairing(game: "Game", round_num: int, stage: int) -> bool:
    for player in game.players:
        if player.round != round_num or player.stage != stage:
            return False
        if player.phase != "battle":
            return False
    return True


def get_pairing_candidates(game: "Game", player: "Player") -> list["Player"]:
    return [
        p
        for p in game.players
        if p.name != player.name
        and p.phase == "battle"
        and p.round == player.round
        and p.stage == player.stage
        and not is_in_active_battle(game, p)
    ]


def find_opponent(game: "Game", player: "Player") -> "Player | None":
    if not can_start_pairing(game, player.round, player.stage):
        return None

    if is_in_active_battle(game, player):
        return None

    candidates = get_pairing_candidates(game, player)
    if not candidates:
        return None

    return weighted_random_opponent(player, candidates)


def weighted_random_opponent(player: "Player", candidates: list["Player"]) -> "Player":
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


def start_battle(game: "Game", player: "Player", opponent: "Player") -> "Battle":
    from mtb.models.game import Battle

    if player.phase != "battle":
        raise ValueError("Player is not in battle phase")
    if opponent.phase != "battle":
        raise ValueError("Opponent is not in battle phase")
    if not can_start_pairing(game, player.round, player.stage):
        raise ValueError("Cannot start pairing yet - not all players are ready")

    coin_flip = random.choice([player, opponent])

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


def get_zones_for_player(battle: "Battle", player: "Player") -> "Zones":
    if player.name == battle.player.name:
        return battle.player_zones
    elif player.name == battle.opponent.name:
        return battle.opponent_zones
    else:
        raise ValueError("Player is not in this battle")


def move_zone(battle: "Battle", player: "Player", card: Card, from_zone: ZoneName, to_zone: ZoneName) -> None:
    if from_zone == to_zone:
        return

    zones = get_zones_for_player(battle, player)

    source = getattr(zones, from_zone)
    if card not in source:
        raise ValueError(f"Card not in {from_zone}")

    source.remove(card)
    destination = getattr(zones, to_zone)
    destination.append(card)


def submit_result(battle: "Battle", player: "Player", winner_name: str) -> None:
    if player.name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Player is not in this battle")

    if winner_name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Winner must be one of the players in the battle")

    battle.result_submissions[player.name] = winner_name


def results_agreed(battle: "Battle") -> bool:
    if len(battle.result_submissions) != 2:
        return False

    results = list(battle.result_submissions.values())
    return results[0] == results[1]


def get_winner(battle: "Battle") -> "Player | None":
    if not results_agreed(battle):
        return None

    winner_name = list(battle.result_submissions.values())[0]
    if winner_name == battle.player.name:
        return battle.player
    return battle.opponent


def get_loser(battle: "Battle") -> "Player | None":
    winner = get_winner(battle)
    if winner is None:
        return None

    if winner.name == battle.player.name:
        return battle.opponent
    return battle.player


def _cleanup_player_treasures(zones: "Zones", player: "Player", max_treasures: int) -> None:
    kept_treasures = min(zones.treasures, max_treasures)
    player.treasures = kept_treasures


def _collect_revealed_cards(zones: "Zones") -> list[Card]:
    revealed: list[Card] = []
    revealed.extend(zones.battlefield)
    revealed.extend(zones.graveyard)
    revealed.extend(zones.exile)
    return [c for c in revealed if not c.type_line.startswith("Basic Land")]


def _track_revealed_cards(battle: "Battle", player: "Player", opponent: "Player") -> None:
    player.most_recently_revealed_cards = _collect_revealed_cards(battle.player_zones)
    opponent.most_recently_revealed_cards = _collect_revealed_cards(battle.opponent_zones)


def end_battle(game: "Game", battle: "Battle") -> tuple["Player", "Player"]:
    if battle.player.phase != "battle":
        raise ValueError("Player is not in battle phase")
    if battle.opponent.phase != "battle":
        raise ValueError("Opponent is not in battle phase")

    if not results_agreed(battle):
        raise ValueError("Players have not agreed on the result")

    winner = get_winner(battle)
    loser = get_loser(battle)

    _cleanup_player_treasures(battle.player_zones, battle.player, game.config.max_treasures)
    _cleanup_player_treasures(battle.opponent_zones, battle.opponent, game.config.max_treasures)

    _track_revealed_cards(battle, battle.player, battle.opponent)

    battle.player.phase = "reward"
    battle.opponent.phase = "reward"

    if battle in game.active_battles:
        game.active_battles.remove(battle)

    return winner, loser

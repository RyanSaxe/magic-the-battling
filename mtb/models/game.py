import random
import weakref

from pydantic import BaseModel, Field

from mtb.models.cards import Battler, Card
from mtb.models.types import BuildSource, CardDestination, Phase, ZoneName


class DraftState(BaseModel):
    packs: list[list[Card]]
    discard: list[Card] = Field(default_factory=list)
    current_packs: dict[str, list[Card]] = Field(default_factory=dict)


class Player(BaseModel):
    name: str
    most_recently_revealed_cards: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)

    vanquishers: int = 0
    poison: int = 0
    treasures: int = 0

    # per-player progression
    phase: "Phase" = "build"
    round: int = 1
    stage: int = 1
    last_opponent_name: str | None = None

    # optional card variants
    upgrades: list[Card] = Field(default_factory=list)
    vanguard: Card | None = None

    # NOTE: commander is not implemented yet
    commander: Card | None = None

    # basics chosen during build phase (e.g., ["Plains", "Island", "Mountain"])
    chosen_basics: list[str] = Field(default_factory=list)

    # weak reference to parent game (not serialized)
    # model_config is required to allow weakref types
    model_config = {"arbitrary_types_allowed": True}
    game_ref: weakref.ref["Game"] | None = Field(default=None, exclude=True)

    @property
    def game(self) -> "Game":
        if self.game_ref is None:
            raise ValueError("Player is not associated with a game")
        game = self.game_ref()
        if game is None:
            raise ValueError("Game reference is no longer valid")
        return game

    @property
    def starting_life(self) -> int:
        return self.game.config.starting_life

    @property
    def hand_size(self) -> int:
        return self.game.config.starting_stage + self.vanquishers


class RealPlayer(Player):
    battler: Battler


# Fake Class for being able to play single player
class FakePlayer(BaseModel):
    historic_game_id: str


class Config(BaseModel):
    pack_size: int = 5
    starting_treasures: int = 1
    starting_stage: int = 3
    starting_pool_size: int = 7
    max_treasures: int = 5
    num_rounds_per_stage: int = 3
    num_basics: int = 3
    max_available_upgrades: int = 4
    poison_to_lose: int = 10
    starting_life: int = 10


class Game(BaseModel):
    players: list[Player]
    config: Config = Field(default_factory=Config)
    battler: Battler | None = None
    available_upgrades: list[Card] = Field(default_factory=list)
    draft_state: DraftState | None = None
    active_battles: list["Battle"] = Field(default_factory=list)

    # set a safe circular reference between players and game
    def model_post_init(self, __context):
        for player in self.players:
            player.game_ref = weakref.ref(self)


class Zones(BaseModel):
    battlefield: list[Card] = Field(default_factory=list)
    graveyard: list[Card] = Field(default_factory=list)
    exile: list[Card] = Field(default_factory=list)
    hand: list[Card] = Field(default_factory=list)
    sideboard: list[Card] = Field(default_factory=list)
    upgrades: list[Card] = Field(default_factory=list)
    command_zone: list[Card] = Field(default_factory=list)
    library: list[Card] = Field(default_factory=list)
    treasures: int = 0


class Battle(BaseModel):
    player: Player
    opponent: Player
    coin_flip: Player
    player_zones: Zones
    opponent_zones: Zones
    result_submissions: dict[str, str] = Field(default_factory=dict)


def create_game(player_names: list[str], num_players: int) -> Game:
    if num_players < len(player_names):
        raise ValueError()
    if num_players > len(player_names):
        # TODO: add fake players from the DB
        raise NotImplementedError()

    config = Config()
    players = [Player(name=name, treasures=config.starting_treasures) for name in player_names]
    return Game(players=players, config=config)


def set_battler(game: Game, battler: Battler) -> None:
    game.battler = battler

    upgrades = battler.upgrades.copy()
    random.shuffle(upgrades)
    max_upgrades = game.config.max_available_upgrades
    game.available_upgrades = upgrades[:max_upgrades]

    _deal_starting_pool(game)


def _deal_starting_pool(game: Game) -> None:
    """Deal initial cards to all players for round 1 (which starts in build phase)."""
    if game.battler is None:
        return

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pool_size = game.config.starting_pool_size
    for player in game.players:
        player_cards = cards[:pool_size]
        cards = cards[pool_size:]
        player.sideboard.extend(player_cards)

    game.battler.cards = cards


def start_draft(game: Game) -> None:
    if game.battler is None:
        raise ValueError("Game has no battler; cannot start draft")
    if game.draft_state is not None:
        raise ValueError("Draft already in progress")

    cards = game.battler.cards.copy()
    random.shuffle(cards)

    pack_size = game.config.pack_size
    packs = [cards[i : i + pack_size] for i in range(0, len(cards), pack_size)]

    game.battler.cards = []
    game.draft_state = DraftState(packs=packs)

    for player in game.players:
        deal_pack(game, player)


def deal_pack(game: Game, player: Player) -> list[Card] | None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if not game.draft_state.packs:
        return None

    pack = game.draft_state.packs.pop()
    game.draft_state.current_packs[player.name] = pack
    return pack


def roll(game: Game, player: Player) -> list[Card] | None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    if player.treasures <= 0:
        raise ValueError("Player has no treasures to spend")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    game.draft_state.discard.extend(current_pack)
    player.treasures -= 1

    return deal_pack(game, player)


def swap(
    game: Game,
    player: Player,
    pack_card: Card,
    player_card: Card,
    destination: CardDestination,
) -> None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    if pack_card not in current_pack:
        raise ValueError("Card not in player's current pack")

    player_collection = getattr(player, destination)
    if player_card not in player_collection:
        raise ValueError(f"Card not in player's {destination}")

    current_pack.remove(pack_card)
    current_pack.append(player_card)

    player_collection.remove(player_card)
    player_collection.append(pack_card)


def take(game: Game, player: Player, pack_card: Card, destination: CardDestination) -> None:
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.get(player.name)
    if current_pack is None:
        raise ValueError("Player has no current pack")

    if pack_card not in current_pack:
        raise ValueError("Card not in player's current pack")

    current_pack.remove(pack_card)
    player_collection = getattr(player, destination)
    player_collection.append(pack_card)


def end_draft_for_player(game: Game, player: Player) -> None:
    if player.phase != "draft":
        raise ValueError("Player is not in draft phase")
    if game.draft_state is None:
        raise ValueError("No draft in progress")

    current_pack = game.draft_state.current_packs.pop(player.name, None)
    if current_pack:
        game.draft_state.discard.extend(current_pack)

    player.phase = "build"

    if not game.draft_state.current_packs:
        _cleanup_draft(game)


def _cleanup_draft(game: Game) -> None:
    if game.draft_state is None:
        return

    remaining_cards: list[Card] = []

    for pack in game.draft_state.packs:
        remaining_cards.extend(pack)

    remaining_cards.extend(game.draft_state.discard)

    if game.battler is not None:
        game.battler.cards = remaining_cards

    game.draft_state = None


# =============================================================================
# Build Phase
# =============================================================================

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


def submit_build(game: Game, player: Player, basics: list[str]) -> None:
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


# =============================================================================
# Battle Phase
# =============================================================================


def _create_basic_land(name: str) -> Card:
    return Card(
        name=name,
        image_url=f"basic/{name.lower()}.jpg",
        id=f"basic-{name.lower()}",
        type_line="Basic Land",
    )


def _create_zones_for_player(player: Player) -> Zones:
    basics = [_create_basic_land(name) for name in player.chosen_basics]
    return Zones(
        battlefield=basics,
        hand=player.hand.copy(),
        sideboard=player.sideboard.copy(),
        upgrades=player.upgrades.copy(),
        treasures=player.treasures,
    )


def is_in_active_battle(game: Game, player: Player) -> bool:
    for battle in game.active_battles:
        if player.name in (battle.player.name, battle.opponent.name):
            return True
    return False


def can_start_pairing(game: Game, round_num: int, stage: int) -> bool:
    for player in game.players:
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


def start_battle(game: Game, player: Player, opponent: Player) -> Battle:
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

    source = getattr(zones, from_zone)
    if card not in source:
        raise ValueError(f"Card not in {from_zone}")

    source.remove(card)
    destination = getattr(zones, to_zone)
    destination.append(card)


def submit_result(battle: Battle, player: Player, winner_name: str) -> None:
    if player.name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Player is not in this battle")

    if winner_name not in (battle.player.name, battle.opponent.name):
        raise ValueError("Winner must be one of the players in the battle")

    battle.result_submissions[player.name] = winner_name


def results_agreed(battle: Battle) -> bool:
    if len(battle.result_submissions) != 2:
        return False

    results = list(battle.result_submissions.values())
    return results[0] == results[1]


def get_winner(battle: Battle) -> Player | None:
    if not results_agreed(battle):
        return None

    winner_name = list(battle.result_submissions.values())[0]
    if winner_name == battle.player.name:
        return battle.player
    return battle.opponent


def get_loser(battle: Battle) -> Player | None:
    winner = get_winner(battle)
    if winner is None:
        return None

    if winner.name == battle.player.name:
        return battle.opponent
    return battle.player


def _cleanup_player_treasures(zones: Zones, player: Player, max_treasures: int) -> None:
    kept_treasures = min(zones.treasures, max_treasures)
    player.treasures = kept_treasures


def _collect_revealed_cards(zones: Zones) -> list[Card]:
    revealed: list[Card] = []
    revealed.extend(zones.battlefield)
    revealed.extend(zones.graveyard)
    revealed.extend(zones.exile)
    return [c for c in revealed if not c.type_line.startswith("Basic Land")]


def _track_revealed_cards(battle: Battle, player: Player, opponent: Player) -> None:
    player.most_recently_revealed_cards = _collect_revealed_cards(battle.player_zones)
    opponent.most_recently_revealed_cards = _collect_revealed_cards(battle.opponent_zones)


def end_battle(game: Game, battle: Battle) -> tuple[Player, Player]:
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


# =============================================================================
# Reward Phase
# =============================================================================


def is_stage_increasing(player: Player) -> bool:
    return player.round % player.game.config.num_rounds_per_stage == 0


def count_applied_upgrades(player: Player) -> int:
    return sum(1 for u in player.upgrades if u.upgrade_target is not None)


def apply_poison(winner: Player, loser: Player) -> int:
    poison = 1 + count_applied_upgrades(winner)
    loser.poison += poison
    return poison


def award_treasure(player: Player) -> None:
    player.treasures += 1


def award_random_card(game: Game, player: Player) -> Card | None:
    if game.battler is None or not game.battler.cards:
        return None

    card = random.choice(game.battler.cards)
    game.battler.cards.remove(card)
    player.sideboard.append(card)
    return card


def award_vanquisher(player: Player) -> None:
    player.vanquishers += 1


def pick_upgrade(game: Game, player: Player, upgrade: Card) -> None:
    if upgrade not in game.available_upgrades:
        raise ValueError("Upgrade not available in this game")

    player.upgrades.append(upgrade.model_copy())


def apply_upgrade_to_card(player: Player, upgrade: Card, target: Card) -> None:
    if upgrade not in player.upgrades:
        raise ValueError("Player does not have this upgrade")

    if upgrade.upgrade_target is not None:
        raise ValueError("Upgrade has already been applied")

    if target not in player.hand and target not in player.sideboard:
        raise ValueError("Target card not in player's hand or sideboard")

    upgrade.upgrade_target = target


def start_reward(game: Game, winner: Player, loser: Player) -> None:
    if winner.phase != "reward":
        raise ValueError("Winner is not in reward phase")
    if loser.phase != "reward":
        raise ValueError("Loser is not in reward phase")

    apply_poison(winner, loser)

    award_treasure(winner)
    award_treasure(loser)

    if is_stage_increasing(winner):
        award_vanquisher(winner)
        award_vanquisher(loser)
    else:
        award_random_card(game, winner)
        award_random_card(game, loser)


def end_reward_for_player(game: Game, player: Player, upgrade_choice: Card | None = None) -> None:
    if player.phase != "reward":
        raise ValueError("Player is not in reward phase")

    if is_stage_increasing(player):
        if upgrade_choice is None:
            raise ValueError("Must provide upgrade choice when stage is increasing")
        pick_upgrade(game, player, upgrade_choice)
        player.stage += 1

    player.round += 1
    player.phase = "draft"
    player.chosen_basics = []

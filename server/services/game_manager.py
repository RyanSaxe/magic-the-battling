import secrets
from dataclasses import dataclass, field

from mtb.models.cards import Battler, Card
from mtb.models.game import Battle, Game, Player, Zones, create_game, set_battler
from mtb.models.types import BuildSource, CardDestination, ZoneName
from mtb.phases import battle, build, draft, reward
from mtb.phases.elimination import get_live_players, process_eliminations
from mtb.utils.cubecobra import get_cube_data
from server.schemas.api import (
    BattleView,
    GameStateResponse,
    LobbyPlayer,
    LobbyStateResponse,
    PlayerView,
    SelfPlayerView,
)


@dataclass
class PendingGame:
    game_id: str
    join_code: str
    cube_id: str
    player_names: list[str] = field(default_factory=list)
    player_ids: list[str] = field(default_factory=list)
    is_started: bool = False


class GameManager:
    def __init__(self):
        self._pending_games: dict[str, PendingGame] = {}
        self._active_games: dict[str, Game] = {}
        self._player_to_game: dict[str, str] = {}
        self._player_id_to_name: dict[str, str] = {}
        self._join_code_to_game: dict[str, str] = {}

    def create_game(self, player_name: str, player_id: str, cube_id: str = "auto") -> PendingGame:
        game_id = secrets.token_urlsafe(8)
        join_code = secrets.token_urlsafe(4).upper()[:6]

        pending = PendingGame(
            game_id=game_id,
            join_code=join_code,
            cube_id=cube_id,
            player_names=[player_name],
            player_ids=[player_id],
        )
        self._pending_games[game_id] = pending
        self._join_code_to_game[join_code] = game_id
        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def get_pending_game(self, game_id: str) -> PendingGame | None:
        return self._pending_games.get(game_id)

    def get_pending_game_by_code(self, join_code: str) -> PendingGame | None:
        game_id = self._join_code_to_game.get(join_code.upper())
        return self._pending_games.get(game_id) if game_id else None

    def join_game(self, join_code: str, player_name: str, player_id: str) -> PendingGame | None:
        pending = self.get_pending_game_by_code(join_code)
        if not pending or pending.is_started:
            return None

        pending.player_names.append(player_name)
        pending.player_ids.append(player_id)
        self._player_to_game[player_id] = pending.game_id
        self._player_id_to_name[player_id] = player_name

        return pending

    def start_game(self, game_id: str) -> Game | None:
        pending = self._pending_games.get(game_id)
        if not pending or len(pending.player_names) < 2:
            return None

        pending.is_started = True

        game = create_game(pending.player_names, len(pending.player_names))
        battler = self._load_battler(pending.cube_id)
        set_battler(game, battler)

        self._active_games[game_id] = game

        return game

    def _load_battler(self, cube_id: str) -> Battler:
        cards = get_cube_data(cube_id)

        main_cards: list[Card] = []
        upgrades: list[Card] = []
        vanguards: list[Card] = []

        for card in cards:
            if card.is_upgrade:
                upgrades.append(card)
            elif card.is_vanguard:
                vanguards.append(card)
            else:
                main_cards.append(card)

        return Battler(cards=main_cards, upgrades=upgrades, vanguards=vanguards)

    def get_game(self, game_id: str) -> Game | None:
        return self._active_games.get(game_id)

    def get_game_for_player(self, player_id: str) -> tuple[str, Game] | None:
        game_id = self._player_to_game.get(player_id)
        if not game_id:
            return None
        game = self._active_games.get(game_id)
        if not game:
            return None
        return game_id, game

    def get_player(self, game: Game, player_id: str) -> Player | None:
        player_name = self._player_id_to_name.get(player_id)
        if not player_name:
            return None
        for player in game.players:
            if player.name == player_name:
                return player
        return None

    def can_rejoin(self, game_id: str, player_name: str) -> bool:
        pending = self._pending_games.get(game_id)
        if pending:
            return player_name in pending.player_names

        game = self._active_games.get(game_id)
        if game:
            return any(p.name == player_name for p in game.players)

        return False

    def rejoin_game(self, game_id: str, player_name: str, player_id: str) -> bool:
        if not self.can_rejoin(game_id, player_name):
            return False

        self._player_to_game[player_id] = game_id
        self._player_id_to_name[player_id] = player_name
        return True

    def get_lobby_state(self, game_id: str) -> LobbyStateResponse | None:
        pending = self._pending_games.get(game_id)
        if not pending:
            return None

        return LobbyStateResponse(
            game_id=game_id,
            join_code=pending.join_code,
            players=[LobbyPlayer(name=name) for name in pending.player_names],
            can_start=len(pending.player_names) >= 2,
            is_started=pending.is_started,
        )

    def get_game_state(self, game_id: str, player_id: str) -> GameStateResponse | None:
        game = self._active_games.get(game_id)
        if not game:
            return None

        player = self.get_player(game, player_id)
        if not player:
            return None

        phase = self._determine_game_phase(game)

        current_pack = None
        if game.draft_state and player.name in game.draft_state.current_packs:
            current_pack = game.draft_state.current_packs[player.name]

        current_battle = None
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                current_battle = self._make_battle_view(b, player)
                break

        return GameStateResponse(
            game_id=game_id,
            phase=phase,
            players=[self._make_player_view(p, player) for p in game.players],
            self_player=SelfPlayerView(
                name=player.name,
                treasures=player.treasures,
                poison=player.poison,
                phase=player.phase,
                round=player.round,
                stage=player.stage,
                vanquishers=player.vanquishers,
                is_ghost=player.is_ghost,
                time_of_death=player.time_of_death,
                hand_count=len(player.hand),
                sideboard_count=len(player.sideboard),
                upgrades=player.upgrades,
                vanguard=player.vanguard,
                chosen_basics=player.chosen_basics,
                hand=player.hand,
                sideboard=player.sideboard,
                current_pack=current_pack,
            ),
            available_upgrades=game.available_upgrades,
            current_battle=current_battle,
        )

    def _determine_game_phase(self, game: Game) -> str:
        phases = {p.phase for p in game.players if not p.is_ghost}
        if len(phases) == 1:
            return phases.pop()
        if "battle" in phases:
            return "battle"
        if "reward" in phases:
            return "reward"
        if "build" in phases:
            return "build"
        if "draft" in phases:
            return "draft"
        return "unknown"

    def _make_player_view(self, player: Player, viewer: Player) -> PlayerView:
        return PlayerView(
            name=player.name,
            treasures=player.treasures,
            poison=player.poison,
            phase=player.phase,
            round=player.round,
            stage=player.stage,
            vanquishers=player.vanquishers,
            is_ghost=player.is_ghost,
            time_of_death=player.time_of_death,
            hand_count=len(player.hand),
            sideboard_count=len(player.sideboard),
            upgrades=player.upgrades,
            vanguard=player.vanguard,
            chosen_basics=player.chosen_basics,
        )

    def _make_battle_view(self, b: Battle, player: Player) -> BattleView:
        is_player = b.player.name == player.name
        your_zones = b.player_zones if is_player else b.opponent_zones
        opponent_zones = b.opponent_zones if is_player else b.player_zones
        opponent_name = b.opponent.name if is_player else b.player.name

        hidden_opponent = Zones(
            battlefield=opponent_zones.battlefield,
            graveyard=opponent_zones.graveyard,
            exile=opponent_zones.exile,
            hand=[],
            sideboard=[],
            upgrades=opponent_zones.upgrades,
            command_zone=opponent_zones.command_zone,
            library=[],
            treasures=opponent_zones.treasures,
            submitted_cards=[],
        )

        return BattleView(
            opponent_name=opponent_name,
            coin_flip_name=b.coin_flip.name,
            your_zones=your_zones,
            opponent_zones=hidden_opponent,
            result_submissions=b.result_submissions,
        )

    def handle_draft_take(self, game: Game, player: Player, card_id: str, destination: CardDestination) -> bool:
        current_pack = game.get_draft_state().current_packs.get(player.name)
        if not current_pack:
            return False

        card = next((c for c in current_pack if c.id == card_id), None)
        if not card:
            return False

        draft.take(game, player, card, destination)
        return True

    def handle_draft_swap(
        self, game: Game, player: Player, pack_card_id: str, player_card_id: str, destination: CardDestination
    ) -> bool:
        current_pack = game.get_draft_state().current_packs.get(player.name)
        if not current_pack:
            return False

        pack_card = next((c for c in current_pack if c.id == pack_card_id), None)
        if not pack_card:
            return False

        collection = player.hand if destination == "hand" else player.sideboard
        if destination == "upgrades":
            collection = player.upgrades

        player_card = next((c for c in collection if c.id == player_card_id), None)
        if not player_card:
            return False

        draft.swap(game, player, pack_card, player_card, destination)
        return True

    def handle_draft_roll(self, game: Game, player: Player) -> bool:
        if player.treasures <= 0:
            return False
        draft.roll(game, player)
        return True

    def handle_draft_done(self, game: Game, player: Player) -> bool:
        if player.phase != "draft":
            return False
        draft.end_for_player(game, player)
        return True

    def handle_build_move(self, player: Player, card_id: str, source: BuildSource, destination: BuildSource) -> bool:
        source_list = player.hand if source == "hand" else player.sideboard
        card = next((c for c in source_list if c.id == card_id), None)
        if not card:
            return False

        build.move_card(player, card, source, destination)
        return True

    def handle_build_submit(self, game: Game, player: Player, basics: list[str]) -> bool:
        try:
            build.submit(game, player, basics)
            self._try_start_battles(game)
            return True
        except ValueError:
            return False

    def _try_start_battles(self, game: Game) -> None:
        live_players = get_live_players(game)
        battle_ready = [p for p in live_players if p.phase == "battle"]

        if len(battle_ready) < 2:
            return

        if not battle.can_start_pairing(game, battle_ready[0].round, battle_ready[0].stage):
            return

        paired = set()
        for p in battle_ready:
            if p.name in paired:
                continue
            opponent = battle.find_opponent(game, p)
            if opponent and opponent.name not in paired:
                battle.start(game, p, opponent)
                paired.add(p.name)
                paired.add(opponent.name)

    def handle_battle_move(
        self, game: Game, player: Player, card_id: str, from_zone: ZoneName, to_zone: ZoneName
    ) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                zones = battle.get_zones_for_player(b, player)
                from_list = zones.get_zone(from_zone)
                card = next((c for c in from_list if c.id == card_id), None)
                if not card:
                    return False
                battle.move_zone(b, player, card, from_zone, to_zone)
                return True
        return False

    def handle_battle_submit_result(self, game: Game, player: Player, result: str) -> bool:
        for b in game.active_battles:
            if player.name in (b.player.name, b.opponent.name):
                battle.submit_result(b, player, result)
                if battle.results_agreed(b):
                    self._end_battle(game, b)
                return True
        return False

    def _end_battle(self, game: Game, b: Battle) -> None:
        result = battle.get_result(b)
        battle.end(game, b)

        if result == "draw":
            reward.start(game, b.player, b.opponent, is_draw=True)
        elif result == b.player.name:
            reward.start(game, b.player, b.opponent)
        else:
            reward.start(game, b.opponent, b.player)

    def handle_reward_pick_upgrade(self, game: Game, player: Player, upgrade_id: str) -> bool:
        upgrade = next((u for u in game.available_upgrades if u.id == upgrade_id), None)
        if not upgrade:
            return False
        reward.pick_upgrade(game, player, upgrade)
        return True

    def handle_reward_apply_upgrade(self, player: Player, upgrade_id: str, target_card_id: str) -> bool:
        upgrade = next((u for u in player.upgrades if u.id == upgrade_id and u.upgrade_target is None), None)
        if not upgrade:
            return False

        all_cards = player.hand + player.sideboard
        target = next((c for c in all_cards if c.id == target_card_id), None)
        if not target:
            return False

        reward.apply_upgrade_to_card(player, upgrade, target)
        return True

    def handle_reward_done(self, game: Game, player: Player) -> bool:
        if player.phase != "reward":
            return False

        reward.end_for_player(game, player)
        process_eliminations(game, player.round)

        if player.phase == "draft" and game.draft_state is None:
            draft.start(game)

        return True


game_manager = GameManager()

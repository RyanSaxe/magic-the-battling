"""Pure read-only view builders for game, battle, status, and share responses.

Every builder in this module reads model state and returns API response schemas
without mutating ``Game``, ``Player``, ``Puppet``, ``Battle``, or manager state.
"""

from __future__ import annotations

import hmac
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pitfight.models.card_registry import get_card_data
from pitfight.models.cards import Card
from pitfight.models.game import Battle, Game, LastBattleResult, Player, Puppet, StaticOpponent, Zones
from pitfight.phases import reward
from pitfight.phases.battle import BASIC_LAND_IMAGES, get_furthest_round, get_pairing_probabilities
from server.schemas.api import (
    BattleView,
    CardCatalogEntry,
    CardRef,
    GameBootstrapResponse,
    GameStateResponse,
    GameStatusPlayer,
    GameStatusResponse,
    LastResult,
    PlayerView,
    RevealAnimationView,
    SelfPlayerView,
    ZonesView,
)
from server.services.game_serialization import (
    build_catalog_from_game,
    card_to_ref,
    cards_to_refs,
    catalog_entry_for_scryfall_id,
    last_battle_result_to_view,
    zones_to_view,
)
from server.services.share import build_share_data as build_share_state

if TYPE_CHECKING:
    from collections.abc import Collection

_PHASE_PRIORITY: tuple[str, ...] = (
    "battle",
    "reward",
    "awaiting_elimination",
    "build",
    "draft",
)
_FINISHED_VIEWER_PHASES: frozenset[str] = frozenset({"eliminated", "winner", "game_over"})
_SYNTHETIC_CATALOG_IDS: frozenset[str] = frozenset(
    {*(f"basic-{name.lower()}" for name in BASIC_LAND_IMAGES), "treasure"}
)


def _opaque_card_id(key: bytes, card_id: str) -> str:
    digest = hmac.digest(key, card_id.encode(), "sha256")
    return str(UUID(bytes=digest[:16]))


def hidden_card_opaque_ids(battle: Battle, zones: Zones) -> dict[str, str]:
    # Derived from the battle's key, not stored, so every view of the battle shows the same ids
    # and an action that sends one back resolves whichever view was built last.
    hidden_ids = {*zones.face_down_card_ids, *(card.id for card in zones.library)}
    return {card_id: _opaque_card_id(battle.opaque_id_key, card_id) for card_id in hidden_ids}


def _scrub_face_down_cards(cards: list[Card], face_down_ids: set[str], *, opaque_ids: dict[str, str]) -> list[Card]:
    scrubbed: list[Card] = []
    for card in cards:
        if card.id in face_down_ids:
            scrubbed.append(
                Card(id=opaque_ids[card.id], scryfall_id="__scrubbed__", name="", image_url="", type_line="")
            )
        else:
            scrubbed.append(card)
    return scrubbed


def determine_game_phase(game: Game) -> str:
    phases = {player.phase for player in game.players if player.phase != "eliminated"}
    if len(phases) == 1:
        return next(iter(phases))
    return next((phase for phase in _PHASE_PRIORITY if phase in phases), "unknown")


def _last_result_for(name: str, result: LastBattleResult | None) -> LastResult | None:
    if result is None:
        return None
    if result.is_draw:
        return "draw"
    return "win" if result.winner_name == name else "loss"


def _parse_round_key(key: str) -> tuple[int, int]:
    stage_str, round_str = key.split("_", 1)
    return int(stage_str), int(round_str)


def puppet_snapshot_for_round(puppet: Puppet, *, stage: int, round_num: int) -> StaticOpponent | None:
    # Mirrors Puppet.get_opponent_for_round without mutating StaticOpponent.poison in place.
    target_stage, target_round = stage, round_num
    if puppet.is_eliminated and puppet.last_played_round and (target_stage, target_round) > puppet.last_played_round:
        target_stage, target_round = puppet.last_played_round

    exact_key = f"{target_stage}_{target_round}"
    if exact_key in puppet.snapshots:
        return puppet.snapshots[exact_key]

    parsed_keys = sorted(((_parse_round_key(key), key) for key in puppet.snapshots), key=lambda item: item[0])
    if not parsed_keys:
        return None

    target = (target_stage, target_round)
    selected_key = parsed_keys[0][1]
    for round_key, key in parsed_keys:
        if round_key <= target:
            selected_key = key
        else:
            break
    return puppet.snapshots[selected_key]


def _read_only_pairing_game(game: Game) -> Game:
    # pitfight.models.game.Puppet.get_opponent_for_round writes opponent.poison in place when building
    # the round table; cloning puppet snapshots keeps reads strictly side-effect free.
    if not game.puppets and game.most_recent_ghost_puppet is None:
        return game
    cloned_puppets = [
        puppet.model_copy(update={"snapshots": {k: snap.model_copy() for k, snap in puppet.snapshots.items()}})
        for puppet in game.puppets
    ]
    ghost = game.most_recent_ghost_puppet
    cloned_ghost = (
        ghost.model_copy(update={"snapshots": {k: snap.model_copy() for k, snap in ghost.snapshots.items()}})
        if ghost is not None
        else None
    )
    return game.model_copy(update={"puppets": cloned_puppets, "most_recent_ghost_puppet": cloned_ghost})


def get_pairing_probabilities_readonly(game: Game, player: Player) -> dict[str, float] | None:
    if player.phase in _FINISHED_VIEWER_PHASES:
        return None
    if player.in_sudden_death:
        other_human = next(
            (
                candidate
                for candidate in game.players
                if candidate.name != player.name and candidate.in_sudden_death and candidate.phase != "eliminated"
            ),
            None,
        )
        if other_human is not None:
            return {other_human.name: 1.0}
        sd_puppet = next(
            (puppet for puppet in game.puppets if puppet.in_sudden_death and not puppet.is_eliminated),
            None,
        )
        return {sd_puppet.name: 1.0} if sd_puppet is not None else {}

    return get_pairing_probabilities(_read_only_pairing_game(game), player)


def _opponent_poison(opponent: StaticOpponent | Player, game: Game) -> int:
    if isinstance(opponent, StaticOpponent) and opponent.source_player_history_id:
        matched = next(
            (puppet for puppet in game.puppets if puppet.player_history_id == opponent.source_player_history_id),
            None,
        )
        if matched is not None:
            return matched.poison
    return opponent.poison


def _scrubbed_opponent_zones(
    battle: Battle,
    opponent_zones: Zones,
    *,
    is_pvp: bool,
    hand_revealed: bool,
) -> Zones:
    face_down_ids = set(opponent_zones.face_down_card_ids)
    visible_upgrades = [upgrade for upgrade in opponent_zones.upgrades if reward.is_revealed_applied_upgrade(upgrade)]
    if is_pvp and face_down_ids:
        reverse_map = hidden_card_opaque_ids(battle, opponent_zones)
        library_ids = {card.id for card in opponent_zones.library}
        return Zones(
            battlefield=_scrub_face_down_cards(opponent_zones.battlefield, face_down_ids, opaque_ids=reverse_map),
            graveyard=_scrub_face_down_cards(opponent_zones.graveyard, face_down_ids, opaque_ids=reverse_map),
            exile=_scrub_face_down_cards(opponent_zones.exile, face_down_ids, opaque_ids=reverse_map),
            hand=list(opponent_zones.hand) if hand_revealed else [],
            sideboard=[],
            upgrades=visible_upgrades,
            command_zone=_scrub_face_down_cards(opponent_zones.command_zone, face_down_ids, opaque_ids=reverse_map),
            library=_scrub_face_down_cards(opponent_zones.library, library_ids, opaque_ids=reverse_map),
            treasures=opponent_zones.treasures,
            submitted_cards=[],
            tapped_card_ids=[reverse_map.get(cid, cid) for cid in opponent_zones.tapped_card_ids],
            flipped_card_ids=[reverse_map.get(cid, cid) for cid in opponent_zones.flipped_card_ids],
            face_down_card_ids=[reverse_map.get(cid, cid) for cid in opponent_zones.face_down_card_ids],
            counters={reverse_map.get(k, k): dict(v) for k, v in opponent_zones.counters.items()},
            attachments={
                reverse_map.get(parent_id, parent_id): [reverse_map.get(cid, cid) for cid in children]
                for parent_id, children in opponent_zones.attachments.items()
            },
            spawned_tokens=_scrub_face_down_cards(opponent_zones.spawned_tokens, face_down_ids, opaque_ids=reverse_map),
        )

    return Zones(
        battlefield=list(opponent_zones.battlefield),
        graveyard=list(opponent_zones.graveyard),
        exile=list(opponent_zones.exile),
        hand=list(opponent_zones.hand) if hand_revealed else [],
        sideboard=[],
        upgrades=visible_upgrades,
        command_zone=list(opponent_zones.command_zone),
        library=list(opponent_zones.library),
        treasures=opponent_zones.treasures,
        submitted_cards=[],
        tapped_card_ids=list(opponent_zones.tapped_card_ids),
        flipped_card_ids=list(opponent_zones.flipped_card_ids),
        face_down_card_ids=list(opponent_zones.face_down_card_ids),
        counters={card_id: dict(counter_map) for card_id, counter_map in opponent_zones.counters.items()},
        attachments={parent_id: list(children) for parent_id, children in opponent_zones.attachments.items()},
        spawned_tokens=list(opponent_zones.spawned_tokens),
    )


def build_battle_view(battle: Battle, viewer: Player, *, game: Game) -> BattleView:
    is_player = battle.player.name == viewer.name
    your_zones = battle.player_zones if is_player else battle.opponent_zones
    opponent_zones = battle.opponent_zones if is_player else battle.player_zones
    opponent_obj = battle.opponent if is_player else battle.player
    hand_revealed = isinstance(opponent_obj, StaticOpponent) and opponent_obj.hand_revealed
    is_pvp = not isinstance(opponent_obj, StaticOpponent)

    hidden_opponent = _scrubbed_opponent_zones(
        battle,
        opponent_zones,
        is_pvp=is_pvp,
        hand_revealed=hand_revealed,
    )
    your_poison = battle.player.poison if is_player else _opponent_poison(battle.opponent, game)
    opponent_poison = _opponent_poison(battle.opponent, game) if is_player else battle.player.poison
    full_sideboard = opponent_zones.sideboard if isinstance(opponent_obj, StaticOpponent) else []

    return BattleView(
        opponent_name=opponent_obj.name,
        coin_flip_name=battle.coin_flip_name,
        on_the_play_name=battle.on_the_play_name,
        current_turn_name=battle.current_turn_name,
        your_zones=zones_to_view(your_zones),
        opponent_zones=zones_to_view(hidden_opponent),
        opponent_hand_count=len(opponent_zones.hand),
        result_submissions=dict(battle.result_submissions),
        your_poison=your_poison,
        opponent_poison=opponent_poison,
        opponent_hand_revealed=hand_revealed,
        your_life=battle.player_life if is_player else battle.opponent_life,
        opponent_life=battle.opponent_life if is_player else battle.player_life,
        is_sudden_death=battle.is_sudden_death,
        opponent_full_sideboard=cards_to_refs(full_sideboard),
        can_manipulate_opponent=isinstance(opponent_obj, StaticOpponent),
        pending_reveal_animations=[
            RevealAnimationView(
                animation_id=anim.animation_id,
                upgrade=cards_to_refs([anim.upgrade])[0],
                target=cards_to_refs([anim.target])[0],
                player_name=anim.player_name,
            )
            for anim in battle.pending_reveal_animations
        ],
    )


def build_player_view(
    player: Player,
    viewer: Player,
    *,
    probabilities: dict[str, float] | None,
    most_recent_ghost_name: str | None = None,
) -> PlayerView:
    is_eliminated = player.phase == "eliminated"
    if player.name == viewer.name:
        visible_upgrades = player.upgrades
    else:
        visible_upgrades = [upgrade for upgrade in player.upgrades if reward.is_revealed_applied_upgrade(upgrade)]
    visible_basics = list(player.chosen_basics) if player.name == viewer.name or player.phase != "build" else []
    return PlayerView(
        name=player.name,
        treasures=player.treasures,
        poison=player.poison,
        phase=player.phase,
        round=player.round,
        stage=player.stage,
        vanquishers=player.vanquishers,
        is_ghost=is_eliminated,
        is_puppet=False,
        time_of_death=None,
        hand_count=len(player.hand),
        sideboard_count=len(player.sideboard),
        hand_size=player.hand_size,
        is_stage_increasing=reward.is_stage_increasing(player),
        upgrades=cards_to_refs(visible_upgrades),
        vanguard=card_to_ref(player.vanguard),
        chosen_basics=visible_basics,
        most_recently_revealed_cards=cards_to_refs(player.most_recently_revealed_cards),
        last_result=_last_result_for(player.name, player.last_battle_result),
        pairing_probability=None if probabilities is None else probabilities.get(player.name, 0.0),
        is_most_recent_ghost=player.name == most_recent_ghost_name,
        full_sideboard=cards_to_refs(player.sideboard) if is_eliminated else [],
        command_zone=cards_to_refs(player.command_zone),
        placement=player.placement,
        in_sudden_death=player.in_sudden_death,
        build_ready=player.build_ready,
    )


def _prior_puppet_snapshot(puppet: Puppet, viewer: Player) -> StaticOpponent | None:
    if viewer.phase == "reward":
        return puppet_snapshot_for_round(puppet, stage=viewer.stage, round_num=viewer.round)
    if viewer.round > 1:
        return puppet_snapshot_for_round(puppet, stage=viewer.stage, round_num=viewer.round - 1)
    starting_stage = 3
    if viewer.stage > starting_stage:
        return puppet_snapshot_for_round(puppet, stage=viewer.stage - 1, round_num=starting_stage)
    return None


def _puppet_revealed_cards_and_upgrades(
    puppet: Puppet,
    viewer: Player,
    *,
    snapshot: StaticOpponent | None,
) -> tuple[list[Card], list[Card]]:
    source = snapshot if viewer.in_sudden_death else _prior_puppet_snapshot(puppet, viewer)
    if source is None:
        return [], []
    return source.hand + source.command_zone, source.upgrades


def build_puppet_view(
    puppet: Puppet,
    viewer: Player,
    *,
    probabilities: dict[str, float] | None,
    most_recent_ghost_puppet_name: str | None = None,
    furthest_round: tuple[int, int] | None = None,
) -> PlayerView:
    snapshot = puppet_snapshot_for_round(puppet, stage=viewer.stage, round_num=viewer.round)
    # The odds come from the furthest round's table, so the treasures do too. The cards stay from the viewer's
    # round, or a player who is behind would see a hand early. Both stop at the round a puppet went out.
    furthest_stage, furthest_round_num = (
        furthest_round if furthest_round is not None else get_furthest_round(viewer.game)
    )
    table_snapshot = puppet_snapshot_for_round(puppet, stage=furthest_stage, round_num=furthest_round_num)
    revealed_cards, prior_upgrades = _puppet_revealed_cards_and_upgrades(puppet, viewer, snapshot=snapshot)
    has_data = snapshot is not None and table_snapshot is not None

    return PlayerView(
        name=puppet.name,
        treasures=table_snapshot.treasures if has_data and table_snapshot is not None else 0,
        poison=puppet.poison if has_data else 0,
        phase="battle",
        round=viewer.round,
        stage=viewer.stage,
        vanquishers=0,
        is_ghost=puppet.is_eliminated,
        is_puppet=True,
        time_of_death=None,
        hand_count=len(snapshot.hand) if has_data and snapshot is not None else 0,
        sideboard_count=len(snapshot.sideboard) if has_data and snapshot is not None else 0,
        hand_size=len(snapshot.hand) if has_data and snapshot is not None else 0,
        is_stage_increasing=False,
        upgrades=cards_to_refs(prior_upgrades) if has_data else [],
        vanguard=card_to_ref(snapshot.vanguard) if has_data and snapshot is not None else None,
        chosen_basics=list(snapshot.chosen_basics) if has_data and snapshot is not None else [],
        most_recently_revealed_cards=cards_to_refs(revealed_cards) if has_data else [],
        last_result=_last_result_for(puppet.name, puppet.last_battle_result),
        pairing_probability=None if probabilities is None else probabilities.get(puppet.name, 0.0),
        is_most_recent_ghost=puppet.name == most_recent_ghost_puppet_name,
        full_sideboard=cards_to_refs(snapshot.sideboard) if has_data and snapshot is not None else [],
        command_zone=cards_to_refs(snapshot.command_zone) if has_data and snapshot is not None else [],
        placement=puppet.placement,
        in_sudden_death=puppet.in_sudden_death,
    )


def _build_self_player_view(game: Game, player: Player) -> SelfPlayerView:
    current_pack = game.draft_state.current_packs.get(player.name) if game.draft_state else None
    shown_build = player.returned_build or player
    return SelfPlayerView(
        name=player.name,
        treasures=player.treasures,
        poison=player.poison,
        phase=player.phase,
        round=player.round,
        stage=player.stage,
        vanquishers=player.vanquishers,
        is_ghost=(player.phase == "eliminated"),
        time_of_death=None,
        hand_count=len(player.hand),
        sideboard_count=len(player.sideboard),
        hand_size=player.hand_size,
        is_stage_increasing=reward.is_stage_increasing(player),
        upgrades=cards_to_refs(player.upgrades),
        vanguard=card_to_ref(player.vanguard),
        chosen_basics=list(player.chosen_basics),
        most_recently_revealed_cards=cards_to_refs(player.most_recently_revealed_cards),
        last_result=_last_result_for(player.name, player.last_battle_result),
        hand=cards_to_refs(shown_build.hand),
        hand_slots=player.slotted_hand(),
        sideboard=cards_to_refs(shown_build.sideboard),
        command_zone=cards_to_refs(player.command_zone),
        current_pack=cards_to_refs(current_pack) if current_pack is not None else None,
        last_battle_result=last_battle_result_to_view(player.last_battle_result),
        build_ready=player.build_ready,
        in_sudden_death=player.in_sudden_death,
        placement=player.placement,
    )


def _add_ref_ids(refs: list[CardRef], out: set[str]) -> None:
    for ref in refs:
        if ref.scryfall_id:
            out.add(ref.scryfall_id)


def _collect_player_view_ids(view: PlayerView, out: set[str]) -> None:
    _add_ref_ids(view.upgrades, out)
    if view.vanguard is not None and view.vanguard.scryfall_id:
        out.add(view.vanguard.scryfall_id)
    _add_ref_ids(view.most_recently_revealed_cards, out)
    _add_ref_ids(view.full_sideboard, out)
    _add_ref_ids(view.command_zone, out)


def _collect_zones_view_ids(zones: ZonesView, out: set[str]) -> None:
    for ref_list in (
        zones.battlefield,
        zones.graveyard,
        zones.exile,
        zones.hand,
        zones.sideboard,
        zones.upgrades,
        zones.command_zone,
        zones.library,
        zones.submitted_cards,
        zones.spawned_tokens,
    ):
        _add_ref_ids(ref_list, out)


def _collect_battle_view_ids(battle_view: BattleView, out: set[str]) -> None:
    _collect_zones_view_ids(battle_view.your_zones, out)
    _collect_zones_view_ids(battle_view.opponent_zones, out)
    _add_ref_ids(battle_view.opponent_full_sideboard, out)
    for anim in battle_view.pending_reveal_animations:
        if anim.upgrade.scryfall_id:
            out.add(anim.upgrade.scryfall_id)
        if anim.target.scryfall_id:
            out.add(anim.target.scryfall_id)


def _collect_state_scryfall_ids(
    all_players: list[PlayerView],
    self_player: SelfPlayerView,
    *,
    available_upgrades: list[CardRef],
    current_battle: BattleView | None,
) -> set[str]:
    out: set[str] = set()
    for view in all_players:
        _collect_player_view_ids(view, out)
    _collect_player_view_ids(self_player, out)
    _add_ref_ids(self_player.hand, out)
    _add_ref_ids(self_player.sideboard, out)
    if self_player.current_pack is not None:
        _add_ref_ids(self_player.current_pack, out)
    last_result = self_player.last_battle_result
    if last_result is not None and last_result.card_gained is not None and last_result.card_gained.scryfall_id:
        out.add(last_result.card_gained.scryfall_id)
    _add_ref_ids(available_upgrades, out)
    if current_battle is not None:
        _collect_battle_view_ids(current_battle, out)
    return out


def _build_catalog_delta(scryfall_ids: set[str]) -> dict[str, CardCatalogEntry]:
    catalog: dict[str, CardCatalogEntry] = {}
    stack = list(scryfall_ids)
    seen = set(scryfall_ids)
    while stack:
        sid = stack.pop()
        try:
            card_data = get_card_data(sid)
        except KeyError:
            continue
        catalog[sid] = catalog_entry_for_scryfall_id(sid)
        for token_sid in card_data.token_scryfall_ids:
            if token_sid not in seen:
                seen.add(token_sid)
                stack.append(token_sid)
    for sid in scryfall_ids:
        if sid not in catalog and sid in _SYNTHETIC_CATALOG_IDS:
            catalog[sid] = catalog_entry_for_scryfall_id(sid)
    return catalog


def build_game_state(game: Game, player: Player, *, game_id: str) -> GameStateResponse:
    current_battle = next(
        (
            build_battle_view(active_battle, player, game=game)
            for active_battle in game.active_battles
            if player.name in (active_battle.player.name, active_battle.opponent.name)
        ),
        None,
    )
    probabilities = get_pairing_probabilities_readonly(game, player)
    most_recent_ghost_name = game.most_recent_ghost.name if game.most_recent_ghost else None
    most_recent_ghost_puppet_name = game.most_recent_ghost_puppet.name if game.most_recent_ghost_puppet else None

    all_players = [
        build_player_view(
            candidate,
            player,
            probabilities=probabilities,
            most_recent_ghost_name=most_recent_ghost_name,
        )
        for candidate in game.players
    ]
    if game.puppets:
        furthest_round = get_furthest_round(game)
        all_players.extend(
            build_puppet_view(
                puppet,
                player,
                probabilities=probabilities,
                most_recent_ghost_puppet_name=most_recent_ghost_puppet_name,
                furthest_round=furthest_round,
            )
            for puppet in game.puppets
        )
    self_player = _build_self_player_view(game, player)
    available_upgrades = cards_to_refs(game.available_upgrades)
    battle_resolution = player.battle_resolution.model_copy(deep=True) if player.battle_resolution else None
    scryfall_ids = _collect_state_scryfall_ids(
        all_players,
        self_player,
        available_upgrades=available_upgrades,
        current_battle=current_battle,
    )
    return GameStateResponse(
        game_id=game_id,
        phase=determine_game_phase(game),
        starting_life=game.config.starting_life,
        use_upgrades=game.config.use_upgrades,
        voice_chat_enabled=game.config.voice_chat_enabled,
        players=all_players,
        self_player=self_player,
        available_upgrades=available_upgrades,
        current_battle=current_battle,
        battle_resolution=battle_resolution,
        cube_id=game.config.cube_id,
        play_mode=game.config.play_mode,
        catalog_delta=_build_catalog_delta(scryfall_ids),
    )


def build_game_bootstrap(game: Game, player: Player, *, game_id: str) -> GameBootstrapResponse:
    catalog = build_catalog_from_game(game)
    state = build_game_state(game, player, game_id=game_id)
    return GameBootstrapResponse(catalog=catalog, state=state)


def build_pending_game_status(
    game_id: str,
    *,
    player_names: list[str],
    player_ids: list[str],
    is_started: bool,
    auto_approve_spectators: bool,
    connected_player_ids: Collection[str],
) -> GameStatusResponse:
    players = [
        GameStatusPlayer(
            name=name,
            is_connected=player_id in connected_player_ids,
            is_puppet=False,
            phase="lobby",
        )
        for name, player_id in zip(player_names, player_ids, strict=False)
    ]
    return GameStatusResponse(
        game_id=game_id,
        phase="lobby",
        is_started=is_started,
        players=players,
        auto_approve_spectators=auto_approve_spectators,
    )


def build_active_game_status(
    game_id: str,
    game: Game,
    *,
    connected_player_names: Collection[str],
) -> GameStatusResponse:
    players = [
        GameStatusPlayer(
            name=player.name,
            is_connected=player.name in connected_player_names,
            is_puppet=False,
            phase=player.phase,
        )
        for player in game.players
    ]
    players.extend(
        GameStatusPlayer(
            name=puppet.name,
            is_connected=True,
            is_puppet=True,
            phase="battle" if not puppet.is_eliminated else "eliminated",
        )
        for puppet in game.puppets
    )
    phases = {player.phase for player in game.players if player.phase != "eliminated"}
    phase = next(iter(phases)) if len(phases) == 1 else "mixed"
    return GameStatusResponse(
        game_id=game_id,
        phase=phase,
        is_started=True,
        players=players,
        auto_approve_spectators=game.config.auto_approve_spectators,
    )


def build_snapshot_game_status(
    game_id: str,
    *,
    config: dict[str, Any],
    players: list[dict[str, Any]],
    puppets: list[dict[str, Any]],
) -> GameStatusResponse:
    status_players = [
        GameStatusPlayer(
            name=str(player["name"]),
            is_connected=False,
            is_puppet=False,
            phase=str(player["phase"]),
        )
        for player in players
    ]
    status_players.extend(
        GameStatusPlayer(
            name=str(puppet["name"]),
            is_connected=True,
            is_puppet=True,
            phase="battle" if not puppet.get("is_eliminated", False) else "eliminated",
        )
        for puppet in puppets
    )
    phases = {str(player["phase"]) for player in players if player.get("phase") != "eliminated"}
    phase = next(iter(phases)) if len(phases) == 1 else "mixed"
    return GameStatusResponse(
        game_id=game_id,
        phase=phase,
        is_started=True,
        players=status_players,
        auto_approve_spectators=bool(config.get("auto_approve_spectators", False)),
    )


__all__ = [
    "build_active_game_status",
    "build_battle_view",
    "build_game_bootstrap",
    "build_game_state",
    "build_pending_game_status",
    "build_player_view",
    "build_puppet_view",
    "build_share_state",
    "build_snapshot_game_status",
    "determine_game_phase",
    "get_pairing_probabilities_readonly",
    "hidden_card_opaque_ids",
    "puppet_snapshot_for_round",
]

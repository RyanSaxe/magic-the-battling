"""Read-only shareable game timeline and summary builder."""

import json

from sqlalchemy.orm import Session, joinedload

from mtb.models.game import restore_snapshot_data
from server.db.models import GameRecord, PlayerGameHistory
from server.errors import ErrorCode, api_error
from server.schemas.api import ShareGameResponse, SharePlayerData, SharePlayerSnapshot


def _build_human_snapshots(history: PlayerGameHistory) -> list[SharePlayerSnapshot]:
    snapshots: list[SharePlayerSnapshot] = []
    sorted_snaps = sorted(history.snapshots, key=lambda s: (s.stage, s.round, s.sudden_death_build or 0))
    for snap in sorted_snaps:
        snapshot_data = restore_snapshot_data(snap.full_state_json)
        poison = snap.poison if snap.poison is not None else snapshot_data.poison
        snapshots.append(
            SharePlayerSnapshot(
                stage=snap.stage,
                round=snap.round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
                upgrades=snapshot_data.upgrades,
                basic_lands=snapshot_data.basic_lands,
                treasures=snapshot_data.treasures,
                poison=poison,
                vanguard=snapshot_data.vanguard,
                sudden_death_build=(int(_v) if (_v := snap.sudden_death_build) is not None else None),
            )
        )
    return snapshots


def _parse_snapshot_key(key: str) -> tuple[int, int]:
    stage_str, round_str = key.split("_", 1)
    return int(stage_str), int(round_str)


def _build_puppet_snapshots(history: PlayerGameHistory, db: Session) -> list[SharePlayerSnapshot]:
    source = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.id == history.source_history_id)
        .first()
    )
    if not source:
        return []

    raw = str(history.poison_history_json) if history.poison_history_json else ""
    poison_map: dict[str, int] = json.loads(raw) if raw else {}

    # A puppet replays each round's ordinary build, as _load_fake_player does in the game.
    ordinary_snaps = [snap for snap in source.snapshots if snap.sudden_death_build is None]
    sorted_snaps = sorted(ordinary_snaps, key=lambda s: (s.stage, s.round))
    if not sorted_snaps:
        return []

    sorted_poison_keys = sorted(poison_map.keys(), key=_parse_snapshot_key)
    snapshots: list[SharePlayerSnapshot] = []
    source_index = 0
    best_source_snapshot = None
    for key in sorted_poison_keys:
        target_stage, target_round = _parse_snapshot_key(key)

        while source_index < len(sorted_snaps):
            candidate = sorted_snaps[source_index]
            candidate_round = (candidate.stage, candidate.round)
            if candidate_round > (target_stage, target_round):
                break
            best_source_snapshot = candidate
            source_index += 1

        source_snapshot = best_source_snapshot or sorted_snaps[0]
        snapshot_data = restore_snapshot_data(source_snapshot.full_state_json)
        snapshots.append(
            SharePlayerSnapshot(
                stage=target_stage,
                round=target_round,
                hand=snapshot_data.hand,
                sideboard=snapshot_data.sideboard,
                command_zone=snapshot_data.command_zone,
                applied_upgrades=snapshot_data.applied_upgrades,
                upgrades=snapshot_data.upgrades,
                basic_lands=snapshot_data.basic_lands,
                treasures=snapshot_data.treasures,
                poison=poison_map[key],
                vanguard=snapshot_data.vanguard,
            )
        )
    return snapshots


def _add_puppet_sudden_death_fights(
    snapshots: list[SharePlayerSnapshot], puppet_name: str, *, histories: list[PlayerGameHistory]
) -> list[SharePlayerSnapshot]:
    """Add an entry for each Sudden Death a puppet fought, from the builds its human opponent saved.

    A puppet never rebuilds, so it fights each Sudden Death with its build of that round, at the poison
    both fighters were reset to.
    """
    builds_by_round = {(snapshot.stage, snapshot.round): snapshot for snapshot in snapshots}
    fights = [
        snap
        for history in histories
        if not history.is_puppet
        for snap in history.snapshots
        if snap.sudden_death_build is not None and snap.opponent_name == puppet_name
    ]
    sudden_death_builds = [
        builds_by_round[(fight.stage, fight.round)].model_copy(
            update={"sudden_death_build": fight.sudden_death_build, "poison": fight.poison}
        )
        for fight in fights
        if (fight.stage, fight.round) in builds_by_round
    ]
    return sorted([*snapshots, *sudden_death_builds], key=_round_of)


def _final_treasures(history: PlayerGameHistory, snapshots: list[SharePlayerSnapshot]) -> int | None:
    if history.final_poison is None:
        return None
    if history.is_puppet:
        # Puppets replay builds from a past game, so battles never change their treasures.
        return snapshots[-1].treasures if snapshots else 0
    return history.final_treasures if history.final_treasures is not None else 0


def _build_share_player(
    history: PlayerGameHistory, histories: list[PlayerGameHistory], *, db: Session
) -> SharePlayerData:
    is_puppet = bool(history.is_puppet)
    snapshots = (
        _add_puppet_sudden_death_fights(
            _build_puppet_snapshots(history, db), str(history.player_name), histories=histories
        )
        if is_puppet
        else _build_human_snapshots(history)
    )

    if history.final_poison is not None:
        final_poison = int(history.final_poison)
    else:
        final_poison = snapshots[-1].poison if snapshots else 0

    return SharePlayerData(
        name=str(history.player_name),
        final_placement=int(history.final_placement) if history.final_placement is not None else None,
        final_poison=final_poison,
        final_treasures=_final_treasures(history, snapshots),
        is_puppet=is_puppet,
        snapshots=snapshots,
    )


# A Sudden Death build comes after the ordinary build of its round, so it is part of what makes a round distinct.
ShareRound = tuple[int, int, int]


def _round_of(snapshot: SharePlayerSnapshot) -> ShareRound:
    return snapshot.stage, snapshot.round, snapshot.sudden_death_build or 0


def _poison_and_treasures_only(snapshot: SharePlayerSnapshot) -> SharePlayerSnapshot:
    return SharePlayerSnapshot(
        stage=snapshot.stage,
        round=snapshot.round,
        hand=[],
        sideboard=[],
        command_zone=[],
        applied_upgrades=[],
        upgrades=[],
        basic_lands=[],
        treasures=snapshot.treasures,
        poison=snapshot.poison,
        vanguard=None,
        visibility="hidden",
        sudden_death_build=snapshot.sudden_death_build,
    )


def _sharer_mid_game(sharer: SharePlayerData, last_round: ShareRound | None) -> SharePlayerData:
    # The sharer's last build is the ghost a remaining player may still fight, and its
    # applied upgrades name the hand cards they target.
    snapshots = [
        snapshot.model_copy(update={"hand": [], "applied_upgrades": [], "upgrades": [], "visibility": "hand_hidden"})
        if _round_of(snapshot) == last_round
        else snapshot
        for snapshot in sharer.snapshots
    ]
    return sharer.model_copy(update={"snapshots": snapshots})


def _other_player_mid_game(
    player: SharePlayerData, sharer_rounds: set[ShareRound], *, sharer_last_round: ShareRound | None
) -> SharePlayerData:
    snapshots = [_poison_and_treasures_only(s) for s in player.snapshots if _round_of(s) in sharer_rounds]
    out_by_sharers_last_round = (
        player.final_placement is not None
        and sharer_last_round is not None
        and all(_round_of(s) <= sharer_last_round for s in player.snapshots)
    )
    if out_by_sharers_last_round:
        return player.model_copy(update={"snapshots": snapshots})
    # Their final state comes from a round after the sharer's, so show them as they were in the sharer's rounds.
    final_poison = snapshots[-1].poison if snapshots else 0
    return player.model_copy(update={"snapshots": snapshots, "final_treasures": None, "final_poison": final_poison})


def _mid_game_players(players: list[SharePlayerData], sharer_name: str) -> list[SharePlayerData]:
    sharer = next(player for player in players if player.name == sharer_name)
    sharer_rounds = {_round_of(snapshot) for snapshot in sharer.snapshots}
    sharer_last_round = max(sharer_rounds, default=None)
    return [
        _sharer_mid_game(player, sharer_last_round)
        if player is sharer
        else _other_player_mid_game(player, sharer_rounds, sharer_last_round=sharer_last_round)
        for player in players
    ]


def build_share_data(db: Session, game_id: str, *, player_name: str) -> ShareGameResponse:
    """Build a player's share page; while the game runs, only a player who is out can share it.

    Mid-game the page lists only the sharer's rounds. The sharer's run is shown in full apart from
    their last build, and every other player shows only poison and treasures, so nothing a
    remaining player could use reaches the page.
    """
    game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
    if not game_record:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, detail="Game not found")

    config = json.loads(str(game_record.config_json)) if game_record.config_json else {}
    use_upgrades = config.get("use_upgrades", True)

    histories = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.game_id == game_id)
        .all()
    )
    sharer_history = next((h for h in histories if str(h.player_name) == player_name), None)

    # GameRecord.shared only records that someone generated a share link or preview; it never gates access.
    in_progress = game_record.ended_at is None
    if in_progress and (sharer_history is None or sharer_history.final_placement is None):
        raise api_error(404, ErrorCode.GAME_IN_PROGRESS, detail="This game is still being played")

    if not histories:
        raise api_error(404, ErrorCode.SHARE_DATA_NOT_FOUND, detail="No player data found for this game")

    if sharer_history is None:
        raise api_error(404, ErrorCode.PLAYER_NOT_IN_GAME, detail="Player not found in this game")

    players = [_build_share_player(history, histories, db=db) for history in histories]
    if in_progress:
        players = _mid_game_players(players, player_name)

    created_at = game_record.created_at.isoformat() if game_record.created_at else ""
    cube_id = str(game_record.cube_id) if game_record.cube_id else config.get("cube_id")

    return ShareGameResponse(
        game_id=game_id,
        owner_name=player_name,
        created_at=created_at,
        use_upgrades=use_upgrades,
        cube_id=cube_id,
        in_progress=in_progress,
        players=players,
    )

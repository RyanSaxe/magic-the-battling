import json
from typing import cast

from sqlalchemy.orm import Session, joinedload

from mtb.models.game import restore_snapshot_data
from server.db.models import GameRecord, PlayerGameHistory
from server.errors import ErrorCode, api_error
from server.schemas.api import ShareGameResponse, SharePlayerData, SharePlayerSnapshot


def _build_human_snapshots(history: PlayerGameHistory) -> list[SharePlayerSnapshot]:
    snapshots: list[SharePlayerSnapshot] = []
    sorted_snaps = sorted(history.snapshots, key=lambda s: (s.stage, s.round))
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

    sorted_snaps = sorted(source.snapshots, key=lambda s: (s.stage, s.round))
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


def _final_treasures(history: PlayerGameHistory, snapshots: list[SharePlayerSnapshot]) -> int | None:
    if history.final_poison is None:
        return None
    if history.is_puppet:
        # Puppets replay builds from a past game, so battles never change their treasures.
        return snapshots[-1].treasures if snapshots else 0
    return cast(int, history.final_treasures)


def _build_share_player(history: PlayerGameHistory, db: Session) -> SharePlayerData:
    is_puppet = bool(history.is_puppet)
    snapshots = _build_puppet_snapshots(history, db) if is_puppet else _build_human_snapshots(history)

    if history.final_poison is not None:
        final_poison = cast(int, history.final_poison)
    else:
        final_poison = snapshots[-1].poison if snapshots else 0

    return SharePlayerData(
        name=str(history.player_name),
        final_placement=cast(int, history.final_placement) if history.final_placement is not None else None,
        final_poison=final_poison,
        final_treasures=_final_treasures(history, snapshots),
        is_puppet=is_puppet,
        snapshots=snapshots,
    )


def build_share_data(db: Session, game_id: str, player_name: str) -> ShareGameResponse:
    game_record = db.query(GameRecord).filter(GameRecord.id == game_id).first()
    if not game_record:
        raise api_error(404, ErrorCode.GAME_NOT_FOUND, "Game not found")

    # Snapshots hold every player's hand and sideboard, so they stay hidden while the game
    # is played. Once it ends they are public by default; GameRecord.shared only records
    # that someone generated a share link or preview.
    if game_record.ended_at is None:
        raise api_error(404, ErrorCode.GAME_IN_PROGRESS, "This game is still being played")

    config = json.loads(str(game_record.config_json)) if game_record.config_json else {}
    use_upgrades = config.get("use_upgrades", True)

    histories = (
        db.query(PlayerGameHistory)
        .options(joinedload(PlayerGameHistory.snapshots))
        .filter(PlayerGameHistory.game_id == game_id)
        .all()
    )

    if not histories:
        raise api_error(404, ErrorCode.SHARE_DATA_NOT_FOUND, "No player data found for this game")

    owner_exists = any(str(h.player_name) == player_name for h in histories)
    if not owner_exists:
        raise api_error(404, ErrorCode.PLAYER_NOT_IN_GAME, "Player not found in this game")

    players = [_build_share_player(history, db) for history in histories]

    created_at = game_record.created_at.isoformat() if game_record.created_at else ""
    cube_id = str(game_record.cube_id) if game_record.cube_id else config.get("cube_id")

    return ShareGameResponse(
        game_id=game_id,
        owner_name=player_name,
        created_at=created_at,
        use_upgrades=use_upgrades,
        cube_id=cube_id,
        players=players,
    )

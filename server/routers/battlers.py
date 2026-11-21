# ruff: noqa: B008
import json
import logging
from typing import cast

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, distinct, func, or_
from sqlalchemy.orm import Session, aliased

from mtb.models.types import normalize_play_mode
from server.db import database
from server.db.models import (
    BattlerFollow,
    BattleSnapshot,
    CubeMetadata,
    GameRecord,
    PlayerGameHistory,
    User,
    UserBattler,
)
from server.db.search import card_in_players_fights, contains_text
from server.errors import ErrorCode, api_error
from server.schemas.auth import (
    CubeSetup,
    CubeSummaryResponse,
    FollowedBattlerResponse,
    GameSummaryResponse,
    UserBattlerCreate,
    UserBattlerResponse,
    UserBattlerUpdate,
)
from server.services.auth import get_current_user, get_optional_user

logger = logging.getLogger(__name__)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _battler_to_response(b: UserBattler) -> UserBattlerResponse:
    return UserBattlerResponse(
        id=cast(int, b.id),
        cube_id=cast(str, b.cube_id),
        display_name=cast(str, b.display_name) if b.display_name else None,
        use_upgrades=cast(bool, b.use_upgrades),
        use_vanguards=cast(bool, b.use_vanguards),
        play_mode=cast(str, b.play_mode),
        puppet_count=cast(int, b.puppet_count),
        target_player_count=cast(int, b.target_player_count),
        auto_approve_spectators=cast(bool, b.auto_approve_spectators),
        guided_mode_default=cast(bool, b.guided_mode_default),
        position=cast(int, b.position),
        created_at=str(b.created_at.isoformat()) if b.created_at else "",
    )


def _game_play_mode():
    """A game's play mode, counting games saved before Constructed existed as Limited."""
    extracted = func.json_extract(GameRecord.config_json, "$.play_mode")
    return case((extracted == "constructed", "constructed"), else_="limited")


def _game_uses_upgrades():
    """Whether a game used upgrades, counting games saved before the setting existed as using them."""
    return func.coalesce(func.json_extract(GameRecord.config_json, "$.use_upgrades"), True)


PresetSettings = tuple[str, str, bool]


def _preset_settings(battler: UserBattler) -> PresetSettings:
    return (str(battler.cube_id), normalize_play_mode(cast(str, battler.play_mode)), bool(battler.use_upgrades))


def _my_stats_by_settings(db: Session, user_id: str, cube_ids: set[str]) -> dict[PresetSettings, dict]:
    """The player's finished games on each cube, split by play mode and upgrades setting."""
    if not cube_ids:
        return {}
    play_mode = _game_play_mode().label("play_mode")
    uses_upgrades = _game_uses_upgrades().label("uses_upgrades")
    rows = (
        db.query(
            GameRecord.cube_id,
            play_mode,
            uses_upgrades,
            func.count(PlayerGameHistory.id),
            func.sum(case((PlayerGameHistory.final_placement == 1, 1), else_=0)),
            func.avg(PlayerGameHistory.final_placement),
            func.max(GameRecord.created_at),
        )
        .join(PlayerGameHistory, PlayerGameHistory.game_id == GameRecord.id)
        .filter(
            GameRecord.cube_id.in_(cube_ids),
            GameRecord.ended_at.isnot(None),
            PlayerGameHistory.user_id == user_id,
            PlayerGameHistory.is_puppet.is_(False),
            PlayerGameHistory.final_placement.isnot(None),
        )
        .group_by(GameRecord.cube_id, play_mode, uses_upgrades)
        .all()
    )
    return {
        (str(r[0]), str(r[1]), bool(r[2])): {
            "my_game_count": r[3],
            "my_win_count": r[4],
            "my_average_placement": float(r[5]),
            "my_last_played": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    }


def _cube_metadata_map(db: Session, cube_ids: set[str]) -> dict[str, CubeMetadata]:
    if not cube_ids:
        return {}
    return {str(m.cube_id): m for m in db.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_ids))}


def _battler_responses(db: Session, user_id: str, battlers: list[UserBattler]) -> list[UserBattlerResponse]:
    cube_ids = {str(b.cube_id) for b in battlers}
    cube_stats = _cube_stats_for_ids(db, cube_ids)
    my_stats = _my_stats_by_settings(db, user_id, cube_ids)
    metadata_map = _cube_metadata_map(db, cube_ids)

    results = []
    for b in battlers:
        meta = metadata_map.get(str(b.cube_id))
        resp = _battler_to_response(b).model_copy(
            update={
                "cube_name": str(meta.name) if meta and meta.name else None,
                "cube_image_uri": str(meta.image_uri) if meta and meta.image_uri else None,
                **cube_stats.get(str(b.cube_id), {}),
                **my_stats.get(_preset_settings(b), {}),
            }
        )
        results.append(resp)
    return results


def _cube_stats_for_ids(db: Session, cube_ids: set[str]) -> dict[str, dict]:
    if not cube_ids:
        return {}
    rows = (
        db.query(
            GameRecord.cube_id,
            func.count(distinct(GameRecord.id)),
            func.count(distinct(PlayerGameHistory.player_name)),
            func.max(GameRecord.created_at),
        )
        .join(PlayerGameHistory, PlayerGameHistory.game_id == GameRecord.id)
        .filter(
            GameRecord.cube_id.in_(cube_ids),
            GameRecord.ended_at.isnot(None),
            PlayerGameHistory.is_puppet.is_(False),
            PlayerGameHistory.final_placement.isnot(None),
        )
        .group_by(GameRecord.cube_id)
        .all()
    )
    return {
        str(r[0]): {
            "game_count": r[1],
            "human_player_count": r[2],
            "last_played": r[3].isoformat() if r[3] else None,
        }
        for r in rows
    }


router = APIRouter(prefix="/api/battlers", tags=["battlers"])


BATTLERS_PAGE_SIZE = 20


@router.get("")
def list_battlers(
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battlers = (
        db.query(UserBattler)
        .filter(UserBattler.user_id == user.id)
        .order_by(UserBattler.position, UserBattler.created_at)
        .offset(offset)
        .limit(BATTLERS_PAGE_SIZE + 1)
        .all()
    )
    has_more = len(battlers) > BATTLERS_PAGE_SIZE
    battlers = battlers[:BATTLERS_PAGE_SIZE]
    return {"battlers": _battler_responses(db, str(user.id), battlers), "has_more": has_more}


@router.post("")
def create_battler(
    request: UserBattlerCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    max_pos = db.query(func.max(UserBattler.position)).filter(UserBattler.user_id == user.id).scalar()
    battler = UserBattler(
        user_id=user.id,
        cube_id=request.cube_id,
        display_name=request.display_name,
        use_upgrades=request.use_upgrades,
        use_vanguards=request.use_vanguards,
        play_mode=request.play_mode,
        puppet_count=request.puppet_count,
        target_player_count=request.target_player_count,
        auto_approve_spectators=request.auto_approve_spectators,
        guided_mode_default=request.guided_mode_default,
        position=(max_pos or 0) + 1,
    )
    db.add(battler)
    db.commit()
    db.refresh(battler)
    database.save_cube_metadata(request.cube_id)
    [resp] = _battler_responses(db, str(user.id), [battler])
    return resp


@router.put("/{battler_id}")
def update_battler(
    battler_id: int,
    request: UserBattlerUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise api_error(404, ErrorCode.BATTLER_NOT_FOUND, "Battler not found")

    updates = request.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(battler, field, value)
    db.commit()
    db.refresh(battler)
    [resp] = _battler_responses(db, str(user.id), [battler])
    return resp


@router.delete("/{battler_id}")
def delete_battler(
    battler_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise api_error(404, ErrorCode.BATTLER_NOT_FOUND, "Battler not found")
    db.delete(battler)
    db.commit()
    return {"ok": True}


GAMES_PAGE_SIZE = 20


def _load_cube_metadata(db: Session, cube_id: str) -> CubeMetadata | None:
    meta = db.query(CubeMetadata).filter(CubeMetadata.cube_id == cube_id).first()
    if meta is None:
        database.save_cube_metadata(cube_id)
        meta = db.query(CubeMetadata).filter(CubeMetadata.cube_id == cube_id).first()
    return meta


def _has_placed_seat(db: Session, player_user_id: str | None = None):
    """Whether a human finished the game with a placement, or, given player_user_id, whether that player did."""
    seat_filter = [
        PlayerGameHistory.game_id == GameRecord.id,
        PlayerGameHistory.is_puppet.is_(False),
        PlayerGameHistory.final_placement.isnot(None),
    ]
    if player_user_id is not None:
        seat_filter.append(PlayerGameHistory.user_id == player_user_id)
    return db.query(PlayerGameHistory.id).filter(*seat_filter).correlate(GameRecord).exists()


def _popular_setup(db: Session, cube_id: str) -> CubeSetup | None:
    """The cube's most played mode and upgrades setting, the more recent one on a tie."""
    play_mode = _game_play_mode().label("play_mode")
    uses_upgrades = _game_uses_upgrades().label("uses_upgrades")
    row = (
        db.query(play_mode, uses_upgrades)
        .filter(GameRecord.cube_id == cube_id, GameRecord.ended_at.isnot(None), _has_placed_seat(db))
        .group_by(play_mode, uses_upgrades)
        .order_by(func.count(GameRecord.id).desc(), func.max(GameRecord.created_at).desc())
        .first()
    )
    if row is None:
        return None
    return CubeSetup(play_mode=row[0], use_upgrades=bool(row[1]))


def _query_cube_games(
    db: Session,
    cube_id: str,
    *,
    play_mode: str | None,
    use_upgrades: bool | None,
    offset: int,
    player_user_id: str | None = None,
) -> dict:
    """A page of a cube's finished games. With player_user_id, only that player's games, each shown by their seat."""
    base_filter = [
        GameRecord.cube_id == cube_id,
        GameRecord.ended_at.isnot(None),
    ]
    if play_mode is not None:
        base_filter.append(_game_play_mode() == play_mode)
    if use_upgrades is not None:
        base_filter.append(_game_uses_upgrades() == use_upgrades)

    query = db.query(GameRecord).filter(*base_filter, _has_placed_seat(db, player_user_id))

    total_games = query.count()

    games = query.order_by(GameRecord.created_at.desc()).offset(offset).limit(GAMES_PAGE_SIZE + 1).all()
    has_more = len(games) > GAMES_PAGE_SIZE
    games = games[:GAMES_PAGE_SIZE]

    meta = _load_cube_metadata(db, cube_id)
    cube_name = str(meta.name) if meta and meta.name else None
    cube_image_uri = str(meta.image_uri) if meta and meta.image_uri else None

    results: list[GameSummaryResponse] = []
    for game in games:
        histories = db.query(PlayerGameHistory).filter(PlayerGameHistory.game_id == game.id).all()
        humans = [h for h in histories if not h.is_puppet]
        placed_humans = [h for h in humans if h.final_placement is not None]
        if player_user_id is not None:
            placed_humans = [h for h in placed_humans if h.user_id == player_user_id]
        if not placed_humans:
            continue

        best = min(placed_humans, key=lambda h: h.final_placement or 999)

        hand_ids: list[str] = []
        final_snap = (
            db.query(BattleSnapshot.hand_json)
            .filter(BattleSnapshot.player_history_id == best.id)
            .order_by(BattleSnapshot.stage.desc(), BattleSnapshot.round.desc())
            .first()
        )
        if final_snap and final_snap[0]:
            try:
                hand_refs = json.loads(str(final_snap[0]))
                hand_ids = [ref["scryfall_id"] for ref in hand_refs if isinstance(ref, dict) and "scryfall_id" in ref]
            except (json.JSONDecodeError, KeyError):
                pass

        humans = [h for h in histories if not h.is_puppet]
        config = json.loads(str(game.config_json)) if game.config_json else {}
        results.append(
            GameSummaryResponse(
                game_id=str(game.id),
                created_at=str(game.created_at.isoformat()) if game.created_at else "",
                player_count=len(histories),
                human_count=len(humans),
                best_human_name=str(best.player_name),
                best_human_placement=cast(int, best.final_placement) if best.final_placement is not None else None,
                cube_id=cube_id,
                cube_name=cube_name,
                cube_image_uri=cube_image_uri,
                play_mode=config.get("play_mode"),
                use_upgrades=config.get("use_upgrades"),
                hand_scryfall_ids=hand_ids,
            )
        )

    return {
        "games": results,
        "has_more": has_more,
        "total_games": total_games,
        "cube_name": cube_name,
        "cube_image_uri": cube_image_uri,
    }


@router.get("/cube/{cube_id}/games")
def list_cube_games(
    cube_id: str,
    play_mode: str | None = Query(default=None),
    use_upgrades: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(_get_db),
):
    return _query_cube_games(db, cube_id, play_mode=play_mode, use_upgrades=use_upgrades, offset=offset)


@router.get("/cube/{cube_id}")
def get_cube_summary(
    cube_id: str,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(_get_db),
) -> CubeSummaryResponse:
    meta = _load_cube_metadata(db, cube_id)
    follow = None
    if current_user is not None:
        follow = (
            db.query(BattlerFollow)
            .filter(BattlerFollow.user_id == current_user.id, BattlerFollow.cube_id == cube_id)
            .first()
        )
    return CubeSummaryResponse(
        cube_id=cube_id,
        cube_name=str(meta.name) if meta and meta.name else None,
        cube_image_uri=str(meta.image_uri) if meta and meta.image_uri else None,
        **_cube_stats_for_ids(db, {cube_id}).get(cube_id, {}),
        popular_setup=_popular_setup(db, cube_id),
        is_following=follow is not None,
        follow_id=cast(int, follow.id) if follow else None,
    )


@router.get("/{battler_id}/games")
def list_battler_games(
    battler_id: int,
    *,
    play_mode: str | None = Query(default=None),
    use_upgrades: bool | None = Query(default=None),
    mine_only: bool = Query(default=False),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise api_error(404, ErrorCode.BATTLER_NOT_FOUND, "Battler not found")

    player_user_id = str(user.id) if mine_only else None
    return _query_cube_games(
        db,
        str(battler.cube_id),
        play_mode=play_mode,
        use_upgrades=use_upgrades,
        offset=offset,
        player_user_id=player_user_id,
    )


def _my_game_matches(db: Session, user_id: str, search: str):
    """Whether a game of the player's matches the search: its cube's name or id, the name of one of the
    player's presets with the game's cube and settings, the name of another player in the game, or a card
    the player had in a fight."""
    other_seat = aliased(PlayerGameHistory)
    named_cube = (
        db.query(CubeMetadata.cube_id)
        .filter(CubeMetadata.cube_id == GameRecord.cube_id, contains_text(CubeMetadata.name, search))
        .correlate(GameRecord)
        .exists()
    )
    named_opponent = (
        db.query(other_seat.id)
        .filter(
            other_seat.game_id == GameRecord.id,
            other_seat.id != PlayerGameHistory.id,
            contains_text(other_seat.player_name, search),
        )
        .correlate(GameRecord, PlayerGameHistory)
        .exists()
    )
    named_presets = (
        db.query(UserBattler)
        .filter(UserBattler.user_id == user_id, contains_text(UserBattler.display_name, search))
        .all()
    )
    preset_games = [
        and_(GameRecord.cube_id == cube_id, _game_play_mode() == play_mode, _game_uses_upgrades() == use_upgrades)
        for cube_id, play_mode, use_upgrades in {_preset_settings(preset) for preset in named_presets}
    ]
    return or_(
        contains_text(GameRecord.cube_id, search),
        named_cube,
        named_opponent,
        card_in_players_fights(search),
        *preset_games,
    )


@router.get("/my-games")
def list_my_games(
    offset: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    """The player's finished games, newest first, or with q, those it matches. The totals count the same games."""
    user_filter = [
        PlayerGameHistory.user_id == str(user.id),
        PlayerGameHistory.is_puppet.is_(False),
        PlayerGameHistory.final_placement.isnot(None),
        GameRecord.ended_at.isnot(None),
    ]
    if search := q.strip():
        user_filter.append(_my_game_matches(db, str(user.id), search))
    total_games = (
        db.query(func.count(PlayerGameHistory.id))
        .join(GameRecord, GameRecord.id == PlayerGameHistory.game_id)
        .filter(*user_filter)
        .scalar()
    ) or 0
    total_wins = (
        db.query(func.count(PlayerGameHistory.id))
        .join(GameRecord, GameRecord.id == PlayerGameHistory.game_id)
        .filter(*user_filter, PlayerGameHistory.final_placement == 1)
        .scalar()
    ) or 0

    histories = (
        db.query(PlayerGameHistory)
        .join(GameRecord, GameRecord.id == PlayerGameHistory.game_id)
        .filter(*user_filter)
        .order_by(GameRecord.created_at.desc())
        .offset(offset)
        .limit(GAMES_PAGE_SIZE + 1)
        .all()
    )
    has_more = len(histories) > GAMES_PAGE_SIZE
    histories = histories[:GAMES_PAGE_SIZE]

    game_ids = [str(h.game_id) for h in histories]
    games_by_id = {str(g.id): g for g in db.query(GameRecord).filter(GameRecord.id.in_(game_ids)).all()}
    cube_ids = {str(g.cube_id) for g in games_by_id.values() if g.cube_id}
    metadata_rows = db.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_ids)).all() if cube_ids else []
    metadata_map = {str(m.cube_id): m for m in metadata_rows}

    results: list[GameSummaryResponse] = []
    for hist in histories:
        game = games_by_id.get(str(hist.game_id))
        if not game:
            continue

        all_histories = db.query(PlayerGameHistory).filter(PlayerGameHistory.game_id == game.id).all()

        hand_ids: list[str] = []
        final_snap = (
            db.query(BattleSnapshot.hand_json)
            .filter(BattleSnapshot.player_history_id == hist.id)
            .order_by(BattleSnapshot.stage.desc(), BattleSnapshot.round.desc())
            .first()
        )
        if final_snap and final_snap[0]:
            try:
                hand_refs = json.loads(str(final_snap[0]))
                hand_ids = [ref["scryfall_id"] for ref in hand_refs if isinstance(ref, dict) and "scryfall_id" in ref]
            except (json.JSONDecodeError, KeyError):
                pass

        game_cube_id = str(game.cube_id) if game.cube_id else ""
        meta = metadata_map.get(game_cube_id)
        humans = [h for h in all_histories if not h.is_puppet]
        config = json.loads(str(game.config_json)) if game.config_json else {}
        results.append(
            GameSummaryResponse(
                game_id=str(game.id),
                created_at=str(game.created_at.isoformat()) if game.created_at else "",
                player_count=len(all_histories),
                human_count=len(humans),
                best_human_name=str(hist.player_name),
                best_human_placement=cast(int, hist.final_placement) if hist.final_placement is not None else None,
                cube_id=game_cube_id,
                cube_name=str(meta.name) if meta and meta.name else None,
                cube_image_uri=str(meta.image_uri) if meta and meta.image_uri else None,
                play_mode=config.get("play_mode"),
                use_upgrades=config.get("use_upgrades"),
                hand_scryfall_ids=hand_ids,
            )
        )

    return {"games": results, "has_more": has_more, "total_games": total_games, "total_wins": total_wins}


# ── Follow endpoints ────────────────────────────────────────────────


@router.get("/following")
def list_following(
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    follows = (
        db.query(BattlerFollow)
        .filter(BattlerFollow.user_id == user.id)
        .order_by(BattlerFollow.created_at.desc())
        .offset(offset)
        .limit(BATTLERS_PAGE_SIZE + 1)
        .all()
    )
    has_more = len(follows) > BATTLERS_PAGE_SIZE
    follows = follows[:BATTLERS_PAGE_SIZE]

    cube_id_set = {str(f.cube_id) for f in follows}
    stats_map = _cube_stats_for_ids(db, cube_id_set)
    metadata_rows = db.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_id_set)).all() if cube_id_set else []
    metadata_map = {str(m.cube_id): m for m in metadata_rows}

    results = []
    for f in follows:
        cid = str(f.cube_id)
        meta = metadata_map.get(cid)
        stats = stats_map.get(cid, {})
        results.append(
            FollowedBattlerResponse(
                id=cast(int, f.id),
                cube_id=cid,
                display_name=cast(str, f.display_name) if f.display_name else None,
                cube_name=str(meta.name) if meta and meta.name else None,
                cube_image_uri=str(meta.image_uri) if meta and meta.image_uri else None,
                created_at=str(f.created_at.isoformat()) if f.created_at else "",
                game_count=stats.get("game_count", 0),
                human_player_count=stats.get("human_player_count", 0),
                last_played=stats.get("last_played"),
            )
        )

    return {"following": results, "has_more": has_more}


class FollowCubeRequest(BaseModel):
    cube_id: str
    display_name: str | None = None


@router.post("/follow")
def follow_cube(
    request: FollowCubeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    existing = (
        db.query(BattlerFollow)
        .filter(BattlerFollow.user_id == user.id, BattlerFollow.cube_id == request.cube_id)
        .first()
    )
    if existing:
        raise api_error(409, ErrorCode.ALREADY_FOLLOWING, "Already following this cube")

    follow = BattlerFollow(user_id=user.id, cube_id=request.cube_id, display_name=request.display_name)
    db.add(follow)
    db.commit()
    db.refresh(follow)
    database.save_cube_metadata(request.cube_id)
    meta = db.query(CubeMetadata).filter(CubeMetadata.cube_id == request.cube_id).first()
    return FollowedBattlerResponse(
        id=cast(int, follow.id),
        cube_id=cast(str, follow.cube_id),
        display_name=cast(str, follow.display_name) if follow.display_name else None,
        cube_name=str(meta.name) if meta and meta.name else None,
        cube_image_uri=str(meta.image_uri) if meta and meta.image_uri else None,
        created_at=str(follow.created_at.isoformat()) if follow.created_at else "",
    )


@router.delete("/follow/{follow_id}")
def unfollow_cube(
    follow_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    follow = db.query(BattlerFollow).filter(BattlerFollow.id == follow_id, BattlerFollow.user_id == user.id).first()
    if not follow:
        raise api_error(404, ErrorCode.FOLLOW_NOT_FOUND, "Follow not found")
    db.delete(follow)
    db.commit()
    return {"ok": True}

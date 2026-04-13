# ruff: noqa: B008
import json
import logging
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import BattlerFollow, BattleSnapshot, GameRecord, PlayerGameHistory, User, UserBattler
from server.schemas.auth import (
    FollowedBattlerResponse,
    GameSummaryResponse,
    UserBattlerCreate,
    UserBattlerResponse,
    UserBattlerUpdate,
)
from server.services.auth import get_current_user

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
    return {"battlers": [_battler_to_response(b) for b in battlers], "has_more": has_more}


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
    return _battler_to_response(battler)


@router.put("/{battler_id}")
def update_battler(
    battler_id: int,
    request: UserBattlerUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise HTTPException(status_code=404, detail="Battler not found")

    updates = request.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(battler, field, value)
    db.commit()
    db.refresh(battler)
    return _battler_to_response(battler)


@router.delete("/{battler_id}")
def delete_battler(
    battler_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise HTTPException(status_code=404, detail="Battler not found")
    db.delete(battler)
    db.commit()
    return {"ok": True}


GAMES_PAGE_SIZE = 20


@router.get("/{battler_id}/games")
def list_battler_games(
    battler_id: int,
    play_mode: str | None = Query(default=None),
    use_upgrades: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise HTTPException(status_code=404, detail="Battler not found")

    cube_id = str(battler.cube_id)
    query = db.query(GameRecord).filter(
        GameRecord.cube_id == cube_id,
        GameRecord.ended_at.isnot(None),
        GameRecord.winner_player_id.isnot(None),
    )
    if play_mode is not None:
        query = query.filter(func.json_extract(GameRecord.config_json, "$.play_mode") == play_mode)
    if use_upgrades is not None:
        query = query.filter(func.json_extract(GameRecord.config_json, "$.use_upgrades") == use_upgrades)

    games = query.order_by(GameRecord.created_at.desc()).offset(offset).limit(GAMES_PAGE_SIZE + 1).all()
    has_more = len(games) > GAMES_PAGE_SIZE
    games = games[:GAMES_PAGE_SIZE]

    results: list[GameSummaryResponse] = []
    for game in games:
        histories = db.query(PlayerGameHistory).filter(PlayerGameHistory.game_id == game.id).all()
        humans = [h for h in histories if not h.is_puppet]
        if not humans:
            continue

        best = min(humans, key=lambda h: h.final_placement or 999)

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

        config = json.loads(str(game.config_json)) if game.config_json else {}
        results.append(
            GameSummaryResponse(
                game_id=str(game.id),
                created_at=str(game.created_at.isoformat()) if game.created_at else "",
                player_count=len(histories),
                best_human_name=str(best.player_name),
                best_human_placement=cast(int, best.final_placement) if best.final_placement is not None else None,
                cube_id=cube_id,
                play_mode=config.get("play_mode"),
                use_upgrades=config.get("use_upgrades"),
                hand_scryfall_ids=hand_ids,
            )
        )

    return {"games": results, "has_more": has_more}


@router.get("/my-games")
def list_my_games(
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    histories = (
        db.query(PlayerGameHistory)
        .join(GameRecord, GameRecord.id == PlayerGameHistory.game_id)
        .filter(
            PlayerGameHistory.user_id == str(user.id),
            PlayerGameHistory.is_puppet.is_(False),
            GameRecord.ended_at.isnot(None),
            GameRecord.winner_player_id.isnot(None),
        )
        .order_by(GameRecord.created_at.desc())
        .offset(offset)
        .limit(GAMES_PAGE_SIZE + 1)
        .all()
    )
    has_more = len(histories) > GAMES_PAGE_SIZE
    histories = histories[:GAMES_PAGE_SIZE]

    results: list[GameSummaryResponse] = []
    for hist in histories:
        game = db.query(GameRecord).filter(GameRecord.id == hist.game_id).first()
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

        config = json.loads(str(game.config_json)) if game.config_json else {}
        results.append(
            GameSummaryResponse(
                game_id=str(game.id),
                created_at=str(game.created_at.isoformat()) if game.created_at else "",
                player_count=len(all_histories),
                best_human_name=str(hist.player_name),
                best_human_placement=cast(int, hist.final_placement) if hist.final_placement is not None else None,
                cube_id=str(game.cube_id) if game.cube_id else "",
                play_mode=config.get("play_mode"),
                use_upgrades=config.get("use_upgrades"),
                hand_scryfall_ids=hand_ids,
            )
        )

    return {"games": results, "has_more": has_more}


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
    return {
        "following": [
            FollowedBattlerResponse(
                id=cast(int, f.id),
                cube_id=cast(str, f.cube_id),
                display_name=cast(str, f.display_name) if f.display_name else None,
                created_at=str(f.created_at.isoformat()) if f.created_at else "",
            )
            for f in follows
        ],
        "has_more": has_more,
    }


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
        raise HTTPException(status_code=409, detail="Already following this cube")

    follow = BattlerFollow(user_id=user.id, cube_id=request.cube_id, display_name=request.display_name)
    db.add(follow)
    db.commit()
    db.refresh(follow)
    return FollowedBattlerResponse(
        id=cast(int, follow.id),
        cube_id=cast(str, follow.cube_id),
        display_name=cast(str, follow.display_name) if follow.display_name else None,
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
        raise HTTPException(status_code=404, detail="Follow not found")
    db.delete(follow)
    db.commit()
    return {"ok": True}

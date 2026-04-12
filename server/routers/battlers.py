# ruff: noqa: B008
import logging
from typing import cast

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import BattlerFollow, GameRecord, PlayerGameHistory, User, UserBattler
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


@router.get("")
def list_battlers(user: User = Depends(get_current_user), db: Session = Depends(_get_db)):
    battlers = (
        db.query(UserBattler)
        .filter(UserBattler.user_id == user.id)
        .order_by(UserBattler.position, UserBattler.created_at)
        .all()
    )
    return {"battlers": [_battler_to_response(b) for b in battlers]}


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


@router.get("/{battler_id}/games")
def list_battler_games(
    battler_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    battler = db.query(UserBattler).filter(UserBattler.id == battler_id, UserBattler.user_id == user.id).first()
    if not battler:
        raise HTTPException(status_code=404, detail="Battler not found")

    cube_id = str(battler.cube_id)
    # Finished game histories are intentionally public-by-default. The shared flag
    # only tracks whether someone explicitly shared the game externally.
    games = (
        db.query(GameRecord)
        .filter(GameRecord.cube_id == cube_id, GameRecord.ended_at.isnot(None))
        .order_by(GameRecord.created_at.desc())
        .limit(100)
        .all()
    )

    results: list[GameSummaryResponse] = []
    for game in games:
        histories = db.query(PlayerGameHistory).filter(PlayerGameHistory.game_id == game.id).all()
        humans = [h for h in histories if not h.is_puppet]
        if not humans:
            continue

        best = min(humans, key=lambda h: h.final_placement or 999)

        results.append(
            GameSummaryResponse(
                game_id=str(game.id),
                created_at=str(game.created_at.isoformat()) if game.created_at else "",
                player_count=len(histories),
                best_human_name=str(best.player_name),
                best_human_placement=cast(int, best.final_placement) if best.final_placement is not None else None,
                cube_id=cube_id,
            )
        )

    return {"games": results}


# ── Follow endpoints ────────────────────────────────────────────────


@router.get("/following")
def list_following(user: User = Depends(get_current_user), db: Session = Depends(_get_db)):
    follows = (
        db.query(BattlerFollow).filter(BattlerFollow.user_id == user.id).order_by(BattlerFollow.created_at.desc()).all()
    )
    return {
        "following": [
            FollowedBattlerResponse(
                id=cast(int, f.id),
                cube_id=cast(str, f.cube_id),
                display_name=cast(str, f.display_name) if f.display_name else None,
                created_at=str(f.created_at.isoformat()) if f.created_at else "",
            )
            for f in follows
        ]
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

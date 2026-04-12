# ruff: noqa: B008
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import BattlerFollow, GameRecord, PlayerGameHistory, User
from server.services.auth import get_optional_user

logger = logging.getLogger(__name__)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/discover", tags=["discover"])


@router.get("")
def search_cubes(
    q: str = Query(default="", max_length=100),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(_get_db),
):
    query = q.strip()

    base = (
        db.query(
            GameRecord.cube_id,
            func.count(distinct(GameRecord.id)).label("game_count"),
            func.count(distinct(PlayerGameHistory.player_name)).label("player_count"),
            func.max(GameRecord.created_at).label("last_played"),
        )
        .join(PlayerGameHistory, PlayerGameHistory.game_id == GameRecord.id)
        .filter(
            GameRecord.cube_id.isnot(None),
            GameRecord.ended_at.isnot(None),
        )
        .group_by(GameRecord.cube_id)
        .order_by(func.count(distinct(GameRecord.id)).desc())
    )

    if query:
        base = base.filter(GameRecord.cube_id.contains(query))

    rows = base.limit(50).all()

    followed_ids: set[str] = set()
    if current_user:
        follows = db.query(BattlerFollow.cube_id).filter(BattlerFollow.user_id == current_user.id).all()
        followed_ids = {str(f[0]) for f in follows}

    results = []
    for row in rows:
        cube_id = str(row[0])
        results.append(
            {
                "cube_id": cube_id,
                "game_count": row[1],
                "player_count": row[2],
                "last_played": row[3].isoformat() if row[3] else None,
                "is_following": cube_id in followed_ids,
            }
        )

    return {"results": results}

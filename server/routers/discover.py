# ruff: noqa: B008
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import BattlerFollow, CubeMetadata, GameRecord, PlayerGameHistory, User
from server.services.auth import get_optional_user

logger = logging.getLogger(__name__)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/discover", tags=["discover"])


PAGE_SIZE = 20


@router.get("")
def browse_cubes(
    offset: int = Query(default=0, ge=0),
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(_get_db),
):
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
            PlayerGameHistory.final_placement.isnot(None),
        )
        .group_by(GameRecord.cube_id)
        .order_by(func.count(distinct(GameRecord.id)).desc())
    )

    rows = base.offset(offset).limit(PAGE_SIZE + 1).all()
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]

    followed_ids: set[str] = set()
    if current_user:
        follows = db.query(BattlerFollow.cube_id).filter(BattlerFollow.user_id == current_user.id).all()
        followed_ids = {str(f[0]) for f in follows}

    cube_ids = [str(row[0]) for row in rows]
    metadata_rows = db.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_ids)).all()
    metadata_map = {str(m.cube_id): m for m in metadata_rows}

    results = []
    for row in rows:
        cube_id = str(row[0])
        meta = metadata_map.get(cube_id)
        results.append(
            {
                "cube_id": cube_id,
                "cube_name": str(meta.name) if meta and meta.name else None,
                "cube_image_uri": str(meta.image_uri) if meta and meta.image_uri else None,
                "game_count": row[1],
                "player_count": row[2],
                "last_played": row[3].isoformat() if row[3] else None,
                "is_following": cube_id in followed_ids,
            }
        )

    return {"results": results, "has_more": has_more}

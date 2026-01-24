from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, relationship


def _utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class GameRecord(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True)
    created_at = Column(DateTime, default=_utc_now)
    ended_at = Column(DateTime, nullable=True)
    final_state_json = Column(Text, nullable=True)
    winner_player_id = Column(String, nullable=True)

    players = relationship("GamePlayerRecord", back_populates="game")


class GamePlayerRecord(Base):
    __tablename__ = "game_players"

    game_id = Column(String, ForeignKey("games.id"), primary_key=True)
    player_id = Column(String, primary_key=True)
    player_name = Column(String, nullable=False)
    final_poison = Column(Integer, default=0)
    placement = Column(Integer, nullable=True)

    game = relationship("GameRecord", back_populates="players")

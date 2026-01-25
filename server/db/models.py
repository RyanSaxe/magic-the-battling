from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
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
    config_json = Column(Text, nullable=True)

    players = relationship("GamePlayerRecord", back_populates="game")


class GamePlayerRecord(Base):
    __tablename__ = "game_players"

    game_id = Column(String, ForeignKey("games.id"), primary_key=True)
    player_id = Column(String, primary_key=True)
    player_name = Column(String, nullable=False)
    final_poison = Column(Integer, default=0)
    placement = Column(Integer, nullable=True)
    is_bot = Column(Boolean, default=False)

    game = relationship("GameRecord", back_populates="players")


class PlayerGameHistory(Base):
    __tablename__ = "player_game_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    player_name = Column(String, nullable=False)
    battler_elo = Column(Float, nullable=False, index=True)
    max_stage = Column(Integer, nullable=False)
    max_round = Column(Integer, nullable=False)
    final_placement = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_utc_now)

    snapshots = relationship("BattleSnapshot", back_populates="player_history")


class BattleSnapshot(Base):
    __tablename__ = "battle_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_history_id = Column(Integer, ForeignKey("player_game_history.id"), nullable=False)
    stage = Column(Integer, nullable=False)
    round = Column(Integer, nullable=False)

    hand_json = Column(Text, nullable=False)
    vanguard_json = Column(Text, nullable=True)
    basic_lands_json = Column(Text, nullable=False)
    applied_upgrades_json = Column(Text, nullable=False)
    treasures = Column(Integer, nullable=False)

    full_state_json = Column(Text, nullable=False)

    player_history = relationship("PlayerGameHistory", back_populates="snapshots")

    __table_args__ = (Index("ix_snapshot_lookup", "player_history_id", "stage", "round"),)

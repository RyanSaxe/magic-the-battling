# ty (the Rust type checker) does not understand SQLAlchemy's Column descriptor
# protocol. Assigning plain Python values to Column-typed attributes is valid at
# runtime but ty reports invalid-assignment. Suppress with `ty: ignore` until ty
# adds SQLAlchemy support. See usages in game_manager.py, ops_manager.py, and
# share_preview.py.
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
    shared = Column(Boolean, default=False)
    cube_id = Column(String, nullable=True)

    players = relationship("GamePlayerRecord", back_populates="game")


class GamePlayerRecord(Base):
    __tablename__ = "game_players"

    game_id = Column(String, ForeignKey("games.id"), primary_key=True)
    player_id = Column(String, primary_key=True)
    player_name = Column(String, nullable=False)
    final_poison = Column(Integer, default=0)
    placement = Column(Integer, nullable=True)
    is_puppet = Column(Boolean, default=False)
    user_id = Column(String, nullable=True)

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
    is_puppet = Column(Boolean, default=False)
    source_history_id = Column(Integer, ForeignKey("player_game_history.id"), nullable=True)
    poison_history_json = Column(Text, nullable=True)
    user_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utc_now)

    snapshots = relationship(
        "BattleSnapshot", back_populates="player_history", foreign_keys="BattleSnapshot.player_history_id"
    )


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
    poison = Column(Integer, nullable=True)
    play_draw_preference = Column(String, nullable=True)

    full_state_json = Column(Text, nullable=False)

    player_history = relationship("PlayerGameHistory", back_populates="snapshots")

    __table_args__ = (Index("ix_snapshot_lookup", "player_history_id", "stage", "round"),)


class ActiveGameSnapshot(Base):
    __tablename__ = "active_game_snapshots"

    game_id = Column(String, primary_key=True)
    state_json = Column(Text, nullable=False)
    last_human_activity_at = Column(DateTime, default=_utc_now, nullable=False)
    updated_at = Column(DateTime, default=_utc_now, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=True, unique=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    battlers = relationship("UserBattler", back_populates="user", cascade="all, delete-orphan")
    follows = relationship("BattlerFollow", back_populates="user", cascade="all, delete-orphan")


class UserBattler(Base):
    __tablename__ = "user_battlers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    cube_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    use_upgrades = Column(Boolean, default=True)
    use_vanguards = Column(Boolean, default=False)
    play_mode = Column(String, default="limited")
    puppet_count = Column(Integer, default=0)
    target_player_count = Column(Integer, default=4)
    auto_approve_spectators = Column(Boolean, default=False)
    guided_mode_default = Column(Boolean, default=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utc_now)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now)

    user = relationship("User", back_populates="battlers")

    __table_args__ = (
        Index("ix_user_battlers_user_id", "user_id"),
        Index("ix_user_battlers_cube_id", "cube_id"),
    )


class BattlerFollow(Base):
    __tablename__ = "battler_follows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    cube_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utc_now)

    user = relationship("User", back_populates="follows")

    __table_args__ = (
        Index("ix_battler_follows_user_id", "user_id"),
        UniqueConstraint("cube_id", "user_id", name="uq_battler_follows_cube_user"),
    )


class OpsState(Base):
    __tablename__ = "ops_state"

    id = Column(Integer, primary_key=True)
    mode = Column(String, nullable=False, default="normal")
    message = Column(Text, nullable=True)
    updated_by = Column(String, nullable=True)
    updated_at = Column(DateTime, default=_utc_now, nullable=False)

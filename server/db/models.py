"""SQLAlchemy ORM models for games, users, histories, snapshots, and cube metadata."""

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class GameRecord(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    final_state_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    winner_player_id: Mapped[str | None] = mapped_column(String, nullable=True)
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared: Mapped[bool | None] = mapped_column(Boolean, default=False)
    cube_id: Mapped[str | None] = mapped_column(String, nullable=True)

    players: Mapped[list["GamePlayerRecord"]] = relationship("GamePlayerRecord", back_populates="game")


class GamePlayerRecord(Base):
    __tablename__ = "game_players"

    game_id: Mapped[str] = mapped_column(String, ForeignKey("games.id"), primary_key=True)
    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    player_name: Mapped[str] = mapped_column(String, nullable=False)
    final_poison: Mapped[int | None] = mapped_column(Integer, default=0)
    placement: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_puppet: Mapped[bool | None] = mapped_column(Boolean, default=False)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    seat_token_hash: Mapped[str | None] = mapped_column(String, nullable=True)

    game: Mapped["GameRecord"] = relationship("GameRecord", back_populates="players")


class PlayerGameHistory(Base):
    __tablename__ = "player_game_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String, ForeignKey("games.id"), nullable=False)
    player_name: Mapped[str] = mapped_column(String, nullable=False)
    battler_elo: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    max_stage: Mapped[int] = mapped_column(Integer, nullable=False)
    max_round: Mapped[int] = mapped_column(Integer, nullable=False)
    final_placement: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_poison: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_treasures: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_puppet: Mapped[bool | None] = mapped_column(Boolean, default=False)
    source_history_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("player_game_history.id"), nullable=True)
    poison_history_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)

    snapshots: Mapped[list["BattleSnapshot"]] = relationship(
        "BattleSnapshot", back_populates="player_history", foreign_keys="BattleSnapshot.player_history_id"
    )


class BattleSnapshot(Base):
    __tablename__ = "battle_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    player_history_id: Mapped[int] = mapped_column(Integer, ForeignKey("player_game_history.id"), nullable=False)
    stage: Mapped[int] = mapped_column(Integer, nullable=False)
    round: Mapped[int] = mapped_column(Integer, nullable=False)

    hand_json: Mapped[str] = mapped_column(Text, nullable=False)
    vanguard_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    basic_lands_json: Mapped[str] = mapped_column(Text, nullable=False)
    applied_upgrades_json: Mapped[str] = mapped_column(Text, nullable=False)
    treasures: Mapped[int] = mapped_column(Integer, nullable=False)
    poison: Mapped[int | None] = mapped_column(Integer, nullable=True)
    play_draw_preference: Mapped[str | None] = mapped_column(String, nullable=True)
    # Who this build faced in the round; older rows, recorded before pairings were kept, hold NULL.
    opponent_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Sudden Death rebuilds share their round with the fight that sent players to it: 1 for the first, 2 after a
    # drawn one. NULL marks an ordinary build, including every build saved before Sudden Death builds were kept.
    sudden_death_build: Mapped[int | None] = mapped_column(Integer, nullable=True)

    full_state_json: Mapped[str] = mapped_column(Text, nullable=False)

    player_history: Mapped["PlayerGameHistory"] = relationship("PlayerGameHistory", back_populates="snapshots")

    __table_args__ = (Index("ix_snapshot_lookup", "player_history_id", "stage", "round"),)


class ActiveGameSnapshot(Base):
    __tablename__ = "active_game_snapshots"

    game_id: Mapped[str] = mapped_column(String, primary_key=True)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)
    last_human_activity_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)


class QuarantinedGameSnapshot(Base):
    """An active game snapshot the server could not restore, kept so a later fix can bring the game back."""

    __tablename__ = "quarantined_game_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    state_json: Mapped[str] = mapped_column(Text, nullable=False)
    last_human_activity_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    error: Mapped[str] = mapped_column(Text, nullable=False)
    quarantined_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now, onupdate=_utc_now)

    battlers: Mapped[list["UserBattler"]] = relationship(
        "UserBattler", back_populates="user", cascade="all, delete-orphan"
    )
    follows: Mapped[list["BattlerFollow"]] = relationship(
        "BattlerFollow", back_populates="user", cascade="all, delete-orphan"
    )


# Usernames and emails keep the case people typed, but two accounts can't differ only by case. init_db adds these
# to databases made before them.
LOWERCASE_UNIQUE_USER_INDEXES = (
    Index("ix_users_username_lower", func.lower(User.username), unique=True),
    Index("ix_users_email_lower", func.lower(User.email), unique=True),
)


class UserBattler(Base):
    __tablename__ = "user_battlers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    cube_id: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    use_upgrades: Mapped[bool] = mapped_column(Boolean, default=True)
    use_vanguards: Mapped[bool] = mapped_column(Boolean, default=False)
    play_mode: Mapped[str] = mapped_column(String, default="limited")
    puppet_count: Mapped[int] = mapped_column(Integer, default=0)
    target_player_count: Mapped[int] = mapped_column(Integer, default=4)
    auto_approve_spectators: Mapped[bool] = mapped_column(Boolean, default=False)
    guided_mode_default: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now, onupdate=_utc_now)

    user: Mapped["User"] = relationship("User", back_populates="battlers")

    __table_args__ = (
        Index("ix_user_battlers_user_id", "user_id"),
        Index("ix_user_battlers_cube_id", "cube_id"),
        # Without AUTOINCREMENT SQLite gives the next preset one more than the highest id left, so deleted ids return.
        {"sqlite_autoincrement": True},
    )


class BattlerFollow(Base):
    __tablename__ = "battler_follows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    cube_id: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)

    user: Mapped["User"] = relationship("User", back_populates="follows")

    __table_args__ = (
        Index("ix_battler_follows_user_id", "user_id"),
        UniqueConstraint("cube_id", "user_id", name="uq_battler_follows_cube_user"),
    )


class CubeMetadata(Base):
    __tablename__ = "cube_metadata"

    cube_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    image_uri: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_utc_now)


class OpsState(Base):
    __tablename__ = "ops_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String, nullable=False, default="normal")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)

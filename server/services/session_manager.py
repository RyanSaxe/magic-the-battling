import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta


@dataclass
class Session:
    session_id: str
    player_id: str
    game_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class SessionManager:
    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._player_to_session: dict[str, str] = {}

    def create_session(self, game_id: str | None = None) -> Session:
        session_id = secrets.token_urlsafe(16)
        player_id = secrets.token_urlsafe(8)
        session = Session(
            session_id=session_id,
            player_id=player_id,
            game_id=game_id,
            created_at=datetime.now(UTC),
            last_seen_at=datetime.now(UTC),
        )
        self._sessions[session_id] = session
        self._player_to_session[player_id] = session_id
        return session

    def get_session(self, session_id: str) -> Session | None:
        session = self._sessions.get(session_id)
        if session is not None:
            session.last_seen_at = datetime.now(UTC)
        return session

    def update_game_id(self, session_id: str, game_id: str) -> None:
        session = self.get_session(session_id)
        if session:
            session.game_id = game_id

    def size(self) -> int:
        return len(self._sessions)

    def cleanup(self, ttl_minutes: int, max_total: int) -> int:
        now = datetime.now(UTC)
        expiry = now - timedelta(minutes=ttl_minutes)
        removed = 0

        for session_id, session in list(self._sessions.items()):
            if session.last_seen_at < expiry:
                self._sessions.pop(session_id, None)
                self._player_to_session.pop(session.player_id, None)
                removed += 1

        total = len(self._sessions)
        if total <= max_total:
            return removed

        overflow = total - max_total
        oldest = sorted(self._sessions.values(), key=lambda s: s.last_seen_at)[:overflow]
        for session in oldest:
            self._sessions.pop(session.session_id, None)
            self._player_to_session.pop(session.player_id, None)
            removed += 1

        return removed


session_manager = SessionManager()

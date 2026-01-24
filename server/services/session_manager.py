import secrets
from dataclasses import dataclass


@dataclass
class Session:
    session_id: str
    player_id: str
    game_id: str | None = None


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
        )
        self._sessions[session_id] = session
        self._player_to_session[player_id] = session_id
        return session

    def get_session(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def get_player_id(self, session_id: str) -> str | None:
        session = self.get_session(session_id)
        return session.player_id if session else None

    def get_session_by_player(self, player_id: str) -> Session | None:
        session_id = self._player_to_session.get(player_id)
        return self._sessions.get(session_id) if session_id else None

    def update_game_id(self, session_id: str, game_id: str) -> None:
        session = self.get_session(session_id)
        if session:
            session.game_id = game_id

    def remove_session(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session:
            self._player_to_session.pop(session.player_id, None)


session_manager = SessionManager()

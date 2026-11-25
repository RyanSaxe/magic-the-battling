"""Spectate requests: asking to watch a player, the player's answer, and admitting approved spectators."""

from datetime import UTC, datetime

from server.services.game.state import GameManagerState
from server.services.spectate_requests import SpectateRequest


class SpectatorService(GameManagerState):
    def create_spectate_request(self, game_id: str, target_player_name: str, *, spectator_name: str) -> SpectateRequest:
        """Ask to watch a player. Open Spectating approves it at once; otherwise it waits for the player's answer.

        Raises TooManySpectateRequestsError when the server holds too many requests.
        """
        self.cleanup_expired_spectate_requests()
        request = self._spectate_requests.create(
            game_id,
            target_player_name,
            spectator_name=spectator_name,
            approve=self._auto_approves_spectators(game_id),
        )
        if request.status == "pending":
            self._spectate_listener.spectate_requests_changed(game_id, target_player_name)
        return request

    def _auto_approves_spectators(self, game_id: str) -> bool:
        pending = self._pending_games.get(game_id)
        if pending is not None:
            return pending.auto_approve_spectators
        game = self._active_games.get(game_id)
        return game is not None and game.config.auto_approve_spectators

    def get_spectate_request(self, game_id: str, request_id: str) -> SpectateRequest | None:
        request = self._spectate_requests.get(request_id)
        return request if request is not None and request.game_id == game_id else None

    def pending_spectate_requests(self, game_id: str, target_player_name: str) -> list[SpectateRequest]:
        return self._spectate_requests.pending_for(game_id, target_player_name)

    def respond_to_spectate_request(self, request_id: str, *, game_id: str, responder_id: str, allowed: bool) -> bool:
        """Approve or deny a pending request; only the player it asks to watch may answer it.

        The responder's requests are sent again either way, since they answered from what their screen showed.
        """
        responder_name = self.get_player_name(responder_id)
        request = self.get_spectate_request(game_id, request_id)
        answered = (
            request is not None
            and self.get_player_id_by_name(game_id, request.target_player_name) == responder_id
            and self._spectate_requests.answer(request, allowed=allowed)
        )
        if responder_name is not None:
            self._spectate_listener.spectate_requests_changed(game_id, responder_name)
        return answered

    def cancel_spectate_request(self, game_id: str, request_id: str) -> SpectateRequest | None:
        """Withdraw a request that is still pending. Returns the request, in whatever status it has now."""
        request = self.get_spectate_request(game_id, request_id)
        if request is not None and self._spectate_requests.cancel(request):
            self._spectate_listener.spectate_requests_changed(game_id, request.target_player_name)
        return request

    def admit_spectator(self, request_id: str, *, session_id: str, game_id: str, target_player_name: str) -> bool:
        return self._spectate_requests.admit(
            request_id, session_id=session_id, game_id=game_id, target_player_name=target_player_name
        )

    def cleanup_expired_spectate_requests(self, now: datetime | None = None) -> None:
        expired = self._spectate_requests.expire(now or datetime.now(UTC))
        for game_id, target_player_name in {(r.game_id, r.target_player_name) for r in expired}:
            self._spectate_listener.spectate_requests_changed(game_id, target_player_name)

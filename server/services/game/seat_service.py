"""A player's seats across games: status checks, resumable games, reclaiming a seat on another device,
closing a seat, and the per-player game views."""

import json
import secrets
from collections.abc import Callable, Collection
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import func
from sqlalchemy.orm import Session

import server.db.database as db
from mtb.models.game import (
    Config,
    Game,
)
from server.db.models import (
    ActiveGameSnapshot,
    CubeMetadata,
    GamePlayerRecord,
)
from server.schemas.api import (
    GameBootstrapResponse,
    GameStateResponse,
    GameStatusResponse,
    ResumableGame,
    ResumableSeat,
)
from server.services.game.lobby_service import LobbyService
from server.services.game.models import LOBBY_STARTING_MESSAGE, PendingGame, SeatClaim, SeatCloseRefusedError
from server.services.game.state import _utc_or_default
from server.services.game.view_builder import (
    build_active_game_status,
    build_game_bootstrap,
    build_game_state,
    build_pending_game_status,
    build_snapshot_game_status,
)
from server.services.seat_tokens import (
    SeatClaimRefusal,
    SeatClaimRefusedError,
    hash_seat_token,
    holds_seat,
    seat_claim_refusal,
    seat_token_matches,
    token_after_claim,
)

FINISHED_PLAYER_PHASES = frozenset({"eliminated", "winner", "game_over"})


SEAT_SHARED_MESSAGE = "Other players are still in this game, so it can't be closed yet."


def _extract_snapshot_status(
    session: Session, game_id: str
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]] | None:
    row = (
        session.query(
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.config"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.config"),
            ).label("config_json"),
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.players"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.players"),
            ).label("players_json"),
            func.coalesce(
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.puppets"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.data.fake_players"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.puppets"),
                func.json_extract(ActiveGameSnapshot.state_json, "$.fake_players"),
                "[]",
            ).label("puppets_json"),
        )
        .filter(ActiveGameSnapshot.game_id == game_id)
        .first()
    )
    if row is None or row.players_json is None:
        return None
    config = json.loads(row.config_json) if row.config_json else {}
    players = json.loads(row.players_json)
    puppets = json.loads(row.puppets_json) if row.puppets_json else []
    return config, players, puppets


@dataclass(frozen=True)
class _RunningSeat:
    """Where a seat stands in a started game, read from the live game or from its snapshot."""

    config: Config
    player_count: int
    can_close: bool
    stage: int
    round: int
    poison: int
    phase: str


def _game_can_close(human_count: int) -> bool:
    return human_count == 1


def _running_seat_in_game(game: Game, player_name: str) -> _RunningSeat | None:
    player = next((p for p in game.players if p.name == player_name), None)
    if player is None:
        return None
    return _RunningSeat(
        config=game.config,
        player_count=len(game.players) + len(game.puppets),
        can_close=_game_can_close(len(game.players)),
        stage=player.stage,
        round=player.round,
        poison=player.poison,
        phase=player.phase,
    )


def _running_seat_in_snapshot(
    config: dict[str, Any], players: list[dict[str, Any]], *, puppet_count: int, player_name: str
) -> _RunningSeat | None:
    player = next((p for p in players if p.get("name") == player_name), None)
    if player is None:
        return None
    return _RunningSeat(
        config=Config.model_validate(config),
        player_count=len(players) + puppet_count,
        can_close=_game_can_close(len(players)),
        stage=player["stage"],
        round=player["round"],
        poison=player["poison"],
        phase=player["phase"],
    )


def _resumable_lobby_seat(seat: ResumableSeat, pending: PendingGame) -> ResumableGame:
    return ResumableGame(
        game_id=seat.game_id,
        player_name=seat.player_name,
        kind="lobby",
        cube_id=pending.cube_id,
        play_mode=pending.play_mode,
        use_upgrades=pending.use_upgrades,
        player_count=len(pending.player_names) + pending.puppet_count,
        can_close=pending.accepts_changes,
    )


def _resumable_game_seat(
    seat: ResumableSeat, running: _RunningSeat, *, last_active_at: datetime | None
) -> ResumableGame:
    return ResumableGame(
        game_id=seat.game_id,
        player_name=seat.player_name,
        kind="game",
        last_active_at=last_active_at,
        cube_id=running.config.cube_id,
        play_mode=running.config.play_mode,
        use_upgrades=running.config.use_upgrades,
        player_count=running.player_count,
        can_close=running.can_close,
        stage=running.stage,
        round=running.round,
        poison=running.poison,
    )


def _lobbies_then_latest_game(game: ResumableGame) -> tuple[bool, datetime]:
    return game.kind == "lobby", _utc_or_default(game.last_active_at, datetime.min.replace(tzinfo=UTC))


def _with_cube_metadata(session: Session, games: list[ResumableGame]) -> list[ResumableGame]:
    cube_ids = {game.cube_id for game in games}
    metadata = {
        cast(str, row.cube_id): row for row in session.query(CubeMetadata).filter(CubeMetadata.cube_id.in_(cube_ids))
    }
    return [
        game.model_copy(
            update={
                "cube_name": cast(str | None, meta.name) if (meta := metadata.get(game.cube_id)) else None,
                "cube_image_uri": cast(str | None, meta.image_uri) if meta else None,
            }
        )
        for game in games
    ]


class SeatService(LobbyService):
    def get_game_status(
        self,
        game_id: str,
        *,
        connected_player_ids: Collection[str] = (),
    ) -> GameStatusResponse | None:
        pending = self._pending_games.get(game_id)
        if pending is not None:
            return build_pending_game_status(
                game_id,
                player_names=pending.player_names,
                player_ids=pending.player_ids,
                is_started=pending.is_started,
                auto_approve_spectators=pending.auto_approve_spectators,
                connected_player_ids=connected_player_ids,
            )

        game = self._active_games.get(game_id)
        if game is not None:
            connected_names = {
                player.name
                for player in game.players
                if (pid := self.get_player_id_by_name(game_id, player.name)) is not None and pid in connected_player_ids
            }
            return build_active_game_status(game_id, game, connected_player_names=connected_names)

        session = db.SessionLocal()
        try:
            snapshot = _extract_snapshot_status(session, game_id)
        except Exception:
            return None
        finally:
            session.close()
        if snapshot is None:
            return None
        config, players, puppets = snapshot
        return build_snapshot_game_status(game_id, config=config, players=players, puppets=puppets)

    def can_rejoin(
        self,
        game_id: str,
        player_name: str,
        is_player_connected: Callable[[str, str], bool] | None = None,
    ) -> bool:
        game = self._active_games.get(game_id)
        if game is not None:
            if not any(p.name == player_name for p in game.players):
                return False
            player_id = self.get_player_id_by_name(game_id, player_name)
            if player_id and is_player_connected:
                return not is_player_connected(game_id, player_id)
            return True

        session = db.SessionLocal()
        try:
            snapshot = _extract_snapshot_status(session, game_id)
        except Exception:
            return False
        finally:
            session.close()
        if snapshot is None:
            return False
        _, players, _ = snapshot
        return any(player.get("name") == player_name for player in players)

    def find_resumable_seats(self, seats: list[ResumableSeat], *, user_id: str | None = None) -> list[ResumableGame]:
        """The seats a caller can still return to: those its browser holds tokens for, and those its account took.

        One seat per game, the browser's first. Either proof closes a seat, so can_close follows the game's own rule.
        Never restores a snapshot."""
        session = db.SessionLocal()
        try:
            account_seats = self._account_seats(session, user_id) if user_id else set()
            seats = [
                *seats,
                *(
                    ResumableSeat(game_id=game_id, player_name=name, seat_token="")
                    for game_id, name in sorted(account_seats)
                ),
            ]
            stored_game_ids = [seat.game_id for seat in seats if seat.game_id not in self._pending_games]
            stored_hashes = {
                (cast(str, row.game_id), cast(str, row.player_name)): cast(str | None, row.seat_token_hash)
                for row in session.query(GamePlayerRecord).filter(
                    GamePlayerRecord.game_id.in_(stored_game_ids),
                    GamePlayerRecord.is_puppet.is_(False),
                )
            }
            # json_extract keeps the snapshot's card registry out of Python; only the seats are parsed.
            snapshots = {
                cast(str, row.game_id): row
                for row in session.query(
                    ActiveGameSnapshot.game_id,
                    ActiveGameSnapshot.last_human_activity_at,
                    func.json_extract(ActiveGameSnapshot.state_json, "$.data.config").label("config_json"),
                    func.json_extract(ActiveGameSnapshot.state_json, "$.data.players").label("players_json"),
                    func.coalesce(
                        func.json_array_length(ActiveGameSnapshot.state_json, "$.data.puppets"),
                        func.json_array_length(ActiveGameSnapshot.state_json, "$.data.fake_players"),
                        0,
                    ).label("puppet_count"),
                ).filter(ActiveGameSnapshot.game_id.in_(stored_game_ids))
            }

            resumable: list[ResumableGame] = []
            listed_game_ids: set[str] = set()
            for seat in seats:
                if seat.game_id in listed_game_ids:
                    continue
                key = (seat.game_id, seat.player_name)
                pending = self._pending_games.get(seat.game_id)
                if pending is not None and not pending.is_started:
                    holds_token = seat_token_matches(seat.seat_token, pending.seat_token_hashes.get(seat.player_name))
                    entry = _resumable_lobby_seat(seat, pending) if holds_token or key in account_seats else None
                elif seat_token_matches(seat.seat_token, stored_hashes.get(key)) or key in account_seats:
                    entry = self._resumable_running_seat(seat, snapshots=snapshots)
                else:
                    entry = None
                if entry is not None:
                    resumable.append(entry)
                    listed_game_ids.add(seat.game_id)

            if user_id:
                # Each device saw different seats last, so an account's list goes by the games' own activity.
                resumable.sort(key=_lobbies_then_latest_game, reverse=True)
            return _with_cube_metadata(session, resumable)
        finally:
            session.close()

    def _resumable_running_seat(self, seat: ResumableSeat, *, snapshots: dict[str, Any]) -> ResumableGame | None:
        game = self._active_games.get(seat.game_id)
        if game is not None:
            running = _running_seat_in_game(game, seat.player_name)
            last_active_at = self._last_human_activity.get(seat.game_id)
        elif (snapshot := snapshots.get(seat.game_id)) is not None:
            running = _running_seat_in_snapshot(
                json.loads(snapshot.config_json),
                json.loads(snapshot.players_json),
                puppet_count=snapshot.puppet_count,
                player_name=seat.player_name,
            )
            last_active_at = _utc_or_default(snapshot.last_human_activity_at, datetime.now(UTC))
        else:
            return None
        if running is None or running.phase in FINISHED_PLAYER_PHASES:
            return None
        return _resumable_game_seat(seat, running, last_active_at=last_active_at)

    def _account_seats(self, session: Session, user_id: str) -> set[tuple[str, str]]:
        # This runs off the event loop, so it reads copies of the dicts that games are added to and removed from.
        lobby_seats = {
            (game_id, name)
            for game_id, pending in list(self._pending_games.items())
            if not pending.is_started
            for player_id, name in zip(pending.player_ids, pending.player_names, strict=False)
            if pending.player_user_ids.get(player_id) == user_id
        }
        # game_players has no index on user_id, so only games still in play are searched, by their id.
        game_ids = set(self._active_games.copy())
        game_ids.update(cast(str, row.game_id) for row in session.query(ActiveGameSnapshot.game_id))
        game_seats = {
            (cast(str, row.game_id), cast(str, row.player_name))
            for row in session.query(GamePlayerRecord.game_id, GamePlayerRecord.player_name).filter(
                GamePlayerRecord.game_id.in_(game_ids),
                GamePlayerRecord.user_id == user_id,
                GamePlayerRecord.is_puppet.is_(False),
            )
        }
        return lobby_seats | game_seats

    def reclaim_seat(
        self,
        game_id: str,
        player_name: str,
        *,
        seat_token: str | None,
        user_id: str | None,
    ) -> SeatClaim:
        """Give the named seat back to a caller who owns it: its player id, and the seat token to keep.

        The player id stays the same, so spectators and lobby state keep following the seat; the newest socket
        for it replaces the older one. Raises SeatClaimRefusedError when the game or seat is gone, or the caller
        does not own the seat."""
        pending = self._pending_games.get(game_id)
        if pending is not None and not pending.is_started:
            return self._reclaim_lobby_seat(pending, player_name, seat_token=seat_token, user_id=user_id)

        if game_id not in self._active_games:
            self.restore_game_from_snapshot(game_id)
        game = self._active_games.get(game_id)
        if game is None:
            raise SeatClaimRefusedError(SeatClaimRefusal.GAME_NOT_FOUND)
        if not any(p.name == player_name for p in game.players):
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)

        session = db.SessionLocal()
        try:
            record = (
                session.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player_name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .first()
            )
            stored_hash = cast(str | None, record.seat_token_hash) if record else None
            refusal = seat_claim_refusal(
                stored_hash=stored_hash,
                owner_user_id=cast(str | None, record.user_id) if record else None,
                seat_token=seat_token,
                user_id=user_id,
            )
            if refusal is not None:
                raise SeatClaimRefusedError(refusal)

            player_id = self.get_player_id_by_name(game_id, player_name) or secrets.token_urlsafe(8)
            self._player_to_game[player_id] = game_id
            self._player_id_to_name[player_id] = player_name
            claimed_token = token_after_claim(seat_token, stored_hash)
            self._persist_human_player_mappings(
                session,
                game_id,
                player_pairs=[(player_id, player_name)],
                seat_token_hashes={player_name: hash_seat_token(claimed_token)},
            )
            session.commit()
        finally:
            session.close()
        return SeatClaim(player_id=player_id, seat_token=claimed_token)

    def _reclaim_lobby_seat(
        self,
        pending: PendingGame,
        player_name: str,
        *,
        seat_token: str | None,
        user_id: str | None,
    ) -> SeatClaim:
        if player_name not in pending.player_names:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)
        player_id = pending.player_ids[pending.player_names.index(player_name)]
        stored_hash = pending.seat_token_hashes.get(player_name)
        refusal = seat_claim_refusal(
            stored_hash=stored_hash,
            owner_user_id=pending.player_user_ids.get(player_id),
            seat_token=seat_token,
            user_id=user_id,
        )
        if refusal is not None:
            raise SeatClaimRefusedError(refusal)
        claimed_token = token_after_claim(seat_token, stored_hash)
        pending.seat_token_hashes[player_name] = hash_seat_token(claimed_token)
        return SeatClaim(player_id=player_id, seat_token=claimed_token)

    def close_seat(self, game_id: str, player_name: str, *, seat_token: str, user_id: str | None) -> str | None:
        """End the named seat for good, for a caller with its token or its account. Returns the player id it had.

        A lobby seat leaves the lobby. A started game is retired, so only a game with no other human can close:
        with others in it, every round would wait on the seat that left. Raises SeatClaimRefusedError when the
        caller doesn't hold such a seat, and SeatCloseRefusedError when it can't end now."""
        pending = self._pending_games.get(game_id)
        if pending is not None and not pending.is_started:
            return self._close_lobby_seat(pending, player_name, seat_token=seat_token, user_id=user_id)

        if game_id not in self._active_games:
            self.restore_game_from_snapshot(game_id)
        game = self._active_games.get(game_id)
        if game is None:
            raise SeatClaimRefusedError(SeatClaimRefusal.GAME_NOT_FOUND)
        player = next((p for p in game.players if p.name == player_name), None)
        if player is None or player.phase in FINISHED_PLAYER_PHASES:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)

        session = db.SessionLocal()
        try:
            record = (
                session.query(GamePlayerRecord)
                .filter(
                    GamePlayerRecord.game_id == game_id,
                    GamePlayerRecord.player_name == player_name,
                    GamePlayerRecord.is_puppet.is_(False),
                )
                .first()
            )
            if not holds_seat(
                stored_hash=cast(str | None, record.seat_token_hash) if record else None,
                owner_user_id=cast(str | None, record.user_id) if record else None,
                seat_token=seat_token,
                user_id=user_id,
            ):
                raise SeatClaimRefusedError(SeatClaimRefusal.TOKEN_REQUIRED)
            if not _game_can_close(len(game.players)):
                raise SeatCloseRefusedError(SEAT_SHARED_MESSAGE)

            player_id = self.get_player_id_by_name(game_id, player_name)
            self._retire_games(session, {game_id})
        finally:
            session.close()
        self._cleanup_game(game_id)
        return player_id

    def _close_lobby_seat(self, pending: PendingGame, player_name: str, *, seat_token: str, user_id: str | None) -> str:
        if player_name not in pending.player_names:
            raise SeatClaimRefusedError(SeatClaimRefusal.SEAT_NOT_FOUND)
        player_id = pending.player_ids[pending.player_names.index(player_name)]
        if not holds_seat(
            stored_hash=pending.seat_token_hashes.get(player_name),
            owner_user_id=pending.player_user_ids.get(player_id),
            seat_token=seat_token,
            user_id=user_id,
        ):
            raise SeatClaimRefusedError(SeatClaimRefusal.TOKEN_REQUIRED)
        if not pending.accepts_changes:
            raise SeatCloseRefusedError(LOBBY_STARTING_MESSAGE)
        self._remove_lobby_seat(pending, player_id)
        return player_id

    def get_game_state(self, game_id: str, player_id: str) -> GameStateResponse | None:
        game = self._active_games.get(game_id)
        if not game:
            return None

        player = self.get_player(game, player_id)
        if not player:
            return None

        return build_game_state(game, player, game_id=game_id)

    def get_game_bootstrap(self, game_id: str, player_id: str) -> GameBootstrapResponse | None:
        game = self._active_games.get(game_id)
        if game is None:
            return None

        player = self.get_player(game, player_id)
        if player is None:
            return None

        return build_game_bootstrap(game, player, game_id=game_id)

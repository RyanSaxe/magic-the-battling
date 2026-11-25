"""Choosing puppets, past players of the same cube and settings, to fill a game's empty seats."""

import json
import random
from typing import Any

from sqlalchemy import true as sql_true
from sqlalchemy.orm import Session, joinedload

import server.db.database as db
from mtb.models.game import (
    Game,
    Puppet,
    StaticOpponent,
    restore_snapshot_data,
)
from mtb.models.types import PlayMode, normalize_play_mode
from server.db.models import (
    GameRecord,
    PlayerGameHistory,
)
from server.services.game.models import BattlerReady, PendingGame
from server.services.game.state import GameManagerState


def _history_config(db: Session, history: PlayerGameHistory) -> dict[str, Any] | None:
    game_record = db.query(GameRecord).filter(GameRecord.id == history.game_id).first()
    if not game_record or not game_record.config_json:
        return None
    return json.loads(str(game_record.config_json))


def _config_matches(
    config: dict[str, Any], *, play_mode: PlayMode, use_upgrades: bool | None, use_vanguards: bool | None
) -> bool:
    raw_mode = config.get("play_mode")
    saved_play_mode = normalize_play_mode(str(raw_mode) if raw_mode is not None else None)
    if saved_play_mode != play_mode:
        return False
    if use_upgrades is not None and config.get("use_upgrades") != use_upgrades:
        return False
    return use_vanguards is None or config.get("use_vanguards") == use_vanguards


_MIN_PUPPET_STAGE = 3
_MIN_PUPPET_MAX_STAGE = 6


class PuppetLoader(GameManagerState):
    def _ensure_unique_name(self, name: str, existing_names: set[str]) -> str:
        """Return a unique version of the name, adding suffix if needed."""
        if name not in existing_names:
            return name
        counter = 2
        while f"{name} ({counter})" in existing_names:
            counter += 1
        return f"{name} ({counter})"

    def _is_suspicious_name(self, name: str) -> bool:
        if not name or len(name) <= 1:
            return True
        if name.isdigit():
            return True
        lower = name.lower()
        if lower in ("test", "testing", "asdf", "qwerty"):
            return True
        return len(set(lower)) == 1

    def _has_triple_same_basic(self, history: PlayerGameHistory) -> bool:
        first_snapshot = next((s for s in history.snapshots if s.stage == _MIN_PUPPET_STAGE and s.round == 1), None)
        # Can't verify without the first snapshot, skip to be safe
        if not first_snapshot:
            return True
        basics = json.loads(first_snapshot.basic_lands_json)
        return len(set(basics)) == 1

    def _is_usable_history(self, history: PlayerGameHistory) -> bool:
        has_starting_stage = any(s.stage == _MIN_PUPPET_STAGE for s in history.snapshots)
        return (
            has_starting_stage
            and not self._is_suspicious_name(str(history.player_name or ""))
            and not self._has_triple_same_basic(history)
        )

    def _find_historical_players(
        self,
        db: Session,
        target_elo: float,
        *,
        count: int,
        exclude_ids: list[int],
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
        play_mode: PlayMode = "limited",
    ) -> list[PlayerGameHistory]:
        play_mode = normalize_play_mode(play_mode)
        query = (
            db.query(PlayerGameHistory)
            .options(joinedload(PlayerGameHistory.snapshots))
            .filter(
                PlayerGameHistory.id.notin_(exclude_ids) if exclude_ids else sql_true(),
                PlayerGameHistory.max_stage >= _MIN_PUPPET_MAX_STAGE,
                PlayerGameHistory.is_puppet.is_(False),
            )
        )

        all_histories = query.all()
        same_cube: list[PlayerGameHistory] = []
        other_cube: list[PlayerGameHistory] = []

        for history in all_histories:
            if not self._is_usable_history(history):
                continue
            config = _history_config(db, history)
            if config is None or not _config_matches(
                config, play_mode=play_mode, use_upgrades=use_upgrades, use_vanguards=use_vanguards
            ):
                continue

            if play_mode == "limited" and cube_id and config.get("cube_id") == cube_id:
                same_cube.append(history)
            else:
                other_cube.append(history)

        elo_range = 200

        if target_elo:
            same_cube = [h for h in same_cube if abs(float(h.battler_elo) - target_elo) <= elo_range]
            other_cube = [h for h in other_cube if abs(float(h.battler_elo) - target_elo) <= elo_range]

        random.shuffle(same_cube)
        random.shuffle(other_cube)

        result = same_cube[:count]
        if len(result) < count:
            result.extend(other_cube[: count - len(result)])

        return result

    def _load_fake_player(self, db: Session, history: PlayerGameHistory, *, existing_names: set[str]) -> Puppet:
        _ = db
        snapshots_dict: dict[str, StaticOpponent] = {}
        player_name = str(history.player_name)
        history_id = int(history.id)

        bot_name = self._ensure_unique_name(player_name, existing_names)

        for snapshot in history.snapshots:
            # A puppet replays a past run one round at a time, so it keeps each round's ordinary build.
            if snapshot.sudden_death_build is not None:
                continue
            key = f"{snapshot.stage}_{snapshot.round}"
            snapshot_data = restore_snapshot_data(snapshot.full_state_json)
            static_opp = StaticOpponent.from_snapshot(snapshot_data, bot_name, history_id=history_id)
            snapshots_dict[key] = static_opp

        return Puppet(
            name=bot_name,
            player_history_id=history_id,
            snapshots=snapshots_dict,
        )

    def load_fake_players_for_game(
        self,
        db: Session,
        game: Game,
        *,
        count: int,
        target_elo: float,
        use_upgrades: bool | None = None,
        use_vanguards: bool | None = None,
        cube_id: str | None = None,
        play_mode: PlayMode = "limited",
    ) -> None:
        if count <= 0:
            return

        existing_names = {p.name for p in game.players}
        existing_names.update(fp.name for fp in game.puppets)

        histories = self._find_historical_players(
            db,
            target_elo,
            count=count,
            exclude_ids=[],
            use_upgrades=use_upgrades,
            use_vanguards=use_vanguards,
            cube_id=cube_id,
            play_mode=play_mode,
        )
        for history in histories:
            fake_player = self._load_fake_player(db, history, existing_names=existing_names)
            existing_names.add(fake_player.name)
            game.puppets.append(fake_player)

    def _get_pending_target_elo(self, pending: PendingGame) -> float | None:
        if pending.play_mode == "limited":
            if pending.battler is None:
                return None
            return pending.battler.elo or 1200.0

        elos = [
            entry.battler.elo
            for entry in pending.player_battlers.values()
            if isinstance(entry, BattlerReady) and entry.battler.elo
        ]
        if not elos:
            return None
        return sum(elos) / len(elos)

    def _count_available_bots(self, pending: PendingGame) -> int | None:
        target_elo = self._get_pending_target_elo(pending)
        if target_elo is None:
            return None

        max_puppets = 8 - len(pending.player_names)
        if max_puppets <= 0:
            return 0

        db_session = db.SessionLocal()
        try:
            histories = self._find_historical_players(
                db_session,
                target_elo,
                count=max_puppets,
                exclude_ids=[],
                use_upgrades=pending.use_upgrades,
                use_vanguards=pending.use_vanguards,
                cube_id=pending.cube_id if pending.play_mode == "limited" else None,
                play_mode=pending.play_mode,
            )
            return len(histories)
        finally:
            db_session.close()

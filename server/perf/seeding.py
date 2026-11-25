"""Database source resolution and synthetic puppet history seeding."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from server.perf.models import PUPPET_HISTORY_ELO_WINDOW


def resolve_db_source(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    if env_path := os.getenv("DATABASE_PATH"):
        return Path(env_path).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "data" / "mtb.db").resolve()


def _mock_snapshot_card(seed: str, idx: int) -> dict[str, Any]:
    sid = f"seed-{seed}-{idx:02d}"
    return {
        "id": sid,
        "scryfall_id": sid,
        "upgrade_target": None,
        "original_owner": None,
    }


def _mock_snapshot_card_data(seed: str, idx: int) -> tuple[str, dict[str, Any]]:
    sid = f"seed-{seed}-{idx:02d}"
    return sid, {
        "name": f"seed_card_{seed}_{idx}",
        "image_url": f"https://example.invalid/seed/{seed}/{idx}.jpg",
        "type_line": "creature",
        "flip_image_url": None,
        "png_url": None,
        "flip_png_url": None,
        "elo": 0.0,
        "oracle_text": None,
        "colors": [],
        "keywords": [],
        "cmc": 0.0,
        "life_modifier": None,
        "hand_modifier": None,
        "token_scryfall_ids": [],
    }


def _seed_history_payload(seed: int) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    hand = [_mock_snapshot_card(str(seed), idx) for idx in range(7)]
    registry: dict[str, Any] = {}
    for idx in range(7):
        sid, card_data = _mock_snapshot_card_data(str(seed), idx)
        registry[sid] = card_data
    basics = ["Plains", "Island", "Swamp"]
    snapshot_data = {
        "hand": hand,
        "vanguard": None,
        "basic_lands": basics,
        "applied_upgrades": [],
        "upgrades": [],
        "treasures": 1,
        "sideboard": [],
        "command_zone": [],
        "poison": 0,
        "play_draw_preference": "play",
    }
    full_state = {"data": snapshot_data, "card_registry": registry}
    return full_state, hand, basics


def _is_suspicious_name(name: str) -> bool:
    if not name or len(name) <= 1 or name.isdigit():
        return True
    lower = name.lower()
    if lower in ("test", "testing", "asdf", "qwerty"):
        return True
    return len(set(lower)) == 1


def _is_varied_basics_json(raw: object) -> bool:
    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if not isinstance(raw, str):
        raw = str(raw)
    if not raw:
        return False
    try:
        basics = json.loads(raw)
    except Exception:
        return False
    if not isinstance(basics, list) or not basics:
        return False
    return len({str(b) for b in basics}) > 1


def _is_usable_history_row(
    row: tuple[object, object, object],
    *,
    target_elo: float | None,
    elo_window: float,
) -> bool:
    player_name, battler_elo, basics_json = row
    name = str(player_name or "")
    if _is_suspicious_name(name) or not _is_varied_basics_json(basics_json):
        return False
    if target_elo is None:
        return True
    if not isinstance(battler_elo, (int, float, str)):
        return False
    try:
        elo = float(battler_elo)
    except (TypeError, ValueError):
        return False
    return abs(elo - target_elo) <= elo_window


def _count_usable_histories(
    conn: sqlite3.Connection,
    *,
    config_json: str,
    target_elo: float | None,
    elo_window: float,
) -> int:
    rows = conn.execute(
        """
        SELECT h.player_name, h.battler_elo, s.basic_lands_json
        FROM player_game_history h
        JOIN games g ON g.id = h.game_id
        JOIN battle_snapshots s ON s.player_history_id = h.id
        WHERE h.max_stage >= 6
          AND g.config_json = ?
          AND s.stage = 3
          AND s.round = 1
        """,
        (config_json,),
    ).fetchall()

    return sum(1 for row in rows if _is_usable_history_row(row, target_elo=target_elo, elo_window=elo_window))


def seed_puppet_histories(
    db_path: Path,
    *,
    cube_id: str,
    use_upgrades: bool,
    use_vanguards: bool,
    min_histories: int,
    target_elo: float | None = None,
    elo_window: float = PUPPET_HISTORY_ELO_WINDOW,
) -> int:
    config_json = json.dumps(
        {
            "use_upgrades": use_upgrades,
            "use_vanguards": use_vanguards,
            "cube_id": cube_id,
        },
    )

    with closing(sqlite3.connect(str(db_path))) as conn:
        conn.execute("PRAGMA busy_timeout=5000")
        usable_count = _count_usable_histories(
            conn,
            config_json=config_json,
            target_elo=target_elo,
            elo_window=elo_window,
        )
        missing = max(0, min_histories - usable_count)
        if missing == 0:
            return 0

        inserted = 0
        for idx in range(missing):
            suffix = secrets.token_hex(4)
            game_id = f"perf_seed_game_{suffix}_{idx}"
            player_name = f"ArchivePilot{idx + 1:04d}"
            base_elo = target_elo if target_elo is not None else 1200.0
            elo = base_elo + float(((idx % 9) - 4) * 15)
            full_state, hand, basics = _seed_history_payload(idx)

            conn.execute(
                """
                INSERT INTO games (id, config_json, shared)
                VALUES (?, ?, 0)
                """,
                (game_id, config_json),
            )
            cursor = conn.execute(
                """
                INSERT INTO player_game_history
                  (game_id, player_name, battler_elo, max_stage, max_round, final_placement, is_puppet)
                VALUES (?, ?, ?, 6, 3, 2, 0)
                """,
                (game_id, player_name, elo),
            )
            rowid = cursor.lastrowid
            if rowid is None:
                msg = "failed to insert seeded player_game_history row"
                raise RuntimeError(msg)
            history_id = int(rowid)
            conn.execute(
                """
                INSERT INTO battle_snapshots
                  (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
                   applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
                VALUES (?, 3, 1, ?, NULL, ?, ?, 1, 0, 'play', ?)
                """,
                (
                    history_id,
                    json.dumps(hand),
                    json.dumps(basics),
                    json.dumps([]),
                    json.dumps(full_state),
                ),
            )
            inserted += 1

        conn.commit()
        return inserted

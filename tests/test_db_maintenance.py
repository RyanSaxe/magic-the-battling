import sqlite3
from pathlib import Path

from server.db.maintenance import apply_db_maintenance, inspect_db_maintenance


def _init_snapshot_tables(db_path: Path) -> None:
    with sqlite3.connect(str(db_path)) as conn:
        conn.executescript(
            """
            CREATE TABLE active_game_snapshots (
                game_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                last_human_activity_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE battle_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_history_id INTEGER NOT NULL,
                stage INTEGER NOT NULL,
                round INTEGER NOT NULL,
                hand_json TEXT NOT NULL,
                vanguard_json TEXT,
                basic_lands_json TEXT NOT NULL,
                applied_upgrades_json TEXT NOT NULL,
                treasures INTEGER NOT NULL,
                poison INTEGER,
                play_draw_preference TEXT,
                full_state_json TEXT NOT NULL
            );
            """
        )


def _old_game_json() -> str:
    return (
        '{"players":[{"name":"Alice","life":20,"poison":0,"deck":[],"hand":[],"battlefield":[],"graveyard":[],"exile":[],'
        '"treasures":0,"vanguard":null,"command_zone":[],"mana_pool":[],"lands_played_this_turn":0,"sideboard":[]}],'
        '"turn":{"turn_number":1,"active_player":0,"priority_player":0},'
        '"players_in_game":[0],"phase":"build","winner":null,"build_index":0,"build_round":1,'
        '"build_direction":"clockwise","draft_pack_size":0,"cube":"test","seed":"test"}'
    )


def _old_snapshot_json() -> str:
    return (
        '{"hand":[{"name":"Alpha","image_url":"img","id":"alpha","type_line":"Creature"}],'
        '"vanguard":null,"basic_lands":["Plains","Island","Swamp"],"applied_upgrades":[],"treasures":1,'
        '"sideboard":[],"command_zone":[],"poison":0,"play_draw_preference":"play"}'
    )


def test_inspect_db_maintenance_reports_pending_changes(tmp_path):
    db_path = tmp_path / "snapshots.db"
    _init_snapshot_tables(db_path)
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO active_game_snapshots (game_id, state_json) VALUES (?, ?)",
            ("g1", _old_game_json()),
        )
        conn.execute(
            """
            INSERT INTO battle_snapshots
              (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
               applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
            VALUES (1, 3, 1, '[]', NULL, '[]', '[]', 1, 0, 'play', ?)
            """,
            (_old_snapshot_json(),),
        )

    result = inspect_db_maintenance(db_path)

    assert result.changes_required is True
    assert result.total_pending == 2
    assert result.total_failed == 0
    assert result.backup_path is None


def test_apply_db_maintenance_creates_bak_and_rewrites_original_db(tmp_path):
    db_path = tmp_path / "snapshots.db"
    _init_snapshot_tables(db_path)
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO active_game_snapshots (game_id, state_json) VALUES (?, ?)",
            ("g1", _old_game_json()),
        )
        conn.execute(
            """
            INSERT INTO battle_snapshots
              (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
               applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
            VALUES (1, 3, 1, '[]', NULL, '[]', '[]', 1, 0, 'play', ?)
            """,
            (_old_snapshot_json(),),
        )

    original_before = db_path.read_bytes()
    result = apply_db_maintenance(db_path)

    assert result.total_failed == 0
    assert result.total_pending == 2
    assert result.backup_path == db_path.with_suffix(".db.bak")
    assert result.backup_path is not None
    assert result.backup_path.exists()
    assert result.backup_path.read_bytes() == original_before

    with sqlite3.connect(str(db_path)) as conn:
        state_json = conn.execute("SELECT state_json FROM active_game_snapshots WHERE game_id = 'g1'").fetchone()[0]
        full_state_json = conn.execute("SELECT full_state_json FROM battle_snapshots WHERE id = 1").fetchone()[0]

    assert '"card_registry"' in state_json
    assert '"card_registry"' in full_state_json

import sqlite3
from pathlib import Path

from mtb.models.cards import Battler, Card
from mtb.models.game import BattleSnapshotData, create_game, set_battler
from server.db.snapshot_migration import migrate_snapshot_storage


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


def _make_game_json() -> str:
    cards = [Card(name=f"c{i}", image_url="img", id=f"c{i}", type_line="Creature") for i in range(12)]
    battler = Battler(cards=cards, upgrades=[], vanguards=[])
    game = create_game(["Alice"], num_players=1)
    set_battler(game, battler)
    return game.model_dump_json()


def _make_snapshot_json() -> str:
    snapshot = BattleSnapshotData(
        hand=[Card(name="Alpha", image_url="img", id="alpha", type_line="Creature")],
        vanguard=None,
        basic_lands=["Plains", "Island", "Swamp"],
        applied_upgrades=[],
        treasures=1,
        sideboard=[],
        command_zone=[],
        poison=0,
        play_draw_preference="play",
    )
    return snapshot.model_dump_json()


def test_snapshot_migration_dry_run_reports_old_rows_without_writing(tmp_path):
    db_path = tmp_path / "snapshots.db"
    _init_snapshot_tables(db_path)

    old_game_json = _make_game_json()
    old_snapshot_json = _make_snapshot_json()

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO active_game_snapshots (game_id, state_json) VALUES (?, ?)",
            ("g1", old_game_json),
        )
        conn.execute(
            """
            INSERT INTO battle_snapshots
              (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
               applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
            VALUES (1, 3, 1, '[]', NULL, '[]', '[]', 1, 0, 'play', ?)
            """,
            (old_snapshot_json,),
        )

    result = migrate_snapshot_storage(db_path, apply=False)

    assert result.active_game_snapshots.migrated == 1
    assert result.battle_snapshots.migrated == 1

    with sqlite3.connect(str(db_path)) as conn:
        stored_game_json = conn.execute("SELECT state_json FROM active_game_snapshots WHERE game_id = 'g1'").fetchone()[
            0
        ]
        stored_snapshot_json = conn.execute("SELECT full_state_json FROM battle_snapshots WHERE id = 1").fetchone()[0]

    assert stored_game_json == old_game_json
    assert stored_snapshot_json == old_snapshot_json


def test_snapshot_migration_apply_rewrites_old_rows_and_skips_current_rows(tmp_path):
    db_path = tmp_path / "snapshots.db"
    _init_snapshot_tables(db_path)

    old_game_json = _make_game_json()
    old_snapshot_json = _make_snapshot_json()

    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO active_game_snapshots (game_id, state_json) VALUES (?, ?)",
            ("g1", old_game_json),
        )
        conn.execute(
            "INSERT INTO active_game_snapshots (game_id, state_json) VALUES (?, ?)",
            ("g2", '{"data": {"players": []}, "card_registry": {}}'),
        )
        conn.execute(
            """
            INSERT INTO battle_snapshots
              (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
               applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
            VALUES (1, 3, 1, '[]', NULL, '[]', '[]', 1, 0, 'play', ?)
            """,
            (old_snapshot_json,),
        )
        conn.execute(
            """
            INSERT INTO battle_snapshots
              (player_history_id, stage, round, hand_json, vanguard_json, basic_lands_json,
               applied_upgrades_json, treasures, poison, play_draw_preference, full_state_json)
            VALUES (2, 3, 1, '[]', NULL, '[]', '[]', 1, 0, 'play', '{"data": {"hand": []}, "card_registry": {}}')
            """
        )

    result = migrate_snapshot_storage(db_path, apply=True)

    assert result.active_game_snapshots.migrated == 1
    assert result.active_game_snapshots.already_current == 1
    assert result.battle_snapshots.migrated == 1
    assert result.battle_snapshots.already_current == 1
    assert result.total_failed == 0

    with sqlite3.connect(str(db_path)) as conn:
        stored_game_json = conn.execute("SELECT state_json FROM active_game_snapshots WHERE game_id = 'g1'").fetchone()[
            0
        ]
        stored_snapshot_json = conn.execute("SELECT full_state_json FROM battle_snapshots WHERE id = 1").fetchone()[0]

    assert '"card_registry"' in stored_game_json
    assert '"card_registry"' in stored_snapshot_json

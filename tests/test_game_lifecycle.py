import asyncio

import server.db.database as db_module
import server.services.game_manager as gm_module
from server.db.models import ActiveGameSnapshot


async def _started_game(game_manager, db) -> str:
    pending = game_manager.create_game("Alice", "pid-alice", cube_id="test", target_player_count=2)
    game_manager.join_game(pending.join_code, "Bob", "pid-bob")
    for player_id in pending.player_ids:
        game_manager.set_player_ready(pending.game_id, player_id, True)

    async def no_broadcast() -> None:
        pass

    await game_manager.start_lobby(pending.game_id, "pid-alice", db, on_change=no_broadcast)
    return pending.game_id


def test_a_game_resumed_after_eviction_outlives_its_abandoned_cleanup(mock_cube_data, test_db):
    game_manager = gm_module.game_manager

    async def scenario() -> tuple[bool, bool]:
        db = db_module.SessionLocal()
        try:
            game_id = await _started_game(game_manager, db)
            game_manager.schedule_abandoned_cleanup(game_id, delay=0.2)
            game_manager.mark_game_dirty(game_id, human_activity=False)
            game_manager.persist_dirty_games()
            game_manager._cleanup_game(game_id, preserve_snapshot=True)

            game_manager.reclaim_seat(game_id, "Alice", seat_token=None, user_id=None)
            await asyncio.sleep(0.4)

            still_loaded = game_manager.get_game(game_id) is not None
            snapshot_kept = db.get(ActiveGameSnapshot, game_id) is not None
            return still_loaded, snapshot_kept
        finally:
            db.close()

    still_loaded, snapshot_kept = asyncio.run(scenario())

    assert still_loaded
    assert snapshot_kept


def test_the_scheduled_cleanup_still_removes_a_finished_game(mock_cube_data, test_db):
    game_manager = gm_module.game_manager

    async def scenario() -> bool:
        db = db_module.SessionLocal()
        try:
            game_id = await _started_game(game_manager, db)
            game_manager.schedule_abandoned_cleanup(game_id, delay=0.05)
            await asyncio.sleep(0.2)
            return game_manager.get_game(game_id) is None
        finally:
            db.close()

    assert asyncio.run(scenario())


def test_a_reconnect_after_game_over_keeps_the_post_game_cleanup(mock_cube_data, test_db, monkeypatch):
    monkeypatch.setattr("server.services.game_manager.POST_GAME_CLEANUP_SECONDS", 0.05)
    game_manager = gm_module.game_manager

    async def scenario() -> bool:
        db = db_module.SessionLocal()
        try:
            game_id = await _started_game(game_manager, db)
            game = game_manager.get_game(game_id)
            assert game is not None
            game_manager.complete_game(game_id, game.players[0], db)
            game_manager.cancel_abandoned_cleanup(game_id)
            await asyncio.sleep(0.2)
            return game_manager.get_game(game_id) is None
        finally:
            db.close()

    assert asyncio.run(scenario())


def test_a_finished_game_unloaded_before_its_cleanup_is_still_retired(mock_cube_data, test_db, monkeypatch):
    monkeypatch.setattr("server.services.game_manager.POST_GAME_CLEANUP_SECONDS", 0.05)
    game_manager = gm_module.game_manager

    async def scenario() -> bool:
        db = db_module.SessionLocal()
        try:
            game_id = await _started_game(game_manager, db)
            game = game_manager.get_game(game_id)
            assert game is not None
            game_manager.complete_game(game_id, game.players[0], db)
            game_manager.mark_game_dirty(game_id, human_activity=False)
            game_manager.persist_dirty_games()
            game_manager._cleanup_game(game_id, preserve_snapshot=True)
            await asyncio.sleep(0.2)
            db.expire_all()
            return db.get(ActiveGameSnapshot, game_id) is None
        finally:
            db.close()

    assert asyncio.run(scenario())

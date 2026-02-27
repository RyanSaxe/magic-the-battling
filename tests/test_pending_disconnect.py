import asyncio

import pytest

from server.services.game_manager import GameManager


@pytest.fixture
def gm():
    return GameManager()


@pytest.fixture
def pending_game(gm):
    pending = gm.create_game("Alice", "pid_alice", cube_id="test")
    gm.join_game(pending.join_code, "Bob", "pid_bob")
    return pending


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()


class TestSchedulePendingDisconnect:
    def test_sets_player_not_ready(self, gm, pending_game):
        gm.set_player_ready(pending_game.game_id, "pid_bob", True)
        assert pending_game.player_ready["pid_bob"] is True

        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob")
            assert pending_game.player_ready["pid_bob"] is False

        run_async(_test())

    def test_does_not_remove_player_immediately(self, gm, pending_game):
        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob")
            assert "pid_bob" in pending_game.player_ids
            assert "Bob" in pending_game.player_names

        run_async(_test())

    def test_removes_player_after_delay(self, gm, pending_game):
        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            await asyncio.sleep(0.1)
            assert "pid_bob" not in pending_game.player_ids
            assert "Bob" not in pending_game.player_names

        run_async(_test())

    def test_calls_on_removed_callback(self, gm, pending_game):
        called = []

        async def callback():
            called.append(True)

        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", on_removed=callback, delay=0.05)
            await asyncio.sleep(0.1)
            assert called == [True]

        run_async(_test())

    def test_noop_for_started_game(self, gm, pending_game):
        pending_game.is_started = True

        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids

        run_async(_test())

    def test_reschedule_cancels_previous(self, gm, pending_game):
        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=10.0)
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids

        run_async(_test())

    def test_removes_join_code_mapping_when_last_pending_player_times_out(self, gm):
        pending = gm.create_game("Alice", "pid_alice", cube_id="test")
        join_code = pending.join_code
        assert gm.get_game_id_by_join_code(join_code) == pending.game_id

        async def _test():
            gm.schedule_pending_disconnect(pending.game_id, "pid_alice", delay=0.05)
            await asyncio.sleep(0.1)
            assert gm.get_pending_game_by_code(join_code) is None
            assert gm.get_game_id_by_join_code(join_code) is None

        run_async(_test())


class TestCancelPendingDisconnect:
    def test_cancel_prevents_removal(self, gm, pending_game):
        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.cancel_pending_disconnect(pending_game.game_id, "pid_bob")
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids
            assert "Bob" in pending_game.player_names

        run_async(_test())

    def test_cancel_noop_when_no_task(self, gm, pending_game):
        gm.cancel_pending_disconnect(pending_game.game_id, "pid_bob")


class TestKickDuringGracePeriod:
    def test_kick_then_grace_expires_no_error(self, gm, pending_game):
        async def _test():
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.kick_player(pending_game.game_id, "pid_alice", "pid_bob")
            assert "pid_bob" not in pending_game.player_ids
            await asyncio.sleep(0.1)

        run_async(_test())

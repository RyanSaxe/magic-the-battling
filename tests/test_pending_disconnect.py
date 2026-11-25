import asyncio
from collections.abc import Coroutine

import pytest

from server.services.game_manager import GameManager, LobbyStage, PendingGame


@pytest.fixture
def gm() -> GameManager:
    return GameManager()


@pytest.fixture
def pending_game(gm: GameManager) -> PendingGame:
    pending = gm.create_game("Alice", "pid_alice", cube_id="test")
    gm.join_game(pending.join_code, "Bob", player_id="pid_bob")
    return pending


def run_async[T](coro: Coroutine[object, object, T]) -> T:
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestSchedulePendingDisconnect:
    def test_sets_player_not_ready(self, gm: GameManager, pending_game: PendingGame) -> None:
        gm.set_player_ready(pending_game.game_id, "pid_bob", is_ready=True)
        assert pending_game.player_ready["pid_bob"] is True

        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob")
            assert pending_game.player_ready["pid_bob"] is False

        run_async(_test())

    def test_does_not_remove_player_immediately(self, gm: GameManager, pending_game: PendingGame) -> None:
        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob")
            assert "pid_bob" in pending_game.player_ids
            assert "Bob" in pending_game.player_names

        run_async(_test())

    def test_removes_player_after_delay(self, gm: GameManager, pending_game: PendingGame) -> None:
        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            await asyncio.sleep(0.1)
            assert "pid_bob" not in pending_game.player_ids
            assert "Bob" not in pending_game.player_names

        run_async(_test())

    def test_calls_on_removed_callback(self, gm: GameManager, pending_game: PendingGame) -> None:
        called = []

        async def callback() -> None:
            called.append(True)

        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", on_removed=callback, delay=0.05)
            await asyncio.sleep(0.1)
            assert called == [True]

        run_async(_test())

    def test_noop_for_started_game(self, gm: GameManager, pending_game: PendingGame) -> None:
        pending_game.stage = LobbyStage.STARTED

        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids

        run_async(_test())

    def test_reschedule_cancels_previous(self, gm: GameManager, pending_game: PendingGame) -> None:
        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=10.0)
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids

        run_async(_test())


class TestCancelPendingDisconnect:
    def test_cancel_prevents_removal(self, gm: GameManager, pending_game: PendingGame) -> None:
        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.cancel_pending_disconnect(pending_game.game_id, "pid_bob")
            await asyncio.sleep(0.1)
            assert "pid_bob" in pending_game.player_ids
            assert "Bob" in pending_game.player_names

        run_async(_test())

    def test_cancel_noop_when_no_task(self, gm: GameManager, pending_game: PendingGame) -> None:
        gm.cancel_pending_disconnect(pending_game.game_id, "pid_bob")


class TestKickDuringGracePeriod:
    def test_kick_then_grace_expires_no_error(self, gm: GameManager, pending_game: PendingGame) -> None:
        async def _test() -> None:
            gm.schedule_pending_disconnect(pending_game.game_id, "pid_bob", delay=0.05)
            gm.kick_player(pending_game.game_id, "pid_alice", target_player_id="pid_bob")
            assert "pid_bob" not in pending_game.player_ids
            await asyncio.sleep(0.1)

        run_async(_test())

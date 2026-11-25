"""Per-socket ordered outgoing object send queue with backpressure detection."""

import asyncio
import logging
from collections import Counter
from collections.abc import Callable, Coroutine
from typing import Any

logger = logging.getLogger(__name__)

# Nothing else bounds what waits for a client that has stopped reading.
MAX_UNSENT_WRITES = 256

Write = Callable[[], Coroutine[Any, Any, None]]


class OutgoingWrites:
    """Write to each socket in order and in the background, so a slow socket holds up only itself."""

    def __init__(self) -> None:
        self._last_write: dict[object, asyncio.Task[None]] = {}
        self._unsent: Counter[object] = Counter()

    def add(self, websocket: object, write: Write, *, on_failure: Callable[[], None] | None = None) -> asyncio.Task:
        previous = self._last_write.get(websocket)
        self._unsent[websocket] += 1
        task = asyncio.create_task(self._write_after(previous, websocket, write=write, on_failure=on_failure))
        self._last_write[websocket] = task
        return task

    def has_fallen_behind(self, websocket: object) -> bool:
        return self._unsent.get(websocket, 0) >= MAX_UNSENT_WRITES

    async def wait_until_sent(self, websocket: object) -> None:
        if (last := self._last_write.get(websocket)) and not last.done():
            await asyncio.wait({last})

    async def _write_after(
        self,
        previous: asyncio.Task[None] | None,
        websocket: object,
        *,
        write: Write,
        on_failure: Callable[[], None] | None,
    ) -> None:
        if previous is not None and not previous.done():
            # Waited on rather than awaited, so cancelling one write at shutdown can't cancel through the whole chain.
            await asyncio.wait({previous})
        try:
            await write()
        except Exception:
            logger.debug("Socket write failed", exc_info=True)
            if on_failure is not None:
                on_failure()
        finally:
            self._unsent[websocket] -= 1
            if not self._unsent[websocket]:
                del self._unsent[websocket]
                self._last_write.pop(websocket, None)

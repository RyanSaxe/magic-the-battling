"""Async-friendly JSON fetching with caching, de-duplication, and rate limiting."""

import asyncio
import atexit
import threading
import time
from collections import OrderedDict
from collections.abc import Coroutine
from dataclasses import dataclass, field
from typing import Any, TypeVar

import httpx

# ----- Tunables -----
_MIN_INTERVAL = 0.1  # seconds: minimum spacing between HTTP calls
_TIMEOUT = httpx.Timeout(10.0, connect=3.05)
_CACHE_MAX = 1024  # max entries to keep in memory


T = TypeVar("T")


@dataclass
class _CacheEntry:
    data: Any
    etag: str | None = field(default=None)


class _AsyncRuntime:
    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._started = threading.Event()
        self._thread = threading.Thread(target=self._run_loop, name="json-runtime", daemon=True)
        self._thread.start()
        self._started.wait()

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._started.set()
        self._loop.run_forever()

    def run(self, coro: Coroutine[Any, Any, T]) -> T:
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def stop(self) -> None:
        def _stop_loop() -> None:
            for task in asyncio.all_tasks(loop=self._loop):
                task.cancel()
            self._loop.stop()

        self._loop.call_soon_threadsafe(_stop_loop)
        self._thread.join(timeout=5)
        self._loop.close()


class _JsonService:
    def __init__(self) -> None:
        self._runtime = _AsyncRuntime()
        self._client = httpx.AsyncClient(timeout=_TIMEOUT)
        self._cache: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._cache_max = _CACHE_MAX
        self._lock = asyncio.Lock()
        self._rate_lock = asyncio.Lock()
        self._last_call = 0.0
        self._inflight: dict[str, asyncio.Task[Any]] = {}

    def get_json(self, url: str) -> Any:
        return self._runtime.run(self._get_json(url))

    def revalidate(self, url: str) -> None:
        self._runtime.run(self._revalidate(url))

    async def _get_json(self, url: str) -> Any:
        async with self._lock:
            entry = self._cache.get(url)
            if entry is not None:
                self._cache.move_to_end(url)
                return entry.data

            task = self._inflight.get(url)
            if task is None:
                task = asyncio.create_task(self._fetch_and_store(url))
                self._inflight[url] = task

        return await task

    async def _revalidate(self, url: str) -> None:
        async with self._lock:
            entry = self._cache.get(url)

        if entry is None:
            await self._get_json(url)
            return

        if not entry.etag:
            return

        async with self._rate_lock:
            now = time.monotonic()
            wait = _MIN_INTERVAL - (now - self._last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()

        try:
            response = await self._client.get(url, headers={"If-None-Match": entry.etag})
            if response.status_code == 304:
                return
            response.raise_for_status()
            new_entry = _CacheEntry(data=response.json(), etag=response.headers.get("etag"))
            async with self._lock:
                self._cache[url] = new_entry
                self._cache.move_to_end(url)
        except Exception:
            pass

    async def _fetch_and_store(self, url: str) -> Any:
        try:
            data, etag = await self._rate_limited_fetch(url)
        except Exception:
            async with self._lock:
                self._inflight.pop(url, None)
            raise

        async with self._lock:
            self._cache[url] = _CacheEntry(data=data, etag=etag)
            self._cache.move_to_end(url)
            if len(self._cache) > self._cache_max:
                self._cache.popitem(last=False)
            self._inflight.pop(url, None)
        return data

    async def _rate_limited_fetch(self, url: str) -> tuple[Any, str | None]:
        async with self._rate_lock:
            now = time.monotonic()
            wait = _MIN_INTERVAL - (now - self._last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()

        response = await self._client.get(url)
        response.raise_for_status()
        return response.json(), response.headers.get("etag")

    async def _close(self) -> None:
        await self._client.aclose()

    def shutdown(self) -> None:
        try:
            self._runtime.run(self._close())
        finally:
            self._runtime.stop()


_SERVICE: _JsonService | None = None
_SERVICE_LOCK = threading.Lock()


def _get_service() -> _JsonService:
    global _SERVICE
    with _SERVICE_LOCK:
        if _SERVICE is None:
            _SERVICE = _JsonService()
        return _SERVICE


def stop_worker() -> None:
    global _SERVICE
    with _SERVICE_LOCK:
        if _SERVICE is not None:
            _SERVICE.shutdown()
            _SERVICE = None


atexit.register(stop_worker)


def get_json(url: str) -> Any:
    return _get_service().get_json(url)


def revalidate_json(url: str) -> None:
    _get_service().revalidate(url)

"""
utility module for safetly rate limiting a call to a HTTP API when done in parallel

NOTE: this was mostly written by GPT5, so be mindful of that
TODO: given the note above, refactor and test this module
"""

import threading
import time
import requests
import queue
from concurrent.futures import Future

# ----- Tunables -----
_MIN_INTERVAL = 0.1  # seconds: minimum spacing between HTTP calls
_TIMEOUT = (3.05, 10.0)  # (connect, read) seconds
_CACHE_MAX = 1024  # max entries to keep in memory

# ----- State -----
_request_q: queue.Queue[tuple[str, Future]] = queue.Queue()
_session = requests.Session()

_results: dict[str, dict] = {}  # url -> JSON
_inflight: dict[str, Future] = {}  # url -> Future (dedupe)
_order: list[str] = []  # simple LRU order (front=oldest)

_lock = threading.RLock()
_last_call = 0.0
_stop = threading.Event()


def _lru_record(url: str):
    # maintain simple LRU with size cap
    try:
        _order.remove(url)
    except ValueError:
        pass
    _order.append(url)
    if len(_order) > _CACHE_MAX:
        old = _order.pop(0)
        _results.pop(old, None)


def _rate_limit_wait():
    global _last_call
    with _lock:
        now = time.monotonic()
        wait = _MIN_INTERVAL - (now - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _worker():
    while not _stop.is_set():
        item = _request_q.get()
        try:
            if item is None:
                _stop.set()
                return
            url, fut = item
            try:
                _rate_limit_wait()
                resp = _session.get(url, timeout=_TIMEOUT)
                resp.raise_for_status()
                data = resp.json()  # may raise
                with _lock:
                    _results[url] = data
                    _lru_record(url)
                    # Resolve *before* removing from inflight so waiters see result
                    fut.set_result(data)
                    _inflight.pop(url, None)
            except Exception as e:
                with _lock:
                    # Propagate the same exception to all waiters and clear inflight
                    fut.set_exception(e)
                    _inflight.pop(url, None)
        finally:
            _request_q.task_done()


_thread = threading.Thread(target=_worker, name="http-worker", daemon=False)
_thread.start()


def stop_worker():
    # None is not a valid URL, but this interface is used to signal the worker to stop
    _request_q.put(None)  # type: ignore
    _thread.join(timeout=5)


def get_json(url: str) -> dict:
    # Fast path: cache hit
    with _lock:
        if url in _results:
            _lru_record(url)
            return _results[url]
        # In-flight: return existing future
        if url in _inflight:
            fut = _inflight[url]
        else:
            fut = Future()
            _inflight[url] = fut
            _request_q.put((url, fut))
    # Wait outside the lock
    return fut.result()

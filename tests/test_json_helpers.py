import contextlib
import json
import threading
import time
from collections.abc import Generator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import ModuleType
from typing import ClassVar

import pytest

from mtb.utils import json_helpers as json_helpers_module_impl


class _JsonHandler(BaseHTTPRequestHandler):
    request_times: ClassVar[list[float]] = []

    def do_GET(self) -> None:
        self.__class__.request_times.append(time.time())
        payload = json.dumps({"call": len(self.__class__.request_times)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 -- matches external API param name
        _ = (format, args)


@pytest.fixture
def json_endpoint() -> Generator[tuple[str, list[float]]]:
    _JsonHandler.request_times = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JsonHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://{server.server_address[0]}:{server.server_address[1]}"
    try:
        yield url, _JsonHandler.request_times
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


@pytest.fixture
def json_helpers_module(monkeypatch: pytest.MonkeyPatch) -> Generator[ModuleType]:
    module = json_helpers_module_impl
    # Undo conftest's offline_cubecobra patch so these tests exercise real local HTTP requests.
    monkeypatch.setattr(module, "get_json", lambda url: module._get_service().get_json(url))  # noqa: SLF001 -- real local HTTP test
    with contextlib.suppress(Exception):
        module.stop_worker()
    yield module
    with contextlib.suppress(Exception):
        module.stop_worker()


def test_get_json_caches_responses(json_helpers_module: ModuleType, json_endpoint: tuple[str, list[float]]) -> None:
    module = json_helpers_module
    url, request_times = json_endpoint

    first = module.get_json(url)
    second = module.get_json(url)

    assert first == second
    assert len(request_times) == 1


def test_get_json_after_stop_worker_returns(
    json_helpers_module: ModuleType, json_endpoint: tuple[str, list[float]]
) -> None:
    module = json_helpers_module
    url, _ = json_endpoint

    module.stop_worker()

    result: dict | None = None

    def call_get() -> None:
        nonlocal result
        result = module.get_json(url)

    worker = threading.Thread(target=call_get)
    worker.start()
    worker.join(timeout=2)

    assert not worker.is_alive(), "get_json should finish after stop_worker"
    assert result == {"call": 1}


def test_revalidate_and_get_on_cache_miss(
    json_helpers_module: ModuleType, json_endpoint: tuple[str, list[float]]
) -> None:
    module = json_helpers_module
    url, request_times = json_endpoint

    result: dict | None = None

    def call() -> None:
        nonlocal result
        result = module.revalidate_and_get(url)

    worker = threading.Thread(target=call)
    worker.start()
    worker.join(timeout=5)

    assert not worker.is_alive(), "revalidate_and_get deadlocked on cache miss"
    assert result == {"call": 1}
    assert len(request_times) == 1


def test_concurrent_requests_share_single_fetch(
    json_helpers_module: ModuleType, json_endpoint: tuple[str, list[float]]
) -> None:
    module = json_helpers_module
    url, request_times = json_endpoint

    barrier = threading.Barrier(2)
    results: list[dict] = []

    def task() -> None:
        barrier.wait()
        results.append(module.get_json(url))

    threads = [threading.Thread(target=task) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=4)

    assert all(not thread.is_alive() for thread in threads)
    assert len(request_times) == 1
    assert results == [{"call": 1}, {"call": 1}]

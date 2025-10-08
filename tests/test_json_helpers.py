import importlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest


class _JsonHandler(BaseHTTPRequestHandler):
    request_times: list[float] = []

    def do_GET(self):
        self.__class__.request_times.append(time.time())
        payload = json.dumps({"call": len(self.__class__.request_times)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args):  # noqa: A003 - match BaseHTTPRequestHandler signature
        return


@pytest.fixture()
def json_endpoint():
    _JsonHandler.request_times = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JsonHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://{server.server_address[0]}:{server.server_address[1]}"
    try:
        yield url, _JsonHandler.request_times
    finally:
        server.shutdown()
        thread.join(timeout=2)


@pytest.fixture()
def json_helpers_module():
    from mtb.utils import json_helpers as module

    try:
        module.stop_worker()
    except Exception:
        pass
    module = importlib.reload(module)
    yield module
    try:
        module.stop_worker()
    except Exception:
        pass


def test_get_json_caches_responses(json_helpers_module, json_endpoint):
    module = json_helpers_module
    url, request_times = json_endpoint

    first = module.get_json(url)
    second = module.get_json(url)

    assert first == second
    assert len(request_times) == 1


def test_get_json_after_stop_worker_returns(json_helpers_module, json_endpoint):
    module = json_helpers_module
    url, _ = json_endpoint

    module.stop_worker()

    result: dict | None = None

    def call_get():
        nonlocal result
        result = module.get_json(url)

    worker = threading.Thread(target=call_get)
    worker.start()
    worker.join(timeout=2)

    assert not worker.is_alive(), "get_json should finish after stop_worker"
    assert result == {"call": 1}


def test_concurrent_requests_share_single_fetch(json_helpers_module, json_endpoint):
    module = json_helpers_module
    url, request_times = json_endpoint

    barrier = threading.Barrier(2)
    results: list[dict] = []

    def task():
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

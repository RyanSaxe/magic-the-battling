import threading

from fastapi.testclient import TestClient

import server.main as main_module
from server.main import app
from server.services.default_cube import start_loading_default_cube


def test_the_server_loads_the_default_cube_without_waiting_for_it_or_needing_it(test_db, monkeypatch):
    cube_requested, may_answer, gave_up = threading.Event(), threading.Event(), threading.Event()

    def unreachable_cubecobra(cube_id: str):
        cube_requested.set()
        if not may_answer.wait(timeout=5):
            gave_up.set()
        raise ConnectionError(f"no network to load {cube_id}")

    monkeypatch.setattr("mtb.utils.cubecobra.get_cube_data", unreachable_cubecobra)
    monkeypatch.setattr(main_module, "start_loading_default_cube", start_loading_default_cube)

    try:
        with TestClient(app) as client:
            assert cube_requested.wait(timeout=2)
            assert client.get("/health").status_code == 200
            assert not gave_up.is_set()
    finally:
        may_answer.set()

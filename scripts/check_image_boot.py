#!/usr/bin/env python3
"""Boot a server image the way a deploy does and check that it serves and restores games in progress.

Usage: python3 scripts/check_image_boot.py IMAGE

The image boots twice, without network access, so a boot that needs PyPI or another outside service fails:
- on an empty /data, as on a fresh volume, and
- on a database holding the snapshots in tests/fixtures/active_game_snapshots and one legacy snapshot that no
  longer restores. Every fixture game must load, and only the legacy one may be set aside.

Needs Docker and the Python standard library only.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures" / "active_game_snapshots"
DB_PATH_IN_IMAGE = "/data/mtb.db"
OPS_TOKEN = "image-boot-check"
BOOT_TIMEOUT_SECONDS = 120
UNRESTORABLE_GAME_ID = "legacy-unrestorable"

logger = logging.getLogger(__name__)


class BootCheckError(Exception):
    pass


def _docker(*args: str) -> str:
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True).stdout.strip()


def _write_fixture_db(db_path: Path) -> list[str]:
    snapshots = {path.stem: path.read_text() for path in sorted(FIXTURES_DIR.glob("*.json"))}
    if not snapshots:
        raise BootCheckError(f"no snapshot fixtures in {FIXTURES_DIR}")
    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    rows = [*snapshots.items(), (UNRESTORABLE_GAME_ID, json.dumps({"not": "a game"}))]
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE active_game_snapshots (game_id VARCHAR NOT NULL PRIMARY KEY, state_json TEXT NOT NULL,"
            " last_human_activity_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
        )
        conn.executemany(
            "INSERT INTO active_game_snapshots VALUES (?, ?, ?, ?)",
            [(game_id, state_json, now, now) for game_id, state_json in rows],
        )
    conn.close()
    return sorted(snapshots)


def _wait_until_serving(container: str) -> None:
    deadline = time.monotonic() + BOOT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if _docker("inspect", "--format", "{{.State.Running}}", container) != "true":
            raise BootCheckError("the server exited during boot")
        health = subprocess.run(
            ["docker", "exec", container, "curl", "--silent", "--fail", "http://127.0.0.1:8000/health"],
            capture_output=True,
            check=False,
        )
        if health.returncode == 0:
            return
        time.sleep(1)
    raise BootCheckError(f"the server did not answer /health within {BOOT_TIMEOUT_SECONDS}s")


def _loaded_games(container: str) -> int:
    capacity = _docker(
        "exec",
        container,
        "curl",
        "--silent",
        "--fail",
        "--header",
        f"x-ops-token: {OPS_TOKEN}",
        "http://127.0.0.1:8000/api/ops/capacity",
    )
    return int(json.loads(capacity)["loaded_games"])


def _boot(image: str, name: str, *, db_file: Path | None, out_dir: Path) -> int:
    container = _docker(
        "create",
        "--network",
        "none",
        "--env",
        "MTB_AUTH_SECRET_KEY=image-boot-check-secret",
        "--env",
        f"MTB_OPS_TOKEN={OPS_TOKEN}",
        image,
    )
    try:
        if db_file is not None:
            _docker("cp", str(db_file), f"{container}:{DB_PATH_IN_IMAGE}")
        _docker("start", container)
        try:
            _wait_until_serving(container)
            loaded = _loaded_games(container)
        finally:
            _docker("stop", container)
            log = subprocess.run(
                ["docker", "logs", container],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
            )
            logger.info("--- %s: server log ---\n%s", name, log.stdout)
        _docker("cp", f"{container}:/data/.", str(out_dir))
        return loaded
    finally:
        _docker("rm", "--force", container)


def _quarantined_ids(db_path: Path) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        ids = sorted(row[0] for row in conn.execute("SELECT game_id FROM quarantined_game_snapshots"))
    conn.close()
    return ids


def check(image: str, work_dir: Path) -> None:
    empty_out = work_dir / "empty-volume"
    empty_out.mkdir()
    if (loaded := _boot(image, "empty volume", db_file=None, out_dir=empty_out)) != 0:
        raise BootCheckError(f"empty volume: expected no games, loaded {loaded}")
    if not (empty_out / "mtb.db").exists():
        raise BootCheckError("empty volume: the server did not create the database")

    fixture_db = work_dir / "fixtures.db"
    fixture_ids = _write_fixture_db(fixture_db)
    fixture_out = work_dir / "fixture-volume"
    fixture_out.mkdir()
    loaded = _boot(image, "fixture snapshots", db_file=fixture_db, out_dir=fixture_out)
    if loaded != len(fixture_ids):
        raise BootCheckError(
            f"fixture snapshots: expected all {len(fixture_ids)} of {fixture_ids} to load, loaded {loaded}",
        )
    quarantined_ids = _quarantined_ids(fixture_out / "mtb.db")
    if quarantined_ids != [UNRESTORABLE_GAME_ID]:
        raise BootCheckError(
            f"fixture snapshots: expected only {UNRESTORABLE_GAME_ID} set aside, got {quarantined_ids}",
        )


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("image", help="Docker image to boot, such as one built from this repository's Dockerfile")
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="image-boot-check-") as work_dir:
        try:
            check(args.image, Path(work_dir))
        except BootCheckError as error:
            logger.error("image boot check failed: %s", error)
            return 1
    sys.stdout.write("image boot check passed: the server boots on an empty volume and restores the fixture games\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

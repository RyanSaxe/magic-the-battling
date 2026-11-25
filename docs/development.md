# Development

Task-focused recipes for testing, checking, load testing, and operating
Pitfight.

## Run repository checks

Install the git commit hook once per clone so formatting and static checks run
before each commit:

```sh
uvx prek@0.5.11 install
```

Run the same full check suite that CI runs:

```sh
uvx prek@0.5.11 run --all-files --show-diff-on-failure
```

To run individual tool suites directly:

```sh
# Python lint, format, type check, and tests
uv run ruff check .
uv run ruff format --check .
uv run ty check
uv run pytest

# Web lint, type check, production build, and unit tests
(cd web && npm run lint && npm run typecheck && npm run build && npm test)
```

## Run Playwright end-to-end tests

The Playwright suite in `web/e2e/` builds `web/dist`, serves it via
`vite preview` on port `4317`, and runs against WebKit (Desktop Safari).

Install WebKit once, then run the suite:

```sh
(cd web && npx playwright install webkit)
(cd web && npm run test:e2e)
```

Port `4317` must be free because Playwright starts a fresh preview server for
the current checkout instead of reusing an existing process.

## Run the load harness

The load harness in `server/perf/` starts a managed server against a temporary
database copy with mock cube data and drives concurrent games end to end.

Small local smoke sweep:

```sh
uv run perf-load \
  --db-copy \
  --mock-cube-data \
  --sweep 5,10 \
  --puppet-count 3 \
  --disable-caps
```

Burst and hot-residency sweeps matching `.github/workflows/pr-load-test.yml`:

```sh
# Burst sweep
uv run python -m server.perf.load_harness \
  --db-copy \
  --mock-cube-data \
  --sweep 10,50,100,200 \
  --puppet-count 3 \
  --disable-caps \
  --fresh-server-per-sweep \
  --no-runtime-reset-between-sweeps \
  --game-timeout-sec 900

# Hot residency sweep
uv run python -m server.perf.load_harness \
  --db-copy \
  --mock-cube-data \
  --games 50 \
  --concurrency 50 \
  --hot-sweep 0,100,250,500 \
  --puppet-count 3 \
  --disable-caps \
  --fresh-server-per-sweep \
  --no-runtime-reset-between-sweeps \
  --game-timeout-sec 900
```

## Verify the Docker image boot check

When changing the server image (`server/`, `pitfight/`, `scripts/`,
`Dockerfile`, `fly*.toml`, `pyproject.toml`, `uv.lock`, or
`tests/fixtures/active_game_snapshots/`), build the image and run the offline
boot check:

```sh
docker build --tag pitfight:boot-check .
uv run --no-project python scripts/check_image_boot.py pitfight:boot-check
```

The script boots the container twice with `--network none`:

1. On an empty `/data` volume, confirming the server initializes SQLite and
   answers `/health`.
2. On a database seeded with every snapshot in
   `tests/fixtures/active_game_snapshots/` plus one intentionally unreadable
   snapshot, confirming every fixture restores and only the unreadable snapshot
   moves to `quarantined_game_snapshots`.

If a code change prevents a fixture snapshot from restoring, keep the old
snapshot format readable rather than regenerating the fixtures.

## Inspect database maintenance

On container startup, `scripts/start_server.sh` runs
`scripts/maintain_db.py --apply` against `/data/mtb.db` before launching
Uvicorn. Inspect what maintenance would change against a copy of a database
without modifying it:

```sh
uv run python scripts/maintain_db.py --db-path /path/to/copy.db
```

Check `active_game_snapshots.failed` in the output. When any snapshot fails to
deserialize, `--apply` leaves the database untouched and creates no backup.

## Manage server ops mode and Fly reports

Deploy workflows put the server into `draining` mode during the pre-restart
warning window so new games pause while active players finish or prepare to
reconnect, then return it to `normal` mode. If a workflow fails to reset the
mode, restore it manually:

```sh
APP_BASE_URL=https://<app>.fly.dev \
OPS_API_TOKEN=<token> \
OPS_UPDATED_BY=<your-name> \
sh scripts/ops_mode.sh normal
```

Inspect Fly machine health, persistent logs, and SQLite metrics:

```sh
# Default production app, last 24 hours
uv run python scripts/fly_activity_report.py

# Custom app, time window, and JSON output
uv run python scripts/fly_activity_report.py --app magic-the-battling --hours 48 --json

# Read persistent logs from /data/logs/server.jsonl alongside Fly buffer logs
uv run python scripts/fly_activity_report.py --log-source both
```

`fly logs --no-tail` returns only Fly's recent log buffer. Passing
`--log-source file` or `--log-source both` includes the rotated JSON logs stored
on the volume at `/data/logs/server.jsonl`.

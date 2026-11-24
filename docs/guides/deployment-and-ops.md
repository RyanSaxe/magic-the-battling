# Deployment and operations

Crucible deploys as a single Docker container to [Fly.io](https://fly.io) with a persistent `/data` volume holding the SQLite database (`/data/mtb.db`) and observability logs (`/data/logs/server.jsonl`).

## Container build and startup

`Dockerfile` installs Python dependencies via `uv sync --frozen --no-dev`, installs Playwright Chromium, builds `web/dist` with `npm ci && npm run build`, and launches `scripts/start_server.sh`:

1. If `MTB_RUN_DB_MAINTENANCE_ON_STARTUP` is `1` (the default), `scripts/maintain_db.py --apply` runs against `DATABASE_PATH` (`/data/mtb.db` on Fly). When pending maintenance exists, it saves a backup at `/data/mtb.db.bak` before applying changes.
2. `uvicorn server.main:app` starts on port `8000` with `--proxy-headers` and `--forwarded-allow-ips "*"`.

Fly app configs live in `fly.toml` (production: `magic-the-battling`, 2 shared CPUs, 2048 MB RAM, `/health` check) and `fly.dev.toml` (dev environment).

## Automated deploy workflows

Pushes to `develop` run `.github/workflows/deploy-dev.yml` (`magic-the-battling-dev.fly.dev`). Pushes to `main` run `.github/workflows/deploy-main.yml` (`magic-the-battling.fly.dev`).

Before deploying, both workflows can put the live server into `draining` mode via `POST /api/ops/mode` (using `x-ops-token`) to warn players and pause new games during the countdown window, then return it to `normal` on success or `maintenance` on failure.

### PR labels

Labels on the merged PR control the pre-deploy drain delay and the GitHub release version bump on `main`:

**Deploy delay (`deploy:*`)**

| Label | `develop` delay | `main` delay | Intended use |
| --- | --- | --- | --- |
| *(none)* | 0 min | 15 min | Standard deploys |
| `deploy:quick` | 0 min | 0 min | Hotfixes and urgent changes |
| `deploy:default` | 15 min | 15 min | Explicit 15-minute warning window |
| `deploy:long` | 60 min | 60 min | Major updates during peak traffic |

**Release version (`release:*` on `main`)**

After a successful `main` deploy, `deploy-main.yml` finds the merged PR and creates a tagged GitHub release:

| Label | Version bump |
| --- | --- |
| *(none)* | Defaults to `patch` |
| `release:patch` | Patch bump (e.g., `v0.8.2` -> `v0.8.3`) |
| `release:minor` | Minor bump (e.g., `v0.8.2` -> `v0.9.0`) |
| `release:major` | Major bump (e.g., `v0.8.2` -> `v1.0.0`) |

You can also cut a manual release and deploy via `.github/workflows/release.yml` (`workflow_dispatch` with `patch`, `minor`, or `major`).

## Fly activity reports

Inspect recent game activity, machine memory, and server logs with `scripts/fly_activity_report.py`:

```sh
# Default app (magic-the-battling), last 24 hours
uv run python scripts/fly_activity_report.py

# Custom app and time window
uv run python scripts/fly_activity_report.py --app magic-the-battling --hours 48

# Combine Fly log buffer with persistent /data/logs/server.jsonl
uv run python scripts/fly_activity_report.py --log-source both

# Target a specific machine and region
uv run python scripts/fly_activity_report.py --machine <machine-id> --region ewr

# Machine-readable JSON output
uv run python scripts/fly_activity_report.py --json
```

`fly logs --no-tail` only reads Fly's in-memory buffer. Pass `--log-source file` or `--log-source both` to include persistent logs from `/data/logs/server.jsonl`. Use `--skip-logs`, `--skip-db`, or `--skip-machine` to isolate specific checks.

## Load testing

`pyproject.toml` exposes a local load-test runner (`server/perf/load_harness.py`):

```sh
uv run perf-load --help
```

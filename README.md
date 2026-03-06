# Magic: The Battling

An online application for playing [Magic: The Battling](https://cubecobra.com/cube/overview/auto), a Magic: The Gathering format that combines drafting with elimination-style battles.

## Community

Join the [Discord](https://discord.gg/MKMacp9JUf) to find games, give feedback, and chat about the format.

## Tech Stack

- **Backend**: Python, FastAPI, SQLite
- **Frontend**: React, TypeScript, Vite
- **Deployment**: Fly.io, Docker

## Development

```sh
# install backend dependencies
uv sync

# install frontend dependencies
cd web && npm ci

# run the dev server (backend + frontend)
uv run dev

# run backend only, serving built frontend from web/dist (deployment-like)
uv run dev --build

# optional: compare variants on custom ports using a temporary DB copy
uv run dev --build --backend-port 8100 --db-copy
uv run dev --backend-port 8200 --frontend-port 3200 --db-copy
```

Open:
- `http://localhost:3000` for `uv run dev`
- `http://localhost:8000` for `uv run dev --build`

## Testing

```sh
# backend
uv run pytest

# frontend
cd web && npm test
```

## API Docs

Start the dev server and visit [`/docs`](http://localhost:8000/docs) for the auto-generated OpenAPI reference.

## Deployment

Deployed to [Fly.io](https://fly.io) via Docker — see `fly.toml` and `Dockerfile`.

### PR Labels

Labels on the merged PR control deploy behavior and release creation.

**Deploy delay** (`deploy:*`) — controls how long players are warned before the server restarts:

| Label | Delay | Use case |
|-------|-------|----------|
| *(none)* | 15 min | Normal deploys |
| `deploy:quick` | 0 min | Hotfixes, config changes |
| `deploy:long` | 1 hour | Large updates during peak hours |

**Release** (`release:*`) — triggers a tagged GitHub release after successful deploy:

| Label | Effect |
|-------|--------|
| *(none)* | No release created |
| `release:patch` | Bump patch version (e.g. v1.0.0 → v1.0.1) |
| `release:minor` | Bump minor version (e.g. v1.0.0 → v1.1.0) |
| `release:major` | Bump major version (e.g. v1.0.0 → v2.0.0) |

Labels can be combined — e.g. `deploy:quick` + `release:patch` for an urgent bugfix release.

## Fly Operations Report

Use the report script to inspect game activity, memory signals, and recent log events.

```sh
# default app + last 24h
uv run python scripts/fly_activity_report.py

# custom app/window
uv run python scripts/fly_activity_report.py --app magic-the-battling --hours 48

# choose log source (fly, file, both)
uv run python scripts/fly_activity_report.py --log-source both

# target a specific machine/region
uv run python scripts/fly_activity_report.py --machine 17817246a66798 --region ewr

# JSON output for automation
uv run python scripts/fly_activity_report.py --json
```

Notes:
- `fly logs --no-tail` only returns Fly's current log buffer, not full historical logs.
- The script can read persistent machine logs from `/data/logs/server.jsonl` with `--log-source file` or `--log-source both`.
- Persistent log files appear after deploying a build that includes the observability logging changes.
- The script combines log output with DB-backed metrics from `/data/mtb.db` for a fuller activity report.

# Pitfight

An online application for playing [Pitfight](https://cubecobra.com/cube/overview/auto), a Magic: The Gathering format that combines drafting with elimination-style fights.

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

On container startup, deploys run `scripts/maintain_db.py --apply` against `/data/mtb.db` before booting the server. If pending DB maintenance exists, the script first copies the database to `/data/mtb.db.bak` and then applies the migration to the live DB. A fresh volume with no database needs no maintenance, and a maintenance failure is logged without stopping the server from starting. Once it is serving, the server loads the default cube from CubeCobra in the background, so the first game after a restart doesn't wait for it. It serves normally when CubeCobra can't be reached. Run `uv run python scripts/maintain_db.py --db-path <copy of mtb.db>` to see what a deploy would change: `active_game_snapshots.failed` counts the games in progress that the new code cannot restore. If any row fails, `--apply` changes nothing and makes no backup.

When the server starts, it moves any active game snapshot it cannot restore to the `quarantined_game_snapshots` table, with the error, and logs the game id, instead of deleting it.

### PR Labels

Labels on the merged PR control deploy behavior and release creation.

**Deploy delay** (`deploy:*`) — controls how long players are warned before the server restarts.
During the warning the server is in draining mode and blocks new games. Once the deploy finishes, fails or is cancelled, the workflow returns the server to normal mode. If that step fails, set the mode by hand with `APP_BASE_URL=https://<app>.fly.dev OPS_API_TOKEN=<token> OPS_UPDATED_BY=<your name> sh scripts/ops_mode.sh normal`.
Both workflows support the same labels but have different defaults:

| Label | Dev default | Prod default | Use case |
|-------|-------------|--------------|----------|
| *(none)* | 0 min | 15 min | Normal deploys |
| `deploy:quick` | 0 min | 0 min | Hotfixes, config changes |
| `deploy:default` | 15 min | 15 min | Explicit standard delay |
| `deploy:long` | 1 hour | 1 hour | Large updates during peak hours |

**Release** (`release:*`) — triggers a tagged GitHub release after successful deploy:

| Label | Effect |
|-------|--------|
| *(none)* | Bump patch version |
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

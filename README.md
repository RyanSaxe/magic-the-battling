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
```

Open http://localhost:5173 in your browser.

## Testing

```sh
# backend
uv run pytest

# frontend
cd web && npm test
```

### Performance Testing

The project includes a protocol-level multiplayer load harness that simulates game sessions over REST + WebSocket
without driving the UI.

```sh
# run the server in synthetic battler mode (deterministic, no external cube fetches)
MTB_SYNTHETIC_BATTLER=1 uv run uvicorn server.main:app --host 0.0.0.0 --port 8000

# run load test + threshold checks (writes JSON + Markdown report under tests/perf/reports)
uv run python -m server.perf.load_harness --games 1000 --max-parallel-games 200 --server-pid <uvicorn_pid>
```

Synthetic battler defaults are production-like (`240` playable cards, `4` upgrades). Override with:
- `MTB_SYNTHETIC_CARD_COUNT`
- `MTB_SYNTHETIC_UPGRADES_COUNT`
- `MTB_SYNTHETIC_VANGUARDS_COUNT`

Abandoned game TTL defaults:
- pending lobby games: 15 minutes (`MTB_PENDING_ABANDONED_TTL_SECONDS`)
- multiplayer started games: 1 hour (`MTB_MULTIPLAYER_ABANDONED_TTL_SECONDS`)
- solo (one human + puppets) started games: 24 hours (`MTB_SOLO_ABANDONED_TTL_SECONDS`)

Thresholds are configured in `tests/perf/thresholds.json`.
Use `--threshold-file` to point to an environment-specific threshold set.

## API Docs

Start the dev server and visit [`/docs`](http://localhost:8000/docs) for the auto-generated OpenAPI reference.

## Deployment

Deployed to [Fly.io](https://fly.io) via Docker — see `fly.toml` and `Dockerfile`.

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

## API Docs

Start the dev server and visit [`/docs`](http://localhost:8000/docs) for the auto-generated OpenAPI reference.

## Deployment

Deployed to [Fly.io](https://fly.io) via Docker — see `fly.toml` and `Dockerfile`.

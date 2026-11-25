# Local setup

## Prerequisites

- **Python 3.12+** and [`uv`](https://docs.astral.sh/uv/)
- **Node.js 20+** and `npm`

## Install dependencies

```sh
uv sync --group dev
cd web && npm ci && cd ..
```

If you need to test share-card PNG rendering locally (via `server/services/preview.py`), install Chromium for Playwright once:

```sh
uv run playwright install chromium
```

Set `MTB_DISABLE_PREVIEW=1` if you want to run without the Playwright preview service.

## Run the development stack

`uv run dev` launches both FastAPI (`uvicorn`) and Vite (`web/`), and sets `MTB_LOCAL_DEV=1` so local runs use the development auth signing key automatically.

```sh
# Backend on :8000 + Vite HMR frontend on :3000
uv run dev

# Enable Python auto-reload on backend edits
uv run dev --reload

# Build web/dist once and serve the SPA directly from FastAPI on :8000
uv run dev --build

# Disable WebSocket gzip compression for readable frames in browser DevTools
uv run dev --no-compress

# Run against an isolated temporary copy of ./data/mtb.db (deleted on exit)
uv run dev --build --backend-port 8100 --db-copy
uv run dev --backend-port 8200 --frontend-port 3200 --db-copy
```

Pass `--db-source /path/to/mtb.db` with `--db-copy` to clone a specific SQLite file instead of `DATABASE_PATH` or `./data/mtb.db`.

Once the backend is running, open `http://localhost:8000/docs` for the interactive OpenAPI reference.

## Tests, linting, and type checks

Run the same checks that `.github/workflows/ci.yml` executes on pull requests:

```sh
# Backend lint, formatting, and static type check
uvx ruff check .
uvx ruff format --check .
uvx ty check

# Backend unit and integration tests
uv run pytest

# Frontend lint, TypeScript check, Vitest suite, and production bundle
cd web
npm run lint
npm run typecheck
npm test
npm run build
```

If you use `pre-commit` or `prek`, `.pre-commit-config.yaml` runs `ruff`, `ruff-format`, `ty`, `eslint`, and `typecheck-web` on changed files.

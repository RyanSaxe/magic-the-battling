# Working on Pitfight

Pitfight is a web app for playing a Magic: The Gathering format that mixes cube
drafting with roguelike elimination fights. See [README.md](README.md) for the
overview and [docs/README.md](docs/README.md) for setup, architecture,
development recipes, and reference tables.

## Repository boundaries

- `pitfight/`: pure Python game rules, models, phases, and CubeCobra/Scryfall
  loaders. Imports nothing from `server/`.
- `server/`: FastAPI HTTP/WebSocket app (`routers/`), single-owner game and
  connection services (`services/game/`, `services/connection_manager.py`),
  SQLite models and migrations (`db/`), runtime config (`runtime_config.py`),
  and load harness (`perf/`).
- `web/src/`: React and TypeScript client (`pages/`, `components/`, `hooks/`,
  unified layout engine in `layout/`, Guided Mode in `guided/`). `web/src/docs/`
  is the in-app player rules guide, not contributor docs.
- `tests/`: pytest suite and active snapshot fixtures
  (`tests/fixtures/active_game_snapshots/`). Web tests sit next to source files
  as `*.test.ts(x)` and Playwright specs live in `web/e2e/`.

## Names

Use player-facing names in `README.md`, `web/src/docs/`, and anything else
players read. Keep internal names in code and contributor docs only.

| In the code | Players see (limited) | Players see (constructed) |
| --- | --- | --- |
| `pitfight` (Python package) | Pitfight | Pitfight |
| `pitfight_*` (browser storage, migrated from `mtb_*`) | — | — |
| `battler` | Cube | Deck |
| `battle` (phase id) | Fight | Fight |
| `MTB_*` (environment variables) | — | — |
| `data/mtb.db` (default SQLite path) | — | — |
| `magic-the-battling` (Fly apps) | — | — |

Never rename a `pitfight_*` browser storage key without migrating existing keys,
because stored keys hold player sessions, names, and saved layouts.

## Rules for changes

- Run Python tools with `uv run` (`ruff`, `ty`, `pytest`) and add packages with
  `uv add` so versions stay pinned to `pyproject.toml`. Ask before adding any
  Python or npm dependency.
- Keep source files at or under 1,000 lines, pass Ruff `ALL` and `ty` for
  Python, and pass strict type-aware `oxlint` and `oxfmt` for web code.
- Import `useEffect` and `useLayoutEffect` only inside `web/src/hooks/`.
- Write a comment only when the code needs to explain why.
- Add a behavioral test when fixing a bug that could regress (pytest for rules
  and server, Vitest for web). Fix the code when a test fails; change a test
  only when the test itself is wrong and explain why in the PR.
- Keep `tests/fixtures/active_game_snapshots/` restorable. If a change breaks
  restoring an active snapshot, keep the old format readable rather than
  regenerating fixtures.

## Checks

```sh
uvx prek@0.5.11 run --all-files --show-diff-on-failure
uv run pytest
(cd web && npm run build && npm test)
```

See [docs/development.md](docs/development.md) for Playwright E2E, the load
harness, and the Docker `image-boot` check (required by CI when `server/`,
`pitfight/`, `scripts/`, `Dockerfile`, `fly*.toml`, `pyproject.toml`, `uv.lock`,
or snapshot fixtures change).

## Branches, deploys, and releases

Branch from `develop` and open pull requests into `develop` using
[Conventional Commits](https://www.conventionalcommits.org) for commit messages
and PR titles. Merging into `develop` deploys staging; merging `develop` into
`main` deploys production and tags a release (see
[docs/reference.md](docs/reference.md#deploy-and-release-pr-labels)).

Without asking, you may create branches, commit, push, and open or update pull
requests into `develop`. Ask before merging any pull request, adding `deploy:`
or `release:` labels, running `fly` commands, or changing
`server/db/maintenance.py`.

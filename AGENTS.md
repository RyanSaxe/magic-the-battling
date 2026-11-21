# Working on Pitfight

Pitfight is a web app for playing a Magic: The Gathering format that mixes
cube drafting with roguelike elimination fights. Players draft, build a hand,
fight each other, take poison, and the last one standing wins.
[README.md](README.md) covers running and deploying the app. This file covers
changing it.

## Setup

```sh
uv sync                   # Python dependencies
(cd web && npm ci)        # web dependencies
uv run dev                # backend on :8000, Vite on :3000
```

Open <http://localhost:3000>. Vite proxies `/api` and `/ws` to the backend.
`uv run dev --help` lists the options: `--backend-port` and `--frontend-port`
move the servers when a port is taken, `--build` serves the built frontend
from the backend as production does, and `--db-copy` runs against a temporary
copy of the database.

The local database is `data/mtb.db`, created on first start. Goldfish games
use past games of the same cube and settings as opponents, so on a fresh
database Goldfish fails with "Not enough puppet data". Seed synthetic opponents
for the default cube with:

```sh
uv run python -c "
from pathlib import Path
from server.perf.load_harness import seed_puppet_histories
for upgrades in (True, False):
    seed_puppet_histories(Path('data/mtb.db'), cube_id='auto', use_upgrades=upgrades,
                          use_vanguards=False, min_histories=24)
"
```

Their cards are mock cards, so they look odd in a fight.

## Modules

- `mtb/` holds the game rules and imports nothing from the server.
  `models/` has the game, player and card types, `phases/` has one module per
  phase (draft, build, battle, reward) plus elimination, and `utils/` fetches
  cubes from CubeCobra and card data from Scryfall.
- `server/` is the FastAPI app. `routers/` has the HTTP routes and the game
  websocket (`ws.py`). `services/game_manager.py` owns every live game: it
  creates and starts games, applies each player's actions, saves snapshots
  and evicts idle games.
  `db/` has the SQLite models and the maintenance migrations, which
  `scripts/maintain_db.py` applies on every deploy. `runtime_config.py`
  reads most of the `MTB_` environment variables, and `perf/` has the load-test
  harness.
- `web/src/` is the React client. `pages/` has one component per route in
  `App.tsx`, with the four game phases in `pages/phases/`. `hooks/` holds the
  game state (`useGame`, `useWebSocket`) and the card layout
  (`useCardLayout`, `computeConstrainedLayout`). `guided/` is the Guided Mode
  walkthrough, and `docs/` is the Markdown that the in-app guide shows
  players, so it describes the rules as players see them.
- `tests/` has the pytest suite. Web tests sit beside their source as
  `*.test.ts` and run with Vitest.

## Names

The code keeps the project's original name, Magic: The Battling, and players
see Pitfight. Use these names in anything a player reads:

| In the code                       | Players see (limited)    | Players see (constructed) |
| --------------------------------- | ------------------------ | ------------------------- |
| `mtb` (Python package)            | —                        | —                         |
| `battler`                         | Cube                     | Deck                      |
| `battle` (phase id)               | Fight                    | Fight                     |
| `mtb_` (browser storage keys)     | —                        | —                         |
| `MTB_` (environment variables)    | —                        | —                         |
| `magic-the-battling` (Fly apps)   | —                        | —                         |

Never rename an `mtb_` browser storage key without migrating it, because the
old key holds each player's session, name and settings.

This file is the only place that explains the internal names. Keep them out of
the README, the docs in `web/src/docs/` and anything else players can read.

## Rules for the code

- Run Python with `uv run` and add packages with `uv add`. Run ruff and ty
  with `uv run` too, which uses the versions pinned in `pyproject.toml`.
  `uvx` ignores the pin.
- Ask before adding a Python or npm dependency.
- Write a comment only to say why the code does something unexpected. Names
  and structure say what it does.
- When you fix a bug that could come back, add a test that fails without the
  fix, through the interface where the bug showed: pytest for rules and server
  behavior, Vitest for web logic.
- When a test fails, fix the code. Change the test only when the test itself
  is wrong, and say why in the pull request.

## Checks

```sh
uv run ruff check . && uv run ruff format --check . && uv run ty check
uv run pytest
(cd web && npm run lint && npm run typecheck && npm run build && npm test)
```

The commit hook in `.pre-commit-config.yaml` runs ruff and ty with `uv run`,
then ESLint and the web type check. pre-commit itself isn't a project
dependency, so install the hook once per clone with `uvx pre-commit install`.
CI runs the same checks, pytest with coverage, the web build, `npm test` and a
load test on every pull request.

## Branches, deploys and releases

Branch from `develop` and open pull requests into `develop`. Merging into
`develop` deploys the dev app, `magic-the-battling-dev` on Fly, and a pull
request from `develop` into `main` deploys production. Labels on the merged
pull request set how long players are warned before the restart and whether
a release is tagged. README.md lists the labels.

Without asking, you may create branches, commit, push them and open or update
pull requests into `develop`. Ask before merging any pull request, adding
`deploy:` or `release:` labels, running `fly` commands, or changing
`server/db/maintenance.py`. Each of those deploys, restarts or migrates the
game that players are using.

Write commit messages and pull request titles as
[Conventional Commits](https://www.conventionalcommits.org), such as
`fix: let the play setup screen scroll on short phones`.

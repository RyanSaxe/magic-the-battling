# Getting started

This tutorial takes a fresh checkout to a running local game and walks through a
solo round against synthetic opponents.

## Prerequisites

- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)
- Node.js 26 or newer and npm

## 1. Install dependencies

Clone the repository and install both the Python and web dependencies:

```sh
git clone https://github.com/RyanSaxe/magic-the-battling.git
cd magic-the-battling
uv sync
(cd web && npm ci)
```

## 2. Start the local servers

Run the combined development launcher:

```sh
uv run dev
```

This starts the FastAPI backend on `http://localhost:8000` and Vite on
`http://localhost:3000`. Vite proxies `/api` and `/ws` to the backend, and the
first startup creates a local SQLite database at `data/mtb.db`.

Common launcher flags:

```sh
uv run dev --reload                                    # auto-reload backend on edits
uv run dev --build                                     # serve built web/dist on :8000
uv run dev --backend-port 8100 --frontend-port 3100    # move ports when defaults are busy
uv run dev --db-copy                                   # run against a temporary DB copy
```

## 3. Seed synthetic opponents for solo play

Solo (Goldfish) games match you against recorded histories from past games of
the same cube and settings. On a fresh database, starting a solo game fails with
"Not enough puppet data" until histories exist.

Seed synthetic opponents for the default `auto` cube:

```sh
uv run python -c "
from pathlib import Path
from server.perf.load_harness import seed_puppet_histories
for upgrades in (True, False):
    seed_puppet_histories(
        Path('data/mtb.db'),
        cube_id='auto',
        use_upgrades=upgrades,
        use_vanguards=False,
        min_histories=24,
    )
"
```

Seeded opponents use mock cards, so their boards look synthetic during a fight.

## 4. Play a solo round

1. Open `http://localhost:3000` in your browser.
2. Start a solo game with the default cube.
3. In Draft, swap cards into your pool until your picks finish.
4. In Build, choose your hand and submit it.
5. In Fight, play out the matchup and report the result, then claim your reward
   for the next round.

The backend also exposes the auto-generated OpenAPI documentation at
`http://localhost:8000/docs`.

## Next steps

- Run the check suite and tests in [Development](development.md).
- Read how the client, server, and rules engine fit together in
  [Architecture](architecture.md).

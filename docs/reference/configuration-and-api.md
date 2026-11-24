# Configuration and API

## Environment variables

All runtime settings are read in `server/runtime_config.py`, `server/main.py`, `server/db/database.py`, and `scripts/start_server.sh`.

### Core and security

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/mtb.db` (`/data/mtb.db` in Docker) | SQLite database file path. |
| `MTB_ENV` | `""` | Environment name (`dev`/`development`/`local`/`test` enables local dev mode; `prod`/`production`/`staging` disables it). |
| `MTB_LOCAL_DEV` | Auto (`1` in `uv run dev` and pytest) | Explicit boolean override for local dev mode. Disables `Secure` auth cookies and allows the default dev signing key. |
| `MTB_AUTH_SECRET_KEY` | Required outside local dev | JWT signing secret. Production startup fails if unset or set to a placeholder key. |
| `MTB_AUTH_TOKEN_EXPIRE_HOURS` | `168` | Auth session token lifetime in hours. |
| `MTB_OPS_TOKEN` | `""` | Shared secret checked in `x-ops-token` header for `/api/ops/*` endpoints. |
| `MTB_CANONICAL_HOST` | `""` | When set, 301-redirects other `Host` headers to HTTPS on this host (exempting `/health` and `/api/ops/mode`). |
| `MTB_DISABLE_PREVIEW` | `false` | Disables the Playwright share-card preview renderer when truthy. |
| `MTB_COMPRESS_WS` | `1` (`0` with `uv run dev --no-compress`) | Enables gzip compression on outbound WebSocket frames. |
| `MTB_RUN_DB_MAINTENANCE_ON_STARTUP` | `1` | Runs `scripts/maintain_db.py --apply` inside `scripts/start_server.sh` before starting Uvicorn. |

### Capacity, snapshots, and eviction

| Variable | Default | Purpose |
| --- | --- | --- |
| `MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS` | `true` | Restores saved active-game snapshots from SQLite on startup. |
| `MTB_SNAPSHOT_INTERVAL_SEC` | `5.0` | Seconds between periodic active-game snapshot writes. |
| `MTB_IDLE_EVICT_MINUTES` | `20` | Minutes of inactivity before an active game is evicted from memory. |
| `MTB_HOT_ACTION_WINDOW_MINUTES` | `20` | Activity window used to classify a loaded game as hot. |
| `MTB_MAX_HOT_GAMES` | `250` | Target ceiling on concurrently hot games in memory. |
| `MTB_MAX_TOTAL_LOADED_GAMES_HARD` | `900` | Hard cap on total loaded games in memory. |
| `MTB_MAX_PENDING_GAMES` | `400` | Maximum concurrent lobby/pending games. |
| `MTB_MAX_WS_CONNECTIONS` | `1800` | Maximum open player WebSocket connections (rejects with close code `1013` when full). |
| `MTB_MAX_GAME_STARTS_IN_FLIGHT` | `100` | Concurrent game-start tasks allowed. |
| `MTB_MAX_GAME_START_QUEUE` | `2000` | Maximum queued game-start requests. |
| `MTB_MAX_BATTLER_PRELOADS_IN_FLIGHT` | `12` | Concurrent CubeCobra/card preload tasks allowed. |
| `MTB_MAX_SESSIONS_TOTAL` | `50000` | Maximum tracked player sessions before cleanup. |
| `MTB_SESSION_TTL_MINUTES` | `1440` | Session TTL in minutes (24 hours). |
| `MTB_MAX_SPECTATE_REQUESTS_TOTAL` | `5000` | Cap on tracked spectate approval requests. |
| `MTB_SPECTATE_REQUEST_TTL_MINUTES` | `30` | Spectate request TTL in minutes. |
| `MTB_STALE_GAME_CLEANUP_HOURS` | `48` | Age threshold for cleaning up stale games. |

## HTTP API routes

Start the backend and open `http://localhost:8000/docs` for full request/response schemas. Top-level route groups defined in `server/main.py` and `server/routers/`:

| Prefix / route | Router | Responsibilities |
| --- | --- | --- |
| `/health`, `/api/server/status` | `server/main.py` | Health probe and public server mode banner (`normal`, `draining`, `maintenance`). |
| `/api/auth` | `auth.py` | `POST /register`, `POST /login`, `POST /logout`, `GET /me`. |
| `/api/games` | `games.py` | Create/join/rejoin/start games, warm cubes (`/cubes/warm`), lobby/cards/status/bootstrap queries, spectate requests, and share JSON (`/{game_id}/share/{player_name}`). |
| `/api/battlers` | `battlers.py` | CRUD for user cubes/decks, game history (`/cube/{cube_id}/games`, `/{battler_id}/games`, `/my-games`), and cube follows (`/following`, `/follow`). |
| `/api/discover` | `discover.py` | Public cube and recent-game discovery feed. |
| `/api/ops` | `ops.py` | Token-protected ops endpoints (`GET /state`, `POST /mode`, `GET /capacity`, `POST /runtime-reset`). |
| `/game/{game_id}/share/{player_name}` | `share_preview.py` | Share HTML page with OpenGraph metadata and `/preview.png` rendered via Playwright. |

## WebSocket protocol (`/ws/{game_id}`)

Gameplay mutations flow over `/ws/{game_id}` (`server/routers/ws.py`). Every action is validated against the player's current phase (`ACTION_REQUIRED_PHASES`):

- **`draft`**: `draft_swap`, `draft_roll`, `draft_done`
- **`build`**: `build_move`, `build_swap`, `build_ready`, `build_unready`, `build_apply_upgrade`, `build_set_companion`, `build_remove_companion`
- **`battle`**: `battle_move`, `battle_reveal_upgrade`, `battle_submit_result`, `battle_update_card_state`, `battle_update_life`, `battle_pass_turn`
- **`reward`**: `reward_pick_upgrade`, `reward_apply_upgrade`, `reward_done`

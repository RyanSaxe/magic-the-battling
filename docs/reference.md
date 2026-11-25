# Reference

Lookup tables for environment variables, CLI tools, pull request labels, and
browser storage keys.

## Environment variables

### Core and authentication

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/mtb.db` (`/data/mtb.db` in Docker) | SQLite database file path |
| `MTB_ENV` | `""` | Environment name (`dev`/`development`/`local`/`test` enables local mode; `prod`/`production`/`staging` disables it) |
| `MTB_LOCAL_DEV` | Derived from `MTB_ENV` / pytest | Explicit boolean override for local dev mode (`1`/`true`/`yes`/`on` or `0`/`false`/`no`/`off`) |
| `MTB_AUTH_SECRET_KEY` | Local dev constant (required in prod) | JWT signing secret; production rejects empty and default dev values |
| `MTB_AUTH_TOKEN_EXPIRE_HOURS` | `168` | Auth JWT lifetime in hours (min `1`) |
| `MTB_OPS_TOKEN` | `""` | Shared secret checked against the `x-ops-token` header on `/api/ops/*` |
| `MTB_CANONICAL_HOST` | `""` | Redirects non-matching hosts to this canonical hostname when set |
| `FLY_APP_NAME` | Set by Fly.io | Enables trusting `Fly-Client-IP` proxy headers |

### Startup and runtime features

| Variable | Default | Purpose |
| --- | --- | --- |
| `MTB_COMPRESS_WS` | `1` | Compresses WebSocket payloads; set to `0` for plain JSON in DevTools |
| `MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS` | `true` | Restores `active_game_snapshots` on server boot |
| `MTB_RUN_DB_MAINTENANCE_ON_STARTUP` | `1` | Runs `scripts/maintain_db.py --apply` in `scripts/start_server.sh` before starting Uvicorn |
| `MTB_DISABLE_PREVIEW` | `""` (enabled) | Set to `1`/`true`/`yes`/`on` to disable Playwright share-preview rendering |

### Capacity and lifecycle limits

Read by `server/runtime_config.py`. Minimum values are clamped to `1` unless
noted.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MTB_SNAPSHOT_INTERVAL_SEC` | `5.0` | Seconds between dirty snapshot flushes and eviction checks (min `1.0`) |
| `MTB_IDLE_EVICT_MINUTES` | `20` | Minutes of inactivity before an active game evicts from memory |
| `MTB_HOT_ACTION_WINDOW_MINUTES` | `20` | Activity window in minutes classifying a loaded game as hot |
| `MTB_MAX_HOT_GAMES` | `250` | Cap on concurrently hot loaded games |
| `MTB_MAX_TOTAL_LOADED_GAMES_HARD` | `900` | Hard cap on total loaded games in memory |
| `MTB_MAX_PENDING_GAMES` | `400` | Maximum open lobbies waiting to start |
| `MTB_MAX_WS_CONNECTIONS` | `1800` | Maximum concurrent WebSocket connections |
| `MTB_MAX_GAME_STARTS_IN_FLIGHT` | `100` | Concurrent game-start semaphore limit |
| `MTB_MAX_GAME_START_QUEUE` | `2000` | Maximum queued game-start waiters |
| `MTB_MAX_BATTLER_PRELOADS_IN_FLIGHT` | `12` | Concurrent cube and deck preload limit |
| `MTB_MAX_SESSIONS_TOTAL` | `50000` | Maximum tracked player and spectator sessions (min `100`) |
| `MTB_SESSION_TTL_MINUTES` | `1440` | Session lifetime in minutes |
| `MTB_MAX_SPECTATE_REQUESTS_TOTAL` | `5000` | Maximum pending spectate requests (min `100`) |
| `MTB_SPECTATE_REQUEST_TTL_MINUTES` | `30` | Spectate request TTL in minutes |
| `MTB_STALE_GAME_CLEANUP_HOURS` | `48` | Age in hours before stale DB game records are removed |

### Operations script variables

Required by `scripts/ops_mode.sh`:

| Variable | Purpose |
| --- | --- |
| `APP_BASE_URL` | Base URL of the deployed server (e.g. `https://<app>.fly.dev`) |
| `OPS_API_TOKEN` | Value sent in the `x-ops-token` header |
| `OPS_UPDATED_BY` | Operator or workflow identifier recorded with the mode change |

## CLI tools and scripts

| Command | Source | Purpose |
| --- | --- | --- |
| `uv run dev` | `server/dev.py` | Start FastAPI (`:8000`) and Vite (`:3000`); supports `--reload`, `--build`, `--no-compress`, `--backend-port`, `--frontend-port`, `--db-copy`, `--db-source` |
| `uv run perf-load` | `server/perf/load_harness.py` | Run concurrent bot load sweeps and memory/latency reports (`--help` for all flags) |
| `uv run python scripts/maintain_db.py` | `scripts/maintain_db.py` | Inspect or `--apply` deploy-safe SQLite snapshot migrations and preset table maintenance |
| `uv run --no-project python scripts/check_image_boot.py IMAGE` | `scripts/check_image_boot.py` | Boot a Docker image offline on an empty volume and on `tests/fixtures/active_game_snapshots/` |
| `sh scripts/ops_mode.sh MODE [MESSAGE]` | `scripts/ops_mode.sh` | Set server ops mode (`normal`, `draining`, or `maintenance`) via `POST /api/ops/mode` |
| `uv run python scripts/fly_activity_report.py` | `scripts/fly_activity_report.py` | Summarize Fly machine status, checks, logs (`fly`, `file`, or `both`), memory, and SQLite activity |

## Deploy and release PR labels

Merges into `develop` trigger `.github/workflows/deploy-dev.yml`. Merges into
`main` trigger `.github/workflows/deploy-main.yml`, which deploys production and
creates a GitHub release.

### Deploy delay (`deploy:*`)

| Label | Staging (`develop`) | Production (`main`) | Use case |
| --- | --- | --- | --- |
| *(none)* | 0 min | 15 min | Normal deploy |
| `deploy:quick` | 0 min | 0 min | Hotfixes and config changes |
| `deploy:default` | 15 min | 15 min | Explicit 15-minute draining window |
| `deploy:long` | 1 hour | 1 hour | Large updates during peak hours |

### Release version (`release:*`)

Applies to merges into `main`. Deploy and release labels can be combined on the
same pull request.

| Label | Effect |
| --- | --- |
| *(none)* | Bump patch version |
| `release:patch` | Bump patch version (e.g. `v1.0.0` to `v1.0.1`) |
| `release:minor` | Bump minor version (e.g. `v1.0.0` to `v1.1.0`) |
| `release:major` | Bump major version (e.g. `v1.0.0` to `v2.0.0`) |

## Browser storage keys

The web client writes keys under the `pitfight_*` prefix and migrates existing
`mtb_*` keys on first read so returning players keep their identity, active
seats, and layout preferences.

### `localStorage`

| Key | Legacy key | Purpose |
| --- | --- | --- |
| `pitfight_device_id` | `mtb_device_id` | Persistent anonymous device ID for seat ownership and reconnection |
| `pitfight_guest_name` | `mtb_guest_name` | Last entered guest display name |
| `pitfight_game_player_map` | `mtb_game_player_map` | Per-game remembered player name for resuming seats |
| `pitfight_game_new_player_pref_map` | `mtb_game_new_player_pref_map` | Per-game Guided Mode preference |
| `pitfight_guided_mode_preference` | `mtb_guided_mode_preference` | Global Guided Mode opt-in setting |
| `pitfight_played_before` | `mtb_played_before` | Tracks whether this browser has played before |
| `pitfight_spectator_name` | `mtb_spectator_name` | Last entered spectator display name |
| `pitfight_signed_in` | `mtb_signed_in` | Cached sign-in hint (`"1"` or `"0"`) |
| `pitfight_guided_progress` | `mtb_guided_progress` | Completed Guided Mode walkthrough steps |
| `pitfight_zone_constraints:v2:<scope>` | `mtb_zone_constraints:v2:<scope>` | Saved zone divider constraints per viewport band and phase |
| `pitfight_rules_panel_window:v2` | `mtb_rules_panel_window:v2` / `:v1` | Saved desktop position and size of the Quick Guide window |
| `pitfight_server_notice_window:v1` | `mtb_server_notice_window:v1` | Saved desktop position of the server status notice window |

### `sessionStorage`

| Key | Legacy key | Purpose |
| --- | --- | --- |
| `pitfight_session:<gameId>` | `mtb_session:<gameId>` (`mtb_session`, `mtb_player`) | Active tab player session token and ID for a game |
| `pitfight_spectate:<gameId>` | `mtb_spectate:<gameId>` | Active tab spectator session for a game |
| `pitfight_voice_muted` | `mtb_voice_muted` | Local voice chat mute state |
| `pitfight_voice_muted_peers` | `mtb_voice_muted_peers` | Muted peer list for voice chat |

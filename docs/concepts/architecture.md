# Architecture

Crucible is split into three layers: a pure-Python rules engine (`mtb/`), a stateful FastAPI and WebSocket server (`server/`), and a React TypeScript client (`web/`).

## Three-layer split

- **`mtb/` (rules engine)**: Pure Pydantic models and phase transition functions with no HTTP or WebSocket dependencies. Handles card registries, pack dealing, build validation, battle zone setup, poison damage calculation, eliminations, and sudden death.
- **`server/` (runtime and API)**: FastAPI application (`server/main.py`) with REST routers (`server/routers/`), a real-time WebSocket hub (`ws.py`), `GameManager` lifecycle management, SQLite WAL persistence (`server/db/`), observability logging, and a headless Chromium service (`server/services/preview.py`) that renders shareable end-of-game summary PNGs.
- **`web/` (client SPA)**: React 19 + Vite application (`web/src/`) served by Vite in dev or directly from `web/dist/` by FastAPI in production. Implements lobbies, `@dnd-kit` drag-and-drop card zones, live battle tables, cube/deck dashboards, discover pages, and share embeds.

## Game flow and phase machine

Games run in either `limited` mode (players draft from a shared Cube) or `constructed` mode (players draw packs from their own Decks). Card lists are fetched from CubeCobra and enriched with Scryfall data (`mtb/utils/cubecobra.py`, `mtb/utils/scryfall.py`).

Each round moves players through a strict phase machine (`mtb/models/types.py`):

1. **`draft`**: Players receive packs, swap cards into their hand/sideboard/upgrades, roll packs, and finish drafting (`mtb/phases/draft.py`).
2. **`build`**: Players arrange their active hand to match their current hand size, choose basic lands (`Plains`, `Island`, `Swamp`, `Mountain`, `Forest`, `Wastes`), apply upgrades or companions, set play/draw preference, and mark ready (`mtb/phases/build.py`).
3. **`battle`**: Ready players pair off into live battles (`mtb/phases/battle.py`). Inside a battle, players manage card state (tap, flip, counters, attachments, tokens, library draw/shuffle), track life, reveal upgrades, and submit results.
4. **`reward`**: Winners deal poison (`1 + count_applied_upgrades` when upgrades are enabled, or a Fibonacci progression otherwise), losers and winners collect post-battle rewards, and players advance rounds and stages (`mtb/phases/reward.py`).
5. **`elimination` and sudden death**: Once battles settle, participants at or above `poison_to_lose` are eliminated (`mtb/phases/elimination.py`). If lethal eliminations would leave fewer than two survivors, the two lowest-poison lethal participants fight in sudden death.

### Ghosts and historical puppets

- **Ghosts**: When an elimination leaves an odd number of active participants, the most recently eliminated player is frozen as a `StaticOpponent` ghost so pairings stay balanced.
- **Puppets**: Games can include `Puppet` opponents backed by recorded round-by-round `BattleSnapshot` history from prior games, allowing smaller lobbies or solo sessions to play full pods.

## Server runtime, snapshots, and persistence

- **Phase-gated WebSockets**: Clients connect to `/ws/{game_id}`. Every game action (`draft_*`, `build_*`, `battle_*`, `reward_*`) is checked against `ACTION_REQUIRED_PHASES` before mutating state, and outbound state updates use gzip compression (`server/compression.py`, toggleable via `MTB_COMPRESS_WS`).
- **Hot/cold game lifecycle**: `GameManager` keeps active games in memory up to configured capacity caps (`MTB_MAX_HOT_GAMES`, `MTB_MAX_TOTAL_LOADED_GAMES_HARD`), periodically persists slim snapshots to `ActiveGameSnapshot` in SQLite (`MTB_SNAPSHOT_INTERVAL_SEC`, default `5.0` s), evicts idle games after `MTB_IDLE_EVICT_MINUTES`, and restores active snapshots on server restart unless `MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS=0`.
- **SQLite WAL storage**: `server/db/database.py` runs SQLite in `WAL` mode with a 5 s busy timeout and applies idempotent column migrations and cube metadata backfills on startup.

## Internal vs user-facing naming

Internal packages, environment variables, and Fly app names keep their legacy prefixes (`mtb`, `battler`, `magic-the-battling`) so existing databases, URLs, and configs stay stable, while user-facing copy always uses **Crucible**:

| Internal identifier | User-facing term |
| --- | --- |
| `mtb` (Python package) | Crucible |
| `battler` (`server/routers/battlers.py`, `Battler` model) | Cube (limited) / Deck (constructed) |
| `MTB_*` (environment variables) | Crucible server config |
| `magic-the-battling` (Fly app name) | Crucible production app |

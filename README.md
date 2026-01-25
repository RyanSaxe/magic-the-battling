# Magic: The Battling

An online application for playing Magic: The Battling, a unique Magic: The Gathering format that combines drafting with elimination-style battles.

## Rules

For complete rules and format details, see: https://cubecobra.com/cube/overview/auto

## Development

- Install deps: `uv sync`
- Run server: `uv run uvicorn app:app --reload`
- Open: http://localhost:8000/

The Draft page loads a local sandbox game and uses the API to deal packs and handle rolls. Network access to Cube Cobra/Scryfall is not required for this demo flow.

## API

- `POST /api/games`
  - Body: `{ "player_names": ["You"], "pack_size": 5, "demo": true }`
  - Optional live battler: pass `{ "demo": false, "battler_id": "<cube_id>", "upgrades_id": "...", "vanguards_id": "..." }`
  - Returns: `{ "game_id": "..." }`

- `GET /api/games/{game_id}/players`
  - Returns sorted players by poison then name.

- `POST /api/games/{game_id}/draft/deal`
  - Body: `{ "player_name": "You", "roll": false|true }`
  - Returns: `{ pack: Card[], treasures: number }`

- `POST /api/games/{game_id}/draft/swap`
  - Body: `{ player_name, from_zone, from_index, to_zone, to_index }`
  - Zones: `pack`, `hand`, `sideboard` (not `upgrades`)
  - Returns: `{ pack, hand, sideboard }`

- `POST /api/games/{game_id}/draft/apply-upgrade`
  - Body: `{ player_name, upgrade_index, target_zone, target_index }`
  - Returns: `{ upgrades, target, pack, hand, sideboard }`

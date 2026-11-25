import { readMigratedItem, removeStorageKeys } from "./storage";

const DEVICE_ID_KEY = "pitfight_device_id";
const LEGACY_DEVICE_ID_KEY = "mtb_device_id";
const GUEST_NAME_KEY = "pitfight_guest_name";
const LEGACY_GUEST_NAME_KEY = "mtb_guest_name";
const GAME_PLAYER_MAP_KEY = "pitfight_game_player_map";
const LEGACY_GAME_PLAYER_MAP_KEY = "mtb_game_player_map";
const GAME_NEW_PLAYER_PREF_MAP_KEY = "pitfight_game_new_player_pref_map";
const LEGACY_GAME_NEW_PLAYER_PREF_MAP_KEY = "mtb_game_new_player_pref_map";
const GUIDED_MODE_PREFERENCE_KEY = "pitfight_guided_mode_preference";
const LEGACY_GUIDED_MODE_PREFERENCE_KEY = "mtb_guided_mode_preference";
const PLAYED_BEFORE_KEY = "pitfight_played_before";
const LEGACY_PLAYED_BEFORE_KEY = "mtb_played_before";
const SPECTATOR_NAME_KEY = "pitfight_spectator_name";
const LEGACY_SPECTATOR_NAME_KEY = "mtb_spectator_name";
const GAME_PLAYER_PREF_KEY_SEP = "::";
const MAX_TRACKED_GAMES = 100;

interface TrackedPlayerEntry {
  name: string;
  seen_at: number;
  seat_token?: string;
  join_code?: string;
}

/** A seat this browser has held in a game: the name it plays under and the token that reclaims it. */
export interface RememberedSeat {
  gameId: string;
  name: string;
  seatToken: string | null;
  joinCode: string | null;
  seenAt: number;
}

interface NewPlayerPreferenceEntry {
  is_new_player: boolean;
  seen_at: number;
}

type TrackedPlayerMap = Record<string, TrackedPlayerEntry>;
type NewPlayerPreferenceMap = Record<string, NewPlayerPreferenceEntry>;

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readTrackedPlayerMap(): TrackedPlayerMap {
  if (!canUseStorage()) return {};

  try {
    return parseTrackedPlayerMap(
      readMigratedItem(
        window.localStorage,
        GAME_PLAYER_MAP_KEY,
        LEGACY_GAME_PLAYER_MAP_KEY,
      ),
    );
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTrackedPlayerEntry(value: unknown): TrackedPlayerEntry | null {
  if (!isRecord(value)) return null;
  const {
    name,
    seen_at: seenAt,
    seat_token: seatToken,
    join_code: joinCode,
  } = value;
  if (typeof name !== "string" || !name) return null;
  if (typeof seenAt !== "number") return null;
  const entry: TrackedPlayerEntry = { name, seen_at: seenAt };
  if (typeof seatToken === "string" && seatToken) {
    entry.seat_token = seatToken;
  }
  if (typeof joinCode === "string" && joinCode) {
    entry.join_code = joinCode;
  }
  return entry;
}

function parseTrackedPlayerMap(raw: string | null): TrackedPlayerMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const result: TrackedPlayerMap = {};
    for (const [gameId, value] of Object.entries(parsed)) {
      const entry = parseTrackedPlayerEntry(value);
      if (entry) result[gameId] = entry;
    }
    return result;
  } catch {
    return {};
  }
}

function parseNewPlayerPreferenceEntry(
  value: unknown,
): NewPlayerPreferenceEntry | null {
  if (!isRecord(value)) return null;
  const { is_new_player: isNewPlayer, seen_at: seenAt } = value;
  if (typeof isNewPlayer !== "boolean") return null;
  if (typeof seenAt !== "number") return null;
  return { is_new_player: isNewPlayer, seen_at: seenAt };
}

function readNewPlayerPreferenceMap(): NewPlayerPreferenceMap {
  if (!canUseStorage()) return {};

  try {
    const raw = readMigratedItem(
      window.localStorage,
      GAME_NEW_PLAYER_PREF_MAP_KEY,
      LEGACY_GAME_NEW_PLAYER_PREF_MAP_KEY,
    );
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const result: NewPlayerPreferenceMap = {};
    for (const [gameId, value] of Object.entries(parsed)) {
      const entry = parseNewPlayerPreferenceEntry(value);
      if (entry) result[gameId] = entry;
    }
    return result;
  } catch {
    return {};
  }
}

function writeTrackedPlayerMap(map: TrackedPlayerMap): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(GAME_PLAYER_MAP_KEY, JSON.stringify(map));
  } catch {
    // Best effort only.
  }
}

function writeNewPlayerPreferenceMap(map: NewPlayerPreferenceMap): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      GAME_NEW_PLAYER_PREF_MAP_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Best effort only.
  }
}

function pruneTrackedPlayerMap(map: TrackedPlayerMap): TrackedPlayerMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_TRACKED_GAMES) return map;

  entries.sort((a, b) => b[1].seen_at - a[1].seen_at);
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_GAMES));
}

function pruneNewPlayerPreferenceMap(
  map: NewPlayerPreferenceMap,
): NewPlayerPreferenceMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_TRACKED_GAMES) return map;

  entries.sort((a, b) => b[1].seen_at - a[1].seen_at);
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_GAMES));
}

function generateDeviceId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateDeviceId(): string {
  if (!canUseStorage()) return "";

  const existing = readMigratedItem(
    window.localStorage,
    DEVICE_ID_KEY,
    LEGACY_DEVICE_ID_KEY,
  );
  if (existing) return existing;

  const next = generateDeviceId();
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, next);
  } catch {
    // Best effort only.
  }
  return next;
}

function buildTrackedPlayerEntry(
  playerName: string,
  details: { seatToken?: string; joinCode?: string },
  previous?: TrackedPlayerEntry,
): TrackedPlayerEntry {
  const entry: TrackedPlayerEntry = { name: playerName, seen_at: Date.now() };
  const token = details.seatToken ?? previous?.seat_token;
  const joinCode = details.joinCode ?? previous?.join_code;
  if (token) entry.seat_token = token;
  if (joinCode) entry.join_code = joinCode;
  return entry;
}

/** Remember this browser's seat in a game. Details not given keep what the same seat already had. */
export function rememberPlayerForGame(
  gameId: string,
  playerName: string,
  details: { seatToken?: string; joinCode?: string } = {},
): void {
  if (!gameId || !playerName) return;
  getOrCreateDeviceId();

  const map = readTrackedPlayerMap();
  const previous = map[gameId]?.name === playerName ? map[gameId] : undefined;
  map[gameId] = buildTrackedPlayerEntry(playerName, details, previous);
  writeTrackedPlayerMap(pruneTrackedPlayerMap(map));
}

function toRememberedSeat(
  gameId: string,
  entry: TrackedPlayerEntry,
): RememberedSeat {
  return {
    gameId,
    name: entry.name,
    seatToken: entry.seat_token ?? null,
    joinCode: entry.join_code ?? null,
    seenAt: entry.seen_at,
  };
}

export function getRememberedSeat(gameId: string): RememberedSeat | null {
  if (!gameId) return null;
  const entry = readTrackedPlayerMap()[gameId];
  return entry ? toRememberedSeat(gameId, entry) : null;
}

export function findRememberedSeatByJoinCode(
  joinCode: string,
): RememberedSeat | null {
  const wanted = joinCode.trim().toUpperCase();
  if (!wanted) return null;
  const match = Object.entries(readTrackedPlayerMap()).find(
    ([, entry]) =>
      entry.join_code?.toUpperCase() === wanted && entry.seat_token,
  );
  return match ? toRememberedSeat(match[0], match[1]) : null;
}

/** Seats this browser can reclaim, most recently seen first. */
export function listReclaimableSeats(limit: number): RememberedSeat[] {
  const reclaimable = Object.entries(readTrackedPlayerMap()).filter(
    ([, entry]) => entry.seat_token,
  );
  reclaimable.sort((a, b) => b[1].seen_at - a[1].seen_at);
  return reclaimable
    .slice(0, limit)
    .map(([gameId, entry]) => toRememberedSeat(gameId, entry));
}

export function forgetSeatForGame(gameId: string): void {
  const map = readTrackedPlayerMap();
  if (!(gameId in map)) return;
  delete map[gameId];
  writeTrackedPlayerMap(map);
}

/** Forgets an account's seats as it logs out, but not a guest's seat in the same game. The seats stay in play. */
export function forgetAccountSeats(
  seats: { game_id: string; player_name: string }[],
): void {
  for (const seat of seats) {
    if (getRememberedSeat(seat.game_id)?.name === seat.player_name) {
      forgetSeatForGame(seat.game_id);
    }
  }
}

/**
 * Whether this browser let go of its seat in a game it played, as Log Out and closing do. A name without a token holds
 * no seat: Resume remembers one before the server agrees. Forgetting always writes the remembered seats back, so a
 * browser without them stored hasn't forgotten any.
 */
export function hasForgottenSeat(gameId: string): boolean {
  if (
    !canUseStorage() ||
    readMigratedItem(
      window.localStorage,
      GAME_PLAYER_MAP_KEY,
      LEGACY_GAME_PLAYER_MAP_KEY,
    ) === null
  ) {
    return false;
  }
  return !getRememberedSeat(gameId)?.seatToken;
}

/** Calls `listener` with the games whose seats another tab forgot, even if one has been remembered again since. */
export function onSeatsForgotten(
  listener: (gameIds: string[]) => void,
): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== GAME_PLAYER_MAP_KEY) return;
    const kept = parseTrackedPlayerMap(event.newValue);
    listener(
      Object.keys(parseTrackedPlayerMap(event.oldValue)).filter(
        (gameId) => !(gameId in kept),
      ),
    );
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** The name this browser last played under without an account. An account's name always comes before it. */
export function getRememberedGuestName(): string | null {
  if (!canUseStorage()) return null;
  return readMigratedItem(
    window.localStorage,
    GUEST_NAME_KEY,
    LEGACY_GUEST_NAME_KEY,
  );
}

export function rememberGuestName(name: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(GUEST_NAME_KEY, name);
    removeStorageKeys(window.localStorage, [LEGACY_GUEST_NAME_KEY]);
  } catch {
    // Best effort only.
  }
}

export function hasPlayedBefore(): boolean {
  if (!canUseStorage()) return false;
  return (
    readMigratedItem(
      window.localStorage,
      PLAYED_BEFORE_KEY,
      LEGACY_PLAYED_BEFORE_KEY,
    ) === "1"
  );
}

export function markPlayedBefore(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PLAYED_BEFORE_KEY, "1");
    removeStorageKeys(window.localStorage, [LEGACY_PLAYED_BEFORE_KEY]);
  } catch {
    // Best effort only.
  }
}

export function getGlobalGuidedModePreference(): boolean | null {
  if (!canUseStorage()) return null;

  const raw = readMigratedItem(
    window.localStorage,
    GUIDED_MODE_PREFERENCE_KEY,
    LEGACY_GUIDED_MODE_PREFERENCE_KEY,
  );
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function setGlobalGuidedModePreference(enabled: boolean): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      GUIDED_MODE_PREFERENCE_KEY,
      enabled ? "1" : "0",
    );
    removeStorageKeys(window.localStorage, [LEGACY_GUIDED_MODE_PREFERENCE_KEY]);
  } catch {
    // Best effort only.
  }
}

export function getDefaultNewPlayerPreference(): boolean {
  return getGlobalGuidedModePreference() ?? true;
}

function buildScopedGamePreferenceKey(
  gameId: string,
  playerId: string,
): string {
  return `${gameId}${GAME_PLAYER_PREF_KEY_SEP}${playerId}`;
}

export function setNewPlayerPreferenceForGame(
  gameId: string,
  isNewPlayer: boolean,
  playerId?: string | null,
): void {
  if (!gameId) return;
  getOrCreateDeviceId();

  const map = readNewPlayerPreferenceMap();
  const scopedKey = playerId
    ? buildScopedGamePreferenceKey(gameId, playerId)
    : gameId;
  map[scopedKey] = {
    is_new_player: isNewPlayer,
    seen_at: Date.now(),
  };
  writeNewPlayerPreferenceMap(pruneNewPlayerPreferenceMap(map));
}

export function getNewPlayerPreferenceForGame(
  gameId: string,
  playerId?: string | null,
): boolean | null {
  if (!gameId) return null;
  const map = readNewPlayerPreferenceMap();
  if (playerId) {
    const scoped = buildScopedGamePreferenceKey(gameId, playerId);
    return map[scoped]?.is_new_player ?? null;
  }
  return map[gameId]?.is_new_player ?? null;
}

export function resolveNewPlayerPreferenceForGame(
  gameId: string,
  playerId?: string | null,
): boolean {
  return (
    getNewPlayerPreferenceForGame(gameId, playerId) ??
    getDefaultNewPlayerPreference()
  );
}

/** The name this browser last asked to watch a game under. */
export function getRememberedSpectatorName(): string | null {
  if (!canUseStorage()) return null;
  return readMigratedItem(
    window.localStorage,
    SPECTATOR_NAME_KEY,
    LEGACY_SPECTATOR_NAME_KEY,
  );
}

export function rememberSpectatorName(name: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SPECTATOR_NAME_KEY, name);
  removeStorageKeys(window.localStorage, [LEGACY_SPECTATOR_NAME_KEY]);
}

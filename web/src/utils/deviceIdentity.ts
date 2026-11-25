const DEVICE_ID_KEY = "mtb_device_id";
const GUEST_NAME_KEY = "mtb_guest_name";
const GAME_PLAYER_MAP_KEY = "mtb_game_player_map";
const GAME_NEW_PLAYER_PREF_MAP_KEY = "mtb_game_new_player_pref_map";
const GUIDED_MODE_PREFERENCE_KEY = "mtb_guided_mode_preference";
const PLAYED_BEFORE_KEY = "mtb_played_before";
const SPECTATOR_NAME_KEY = "mtb_spectator_name";
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
      window.localStorage.getItem(GAME_PLAYER_MAP_KEY),
    );
  } catch {
    return {};
  }
}

function parseTrackedPlayerMap(raw: string | null): TrackedPlayerMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const result: TrackedPlayerMap = {};
    for (const [gameId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const name = (value as { name?: unknown }).name;
      const seenAt = (value as { seen_at?: unknown }).seen_at;
      const seatToken = (value as { seat_token?: unknown }).seat_token;
      const joinCode = (value as { join_code?: unknown }).join_code;
      if (typeof name !== "string" || !name) continue;
      if (typeof seenAt !== "number") continue;
      result[gameId] = { name, seen_at: seenAt };
      if (typeof seatToken === "string" && seatToken)
        result[gameId].seat_token = seatToken;
      if (typeof joinCode === "string" && joinCode)
        result[gameId].join_code = joinCode;
    }
    return result;
  } catch {
    return {};
  }
}

function readNewPlayerPreferenceMap(): NewPlayerPreferenceMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(GAME_NEW_PLAYER_PREF_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const result: NewPlayerPreferenceMap = {};
    for (const [gameId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const isNewPlayer = (value as { is_new_player?: unknown }).is_new_player;
      const seenAt = (value as { seen_at?: unknown }).seen_at;
      if (typeof isNewPlayer !== "boolean") continue;
      if (typeof seenAt !== "number") continue;
      result[gameId] = { is_new_player: isNewPlayer, seen_at: seenAt };
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
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateDeviceId(): string {
  if (!canUseStorage()) return "";

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const next = generateDeviceId();
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, next);
  } catch {
    // Best effort only.
  }
  return next;
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
  const token = details.seatToken ?? previous?.seat_token;
  const joinCode = details.joinCode ?? previous?.join_code;
  map[gameId] = {
    name: playerName,
    seen_at: Date.now(),
    ...(token ? { seat_token: token } : {}),
    ...(joinCode ? { join_code: joinCode } : {}),
  };
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
  return Object.entries(readTrackedPlayerMap())
    .filter(([, entry]) => entry.seat_token)
    .sort((a, b) => b[1].seen_at - a[1].seen_at)
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
    if (getRememberedSeat(seat.game_id)?.name === seat.player_name)
      forgetSeatForGame(seat.game_id);
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
    window.localStorage.getItem(GAME_PLAYER_MAP_KEY) === null
  )
    return false;
  return !getRememberedSeat(gameId)?.seatToken;
}

/** Calls `listener` with the games whose seats another tab forgot, even if one has been remembered again since. */
export function onSeatsForgotten(
  listener: (gameIds: string[]) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
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
  return window.localStorage.getItem(GUEST_NAME_KEY);
}

export function rememberGuestName(name: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    // Best effort only.
  }
}

export function hasPlayedBefore(): boolean {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(PLAYED_BEFORE_KEY) === "1";
}

export function markPlayedBefore(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PLAYED_BEFORE_KEY, "1");
  } catch {
    // Best effort only.
  }
}

export function getGlobalGuidedModePreference(): boolean | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(GUIDED_MODE_PREFERENCE_KEY);
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
  return window.localStorage.getItem(SPECTATOR_NAME_KEY);
}

export function rememberSpectatorName(name: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SPECTATOR_NAME_KEY, name);
}

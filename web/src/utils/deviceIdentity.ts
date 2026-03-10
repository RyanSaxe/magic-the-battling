const DEVICE_ID_KEY = "mtb_device_id";
const GAME_PLAYER_MAP_KEY = "mtb_game_player_map";
const GAME_NEW_PLAYER_PREF_MAP_KEY = "mtb_game_new_player_pref_map";
const GUIDED_MODE_PREFERENCE_KEY = "mtb_guided_mode_preference";
const PLAYED_BEFORE_KEY = "mtb_played_before";
const GAME_PLAYER_PREF_KEY_SEP = "::";
const MAX_TRACKED_GAMES = 100;

interface TrackedPlayerEntry {
  name: string;
  seen_at: number;
}

interface NewPlayerPreferenceEntry {
  is_new_player: boolean;
  seen_at: number;
}

type TrackedPlayerMap = Record<string, TrackedPlayerEntry>;
type NewPlayerPreferenceMap = Record<string, NewPlayerPreferenceEntry>;

export interface ReconnectStatusPlayer {
  name: string;
  is_connected: boolean;
  is_puppet: boolean;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readTrackedPlayerMap(): TrackedPlayerMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(GAME_PLAYER_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const result: TrackedPlayerMap = {};
    for (const [gameId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const name = (value as { name?: unknown }).name;
      const seenAt = (value as { seen_at?: unknown }).seen_at;
      if (typeof name !== "string" || !name) continue;
      if (typeof seenAt !== "number") continue;
      result[gameId] = { name, seen_at: seenAt };
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

export function rememberPlayerForGame(gameId: string, playerName: string): void {
  if (!gameId || !playerName) return;
  getOrCreateDeviceId();

  const map = readTrackedPlayerMap();
  map[gameId] = {
    name: playerName,
    seen_at: Date.now(),
  };
  writeTrackedPlayerMap(pruneTrackedPlayerMap(map));
}

export function getRememberedPlayerForGame(gameId: string): string | null {
  if (!gameId) return null;
  const map = readTrackedPlayerMap();
  return map[gameId]?.name ?? null;
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

function buildScopedGamePreferenceKey(gameId: string, playerId: string): string {
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

export function pickAutoReconnectPlayer(
  rememberedPlayerName: string | null,
  players: ReconnectStatusPlayer[],
): string | null {
  if (!rememberedPlayerName) return null;
  const match = players.find(
    (player) => !player.is_puppet && player.name === rememberedPlayerName,
  );
  if (!match || match.is_connected) return null;
  return match.name;
}

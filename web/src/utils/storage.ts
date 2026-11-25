/**
 * Browser storage read/migration helpers.
 * Owns one-time key migration from legacy `mtb_*` keys to canonical `pitfight_*` keys.
 */

export interface StorageLike {
  readonly length?: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function removeStorageKeys(
  storage: StorageLike,
  keys: readonly string[],
): void {
  if (typeof storage.removeItem !== "function") return;
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Best effort only.
    }
  }
}

export function readMigratedItem(
  storage: StorageLike,
  key: string,
  legacyKeys: string | readonly string[],
): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  if (storage.length === 0) return null;

  const candidates = typeof legacyKeys === "string" ? [legacyKeys] : legacyKeys;
  for (const legacyKey of candidates) {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue === null) continue;
    try {
      storage.setItem(key, legacyValue);
      removeStorageKeys(storage, candidates);
    } catch {
      // Keep legacy data intact if storage cannot be written.
    }
    return legacyValue;
  }
  return null;
}

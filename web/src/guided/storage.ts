import type { GuidedGuideId } from "./types";

const GUIDED_PROGRESS_KEY = "mtb_guided_progress";
const MAX_TRACKED_SESSIONS = 100;

type StoredProgress = Record<string, string[]>;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildScopeKey(gameId: string, playerId?: string | null): string {
  return `${gameId}::${playerId ?? "anonymous"}`;
}

function readProgress(): StoredProgress {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(GUIDED_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: StoredProgress = {};
    for (const [scopeKey, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      result[scopeKey] = value.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      );
    }
    return result;
  } catch {
    return {};
  }
}

function pruneProgress(progress: StoredProgress): StoredProgress {
  const entries = Object.entries(progress);
  if (entries.length <= MAX_TRACKED_SESSIONS) {
    return progress;
  }

  return Object.fromEntries(entries.slice(entries.length - MAX_TRACKED_SESSIONS));
}

function writeProgress(progress: StoredProgress): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      GUIDED_PROGRESS_KEY,
      JSON.stringify(pruneProgress(progress)),
    );
  } catch {
    // Best effort only.
  }
}

export function getSeenGuidesForGame(
  gameId: string,
  playerId?: string | null,
): Set<GuidedGuideId> {
  if (!gameId) {
    return new Set();
  }
  const progress = readProgress();
  return new Set(
    (progress[buildScopeKey(gameId, playerId)] ?? []) as GuidedGuideId[],
  );
}

export function markGuideSeenForGame(
  gameId: string,
  guideId: GuidedGuideId,
  playerId?: string | null,
): void {
  if (!gameId) return;

  const progress = readProgress();
  const scopeKey = buildScopeKey(gameId, playerId);
  const seen = new Set(progress[scopeKey] ?? []);
  seen.add(guideId);
  progress[scopeKey] = [...seen];
  writeProgress(progress);
}

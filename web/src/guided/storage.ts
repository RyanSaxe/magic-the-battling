import type {
  GuidedGuideId,
  GuideProgressState,
  GuideStorageIdentity,
} from "./types";

const GUIDED_PROGRESS_KEY = "mtb_guided_progress";
const MAX_TRACKED_SESSIONS = 100;

interface StoredProgressEntry {
  seen: string[];
  skipped_all?: boolean;
  active_guide?: {
    id: string;
    step: number;
  };
}

type StoredProgress = Record<string, StoredProgressEntry>;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildScopeKey(gameId: string, playerKey?: string | null): string {
  return `${gameId}::${playerKey ?? "anonymous"}`;
}

function normalizeEntry(value: unknown): StoredProgressEntry | null {
  if (Array.isArray(value)) {
    return {
      seen: value.filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0,
      ),
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const seen = Array.isArray((value as { seen?: unknown }).seen)
    ? (value as { seen: unknown[] }).seen.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    )
    : [];
  const skippedAll = (value as { skipped_all?: unknown }).skipped_all;
  const activeGuideValue = (value as { active_guide?: unknown }).active_guide;
  const activeGuide = activeGuideValue
    && typeof activeGuideValue === "object"
    && typeof (activeGuideValue as { id?: unknown }).id === "string"
    && typeof (activeGuideValue as { step?: unknown }).step === "number"
      ? {
          id: (activeGuideValue as { id: string }).id,
          step: (activeGuideValue as { step: number }).step,
        }
      : undefined;

  return {
    seen,
    skipped_all: skippedAll === true ? true : undefined,
    active_guide: activeGuide,
  };
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
      const normalized = normalizeEntry(value);
      if (normalized) {
        result[scopeKey] = normalized;
      }
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

function readEntry(
  progress: StoredProgress,
  identity: GuideStorageIdentity,
): StoredProgressEntry {
  if (!identity.gameId) {
    return { seen: [] };
  }

  const primaryKey = buildScopeKey(identity.gameId, identity.playerName);
  const legacyKey = identity.legacyPlayerId
    ? buildScopeKey(identity.gameId, identity.legacyPlayerId)
    : null;

  return progress[primaryKey]
    ?? (legacyKey ? progress[legacyKey] : undefined)
    ?? progress[buildScopeKey(identity.gameId)]
    ?? { seen: [] };
}

function resolveWriteScope(identity: GuideStorageIdentity): string | null {
  if (!identity.gameId) {
    return null;
  }

  return buildScopeKey(
    identity.gameId,
    identity.playerName ?? identity.legacyPlayerId ?? null,
  );
}

function writeEntry(
  identity: GuideStorageIdentity,
  update: (current: StoredProgressEntry) => StoredProgressEntry,
): void {
  const scopeKey = resolveWriteScope(identity);
  if (!scopeKey) return;

  const progress = readProgress();
  const nextEntry = update(readEntry(progress, identity));
  progress[scopeKey] = nextEntry;
  writeProgress(progress);
}

export function getGuideProgressForGame(
  identity: GuideStorageIdentity,
): GuideProgressState {
  const entry = readEntry(readProgress(), identity);
  const activeGuide = entry.active_guide
    ? {
        guideId: entry.active_guide.id as GuidedGuideId,
        stepIndex: entry.active_guide.step,
      }
    : null;
  return {
    seenGuides: new Set(entry.seen as GuidedGuideId[]),
    skippedAll: entry.skipped_all === true,
    activeGuide,
  };
}

export function markGuideSeenForGame(
  identity: GuideStorageIdentity,
  guideId: GuidedGuideId,
): void {
  writeEntry(identity, (current) => {
    const seen = new Set(current.seen);
    seen.add(guideId);
    return {
      ...current,
      active_guide: undefined,
      seen: [...seen],
    };
  });
}

export function skipAllGuidesForGame(identity: GuideStorageIdentity): void {
  writeEntry(identity, (current) => ({
    ...current,
    active_guide: undefined,
    skipped_all: true,
  }));
}

export function setActiveGuideForGame(
  identity: GuideStorageIdentity,
  guideId: GuidedGuideId,
  stepIndex: number,
): void {
  writeEntry(identity, (current) => ({
    ...current,
    active_guide: {
      id: guideId,
      step: stepIndex,
    },
  }));
}

export function clearActiveGuideForGame(identity: GuideStorageIdentity): void {
  writeEntry(identity, (current) => ({
    ...current,
    active_guide: undefined,
  }));
}

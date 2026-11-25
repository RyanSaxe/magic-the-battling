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
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function buildScopeKey(gameId: string, playerKey?: string | null): string {
  return `${gameId}::${playerKey ?? "anonymous"}`;
}

const KNOWN_GUIDE_IDS = new Map<string, GuidedGuideId>([
  ["welcome", "welcome"],
  ["build", "build"],
  ["build_play_draw", "build_play_draw"],
  ["battle", "battle"],
  ["battle_result_submit", "battle_result_submit"],
  ["reward", "reward"],
  ["reward_stage_end", "reward_stage_end"],
  ["draft", "draft"],
  ["hint_treasure_producer", "hint_treasure_producer"],
  ["hint_treasure_cap", "hint_treasure_cap"],
  ["hint_build_unapplied_upgrade", "hint_build_unapplied_upgrade"],
  ["hint_battle_unrevealed_upgrade", "hint_battle_unrevealed_upgrade"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseActiveGuide(
  value: unknown,
): { id: string; step: number } | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id === "string" && typeof value.step === "number") {
    return { id: value.id, step: value.step };
  }
  return undefined;
}

function normalizeEntry(value: unknown): StoredProgressEntry | null {
  if (Array.isArray(value)) {
    return {
      seen: value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      ),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const rawSeen = value.seen;
  const seen = Array.isArray(rawSeen)
    ? rawSeen.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    : [];

  return {
    seen,
    skipped_all: value.skipped_all === true ? true : undefined,
    active_guide: parseActiveGuide(value.active_guide),
  };
}

function readProgress(): StoredProgress {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(GUIDED_PROGRESS_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
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

  return Object.fromEntries(
    entries.slice(entries.length - MAX_TRACKED_SESSIONS),
  );
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

  return (
    progress[primaryKey] ??
    (legacyKey ? progress[legacyKey] : undefined) ??
    progress[buildScopeKey(identity.gameId)] ?? { seen: [] }
  );
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
  const activeGuideId = entry.active_guide
    ? KNOWN_GUIDE_IDS.get(entry.active_guide.id)
    : undefined;
  const activeGuide =
    entry.active_guide && activeGuideId
      ? {
          guideId: activeGuideId,
          stepIndex: entry.active_guide.step,
        }
      : null;
  const seenGuides = new Set<GuidedGuideId>();
  for (const id of entry.seen) {
    const known = KNOWN_GUIDE_IDS.get(id);
    if (known) seenGuides.add(known);
  }
  return {
    seenGuides,
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

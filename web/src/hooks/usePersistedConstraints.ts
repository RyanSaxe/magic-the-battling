import { useCallback, useReducer } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";

const STORAGE_PREFIX = "mtb_zone_constraints:v2:";

export interface PersistedConstraintLocation {
  scopeKey: string;
  stage: number;
  round: number;
}

export type PersistedConstraintEntry =
  | {
      stage: number;
      round: number;
      mode: "constraints";
      constraints: ZoneConstraints;
    }
  | {
      stage: number;
      round: number;
      mode: "dynamic";
    };

export interface PersistedConstraintResolution {
  constraints: ZoneConstraints | null;
  source: "dynamic" | "exact" | "inherited";
  canReset: boolean;
  originStage: number | null;
  originRound: number | null;
}

interface PersistedConstraintStore {
  version: 2;
  entries: PersistedConstraintEntry[];
}

export interface UsePersistedConstraintsResult {
  constraints: ZoneConstraints | null;
  setConstraints: (c: ZoneConstraints) => void;
  clearConstraints: () => void;
  resolution: PersistedConstraintResolution;
}

function storageKeyForScope(scopeKey: string): string {
  return `${STORAGE_PREFIX}${scopeKey}`;
}

function compareStageRound(
  a: Pick<PersistedConstraintEntry, "stage" | "round">,
  b: Pick<PersistedConstraintEntry, "stage" | "round">,
): number {
  if (a.stage !== b.stage) return a.stage - b.stage;
  return a.round - b.round;
}

function isSameStageRound(
  a: Pick<PersistedConstraintEntry, "stage" | "round">,
  b: Pick<PersistedConstraintEntry, "stage" | "round">,
): boolean {
  return a.stage === b.stage && a.round === b.round;
}

function sortEntries(entries: PersistedConstraintEntry[]): PersistedConstraintEntry[] {
  return [...entries].sort(compareStageRound);
}

function loadEntries(scopeKey: string): PersistedConstraintEntry[] {
  try {
    const raw = localStorage.getItem(storageKeyForScope(scopeKey));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as PersistedConstraintStore | PersistedConstraintEntry[];
    if (Array.isArray(parsed)) {
      return sortEntries(parsed);
    }

    return Array.isArray(parsed.entries) ? sortEntries(parsed.entries) : [];
  } catch {
    return [];
  }
}

function saveEntries(scopeKey: string, entries: PersistedConstraintEntry[]): void {
  const payload: PersistedConstraintStore = {
    version: 2,
    entries: sortEntries(entries),
  };
  localStorage.setItem(storageKeyForScope(scopeKey), JSON.stringify(payload));
}

export function resolveConstraintHistory(
  entries: PersistedConstraintEntry[],
  stage: number,
  round: number,
): PersistedConstraintResolution {
  const current = { stage, round };
  const sorted = sortEntries(entries);
  let activeEntry: PersistedConstraintEntry | null = null;

  for (const entry of sorted) {
    if (compareStageRound(entry, current) > 0) break;
    activeEntry = entry;
  }

  if (!activeEntry || activeEntry.mode === "dynamic") {
    return {
      constraints: null,
      source: "dynamic",
      canReset: false,
      originStage: activeEntry?.stage ?? null,
      originRound: activeEntry?.round ?? null,
    };
  }

  return {
    constraints: activeEntry.constraints,
    source: isSameStageRound(activeEntry, current) ? "exact" : "inherited",
    canReset: true,
    originStage: activeEntry.stage,
    originRound: activeEntry.round,
  };
}

export function upsertConstraintHistoryEntry(
  entries: PersistedConstraintEntry[],
  nextEntry: PersistedConstraintEntry,
): PersistedConstraintEntry[] {
  const filtered = entries.filter((entry) => !isSameStageRound(entry, nextEntry));
  filtered.push(nextEntry);
  return sortEntries(filtered);
}

export function resetConstraintHistoryFrom(
  entries: PersistedConstraintEntry[],
  stage: number,
  round: number,
): PersistedConstraintEntry[] {
  const cursor = { stage, round };
  const filtered = entries.filter((entry) => compareStageRound(entry, cursor) < 0);
  filtered.push({ stage, round, mode: "dynamic" });
  return sortEntries(filtered);
}

export function usePersistedConstraints(
  location: PersistedConstraintLocation | null,
): UsePersistedConstraintsResult {
  const [revision, bumpRevision] = useReducer((count: number) => count + 1, 0);

  const scopeKey = location?.scopeKey ?? null;
  const stage = location?.stage ?? 0;
  const round = location?.round ?? 0;

  void revision;

  const resolution: PersistedConstraintResolution = scopeKey
    ? resolveConstraintHistory(loadEntries(scopeKey), stage, round)
    : {
        constraints: null,
        source: "dynamic",
        canReset: false,
        originStage: null,
        originRound: null,
      };

  const setConstraints = useCallback(
    (constraints: ZoneConstraints) => {
      if (!scopeKey) return;
      const entries = loadEntries(scopeKey);
      saveEntries(
        scopeKey,
        upsertConstraintHistoryEntry(entries, {
          stage,
          round,
          mode: "constraints",
          constraints,
        }),
      );
      bumpRevision();
    },
    [scopeKey, stage, round],
  );

  const clearConstraints = useCallback(() => {
    if (!scopeKey) return;
    const entries = loadEntries(scopeKey);
    saveEntries(scopeKey, resetConstraintHistoryFrom(entries, stage, round));
    bumpRevision();
  }, [scopeKey, stage, round]);

  return {
    constraints: resolution.constraints,
    setConstraints,
    clearConstraints,
    resolution,
  };
}

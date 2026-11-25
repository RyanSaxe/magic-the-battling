import { useCallback, useMemo, useReducer } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";

const STORAGE_PREFIX = "mtb_zone_constraints:v2:";

// A saved layout belongs to the board size it was made on. Boards are grouped
// into bands so a small window resize keeps the layout; the edges sit between
// the board sizes of common screens.
const BAND_WIDTH_EDGES = [800, 1400];
const BAND_HEIGHT_EDGES = [600, 900];

export interface BoardSize {
  width: number;
  height: number;
}

/** The size band a board falls in, such as "w1h2" for a board 800-1399px wide and at least 900px tall. */
export function boardSizeBand({ width, height }: BoardSize): string {
  const index = (value: number, edges: number[]) =>
    edges.filter((edge) => value >= edge).length;
  return `w${index(width, BAND_WIDTH_EDGES)}h${index(height, BAND_HEIGHT_EDGES)}`;
}

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

// Version 2 kept one history per phase, whatever the board size. Its layouts
// are dropped rather than guessed into a band.
interface PersistedConstraintStore {
  version: 3;
  bands: Record<string, PersistedConstraintEntry[]>;
}

export interface UseSavedLayoutResult {
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

function sortEntries(
  entries: PersistedConstraintEntry[],
): PersistedConstraintEntry[] {
  return [...entries].sort(compareStageRound);
}

function loadBands(
  scopeKey: string,
): Record<string, PersistedConstraintEntry[]> {
  try {
    const raw = localStorage.getItem(storageKeyForScope(scopeKey));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Partial<PersistedConstraintStore> | null;
    if (
      parsed?.version !== 3 ||
      !parsed.bands ||
      typeof parsed.bands !== "object"
    )
      return {};
    return parsed.bands;
  } catch {
    return {};
  }
}

function loadEntries(
  scopeKey: string,
  band: string,
): PersistedConstraintEntry[] {
  const entries = loadBands(scopeKey)[band];
  return Array.isArray(entries) ? sortEntries(entries) : [];
}

function saveEntries(
  scopeKey: string,
  band: string,
  entries: PersistedConstraintEntry[],
): void {
  const payload: PersistedConstraintStore = {
    version: 3,
    bands: { ...loadBands(scopeKey), [band]: sortEntries(entries) },
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
  const filtered = entries.filter(
    (entry) => !isSameStageRound(entry, nextEntry),
  );
  filtered.push(nextEntry);
  return sortEntries(filtered);
}

export function resetConstraintHistoryFrom(
  entries: PersistedConstraintEntry[],
  stage: number,
  round: number,
): PersistedConstraintEntry[] {
  const cursor = { stage, round };
  const filtered = entries.filter(
    (entry) => compareStageRound(entry, cursor) < 0,
  );
  filtered.push({ stage, round, mode: "dynamic" });
  return sortEntries(filtered);
}

/**
 * The layout saved for this phase, stage and round on a board of this size
 * band. Until the board has been measured there is no band, and the layout
 * is the automatic one.
 */
export function useSavedLayout(
  location: PersistedConstraintLocation | null,
  board: BoardSize | null,
): UseSavedLayoutResult {
  const [revision, bumpRevision] = useReducer((count: number) => count + 1, 0);

  const scopeKey = location?.scopeKey ?? null;
  const stage = location?.stage ?? 0;
  const round = location?.round ?? 0;
  const band =
    board && board.width > 0 && board.height > 0 ? boardSizeBand(board) : null;

  // Storage is read when the phase, round or band changes, or after this hook writes, not on every render.
  const resolution: PersistedConstraintResolution = useMemo(() => {
    void revision;
    return scopeKey && band
      ? resolveConstraintHistory(loadEntries(scopeKey, band), stage, round)
      : {
          constraints: null,
          source: "dynamic",
          canReset: false,
          originStage: null,
          originRound: null,
        };
  }, [scopeKey, band, stage, round, revision]);

  const setConstraints = useCallback(
    (constraints: ZoneConstraints) => {
      if (!scopeKey || !band) return;
      const entries = loadEntries(scopeKey, band);
      saveEntries(
        scopeKey,
        band,
        upsertConstraintHistoryEntry(entries, {
          stage,
          round,
          mode: "constraints",
          constraints,
        }),
      );
      bumpRevision();
    },
    [scopeKey, band, stage, round],
  );

  const clearConstraints = useCallback(() => {
    if (!scopeKey || !band) return;
    const entries = loadEntries(scopeKey, band);
    saveEntries(
      scopeKey,
      band,
      resetConstraintHistoryFrom(entries, stage, round),
    );
    bumpRevision();
  }, [scopeKey, band, stage, round]);

  return {
    constraints: resolution.constraints,
    setConstraints,
    clearConstraints,
    resolution,
  };
}

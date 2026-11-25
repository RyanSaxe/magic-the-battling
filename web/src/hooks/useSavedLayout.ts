/**
 * React hook persisting per-phase, per-size-band zone constraints in
 * localStorage. Delegates history resolution and band keying to web/src/layout/.
 */
import { useCallback, useMemo, useReducer } from "react";
import {
  boardSizeBand,
  parsePersistedConstraintBands,
  resetConstraintHistoryFrom,
  resolveConstraintHistory,
  sortConstraintEntries,
  upsertConstraintHistoryEntry,
  type BoardSize,
  type PersistedConstraintEntry,
  type PersistedConstraintResolution,
  type ZoneConstraints,
} from "../layout";

export {
  boardSizeBand,
  resetConstraintHistoryFrom,
  resolveConstraintHistory,
  upsertConstraintHistoryEntry,
  type BoardSize,
  type PersistedConstraintEntry,
  type PersistedConstraintResolution,
};

const STORAGE_PREFIX = "mtb_zone_constraints:v2:";

export interface PersistedConstraintLocation {
  scopeKey: string;
  stage: number;
  round: number;
}

export interface UseSavedLayoutResult {
  constraints: ZoneConstraints | null;
  setConstraints: (c: ZoneConstraints) => void;
  clearConstraints: () => void;
  resolution: PersistedConstraintResolution;
}

function loadBands(
  scopeKey: string,
): Record<string, PersistedConstraintEntry[]> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${scopeKey}`);
    return raw ? parsePersistedConstraintBands(raw) : {};
  } catch {
    return {};
  }
}

function loadEntries(
  scopeKey: string,
  band: string,
): PersistedConstraintEntry[] {
  const entries = loadBands(scopeKey)[band];
  return Array.isArray(entries) ? sortConstraintEntries(entries) : [];
}

function saveEntries(
  scopeKey: string,
  band: string,
  entries: PersistedConstraintEntry[],
): void {
  const payload: {
    version: 3;
    bands: Record<string, PersistedConstraintEntry[]>;
  } = {
    version: 3,
    bands: { ...loadBands(scopeKey), [band]: sortConstraintEntries(entries) },
  };
  localStorage.setItem(`${STORAGE_PREFIX}${scopeKey}`, JSON.stringify(payload));
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
    return revision >= 0 && scopeKey && band
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

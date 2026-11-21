// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSize, PersistedConstraintEntry } from "./usePersistedConstraints";
import {
  boardSizeBand,
  resolveConstraintHistory,
  resetConstraintHistoryFrom,
  upsertConstraintHistoryEntry,
  usePersistedConstraints,
} from "./usePersistedConstraints";

describe("usePersistedConstraints helpers", () => {
  it("resolves an exact constraint entry for the current stage and round", () => {
    const entries: PersistedConstraintEntry[] = [
      {
        stage: 4,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.42 },
      },
    ];

    expect(resolveConstraintHistory(entries, 4, 1)).toEqual({
      constraints: { topFraction: 0.42 },
      source: "exact",
      canReset: true,
      originStage: 4,
      originRound: 1,
    });
  });

  it("inherits the nearest prior constraint entry for later rounds only", () => {
    const entries: PersistedConstraintEntry[] = [
      {
        stage: 4,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.42 },
      },
    ];

    expect(resolveConstraintHistory(entries, 4, 2)).toEqual({
      constraints: { topFraction: 0.42 },
      source: "inherited",
      canReset: true,
      originStage: 4,
      originRound: 1,
    });

    expect(resolveConstraintHistory(entries, 3, 3)).toEqual({
      constraints: null,
      source: "dynamic",
      canReset: false,
      originStage: null,
      originRound: null,
    });
  });

  it("uses a dynamic marker to stop later inheritance until the user resizes again", () => {
    const entries: PersistedConstraintEntry[] = [
      {
        stage: 4,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.42 },
      },
      { stage: 4, round: 2, mode: "dynamic" },
      {
        stage: 4,
        round: 4,
        mode: "constraints",
        constraints: { topFraction: 0.61 },
      },
    ];

    expect(resolveConstraintHistory(entries, 4, 2)).toEqual({
      constraints: null,
      source: "dynamic",
      canReset: false,
      originStage: 4,
      originRound: 2,
    });

    expect(resolveConstraintHistory(entries, 4, 3)).toEqual({
      constraints: null,
      source: "dynamic",
      canReset: false,
      originStage: 4,
      originRound: 2,
    });

    expect(resolveConstraintHistory(entries, 4, 4)).toEqual({
      constraints: { topFraction: 0.61 },
      source: "exact",
      canReset: true,
      originStage: 4,
      originRound: 4,
    });
  });

  it("resetting from a stage and round clears current and future entries for that scope", () => {
    const entries: PersistedConstraintEntry[] = [
      {
        stage: 4,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.42 },
      },
      {
        stage: 4,
        round: 3,
        mode: "constraints",
        constraints: { topFraction: 0.55 },
      },
      {
        stage: 5,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.63 },
      },
    ];

    expect(resetConstraintHistoryFrom(entries, 4, 2)).toEqual([
      {
        stage: 4,
        round: 1,
        mode: "constraints",
        constraints: { topFraction: 0.42 },
      },
      { stage: 4, round: 2, mode: "dynamic" },
    ]);
  });

  it("replaces any exact entry at the same stage and round when saving new constraints", () => {
    const entries: PersistedConstraintEntry[] = [
      {
        stage: 4,
        round: 2,
        mode: "dynamic",
      },
    ];

    expect(
      upsertConstraintHistoryEntry(entries, {
        stage: 4,
        round: 2,
        mode: "constraints",
        constraints: { leftFraction: 0.7 },
      }),
    ).toEqual([
      {
        stage: 4,
        round: 2,
        mode: "constraints",
        constraints: { leftFraction: 0.7 },
      },
    ]);
  });
});

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("usePersistedConstraints", () => {
  const location = { scopeKey: "phase:build", stage: 4, round: 2 };
  const laptop: BoardSize = { width: 980, height: 712 };
  const desktop: BoardSize = { width: 1620, height: 992 };

  beforeEach(() => vi.stubGlobal("localStorage", createStorageMock()));
  afterEach(() => vi.unstubAllGlobals());

  it("groups boards into bands with edges at 800 and 1400px wide and 600 and 900px tall", () => {
    expect(boardSizeBand({ width: 799, height: 599 })).toBe("w0h0");
    expect(boardSizeBand(laptop)).toBe("w1h1");
    expect(boardSizeBand({ width: 1400, height: 900 })).toBe("w2h2");
    expect(boardSizeBand({ width: 1140, height: 812 })).toBe(boardSizeBand({ width: 1180, height: 840 }));
  });

  it("applies a saved layout only on boards in the band it was saved in", () => {
    const { result, rerender } = renderHook(({ board }) => usePersistedConstraints(location, board), {
      initialProps: { board: laptop },
    });
    act(() => result.current.setConstraints({ topFraction: 0.3 }));
    expect(result.current.constraints).toEqual({ topFraction: 0.3 });

    rerender({ board: desktop });
    expect(result.current.constraints).toBeNull();
    expect(result.current.resolution.canReset).toBe(false);

    rerender({ board: { width: 1020, height: 700 } });
    expect(result.current.constraints).toEqual({ topFraction: 0.3 });
  });

  it("inherits a layout from an earlier round only within its band", () => {
    const { result } = renderHook(() => usePersistedConstraints({ ...location, round: 1 }, laptop));
    act(() => result.current.setConstraints({ topFraction: 0.3 }));

    const later = renderHook(({ board }) => usePersistedConstraints(location, board), {
      initialProps: { board: laptop },
    });
    expect(later.result.current.resolution.source).toBe("inherited");
    later.rerender({ board: desktop });
    expect(later.result.current.resolution.source).toBe("dynamic");
  });

  it("drops layouts saved before boards had bands", () => {
    localStorage.setItem(
      "mtb_zone_constraints:v2:phase:build",
      JSON.stringify({
        version: 2,
        entries: [{ stage: 4, round: 2, mode: "constraints", constraints: { topFraction: 0.3 } }],
      }),
    );
    const { result } = renderHook(() => usePersistedConstraints(location, laptop));
    expect(result.current.constraints).toBeNull();
  });

  it("uses the automatic layout until the board has been measured", () => {
    const { result } = renderHook(() => usePersistedConstraints(location, null));
    act(() => result.current.setConstraints({ topFraction: 0.3 }));
    expect(result.current.constraints).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});

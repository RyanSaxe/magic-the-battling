import { describe, expect, it } from "vitest";
import type { PersistedConstraintEntry } from "./usePersistedConstraints";
import {
  resolveConstraintHistory,
  resetConstraintHistoryFrom,
  upsertConstraintHistoryEntry,
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

/**
 * Unit tests for shared game-shell layout primitives: 4px board quantization,
 * divider visibility/clamping, and type-safe persisted constraint parsing.
 */
import { describe, expect, it } from "vitest";
import {
  clampDividerFraction,
  omitConstraintKey,
  parsePersistedConstraintBands,
  quantizeBoardSize,
  resolveVisibleDividers,
} from "./shellPrimitives";

describe("shellPrimitives", () => {
  it("quantizes board sizes down to 4px multiples", () => {
    expect(quantizeBoardSize(955.8, 715.2)).toEqual({
      width: 952,
      height: 712,
    });
    expect(quantizeBoardSize(952, 712)).toEqual({ width: 952, height: 712 });
  });

  it("determines visible dividers from active zones and horizontal flag", () => {
    const config = {
      zones: {
        hand: { count: 5 },
        battlefield: { count: 5 },
        sideboard: { count: 8 },
        commandZone: { count: 2 },
      },
      layout: {
        top: ["hand"],
        bottomLeft: ["battlefield", "sideboard"],
        bottomRight: ["commandZone"],
      },
    };
    expect(resolveVisibleDividers(config, true)).toEqual({
      top: true,
      bottomLeftSplit: true,
      left: true,
    });
    expect(resolveVisibleDividers(config, false)).toEqual({
      top: true,
      bottomLeftSplit: true,
      left: false,
    });
  });

  it("clamps divider fractions to keep zones at least 80px unless started closer", () => {
    expect(clampDividerFraction(0.01, 800, 0.5)).toBeCloseTo(0.1);
    expect(clampDividerFraction(0.99, 800, 0.5)).toBeCloseTo(0.9);
    expect(clampDividerFraction(0.06, 800, 0.05)).toBeCloseTo(0.06);
  });

  it("omits a constraint key and returns null when empty", () => {
    expect(omitConstraintKey({ topFraction: 0.4 }, "topFraction")).toBeNull();
    expect(
      omitConstraintKey({ topFraction: 0.4, leftFraction: 0.7 }, "topFraction"),
    ).toEqual({ leftFraction: 0.7 });
  });

  it("parses valid version-3 band stores and rejects malformed or older payloads", () => {
    const valid = JSON.stringify({
      version: 3,
      bands: {
        w1h1: [
          {
            stage: 3,
            round: 1,
            mode: "constraints",
            constraints: { topFraction: 0.4 },
          },
          { stage: 3, round: 2, mode: "dynamic" },
          { stage: "bad", round: 1, mode: "dynamic" },
        ],
      },
    });
    expect(parsePersistedConstraintBands(valid)).toEqual({
      w1h1: [
        {
          stage: 3,
          round: 1,
          mode: "constraints",
          constraints: { topFraction: 0.4 },
        },
        { stage: 3, round: 2, mode: "dynamic" },
      ],
    });
    expect(
      parsePersistedConstraintBands(
        JSON.stringify({ version: 2, entries: [] }),
      ),
    ).toEqual({});
    expect(parsePersistedConstraintBands("{not-json")).toEqual({});
  });
});

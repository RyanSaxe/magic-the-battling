/**
 * Unit tests for the unified fitCards engine: 40px minimum width floor,
 * negative-gap fanning rule, fixed rows/columns, maxRows clamping, and noClip.
 */
import { describe, expect, it } from "vitest";
import { fitCards, zoneGridHeight, zoneGridWidth } from "./cardFit";
import { CARD_ASPECT_RATIO, MIN_CARD_WIDTH } from "./types";

describe("fitCards", () => {
  it("respects the 40px minimum card width floor by default", () => {
    const result = fitCards({
      count: 10,
      availableWidth: 200,
      availableHeight: 100,
      gap: 6,
      maxCardWidth: 200,
    });
    expect(result.width).toBeGreaterThanOrEqual(MIN_CARD_WIDTH);
    expect(result.height).toBe(Math.round(result.width * CARD_ASPECT_RATIO));
  });

  it("returns maxCardWidth placeholder dimensions when count is zero", () => {
    const result = fitCards({
      count: 0,
      availableWidth: 600,
      availableHeight: 400,
      maxCardWidth: 180,
    });
    expect(result).toEqual({
      width: 180,
      height: Math.round(180 * CARD_ASPECT_RATIO),
      rows: 1,
      columns: 1,
      gap: 6,
    });
  });

  it("fans a single row with negative gap up to maxOverlapRatio before shrinking", () => {
    const fanned = fitCards({
      count: 7,
      availableWidth: 620,
      availableHeight: 140,
      gap: 6,
      maxCardWidth: 200,
      maxOverlapRatio: 0.2,
    });
    expect(fanned.rows).toBe(1);
    expect(fanned.columns).toBe(7);
    expect(fanned.width).toBe(100);
    expect(fanned.gap).toBe(-14);

    const shrunk = fitCards({
      count: 7,
      availableWidth: 500,
      availableHeight: 140,
      gap: 6,
      maxCardWidth: 200,
      maxOverlapRatio: 0.2,
    });
    expect(shrunk.rows).toBe(1);
    expect(shrunk.columns).toBe(7);
    expect(shrunk.width).toBe(88);
    expect(shrunk.gap).toBe(-20);
  });

  it("clamps fanned row shrinkage at the 40px floor when tightly packed", () => {
    const packed = fitCards({
      count: 15,
      availableWidth: 300,
      availableHeight: 140,
      gap: 6,
      maxCardWidth: 200,
      maxOverlapRatio: 0.2,
    });
    expect(packed.rows).toBe(1);
    expect(packed.columns).toBe(15);
    expect(packed.width).toBeGreaterThanOrEqual(MIN_CARD_WIDTH);
    expect(packed.gap).toBe(-Math.floor(100 * 0.2));
  });

  it("honors maxRows by clamping multi-row search results", () => {
    const result = fitCards({
      count: 6,
      availableWidth: 600,
      availableHeight: 500,
      gap: 6,
      maxCardWidth: 250,
      maxRows: 1,
    });
    expect(result.rows).toBe(1);
    expect(result.columns).toBe(6);
    expect(zoneGridWidth(result, result.gap)).toBeLessThanOrEqual(600);
  });

  it("supports fixedColumns for narrow upgrade rails", () => {
    const result = fitCards({
      count: 3,
      availableWidth: 220,
      availableHeight: 500,
      gap: 6,
      maxCardWidth: 200,
      fixedColumns: 2,
    });
    expect(result.columns).toBe(2);
    expect(result.rows).toBe(2);
    expect(zoneGridWidth(result, result.gap)).toBeLessThanOrEqual(220);
    expect(zoneGridHeight(result, result.gap)).toBeLessThanOrEqual(500);
  });

  it("shrinks below minCardWidth when noClip is enabled and bounds are tiny", () => {
    const result = fitCards({
      count: 12,
      availableWidth: 160,
      availableHeight: 120,
      gap: 4,
      minCardWidth: MIN_CARD_WIDTH,
      maxCardWidth: 200,
      noClip: true,
    });
    expect(zoneGridWidth(result, result.gap)).toBeLessThanOrEqual(160);
    expect(zoneGridHeight(result, result.gap)).toBeLessThanOrEqual(120);
  });
});

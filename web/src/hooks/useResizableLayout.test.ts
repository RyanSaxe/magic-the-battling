import { describe, it, expect } from "vitest";
import { measureFromPlacement } from "./useResizableLayout";
import { ZONE_LAYOUT_PADDING } from "./useCardLayout";

const PADDING_V = ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom;

describe("measureFromPlacement", () => {
  it("returns null before any zone has been measured", () => {
    const result = measureFromPlacement({
      layout: { top: ["hand"], bottomLeft: ["sideboard"] },
      zones: { hand: { count: 5 }, sideboard: { count: 5 } },
      zoneMeasurements: { hand: null, sideboard: null },
      containerWidth: 1000,
    });
    expect(result).toBeNull();
  });

  it("derives topFraction from top zone vs bottom row", () => {
    const result = measureFromPlacement({
      layout: { top: ["hand"], bottomLeft: ["sideboard"] },
      zones: { hand: { count: 5 }, sideboard: { count: 12 } },
      zoneMeasurements: {
        hand: { outerWidth: 1000, outerHeight: 200 },
        sideboard: { outerWidth: 1000, outerHeight: 600 },
      },
      containerWidth: 1000,
    });
    expect(result).not.toBeNull();
    expect(result!.topFraction).toBeCloseTo(200 / 800);
    expect(result!.leftFraction).toBe(0.7); // no bottomRight → default
  });

  it("derives bottomLeftSplit when bottomLeft has primary + fill", () => {
    const result = measureFromPlacement({
      layout: { top: ["hand"], bottomLeft: ["battlefield", "sideboard"] },
      zones: {
        hand: { count: 6 },
        battlefield: { count: 5, priority: "fill", maxRows: 1 },
        sideboard: { count: 9 },
      },
      zoneMeasurements: {
        hand: { outerWidth: 1400, outerHeight: 300 },
        battlefield: { outerWidth: 1400, outerHeight: 200 },
        sideboard: { outerWidth: 1400, outerHeight: 400 },
      },
      containerWidth: 1400,
    });
    expect(result).not.toBeNull();
    const bfInner = 200 - PADDING_V;
    const sbInner = 400 - PADDING_V;
    expect(result!.bottomLeftSplit).toBeCloseTo(bfInner / (bfInner + sbInner));
  });

  it("derives leftFraction from primary BL width vs total bottom width when bottomRight present", () => {
    const result = measureFromPlacement({
      layout: {
        top: ["hand"],
        bottomLeft: ["battlefield", "sideboard"],
        bottomRight: ["commandZone"],
      },
      zones: {
        hand: { count: 6 },
        battlefield: { count: 5, priority: "fill", maxRows: 1 },
        sideboard: { count: 9 },
        commandZone: { count: 3 },
      },
      zoneMeasurements: {
        hand: { outerWidth: 1400, outerHeight: 300 },
        battlefield: { outerWidth: 1100, outerHeight: 200 },
        sideboard: { outerWidth: 1100, outerHeight: 400 },
        commandZone: { outerWidth: 200, outerHeight: 600 },
      },
      containerWidth: 1400,
    });
    expect(result).not.toBeNull();
    const totalBottomWidth = 1100 + 200 + ZONE_LAYOUT_PADDING.sectionGap;
    expect(result!.leftFraction).toBeCloseTo(
      1100 / (totalBottomWidth - ZONE_LAYOUT_PADDING.sectionGap),
    );
  });

  it("uses bottomRight height when bottomLeft is shorter (max wins)", () => {
    const result = measureFromPlacement({
      layout: {
        top: ["hand"],
        bottomLeft: ["sideboard"],
        bottomRight: ["commandZone"],
      },
      zones: {
        hand: { count: 5 },
        sideboard: { count: 5 },
        commandZone: { count: 3 },
      },
      zoneMeasurements: {
        hand: { outerWidth: 1400, outerHeight: 200 },
        sideboard: { outerWidth: 1100, outerHeight: 200 }, // shorter
        commandZone: { outerWidth: 200, outerHeight: 500 }, // taller
      },
      containerWidth: 1400,
    });
    expect(result).not.toBeNull();
    // usableHeight = top (200) + max(BL=200, BR=500) = 700
    expect(result!.usableHeight).toBe(700);
    expect(result!.topFraction).toBeCloseTo(200 / 700);
  });

  it("falls back to containerWidth for usableWidth when no bottom zones rendered", () => {
    const result = measureFromPlacement({
      layout: { top: ["hand"], bottomLeft: ["sideboard"] },
      zones: { hand: { count: 5 }, sideboard: { count: 5 } },
      zoneMeasurements: {
        hand: { outerWidth: 1000, outerHeight: 200 },
        sideboard: { outerWidth: 0, outerHeight: 200 }, // weird case: rect.width is 0 but height present
      },
      containerWidth: 1234,
    });
    expect(result).not.toBeNull();
    // totalBottomWidth = 0, so falls back to containerWidth
    expect(result!.usableWidth).toBe(1234);
  });

  it("ignores zones with count=0", () => {
    const result = measureFromPlacement({
      layout: {
        top: ["hand"],
        bottomLeft: ["battlefield", "sideboard"],
        bottomRight: ["commandZone"],
      },
      zones: {
        hand: { count: 5 },
        battlefield: { count: 5 },
        sideboard: { count: 0 }, // empty
        commandZone: { count: 0 }, // empty
      },
      zoneMeasurements: {
        hand: { outerWidth: 1000, outerHeight: 200 },
        battlefield: { outerWidth: 1000, outerHeight: 400 },
        sideboard: { outerWidth: 0, outerHeight: 0 },
        commandZone: { outerWidth: 0, outerHeight: 0 },
      },
      containerWidth: 1000,
    });
    expect(result).not.toBeNull();
    expect(result!.bottomLeftSplit).toBe(0.5); // no fill (sideboard ignored), default
    expect(result!.leftFraction).toBe(0.7); // no BR (commandZone ignored), default
  });
});

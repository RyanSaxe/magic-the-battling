import { describe, expect, it } from "vitest";
import { computeScrollDeltaForVisibility } from "./useGuidePositioning";

describe("computeScrollDeltaForVisibility", () => {
  const container = {
    top: 100,
    right: 400,
    bottom: 500,
    left: 50,
  };

  it("returns null when the target is already comfortably visible", () => {
    expect(
      computeScrollDeltaForVisibility(container, {
        top: 140,
        right: 260,
        bottom: 320,
        left: 120,
      }),
    ).toBeNull();
  });

  it("scrolls upward when the target is above the visible area", () => {
    expect(
      computeScrollDeltaForVisibility(container, {
        top: 90,
        right: 260,
        bottom: 220,
        left: 120,
      }),
    ).toEqual({ top: -22, left: 0 });
  });

  it("scrolls downward when the target is below the visible area", () => {
    expect(
      computeScrollDeltaForVisibility(container, {
        top: 360,
        right: 260,
        bottom: 520,
        left: 120,
      }),
    ).toEqual({ top: 32, left: 0 });
  });

  it("scrolls horizontally when the target overflows to the right", () => {
    expect(
      computeScrollDeltaForVisibility(container, {
        top: 160,
        right: 430,
        bottom: 280,
        left: 260,
      }),
    ).toEqual({ top: 0, left: 42 });
  });
});

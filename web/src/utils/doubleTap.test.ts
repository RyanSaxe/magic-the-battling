import { describe, expect, it } from "vitest";

import { DOUBLE_TAP_WINDOW_MS, registerTap } from "./doubleTap";

describe("registerTap", () => {
  it("treats a first tap as a single tap", () => {
    expect(registerTap(null, 1000)).toEqual({
      isDoubleTap: false,
      lastTapAt: 1000,
    });
  });

  it("treats a second tap inside the window as a double tap", () => {
    const first = registerTap(null, 1000);
    expect(
      registerTap(first.lastTapAt, 1000 + DOUBLE_TAP_WINDOW_MS).isDoubleTap,
    ).toBe(true);
  });

  it("starts over when the second tap comes too late", () => {
    const first = registerTap(null, 1000);
    expect(registerTap(first.lastTapAt, 1001 + DOUBLE_TAP_WINDOW_MS)).toEqual({
      isDoubleTap: false,
      lastTapAt: 1001 + DOUBLE_TAP_WINDOW_MS,
    });
  });

  it("does not count a third quick tap as another double tap", () => {
    const first = registerTap(null, 1000);
    const second = registerTap(first.lastTapAt, 1100);
    expect(registerTap(second.lastTapAt, 1200).isDoubleTap).toBe(false);
  });
});

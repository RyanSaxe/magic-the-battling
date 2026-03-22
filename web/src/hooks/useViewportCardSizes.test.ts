import { describe, expect, it } from "vitest";

import {
  computeViewportCardSizes,
  MOBILE_BREAKPOINT_PX,
} from "./useViewportCardSizes";

describe("computeViewportCardSizes", () => {
  it("uses the true mobile breakpoint", () => {
    expect(
      computeViewportCardSizes(MOBILE_BREAKPOINT_PX - 1, 900).isMobile,
    ).toBe(true);
    expect(
      computeViewportCardSizes(MOBILE_BREAKPOINT_PX, 900).isMobile,
    ).toBe(false);
  });
});

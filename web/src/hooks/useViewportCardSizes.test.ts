import { describe, expect, it } from "vitest";

import {
  computeViewportCardSizes,
  GAME_MOBILE_BREAKPOINT_PX,
} from "./useViewportCardSizes";

describe("computeViewportCardSizes", () => {
  it("uses the raised mobile breakpoint", () => {
    expect(
      computeViewportCardSizes(GAME_MOBILE_BREAKPOINT_PX - 1, 900).isMobile,
    ).toBe(true);
    expect(
      computeViewportCardSizes(GAME_MOBILE_BREAKPOINT_PX, 900).isMobile,
    ).toBe(false);
  });
});

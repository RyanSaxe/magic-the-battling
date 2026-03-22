import { describe, expect, it } from "vitest";

import {
  computeGameShellMode,
  GAME_SHELL_MOBILE_BREAKPOINT_PX,
  GAME_SHELL_SMALL_BREAKPOINT_PX,
} from "./useGameShellMode";

describe("computeGameShellMode", () => {
  it("classifies mobile widths", () => {
    expect(computeGameShellMode(GAME_SHELL_MOBILE_BREAKPOINT_PX - 1)).toBe("mobile");
  });

  it("classifies small widths", () => {
    expect(computeGameShellMode(GAME_SHELL_MOBILE_BREAKPOINT_PX)).toBe("small");
    expect(computeGameShellMode(GAME_SHELL_SMALL_BREAKPOINT_PX - 1)).toBe("small");
  });

  it("classifies big widths", () => {
    expect(computeGameShellMode(GAME_SHELL_SMALL_BREAKPOINT_PX)).toBe("big");
  });
});

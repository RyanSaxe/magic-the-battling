import { describe, expect, it } from "vitest";
import { clampMenuToViewport } from "./menuPosition";

const viewport = { width: 1440, height: 900 };

describe("clampMenuToViewport", () => {
  it("opens the menu at the click point when it fits", () => {
    expect(clampMenuToViewport({ x: 300, y: 200 }, { width: 160, height: 240 }, viewport)).toEqual({
      x: 300,
      y: 200,
    });
  });

  it("lifts a menu that grew past the bottom edge back inside the viewport", () => {
    expect(clampMenuToViewport({ x: 300, y: 651 }, { width: 160, height: 405 }, viewport)).toEqual({
      x: 300,
      y: 487,
    });
  });

  it("moves a menu opened near the right edge to the left", () => {
    expect(clampMenuToViewport({ x: 1400, y: 200 }, { width: 160, height: 240 }, viewport)).toEqual({
      x: 1272,
      y: 200,
    });
  });

  it("keeps the top edge on screen when the menu is taller than the viewport", () => {
    expect(clampMenuToViewport({ x: 300, y: 300 }, { width: 160, height: 1000 }, viewport).y).toBe(8);
  });
});

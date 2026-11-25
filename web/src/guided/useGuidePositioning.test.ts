// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  computeScrollDeltaForVisibility,
  scrollTargetIntoVisibleArea,
} from "./useGuidePositioning";

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

function makeRect(box: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
    toJSON: (): Record<string, never> => ({}),
  };
}

describe("scrollTargetIntoVisibleArea", () => {
  it("never scrolls the phase timeline up or down, or past either end", () => {
    const row = document.body.appendChild(document.createElement("div"));
    row.style.overflowX = "auto";
    row.style.overflowY = "auto";
    row.getBoundingClientRect = (): DOMRect =>
      makeRect({ left: 0, top: 10, width: 200, height: 22 });
    Object.defineProperties(row, {
      clientWidth: { value: 200 },
      scrollWidth: { value: 294 },
      clientHeight: { value: 22 },
      scrollHeight: { value: 22 },
      scrollTop: { value: 0, writable: true },
      scrollLeft: { value: 0, writable: true },
    });
    // Unlike desktop browsers, iOS can keep a scroll past a box's end, so this row doesn't clamp.
    row.scrollBy = (
      optionsOrX?: ScrollToOptions | number,
      y?: number,
    ): void => {
      if (typeof optionsOrX === "number") {
        row.scrollLeft += optionsOrX;
        row.scrollTop += y ?? 0;
      } else {
        row.scrollTop += optionsOrX?.top ?? 0;
        row.scrollLeft += optionsOrX?.left ?? 0;
      }
    };
    const step = row.appendChild(document.createElement("span"));

    step.getBoundingClientRect = (): DOMRect =>
      makeRect({ left: 0, top: 13, width: 24, height: 16 });
    scrollTargetIntoVisibleArea(step, row);
    expect([row.scrollLeft, row.scrollTop]).toEqual([0, 0]);

    step.getBoundingClientRect = (): DOMRect =>
      makeRect({ left: 204, top: 13, width: 90, height: 16 });
    scrollTargetIntoVisibleArea(step, row);
    expect([row.scrollLeft, row.scrollTop]).toEqual([94, 0]);
  });
});

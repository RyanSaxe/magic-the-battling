// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildLayoutConfig } from "../pages/phases/phaseLayouts";
import type { ZoneConstraints } from "./computeConstrainedLayout";
import { layoutForContainer } from "./useCardLayout";
import { useZoneDividers } from "./useZoneDividers";

// Build at 1280x720 with a hand of 3 and 6 sideboard cards, where grabbing the
// battlefield/sideboard divider used to shrink the hand from 285px to 189px.
const BOARD = { width: 980, height: 632 };
const config = buildLayoutConfig({ handSize: 3, sideboardCount: 6, upgradeRailCount: 0 });

function dividersFor(saved: ZoneConstraints | null) {
  const rendered = layoutForContainer(BOARD.width, BOARD.height, { ...config, constraints: saved });
  const writes: ZoneConstraints[] = [];
  const { result } = renderHook(() =>
    useZoneDividers({
      containerHeight: rendered.containerSize.height,
      containerWidth: rendered.containerSize.width,
      layoutConfig: config,
      renderedConstraints: rendered.constraints,
      constraints: saved,
      onConstraintsChange: (constraints) => writes.push(constraints),
      onConstraintsClear: () => {},
    }),
  );
  const frameHeights = (constraints: ZoneConstraints | null) => {
    const { frames } = layoutForContainer(BOARD.width, BOARD.height, { ...config, constraints });
    return { hand: frames.hand.outerHeight, battlefield: frames.battlefield.outerHeight, sideboard: frames.sideboard.outerHeight };
  };
  return { dividers: result.current, writes, before: frameHeights(saved), frameHeights };
}

describe("useZoneDividers", () => {
  it("leaves the other zones where they were drawn when one divider moves", () => {
    const { dividers, writes, before, frameHeights } = dividersFor(null);
    const split = dividers.bottomLeftSplitDivider!;
    split.onDragStart();
    split.onDrag(20);
    split.onDragEnd();

    const after = frameHeights(writes[writes.length - 1]);
    expect(after.hand).toBe(before.hand);
    expect(after.battlefield + after.sideboard).toBe(before.battlefield + before.sideboard);
    expect(after.battlefield).toBeGreaterThan(before.battlefield);
  });

  it("keeps a saved fraction and adds the ones on screen when a different divider moves", () => {
    const { dividers, writes } = dividersFor({ topFraction: 0.4 });
    const split = dividers.bottomLeftSplitDivider!;
    split.onDragStart();
    split.onDrag(10);
    split.onDragEnd();

    expect(writes[writes.length - 1]).toMatchObject({ topFraction: 0.4, bottomLeftSplit: expect.any(Number) });
  });

  it("saves nothing when a divider is pressed and released without moving", () => {
    const { dividers, writes } = dividersFor(null);
    for (const divider of [dividers.topDivider!, dividers.bottomLeftSplitDivider!]) {
      divider.onDragStart();
      divider.onDragEnd();
    }
    expect(writes).toEqual([]);
  });

  it("returns a divider drawn closer than 80px to an edge to where it was when moved back", () => {
    const { dividers, writes, before, frameHeights } = dividersFor({ topFraction: 0.05 });
    expect(before.hand).toBeLessThan(80);
    const top = dividers.topDivider!;
    top.onDragStart();
    top.onDrag(-6);
    top.onDrag(6);
    top.onDragEnd();

    expect(frameHeights(writes[writes.length - 1])).toEqual(before);
  });
});

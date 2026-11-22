// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildLayoutConfig } from "../pages/phases/phaseLayouts";
import type { ZoneConstraints } from "./computeConstrainedLayout";
import { layoutForContainer, type CardLayoutConfig } from "./useCardLayout";
import { useLayoutDrag } from "./useLayoutDrag";
import { useZoneDividers, type DividerCallbacks } from "./useZoneDividers";

// Build at 1280x720 with a hand of 3 and 6 sideboard cards, where grabbing the
// battlefield/sideboard divider used to shrink the hand from 285px to 189px.
const BOARD = { width: 980, height: 632 };
const config = buildLayoutConfig({ handSize: 3, sideboardCount: 6, upgradeRailCount: 0 });

/** The dividers of a board drawn with a saved layout, wired to a drag the way useResizableLayout wires them. */
function dividersFor(saved: ZoneConstraints | null, layoutConfig: CardLayoutConfig = config, board = BOARD) {
  const rendered = layoutForContainer(board.width, board.height, { ...layoutConfig, constraints: saved });
  const writes: ZoneConstraints[] = [];
  const save = (constraints: ZoneConstraints) => {
    writes.push(constraints);
  };
  const { result } = renderHook(() => {
    const layout = useLayoutDrag(saved, save);
    return useZoneDividers({
      containerHeight: rendered.containerSize.height,
      containerWidth: rendered.containerSize.width,
      layoutConfig,
      renderedConstraints: rendered.constraints,
      constraints: layout.constraints,
      drag: layout.drag,
      onConstraintsChange: save,
      onConstraintsClear: () => {},
    });
  });
  const grab = (divider: keyof DividerCallbacks, deltas: number[]) => {
    const handle = result.current[divider]!;
    act(() => {
      handle.onDragStart();
      for (const delta of deltas) handle.onDrag(delta);
      handle.onDragEnd();
    });
  };
  const frameHeights = (constraints: ZoneConstraints | null) => {
    const { frames } = layoutForContainer(board.width, board.height, { ...layoutConfig, constraints });
    return { hand: frames.hand.outerHeight, battlefield: frames.battlefield.outerHeight, sideboard: frames.sideboard.outerHeight };
  };
  return { grab, writes, rendered, before: frameHeights(saved), frameHeights };
}

describe("useZoneDividers", () => {
  it("leaves the other zones where they were drawn when one divider moves", () => {
    const { grab, writes, before, frameHeights } = dividersFor(null);
    grab("bottomLeftSplitDivider", [20]);

    const after = frameHeights(writes[writes.length - 1]);
    expect(after.hand).toBe(before.hand);
    expect(after.battlefield + after.sideboard).toBe(before.battlefield + before.sideboard);
    expect(after.battlefield).toBeGreaterThan(before.battlefield);
  });

  it("keeps a saved fraction and adds the ones on screen when a different divider moves", () => {
    const { grab, writes } = dividersFor({ topFraction: 0.4 });
    grab("bottomLeftSplitDivider", [10]);

    expect(writes[writes.length - 1]).toMatchObject({ topFraction: 0.4, bottomLeftSplit: expect.any(Number) });
  });

  it("saves nothing when a divider is pressed and released without moving", () => {
    const { grab, writes } = dividersFor(null);
    grab("topDivider", []);
    grab("bottomLeftSplitDivider", []);
    expect(writes).toEqual([]);
  });

  it("returns a divider drawn closer than 80px to an edge to where it was when moved back", () => {
    // Eight upgrades leave the automatic upgrade rail narrower than the divider's 80px limit.
    const railConfig = buildLayoutConfig({ handSize: 3, sideboardCount: 0, upgradeRailCount: 8 });
    const board = { width: 880, height: 732 };
    const { grab, writes, rendered } = dividersFor(null, railConfig, board);
    expect(rendered.frames.commandZone.outerWidth).toBeLessThan(80);
    grab("leftDivider", [6, -6]);

    const after = layoutForContainer(board.width, board.height, { ...railConfig, constraints: writes[writes.length - 1] });
    expect(after.frames).toEqual(rendered.frames);
  });
});

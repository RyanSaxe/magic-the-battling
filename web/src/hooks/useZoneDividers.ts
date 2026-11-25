/**
 * React hook wiring interactive zone dividers to the pure divider visibility,
 * clamping, and constraint-seed primitives in web/src/layout/.
 */
import { useRef, useCallback, useMemo } from "react";
import {
  clampDividerFraction,
  omitConstraintKey,
  resolveVisibleDividers,
  seedDragConstraints,
  type CardLayoutConfig,
  type ZoneConstraints,
} from "../layout";
import type { DividerDragCallbacks } from "./useDividerDrag";
import type { LayoutDrag } from "./useLayoutDrag";

export interface DividerCallbacks {
  topDivider: DividerDragCallbacks | null;
  bottomLeftSplitDivider: DividerDragCallbacks | null;
  leftDivider: DividerDragCallbacks | null;
}

interface MeasuredConstraints extends Required<ZoneConstraints> {
  usableHeight?: number;
  bottomInnerHeight?: number;
  usableWidth?: number;
}

export function useZoneDividers(cfg: {
  containerHeight: number;
  containerWidth: number;
  layoutConfig: CardLayoutConfig;
  allowHorizontalResize?: boolean;
  measureInitialConstraints?: () => MeasuredConstraints | null;
  renderedConstraints: Required<ZoneConstraints>;
  constraints: ZoneConstraints | null;
  drag: LayoutDrag;
  onConstraintsChange: (c: ZoneConstraints) => void;
  onConstraintsClear: () => void;
}): DividerCallbacks {
  const {
    containerHeight,
    containerWidth,
    layoutConfig,
    allowHorizontalResize = true,
    measureInitialConstraints,
    renderedConstraints,
    constraints,
    drag,
    onConstraintsChange,
    onConstraintsClear,
  } = cfg;

  const dragStartRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const dragSpaceRef = useRef<Record<keyof ZoneConstraints, number>>({
    topFraction: 0,
    bottomLeftSplit: 0,
    leftFraction: 0,
  });

  const {
    top: showTopDivider,
    bottomLeftSplit: showBottomLeftSplit,
    left: showLeftDivider,
  } = resolveVisibleDividers(layoutConfig, allowHorizontalResize);
  const availH = containerHeight - (layoutConfig.fixedHeight ?? 0);

  // A drag saves every divider on screen where it was drawn, so moving one
  // leaves the others in place; fractions saved for dividers not shown stay.
  const startDrag = useCallback(
    (key: keyof ZoneConstraints) => {
      dragStartRef.current = renderedConstraints[key];
      dragDeltaRef.current = 0;
      drag.start(
        seedDragConstraints(constraints, renderedConstraints, {
          top: showTopDivider,
          bottomLeftSplit: showBottomLeftSplit,
          left: showLeftDivider,
        }),
      );
    },
    [
      constraints,
      renderedConstraints,
      showTopDivider,
      showBottomLeftSplit,
      showLeftDivider,
      drag,
    ],
  );

  // The divider follows the pointer's distance from where the drag started, so
  // pushing past the clamp and coming back returns it to where it was.
  const dragTo = useCallback(
    (key: keyof ZoneConstraints, deltaPx: number, dragSpace: number) => {
      dragDeltaRef.current += deltaPx;
      const start = dragStartRef.current;
      drag.move(
        key,
        clampDividerFraction(
          start + dragDeltaRef.current / dragSpace,
          dragSpace,
          start,
        ),
      );
    },
    [drag],
  );

  const resetKey = useCallback(
    (key: keyof ZoneConstraints) => {
      const rest = omitConstraintKey(constraints, key);
      if (rest === null) {
        onConstraintsClear();
      } else {
        onConstraintsChange(rest);
      }
    },
    [constraints, onConstraintsChange, onConstraintsClear],
  );

  const makeHandle = useCallback(
    (
      key: keyof ZoneConstraints,
      readMeasuredSpace: (measured: MeasuredConstraints | null) => number,
      fallbackSpace: () => number,
    ): DividerDragCallbacks => ({
      onDragStart: () => {
        const measured = constraints
          ? null
          : (measureInitialConstraints?.() ?? null);
        dragSpaceRef.current[key] = readMeasuredSpace(measured);
        startDrag(key);
      },
      onDrag: (deltaPx: number) => {
        dragTo(key, deltaPx, dragSpaceRef.current[key] || fallbackSpace());
      },
      onDragEnd: drag.end,
      onDoubleClick: () => resetKey(key),
    }),
    [
      constraints,
      measureInitialConstraints,
      startDrag,
      dragTo,
      drag.end,
      resetKey,
    ],
  );

  const topFractionForSplit =
    constraints?.topFraction ?? renderedConstraints.topFraction;

  return useMemo(
    () => ({
      topDivider: showTopDivider
        ? makeHandle(
            "topFraction",
            (m) => m?.usableHeight ?? availH,
            () => availH,
          )
        : null,
      bottomLeftSplitDivider: showBottomLeftSplit
        ? makeHandle(
            "bottomLeftSplit",
            (m) =>
              m?.bottomInnerHeight ??
              availH * (1 - renderedConstraints.topFraction),
            () => availH * (1 - topFractionForSplit),
          )
        : null,
      leftDivider: showLeftDivider
        ? makeHandle(
            "leftFraction",
            (m) => m?.usableWidth ?? containerWidth,
            () => containerWidth,
          )
        : null,
    }),
    [
      showTopDivider,
      showBottomLeftSplit,
      showLeftDivider,
      makeHandle,
      availH,
      containerWidth,
      renderedConstraints.topFraction,
      topFractionForSplit,
    ],
  );
}

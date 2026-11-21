import { useRef, useCallback, useMemo } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";
import type { DividerDragCallbacks } from "./useDividerDrag";
import type { CardLayoutConfig } from "./useCardLayout";

function omitKey<T extends object>(obj: T, key: keyof T): Partial<T> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const MIN_ZONE_PX = 80;

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

/** Keeps a zone at least MIN_ZONE_PX, or where the divider started if it was already closer. */
function clampFraction(value: number, containerPx: number, start: number): number {
  const min = Math.min(MIN_ZONE_PX / containerPx, start);
  const max = Math.max(1 - MIN_ZONE_PX / containerPx, start);
  return Math.max(min, Math.min(max, value));
}

export function useZoneDividers(cfg: {
  containerHeight: number;
  containerWidth: number;
  layoutConfig: CardLayoutConfig;
  allowHorizontalResize?: boolean;
  measureInitialConstraints?: () => MeasuredConstraints | null;
  /** The fractions the zones on screen were drawn with. */
  renderedConstraints: Required<ZoneConstraints>;
  constraints: ZoneConstraints | null;
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
    onConstraintsChange,
    onConstraintsClear,
  } = cfg;

  const draftRef = useRef<ZoneConstraints>({});
  const dragStartRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const movedRef = useRef(false);
  const topDragSpaceRef = useRef(0);
  const bottomSplitSpaceRef = useRef(0);
  const leftDragSpaceRef = useRef(0);

  const topIds = layoutConfig.layout.top ?? [];
  const blIds = layoutConfig.layout.bottomLeft ?? [];
  const brIds = layoutConfig.layout.bottomRight ?? [];

  const hasActiveTop = topIds.some((id) => (layoutConfig.zones[id]?.count ?? 0) > 0);
  const hasActiveBottom =
    blIds.some((id) => (layoutConfig.zones[id]?.count ?? 0) > 0) ||
    brIds.some((id) => (layoutConfig.zones[id]?.count ?? 0) > 0);
  const hasActiveBLMultiple =
    blIds.filter((id) => (layoutConfig.zones[id]?.count ?? 0) > 0).length >= 2;
  const hasActiveBR = brIds.some((id) => (layoutConfig.zones[id]?.count ?? 0) > 0);
  const hasActiveBL = blIds.some((id) => (layoutConfig.zones[id]?.count ?? 0) > 0);

  const showTopDivider = hasActiveTop && hasActiveBottom;
  const showBottomLeftSplit = hasActiveBLMultiple;
  const showLeftDivider = allowHorizontalResize && hasActiveBL && hasActiveBR;

  const fixedHeight = layoutConfig.fixedHeight ?? 0;
  const availH = containerHeight - fixedHeight;

  // A drag saves every divider on screen where it was drawn, so moving one
  // leaves the others in place; fractions saved for dividers not shown now stay.
  const startDrag = useCallback(
    (key: keyof ZoneConstraints) => {
      draftRef.current = {
        ...constraints,
        ...(showTopDivider ? { topFraction: renderedConstraints.topFraction } : {}),
        ...(showBottomLeftSplit ? { bottomLeftSplit: renderedConstraints.bottomLeftSplit } : {}),
        ...(showLeftDivider ? { leftFraction: renderedConstraints.leftFraction } : {}),
      };
      dragStartRef.current = renderedConstraints[key];
      dragDeltaRef.current = 0;
      movedRef.current = false;
    },
    [constraints, renderedConstraints, showTopDivider, showBottomLeftSplit, showLeftDivider],
  );

  // The divider follows the pointer's distance from where the drag started, so
  // pushing past the clamp and coming back returns it to where it was.
  const dragTo = useCallback(
    (key: keyof ZoneConstraints, deltaPx: number, dragSpace: number) => {
      dragDeltaRef.current += deltaPx;
      const start = dragStartRef.current;
      const next = clampFraction(start + dragDeltaRef.current / dragSpace, dragSpace, start);
      draftRef.current = { ...draftRef.current, [key]: next };
      movedRef.current = true;
      onConstraintsChange({ ...draftRef.current });
    },
    [onConstraintsChange],
  );

  // A press without a move leaves the layout as it was, so there is nothing to save.
  const endDrag = useCallback(() => {
    if (movedRef.current) onConstraintsChange({ ...draftRef.current });
  }, [onConstraintsChange]);

  const makeTopDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      topDragSpaceRef.current = measured?.usableHeight ?? availH;
      startDrag("topFraction");
    },
    onDrag: (deltaPx: number) => {
      dragTo("topFraction", deltaPx, topDragSpaceRef.current || availH);
    },
    onDragEnd: endDrag,
    onDoubleClick: () => {
      const rest = omitKey(constraints ?? {}, "topFraction");
      if (Object.keys(rest).length === 0) {
        onConstraintsClear();
      } else {
        onConstraintsChange(rest);
      }
    },
  }), [
    constraints,
    availH,
    measureInitialConstraints,
    startDrag,
    dragTo,
    endDrag,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  const makeBottomLeftSplitDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      bottomSplitSpaceRef.current =
        measured?.bottomInnerHeight ?? availH * (1 - renderedConstraints.topFraction);
      startDrag("bottomLeftSplit");
    },
    onDrag: (deltaPx: number) => {
      const topFraction = draftRef.current.topFraction ?? renderedConstraints.topFraction;
      dragTo(
        "bottomLeftSplit",
        deltaPx,
        bottomSplitSpaceRef.current || availH * (1 - topFraction),
      );
    },
    onDragEnd: endDrag,
    onDoubleClick: () => {
      const rest = omitKey(constraints ?? {}, "bottomLeftSplit");
      if (Object.keys(rest).length === 0) {
        onConstraintsClear();
      } else {
        onConstraintsChange(rest);
      }
    },
  }), [
    constraints,
    renderedConstraints.topFraction,
    availH,
    measureInitialConstraints,
    startDrag,
    dragTo,
    endDrag,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  const makeLeftDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      leftDragSpaceRef.current = measured?.usableWidth ?? containerWidth;
      startDrag("leftFraction");
    },
    onDrag: (deltaPx: number) => {
      dragTo("leftFraction", deltaPx, leftDragSpaceRef.current || containerWidth);
    },
    onDragEnd: endDrag,
    onDoubleClick: () => {
      const rest = omitKey(constraints ?? {}, "leftFraction");
      if (Object.keys(rest).length === 0) {
        onConstraintsClear();
      } else {
        onConstraintsChange(rest);
      }
    },
  }), [
    constraints,
    containerWidth,
    measureInitialConstraints,
    startDrag,
    dragTo,
    endDrag,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  return useMemo(() => ({
    topDivider: showTopDivider ? makeTopDivider() : null,
    bottomLeftSplitDivider: showBottomLeftSplit ? makeBottomLeftSplitDivider() : null,
    leftDivider: showLeftDivider ? makeLeftDivider() : null,
  }), [showTopDivider, showBottomLeftSplit, showLeftDivider, makeTopDivider, makeBottomLeftSplitDivider, makeLeftDivider]);
}

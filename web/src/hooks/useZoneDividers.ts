import { useRef, useCallback, useMemo } from "react";
import {
  deriveConstraintsFromLayout,
  type ZoneConstraints,
} from "./computeConstrainedLayout";
import type { DividerDragCallbacks } from "./useDividerDrag";
import type { CardLayoutConfig, CardLayoutResult } from "./useCardLayout";

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

function clampFraction(value: number, containerPx: number): number {
  const min = MIN_ZONE_PX / containerPx;
  const max = 1 - min;
  return Math.max(min, Math.min(max, value));
}

export function useZoneDividers(cfg: {
  containerHeight: number;
  containerWidth: number;
  currentLayout: CardLayoutResult;
  layoutConfig: CardLayoutConfig;
  allowHorizontalResize?: boolean;
  measureInitialConstraints?: () => MeasuredConstraints | null;
  constraints: ZoneConstraints | null;
  onConstraintsChange: (c: ZoneConstraints) => void;
  onConstraintsClear: () => void;
}): DividerCallbacks {
  const {
    containerHeight,
    containerWidth,
    currentLayout,
    layoutConfig,
    allowHorizontalResize = true,
    measureInitialConstraints,
    constraints,
    onConstraintsChange,
    onConstraintsClear,
  } = cfg;

  const draftRef = useRef<ZoneConstraints>({});
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
  const derivedConstraints = useMemo(
    () =>
      deriveConstraintsFromLayout(
        currentLayout,
        layoutConfig,
        containerHeight,
        containerWidth,
      ),
    [containerHeight, containerWidth, currentLayout, layoutConfig],
  );

  const makeTopDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      const currentFraction =
        constraints?.topFraction ??
        measured?.topFraction ??
        derivedConstraints.topFraction;
      topDragSpaceRef.current = measured?.usableHeight ?? availH;
      draftRef.current = { ...constraints, topFraction: currentFraction };
    },
    onDrag: (deltaPx: number) => {
      const prev = draftRef.current.topFraction ?? 0.5;
      const dragSpace = topDragSpaceRef.current || availH;
      const next = clampFraction(prev + deltaPx / dragSpace, dragSpace);
      draftRef.current = { ...draftRef.current, topFraction: next };
      onConstraintsChange({ ...draftRef.current });
    },
    onDragEnd: () => {
      onConstraintsChange({ ...draftRef.current });
    },
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
    derivedConstraints.topFraction,
    availH,
    measureInitialConstraints,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  const makeBottomLeftSplitDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      const topFraction =
        constraints?.topFraction ??
        measured?.topFraction ??
        derivedConstraints.topFraction;
      bottomSplitSpaceRef.current =
        measured?.bottomInnerHeight ?? availH * (1 - topFraction);
      draftRef.current = {
        ...constraints,
        bottomLeftSplit:
          constraints?.bottomLeftSplit ??
          measured?.bottomLeftSplit ??
          derivedConstraints.bottomLeftSplit,
      };
    },
    onDrag: (deltaPx: number) => {
      const topFraction =
        draftRef.current.topFraction ??
        constraints?.topFraction ??
        derivedConstraints.topFraction;
      const bottomH = bottomSplitSpaceRef.current || availH * (1 - topFraction);
      const prev = draftRef.current.bottomLeftSplit ?? 0.5;
      const next = clampFraction(prev + deltaPx / bottomH, bottomH);
      draftRef.current = { ...draftRef.current, bottomLeftSplit: next };
      onConstraintsChange({ ...draftRef.current });
    },
    onDragEnd: () => {
      onConstraintsChange({ ...draftRef.current });
    },
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
    derivedConstraints.bottomLeftSplit,
    derivedConstraints.topFraction,
    availH,
    measureInitialConstraints,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  const makeLeftDivider = useCallback(() => ({
    onDragStart: () => {
      const measured = constraints ? null : measureInitialConstraints?.();
      leftDragSpaceRef.current = measured?.usableWidth ?? containerWidth;
      draftRef.current = {
        ...constraints,
        leftFraction:
          constraints?.leftFraction ??
          measured?.leftFraction ??
          derivedConstraints.leftFraction,
      };
    },
    onDrag: (deltaPx: number) => {
      const prev = draftRef.current.leftFraction ?? derivedConstraints.leftFraction;
      const dragSpace = leftDragSpaceRef.current || containerWidth;
      const next = clampFraction(prev + deltaPx / dragSpace, dragSpace);
      draftRef.current = { ...draftRef.current, leftFraction: next };
      onConstraintsChange({ ...draftRef.current });
    },
    onDragEnd: () => {
      onConstraintsChange({ ...draftRef.current });
    },
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
    derivedConstraints.leftFraction,
    measureInitialConstraints,
    onConstraintsChange,
    onConstraintsClear,
  ]);

  return useMemo(() => ({
    topDivider: showTopDivider ? makeTopDivider() : null,
    bottomLeftSplitDivider: showBottomLeftSplit ? makeBottomLeftSplitDivider() : null,
    leftDivider: showLeftDivider ? makeLeftDivider() : null,
  }), [showTopDivider, showBottomLeftSplit, showLeftDivider, makeTopDivider, makeBottomLeftSplitDivider, makeLeftDivider]);
}

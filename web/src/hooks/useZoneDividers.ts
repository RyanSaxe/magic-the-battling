import { useRef, useCallback, useMemo } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";
import type { CardLayoutConfig, CardLayoutResult } from "./useCardLayout";

function omitKey<T extends Record<string, unknown>>(obj: T, key: keyof T): Partial<T> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

const MIN_ZONE_PX = 80;

export interface DividerCallbacks {
  topDivider: {
    onDragStart: () => void;
    onDrag: (deltaPx: number) => void;
    onDragEnd: () => void;
    onDoubleClick: () => void;
  } | null;
  bottomLeftSplitDivider: {
    onDragStart: () => void;
    onDrag: (deltaPx: number) => void;
    onDragEnd: () => void;
    onDoubleClick: () => void;
  } | null;
  leftDivider: {
    onDragStart: () => void;
    onDrag: (deltaPx: number) => void;
    onDragEnd: () => void;
    onDoubleClick: () => void;
  } | null;
}

function clampFraction(value: number, containerPx: number): number {
  const min = MIN_ZONE_PX / containerPx;
  const max = 1 - min;
  return Math.max(min, Math.min(max, value));
}

function deriveTopFraction(
  layout: CardLayoutResult,
  config: CardLayoutConfig,
  containerH: number,
): number {
  const topIds = config.layout.top ?? [];
  const fixedHeight = config.fixedHeight ?? 0;
  const sectionPadTop = config.sectionPadTop ?? 0;
  const sectionPadBottom = config.sectionPadBottom ?? 0;
  const sectionPadV = sectionPadTop + sectionPadBottom;
  const availH = containerH - fixedHeight;
  if (availH <= 0) return 0.5;

  let topH = 0;
  for (const id of topIds) {
    const d = layout[id];
    if (d && d.width > 0) {
      const gap = config.zones[id]?.gap ?? 6;
      topH += d.rows * d.height + gap * Math.max(0, d.rows - 1) + sectionPadV;
    }
  }
  return topH / availH;
}

export function useZoneDividers(cfg: {
  containerHeight: number;
  containerWidth: number;
  currentLayout: CardLayoutResult;
  layoutConfig: CardLayoutConfig;
  constraints: ZoneConstraints | null;
  onConstraintsChange: (c: ZoneConstraints) => void;
  onConstraintsClear: () => void;
}): DividerCallbacks {
  const {
    containerHeight,
    containerWidth,
    currentLayout,
    layoutConfig,
    constraints,
    onConstraintsChange,
    onConstraintsClear,
  } = cfg;

  const draftRef = useRef<ZoneConstraints>({});

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
  const showLeftDivider = hasActiveBL && hasActiveBR;

  const fixedHeight = layoutConfig.fixedHeight ?? 0;
  const availH = containerHeight - fixedHeight;

  const makeTopDivider = useCallback(() => ({
    onDragStart: () => {
      const currentFraction = constraints?.topFraction ??
        deriveTopFraction(currentLayout, layoutConfig, containerHeight);
      draftRef.current = { ...constraints, topFraction: currentFraction };
    },
    onDrag: (deltaPx: number) => {
      const prev = draftRef.current.topFraction ?? 0.5;
      const next = clampFraction(prev + deltaPx / availH, availH);
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
  }), [constraints, currentLayout, layoutConfig, containerHeight, availH, onConstraintsChange, onConstraintsClear]);

  const makeBottomLeftSplitDivider = useCallback(() => ({
    onDragStart: () => {
      draftRef.current = { ...constraints, bottomLeftSplit: constraints?.bottomLeftSplit ?? 0.5 };
    },
    onDrag: (deltaPx: number) => {
      const bottomH = availH * (1 - (constraints?.topFraction ?? 0.5));
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
  }), [constraints, availH, onConstraintsChange, onConstraintsClear]);

  const makeLeftDivider = useCallback(() => ({
    onDragStart: () => {
      draftRef.current = { ...constraints, leftFraction: constraints?.leftFraction ?? 0.7 };
    },
    onDrag: (deltaPx: number) => {
      const prev = draftRef.current.leftFraction ?? 0.7;
      const next = clampFraction(prev + deltaPx / containerWidth, containerWidth);
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
  }), [constraints, containerWidth, onConstraintsChange, onConstraintsClear]);

  return useMemo(() => ({
    topDivider: showTopDivider ? makeTopDivider() : null,
    bottomLeftSplitDivider: showBottomLeftSplit ? makeBottomLeftSplitDivider() : null,
    leftDivider: showLeftDivider ? makeLeftDivider() : null,
  }), [showTopDivider, showBottomLeftSplit, showLeftDivider, makeTopDivider, makeBottomLeftSplitDivider, makeLeftDivider]);
}

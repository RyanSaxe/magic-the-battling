import { useCallback, useMemo, useRef } from "react";
import {
  useCardLayout,
  ZONE_LAYOUT_PADDING,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ContainerSize,
} from "./useCardLayout";
import { useZoneDividers, type DividerCallbacks } from "./useZoneDividers";
import type {
  ZoneConstraints,
  ZoneFrameResult,
} from "./computeConstrainedLayout";

export interface ZoneMeasurement {
  outerWidth: number;
  outerHeight: number;
}

export interface MeasuredFromPlacement {
  topFraction: number;
  leftFraction: number;
  bottomLeftSplit: number;
  usableHeight: number;
  bottomInnerHeight: number;
  usableWidth: number;
}

/**
 * Pure function form of the measurement logic, separated so it can be
 * unit-tested without React. Given the layout shape and the actual rendered
 * outer rects of each zone, returns the constraints for divider drag start.
 *
 * Returns null when no zone has been measured yet (initial mount before
 * refs settle).
 */
export function measureFromPlacement(args: {
  layout: CardLayoutConfig["layout"];
  zones: CardLayoutConfig["zones"];
  zoneMeasurements: Record<string, ZoneMeasurement | null | undefined>;
  containerWidth: number;
  sectionPadTop?: number;
  sectionPadBottom?: number;
  sectionGap?: number;
}): MeasuredFromPlacement | null {
  const {
    layout,
    zones,
    zoneMeasurements,
    containerWidth,
    sectionPadTop = ZONE_LAYOUT_PADDING.sectionPadTop,
    sectionPadBottom = ZONE_LAYOUT_PADDING.sectionPadBottom,
    sectionGap = ZONE_LAYOUT_PADDING.sectionGap,
  } = args;
  const sectionPadV = sectionPadTop + sectionPadBottom;

  const activeIn = (slot: string[] | undefined) =>
    (slot ?? []).filter((id) => (zones[id]?.count ?? 0) > 0);

  const topId = activeIn(layout.top)[0];
  const blIds = activeIn(layout.bottomLeft);
  const blPrimaryId = blIds[0];
  const blFillId = blIds[1]; // currently only one fill zone is supported
  const brId = activeIn(layout.bottomRight)[0];

  const measureFor = (id: string | undefined): ZoneMeasurement => {
    if (!id) return { outerWidth: 0, outerHeight: 0 };
    const m = zoneMeasurements[id];
    return m ?? { outerWidth: 0, outerHeight: 0 };
  };

  const top = measureFor(topId);
  const blPrimary = measureFor(blPrimaryId);
  const blFill = measureFor(blFillId);
  const br = measureFor(brId);

  const hasFill = !!blFillId;
  const hasBR = !!brId;

  const blOuter = blPrimary.outerHeight + (hasFill ? blFill.outerHeight + sectionGap : 0);
  const bottomOuter = Math.max(blOuter, br.outerHeight);
  if (bottomOuter <= 0) return null;

  const usableHeight = top.outerHeight + bottomOuter;

  const totalBottomWidth =
    blPrimary.outerWidth + (hasBR ? br.outerWidth + sectionGap : 0);
  const leftFraction =
    hasBR && totalBottomWidth > sectionGap
      ? blPrimary.outerWidth / (totalBottomWidth - sectionGap)
      : 0.7;

  let bottomLeftSplit = 0.5;
  if (hasFill) {
    const primaryInner = Math.max(0, blPrimary.outerHeight - sectionPadV);
    const fillInner = Math.max(0, blFill.outerHeight - sectionPadV);
    const totalInner = primaryInner + fillInner;
    if (totalInner > 0) bottomLeftSplit = primaryInner / totalInner;
  }

  return {
    topFraction: usableHeight > 0 ? top.outerHeight / usableHeight : 0,
    leftFraction,
    bottomLeftSplit,
    usableHeight,
    bottomInnerHeight: Math.max(
      0,
      blOuter - (hasFill ? sectionGap : 0) - (hasFill ? 2 : 1) * sectionPadV,
    ),
    usableWidth: totalBottomWidth > 0 ? totalBottomWidth : containerWidth,
  };
}

interface UseResizableLayoutOptions {
  layoutConfig: CardLayoutConfig;
  constraints: ZoneConstraints | null;
  onConstraintsChange: (c: ZoneConstraints) => void;
  onConstraintsClear: () => void;
  allowHorizontalResize?: boolean;
}

interface UseResizableLayoutResult {
  containerRef: React.RefCallback<HTMLElement>;
  dims: CardLayoutResult;
  containerSize: ContainerSize;
  zoneFrames: ZoneFrameResult;
  /** RefCallbacks keyed by the zone ids in layoutConfig.zones. */
  zoneRefs: Record<string, React.RefCallback<HTMLDivElement>>;
  dividerCallbacks: DividerCallbacks;
}

/**
 * Wraps useCardLayout + useZoneDividers + the per-zone refs + the unified
 * measureInitialConstraints derivation that DeckDisplay/Build/Draft/Reward
 * all reimplemented separately. Callers describe their layout via
 * `layoutConfig.layout` (top / bottomLeft / bottomRight) and the hook does
 * everything else.
 */
export function useResizableLayout({
  layoutConfig,
  constraints,
  onConstraintsChange,
  onConstraintsClear,
  allowHorizontalResize,
}: UseResizableLayoutOptions): UseResizableLayoutResult {
  const allZoneIds = useMemo(
    () => Object.keys(layoutConfig.zones),
    [layoutConfig.zones],
  );
  const allZoneIdsKey = allZoneIds.join("\0");

  const zoneNodesRef = useRef<Record<string, HTMLDivElement | null>>({});
  const zoneRefs = useMemo(() => {
    const result: Record<string, React.RefCallback<HTMLDivElement>> = {};
    for (const id of allZoneIds) {
      result[id] = (node: HTMLDivElement | null) => {
        zoneNodesRef.current[id] = node;
      };
    }
    return result;
    // allZoneIdsKey changes only when the set of zones changes, keeping refs stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allZoneIdsKey]);

  const [containerRef, dims, containerSize, zoneFrames] = useCardLayout({
    ...layoutConfig,
    constraints,
  });

  const measureInitialConstraints = useCallback(() => {
    const measurements: Record<string, ZoneMeasurement | null> = {};
    for (const id of allZoneIds) {
      const rect = zoneNodesRef.current[id]?.getBoundingClientRect();
      measurements[id] = rect
        ? { outerWidth: rect.width, outerHeight: rect.height }
        : null;
    }
    return measureFromPlacement({
      layout: layoutConfig.layout,
      zones: layoutConfig.zones,
      zoneMeasurements: measurements,
      containerWidth: containerSize.width,
      sectionPadTop: layoutConfig.sectionPadTop,
      sectionPadBottom: layoutConfig.sectionPadBottom,
      sectionGap: layoutConfig.sectionGap,
    });
  }, [layoutConfig, containerSize.width, allZoneIds]);

  const dividerCallbacks = useZoneDividers({
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    currentLayout: dims,
    layoutConfig,
    allowHorizontalResize,
    measureInitialConstraints,
    constraints,
    onConstraintsChange,
    onConstraintsClear,
  });

  return {
    containerRef,
    dims,
    containerSize,
    zoneFrames,
    zoneRefs,
    dividerCallbacks,
  };
}

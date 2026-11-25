/**
 * React hook composing useCardLayout, useZoneDividers, and per-zone DOM refs
 * for Draft, Build, Reward, and DeckDisplay surfaces.
 */
import { useCallback, useMemo, useRef } from "react";
import {
  measureFromPlacement,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ContainerSize,
  type MeasuredFromPlacement,
  type ZoneConstraints,
  type ZoneFrameResult,
  type ZoneMeasurement,
} from "../layout";
import { useCardLayout } from "./useCardLayout";
import { useLayoutDrag } from "./useLayoutDrag";
import { useZoneDividers, type DividerCallbacks } from "./useZoneDividers";

export {
  measureFromPlacement,
  type MeasuredFromPlacement,
  type ZoneMeasurement,
};

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
  zoneRefs: Record<string, React.RefCallback<HTMLDivElement>>;
  dividerCallbacks: DividerCallbacks;
}

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

  const layout = useLayoutDrag(constraints, onConstraintsChange);
  const [containerRef, dims, containerSize, zoneFrames, renderedConstraints] =
    useCardLayout({
      ...layoutConfig,
      constraints: layout.constraints,
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
    layoutConfig,
    allowHorizontalResize,
    measureInitialConstraints,
    renderedConstraints,
    constraints: layout.constraints,
    drag: layout.drag,
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

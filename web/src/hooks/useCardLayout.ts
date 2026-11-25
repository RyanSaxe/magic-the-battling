/**
 * React hook binding ResizeObserver measurements to the pure web/src/layout
 * engine. Re-exports layout types and compute functions to keep phase callers stable.
 */
import { useState, useCallback, useRef, useLayoutEffect } from "react";
import {
  DEFAULT_PASS_2_MAX_CARD_WIDTH,
  ZONE_LAYOUT_PADDING,
  computePhaseLayout,
  dimsEqual,
  framesEqual,
  layoutForContainer,
  makeDefaultDims,
  makeDefaultFrames,
  measureContentBox,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ContainerLayout,
  type ContainerSize,
  type ZoneConstraints,
  type ZoneFrameResult,
  type ZoneSpec,
} from "../layout";

export {
  DEFAULT_PASS_2_MAX_CARD_WIDTH,
  ZONE_LAYOUT_PADDING,
  computePhaseLayout as computeLayout,
  layoutForContainer,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ContainerLayout,
  type ContainerSize,
  type ZoneSpec,
};

export function useCardLayout(
  config: CardLayoutConfig,
): [
  React.RefCallback<HTMLElement>,
  CardLayoutResult,
  ContainerSize,
  ZoneFrameResult,
  Required<ZoneConstraints>,
] {
  const zoneIds = Object.keys(config.zones);

  const [dims, setDims] = useState<CardLayoutResult>(() =>
    makeDefaultDims(zoneIds),
  );
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  });
  const [zoneFrames, setZoneFrames] = useState<ZoneFrameResult>(() =>
    makeDefaultFrames(zoneIds),
  );
  const [renderedConstraints, setRenderedConstraints] = useState<
    Required<ZoneConstraints>
  >({ topFraction: 0.5, leftFraction: 0.7, bottomLeftSplit: 0.5 });

  const configRef = useRef(config);
  const observerRef = useRef<ResizeObserver | null>(null);
  const measuredRef = useRef<ContainerSize | null>(null);

  const update = useCallback((w: number, h: number) => {
    const next = layoutForContainer(w, h, configRef.current);
    setContainerSize((prev) =>
      prev.width === next.containerSize.width &&
      prev.height === next.containerSize.height
        ? prev
        : next.containerSize,
    );
    setDims((prev) => (dimsEqual(prev, next.dims) ? prev : next.dims));
    setZoneFrames((prev) =>
      framesEqual(prev, next.frames) ? prev : next.frames,
    );
    setRenderedConstraints((prev) =>
      prev.topFraction === next.constraints.topFraction &&
      prev.leftFraction === next.constraints.leftFraction &&
      prev.bottomLeftSplit === next.constraints.bottomLeftSplit
        ? prev
        : next.constraints,
    );
  }, []);

  const measure = useCallback(
    (node: HTMLElement) => {
      measuredRef.current = measureContentBox(node);
      update(measuredRef.current.width, measuredRef.current.height);
    },
    [update],
  );

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      measuredRef.current = null;
      if (!node) return;

      measure(node);
      const observer = new ResizeObserver(() => measure(node));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  // Sync latest config and re-run layout from the last measurement without
  // re-measuring the DOM, avoiding feedback loops when stylesheets load late.
  useLayoutEffect(() => {
    configRef.current = config;
    if (measuredRef.current) {
      update(measuredRef.current.width, measuredRef.current.height);
    }
  });

  return [refCallback, dims, containerSize, zoneFrames, renderedConstraints];
}

/**
 * DOM measurement and viewport positioning hook for Guided Mode spotlights and tooltips.
 */
import { useLayoutEffect, useState, type RefObject } from "react";
import type { GuidePlacement, GuideTargetId } from "../guided/types";

const CARD_MARGIN = 12;
const SPOTLIGHT_PADDING = 12;
const MOBILE_BREAKPOINT = 640;
const SCROLL_MARGIN = 12;
const LAYOUT_STABILITY_FRAMES = 2;

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionState {
  spotlight: SpotlightRect | null;
  cardLeft: number;
  cardTop: number;
  resolvedPlacement: GuidePlacement;
  isMobile: boolean;
  containerWidth: number;
  containerHeight: number;
  clipPath: string;
}

interface LayoutMeasurement {
  state: PositionState | null;
  signature: string | null;
  target: HTMLElement | null;
  observedElements: HTMLElement[];
}

export function resolveTarget(
  root: HTMLElement,
  targetId?: GuideTargetId,
  targetSelector?: string,
): HTMLElement | null {
  if (targetSelector) {
    const selectorTarget = root.querySelector<HTMLElement>(targetSelector);
    if (selectorTarget) return selectorTarget;
    const documentSelectorTarget =
      document.querySelector<HTMLElement>(targetSelector);
    if (documentSelectorTarget) return documentSelectorTarget;
  }
  if (!targetId) return null;
  return (
    root.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`) ??
    document.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`)
  );
}

function toRelativeRect(
  root: HTMLElement,
  target: HTMLElement,
  padding: number,
): SpotlightRect {
  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return {
    x: targetRect.left - rootRect.left - padding,
    y: targetRect.top - rootRect.top - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };
}

function clampSpotlight(
  rect: SpotlightRect,
  cw: number,
  ch: number,
): SpotlightRect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(cw, rect.x + rect.width);
  const bottom = Math.min(ch, rect.y + rect.height);
  return { x, y, width: right - x, height: bottom - y };
}

function buildClipPath(
  spotlight: SpotlightRect | null,
  cw: number,
  ch: number,
): string {
  if (!spotlight) return "none";
  const { x, y, width, height } = spotlight;
  const l = x;
  const t = y;
  const ri = x + width;
  const b = y + height;

  return `polygon(0 0, ${cw}px 0, ${cw}px ${ch}px, 0 ${ch}px, 0 0, ${l}px ${t}px, ${l}px ${b}px, ${ri}px ${b}px, ${ri}px ${t}px, ${l}px ${t}px)`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundRectValue(value: number): number {
  return Math.round(value * 10) / 10;
}

function rectSignature(rect: SpotlightRect | null): string {
  if (!rect) {
    return "none";
  }
  return [
    roundRectValue(rect.x),
    roundRectValue(rect.y),
    roundRectValue(rect.width),
    roundRectValue(rect.height),
  ].join(":");
}

function hasVisibleArea(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function positionKey(state: PositionState): string {
  return [
    rectSignature(state.spotlight),
    state.cardLeft,
    state.cardTop,
    state.resolvedPlacement,
    state.isMobile,
    state.containerWidth,
    state.containerHeight,
    state.clipPath,
  ].join("|");
}

function samePositionState(
  a: PositionState | null,
  b: PositionState | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return positionKey(a) === positionKey(b);
}

interface RectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function computeScrollDeltaForVisibility(
  containerRect: RectLike,
  targetRect: RectLike,
  margin: number = SCROLL_MARGIN,
): { top: number; left: number } | null {
  let top = 0;
  let left = 0;

  if (targetRect.top < containerRect.top + margin) {
    top = targetRect.top - containerRect.top - margin;
  } else if (targetRect.bottom > containerRect.bottom - margin) {
    top = targetRect.bottom - containerRect.bottom + margin;
  }

  if (targetRect.left < containerRect.left + margin) {
    left = targetRect.left - containerRect.left - margin;
  } else if (targetRect.right > containerRect.right - margin) {
    left = targetRect.right - containerRect.right + margin;
  }

  return top !== 0 || left !== 0 ? { top, left } : null;
}

function axisScrollLimit(overflow: string, hiddenSize: number): number {
  const scrollable =
    overflow === "auto" || overflow === "scroll" || overflow === "overlay";
  return scrollable && hiddenSize > 1 ? hiddenSize : 0;
}

function getScrollLimits(element: HTMLElement): { top: number; left: number } {
  const { overflowX, overflowY } = window.getComputedStyle(element);
  return {
    top: axisScrollLimit(
      overflowY,
      element.scrollHeight - element.clientHeight,
    ),
    left: axisScrollLimit(overflowX, element.scrollWidth - element.clientWidth),
  };
}

function isScrollableElement(element: HTMLElement): boolean {
  const { top, left } = getScrollLimits(element);
  return top > 0 || left > 0;
}

function findNearestScrollableAncestor(
  target: HTMLElement,
  root: HTMLElement,
): HTMLElement | null {
  let current = target.parentElement;

  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }

  return isScrollableElement(root) ? root : null;
}

export function scrollTargetIntoVisibleArea(
  target: HTMLElement,
  root: HTMLElement,
): void {
  const scrollContainer = findNearestScrollableAncestor(target, root);
  if (!scrollContainer) {
    return;
  }

  const delta = computeScrollDeltaForVisibility(
    scrollContainer.getBoundingClientRect(),
    target.getBoundingClientRect(),
  );
  if (!delta) {
    return;
  }

  // iOS can keep a scroll past a box's ends, so only ask each axis for the room it has.
  const limits = getScrollLimits(scrollContainer);
  const top = clamp(
    delta.top,
    -scrollContainer.scrollTop,
    limits.top - scrollContainer.scrollTop,
  );
  const left = clamp(
    delta.left,
    -scrollContainer.scrollLeft,
    limits.left - scrollContainer.scrollLeft,
  );
  if (top === 0 && left === 0) {
    return;
  }

  scrollContainer.scrollBy({ top, left, behavior: "smooth" });
}

function placementOrder(preferred: GuidePlacement): GuidePlacement[] {
  switch (preferred) {
    case "top":
      return ["top", "bottom", "right", "left"];
    case "right":
      return ["right", "left", "bottom", "top"];
    case "left":
      return ["left", "right", "bottom", "top"];
    case "bottom":
      return ["bottom", "top", "right", "left"];
    case "center":
    default:
      return ["center"];
  }
}

interface RectCandidate {
  left: number;
  top: number;
  resolved: GuidePlacement;
}

type HorizontalRegion = "left" | "overlap" | "right";
type VerticalRegion = "top" | "overlap" | "bottom";

interface AxisInterval<TRegion extends string> {
  min: number;
  max: number;
  region: TRegion;
}

function overlapArea(a: SpotlightRect, b: SpotlightRect): number {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return width * height;
}

function rectDistanceSquared(a: SpotlightRect, b: SpotlightRect): number {
  const dx = Math.max(
    0,
    Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)),
  );
  const dy = Math.max(
    0,
    Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)),
  );
  return dx * dx + dy * dy;
}

interface AnchorOffsetInput {
  candidate: RectCandidate;
  preferred: GuidePlacement;
  spotlight: SpotlightRect;
  centeredLeft: number;
  centeredTop: number;
  cardW: number;
  cardH: number;
}

function preferredAnchorOffsetSquared({
  candidate,
  preferred,
  spotlight,
  centeredLeft,
  centeredTop,
  cardW,
  cardH,
}: AnchorOffsetInput): number {
  switch (preferred) {
    case "top":
      return (
        (candidate.left - centeredLeft) ** 2 +
        (candidate.top - (spotlight.y - cardH)) ** 2
      );
    case "bottom":
      return (
        (candidate.left - centeredLeft) ** 2 +
        (candidate.top - (spotlight.y + spotlight.height)) ** 2
      );
    case "left":
      return (
        (candidate.left - (spotlight.x - cardW)) ** 2 +
        (candidate.top - centeredTop) ** 2
      );
    case "right":
      return (
        (candidate.left - (spotlight.x + spotlight.width)) ** 2 +
        (candidate.top - centeredTop) ** 2
      );
    case "center":
    default:
      return (
        (candidate.left - centeredLeft) ** 2 +
        (candidate.top - centeredTop) ** 2
      );
  }
}

function placementPenalty(
  candidate: GuidePlacement,
  preferred: GuidePlacement,
): number {
  if (preferred === "center") {
    return candidate === "center" ? 0 : 1_000;
  }

  const order = placementOrder(preferred);
  const index = order.indexOf(candidate);
  return index === -1 ? 10_000 : index * 100;
}

function buildInterval<TRegion extends string>(
  min: number,
  max: number,
  region: TRegion,
): AxisInterval<TRegion> | null {
  if (min > max) {
    return null;
  }
  return { min, max, region };
}

function chooseAxisCoordinate<TRegion extends string>(
  interval: AxisInterval<TRegion>,
  preferred: number,
): number {
  switch (interval.region) {
    case "left":
    case "top":
      return interval.max;
    case "right":
    case "bottom":
      return interval.min;
    default:
      return clamp(preferred, interval.min, interval.max);
  }
}

function resolveCandidatePlacement(
  horizontal: HorizontalRegion,
  vertical: VerticalRegion,
  preferred: GuidePlacement,
): GuidePlacement {
  if (horizontal === "overlap" && vertical !== "overlap") return vertical;
  if (vertical === "overlap" && horizontal !== "overlap") return horizontal;
  if (preferred !== "center") return preferred;
  if (vertical !== "overlap") return vertical;
  if (horizontal !== "overlap") return horizontal;
  return "center";
}

interface ComputePositionInput {
  placement: GuidePlacement;
  cw: number;
  ch: number;
  spotlight: SpotlightRect | null;
  cardW: number;
  cardH: number;
  isMobile: boolean;
  centerAnchor?: SpotlightRect | null;
}

function buildLegalCandidates(options: {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  spotlight: SpotlightRect;
  cardW: number;
  cardH: number;
  centeredLeft: number;
  centeredTop: number;
  placement: GuidePlacement;
}): RectCandidate[] {
  const {
    xMin,
    xMax,
    yMin,
    yMax,
    spotlight,
    cardW,
    cardH,
    centeredLeft,
    centeredTop,
    placement,
  } = options;
  const horizontalIntervals = [
    buildInterval(xMin, Math.min(xMax, spotlight.x - cardW), "left"),
    buildInterval(
      Math.max(xMin, spotlight.x - cardW),
      Math.min(xMax, spotlight.x + spotlight.width),
      "overlap",
    ),
    buildInterval(Math.max(xMin, spotlight.x + spotlight.width), xMax, "right"),
  ].filter(
    (interval): interval is AxisInterval<HorizontalRegion> => interval !== null,
  );

  const verticalIntervals = [
    buildInterval(yMin, Math.min(yMax, spotlight.y - cardH), "top"),
    buildInterval(
      Math.max(yMin, spotlight.y - cardH),
      Math.min(yMax, spotlight.y + spotlight.height),
      "overlap",
    ),
    buildInterval(
      Math.max(yMin, spotlight.y + spotlight.height),
      yMax,
      "bottom",
    ),
  ].filter(
    (interval): interval is AxisInterval<VerticalRegion> => interval !== null,
  );

  const candidates: RectCandidate[] = [];
  for (const horizontal of horizontalIntervals) {
    for (const vertical of verticalIntervals) {
      if (horizontal.region === "overlap" && vertical.region === "overlap") {
        continue;
      }
      candidates.push({
        left: chooseAxisCoordinate(horizontal, centeredLeft),
        top: chooseAxisCoordinate(vertical, centeredTop),
        resolved: resolveCandidatePlacement(
          horizontal.region,
          vertical.region,
          placement,
        ),
      });
    }
  }
  return candidates;
}

function computePosition({
  placement,
  cw,
  ch,
  spotlight,
  cardW,
  cardH,
  isMobile,
  centerAnchor,
}: ComputePositionInput): {
  left: number;
  top: number;
  resolved: GuidePlacement;
} {
  const xMin = CARD_MARGIN;
  const yMin = CARD_MARGIN;
  const xMax = Math.max(CARD_MARGIN, cw - cardW - CARD_MARGIN);
  const yMax = Math.max(CARD_MARGIN, ch - cardH - CARD_MARGIN);

  if (!spotlight || placement === "center") {
    const cx = centerAnchor ? centerAnchor.x + centerAnchor.width / 2 : cw / 2;
    const cy = centerAnchor ? centerAnchor.y + centerAnchor.height / 2 : ch / 2;
    return {
      left: clamp(cx - cardW / 2, xMin, xMax),
      top: clamp(cy - cardH / 2, yMin, yMax),
      resolved: "center",
    };
  }

  const centeredLeft = clamp(
    spotlight.x + spotlight.width / 2 - cardW / 2,
    xMin,
    xMax,
  );
  const centeredTop = clamp(
    spotlight.y + spotlight.height / 2 - cardH / 2,
    yMin,
    yMax,
  );

  const legalCandidates = buildLegalCandidates({
    xMin,
    xMax,
    yMin,
    yMax,
    spotlight,
    cardW,
    cardH,
    centeredLeft,
    centeredTop,
    placement,
  });

  const fallbackCandidates: RectCandidate[] = [
    { left: centeredLeft, top: yMin, resolved: "top" },
    { left: centeredLeft, top: yMax, resolved: "bottom" },
    { left: xMin, top: centeredTop, resolved: "left" },
    { left: xMax, top: centeredTop, resolved: "right" },
    {
      left: centeredLeft,
      top: centeredTop,
      resolved: isMobile ? "bottom" : placement,
    },
    { left: xMin, top: yMin, resolved: "top" },
    { left: xMax, top: yMin, resolved: "top" },
    { left: xMin, top: yMax, resolved: "bottom" },
    { left: xMax, top: yMax, resolved: "bottom" },
  ];

  const pool =
    legalCandidates.length > 0 ? legalCandidates : fallbackCandidates;
  const scored = pool.map((candidate) => {
    const cardRect: SpotlightRect = {
      x: candidate.left,
      y: candidate.top,
      width: cardW,
      height: cardH,
    };
    return {
      left: candidate.left,
      top: candidate.top,
      resolved: candidate.resolved,
      overlap: overlapArea(cardRect, spotlight),
      penalty: placementPenalty(candidate.resolved, placement),
      anchorOffset: preferredAnchorOffsetSquared({
        candidate,
        preferred: placement,
        spotlight,
        centeredLeft,
        centeredTop,
        cardW,
        cardH,
      }),
      distance: rectDistanceSquared(cardRect, spotlight),
    };
  });

  scored.sort(
    (a, b) =>
      a.overlap - b.overlap ||
      a.penalty - b.penalty ||
      a.anchorOffset - b.anchorOffset ||
      a.distance - b.distance,
  );

  const best = scored[0];
  if (!best) {
    return {
      left: centeredLeft,
      top: yMax,
      resolved: isMobile ? "bottom" : placement,
    };
  }

  return { left: best.left, top: best.top, resolved: best.resolved };
}

function buildResolvedMeasurement(options: {
  root: HTMLElement;
  card: HTMLElement;
  target: HTMLElement | null;
  posTarget: HTMLElement | null;
  observedElements: HTMLElement[];
  placement: GuidePlacement;
  spotlightPadding: number | undefined;
  stepKey: string;
}): LayoutMeasurement {
  const {
    root,
    card,
    target,
    posTarget,
    observedElements,
    placement,
    spotlightPadding,
    stepKey,
  } = options;
  const cw = root.clientWidth;
  const ch = root.clientHeight;
  const padding = spotlightPadding ?? SPOTLIGHT_PADDING;
  const rawSpotlight = target ? toRelativeRect(root, target, padding) : null;
  const spotlight = rawSpotlight ? clampSpotlight(rawSpotlight, cw, ch) : null;
  const cardRect = card.getBoundingClientRect();
  const isMobile = cw <= MOBILE_BREAKPOINT;
  const centerAnchor = posTarget ? toRelativeRect(root, posTarget, 0) : null;
  const pos = computePosition({
    placement,
    cw,
    ch,
    spotlight,
    cardW: cardRect.width,
    cardH: cardRect.height,
    isMobile,
    centerAnchor,
  });

  return {
    state: {
      spotlight,
      cardLeft: pos.left,
      cardTop: pos.top,
      resolvedPlacement: pos.resolved,
      isMobile,
      containerWidth: cw,
      containerHeight: ch,
      clipPath: buildClipPath(spotlight, cw, ch),
    },
    signature: [
      stepKey,
      cw,
      ch,
      roundRectValue(cardRect.width),
      roundRectValue(cardRect.height),
      rectSignature(spotlight),
      rectSignature(centerAnchor),
      roundRectValue(pos.left),
      roundRectValue(pos.top),
      pos.resolved,
    ].join("|"),
    target,
    observedElements,
  };
}

export interface UseGuidePositioningOptions {
  rootRef: RefObject<HTMLElement | null>;
  cardRef: RefObject<HTMLElement | null>;
  targetId: GuideTargetId | undefined;
  targetSelector: string | undefined;
  positionTargetId: GuideTargetId | undefined;
  positionTargetSelector: string | undefined;
  waitForLayoutTargetId: GuideTargetId | undefined;
  waitForLayoutTargetSelector: string | undefined;
  placement: GuidePlacement;
  spotlightPadding: number | undefined;
  stepKey: string;
}

export function useGuidePositioning({
  rootRef,
  cardRef,
  targetId,
  targetSelector,
  positionTargetId,
  positionTargetSelector,
  waitForLayoutTargetId,
  waitForLayoutTargetSelector,
  placement,
  spotlightPadding,
  stepKey,
}: UseGuidePositioningOptions): PositionState | null {
  const [state, setState] = useState<PositionState | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) {
      return undefined;
    }

    let animationFrameId: number | null = null;
    let stableFrameCount = 0;
    let mutatedSinceMeasured = false;
    let lastSignature: string | null = null;
    let active = true;
    let hasAttemptedInitialScroll = false;
    const observedElements = new Set<HTMLElement>();

    const measureLayout = (): LayoutMeasurement => {
      const r = rootRef.current;
      const c = cardRef.current;
      if (!r || !c) {
        return {
          state: null,
          signature: null,
          target: null,
          observedElements: [],
        };
      }

      const target = resolveTarget(r, targetId, targetSelector);
      const posTarget = resolveTarget(
        r,
        positionTargetId,
        positionTargetSelector,
      );
      const waitTarget = resolveTarget(
        r,
        waitForLayoutTargetId,
        waitForLayoutTargetSelector,
      );
      const nextObserved = [target, posTarget, waitTarget].filter(
        (element): element is HTMLElement => element !== null,
      );

      const requiresWaitTarget = Boolean(
        waitForLayoutTargetId || waitForLayoutTargetSelector,
      );
      if (requiresWaitTarget && (!waitTarget || !hasVisibleArea(waitTarget))) {
        return {
          state: null,
          signature: waitTarget
            ? `waiting:${stepKey}:hidden`
            : `waiting:${stepKey}:missing`,
          target,
          observedElements: nextObserved,
        };
      }

      return buildResolvedMeasurement({
        root: r,
        card: c,
        target,
        posTarget,
        observedElements: nextObserved,
        placement,
        spotlightPadding,
        stepKey,
      });
    };

    const syncObservedElements = (elements: HTMLElement[]): void => {
      for (const element of observedElements) {
        if (!elements.includes(element)) {
          resizeObserver.unobserve(element);
          observedElements.delete(element);
        }
      }
      for (const element of elements) {
        if (observedElements.has(element)) {
          continue;
        }
        resizeObserver.observe(element);
        observedElements.add(element);
      }
    };

    const runStabilityCheck = (): void => {
      animationFrameId = null;
      if (!active) {
        return;
      }

      const mutated = mutatedSinceMeasured;
      mutatedSinceMeasured = false;
      const measurement = measureLayout();
      syncObservedElements(measurement.observedElements);

      if (!hasAttemptedInitialScroll && measurement.target) {
        hasAttemptedInitialScroll = true;
        scrollTargetIntoVisibleArea(measurement.target, root);
        stableFrameCount = 0;
        lastSignature = null;
        scheduleUpdate();
        return;
      }

      if (!measurement.state || !measurement.signature) {
        stableFrameCount = 0;
        lastSignature = measurement.signature;
        setState((current) => (current === null ? current : null));
        return;
      }

      if (measurement.signature === lastSignature) {
        stableFrameCount += 1;
      } else {
        lastSignature = measurement.signature;
        stableFrameCount = 1;
      }

      // A mutation can start a transition that hasn't moved in its first frame, so it takes one more frame. It can't
      // restart the count, or an animation that writes every frame would keep the guide from ever settling.
      const framesNeeded = mutated
        ? LAYOUT_STABILITY_FRAMES + 1
        : LAYOUT_STABILITY_FRAMES;
      if (stableFrameCount < framesNeeded) {
        scheduleUpdate();
        return;
      }

      setState((current) =>
        samePositionState(current, measurement.state)
          ? current
          : measurement.state,
      );
      if (mutated) scheduleUpdate();
    };

    const scheduleUpdate = (): void => {
      if (!active || animationFrameId !== null) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(runStabilityCheck);
    };

    const resizeObserver = new ResizeObserver(() => {
      stableFrameCount = 0;
      scheduleUpdate();
    });
    resizeObserver.observe(root);
    resizeObserver.observe(card);

    const mutationObserver = new MutationObserver(() => {
      mutatedSinceMeasured = true;
      scheduleUpdate();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    scheduleUpdate();

    return (): void => {
      active = false;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [
    rootRef,
    cardRef,
    targetId,
    targetSelector,
    positionTargetId,
    positionTargetSelector,
    waitForLayoutTargetId,
    waitForLayoutTargetSelector,
    placement,
    spotlightPadding,
    stepKey,
  ]);

  return state;
}

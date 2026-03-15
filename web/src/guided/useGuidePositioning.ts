import { useLayoutEffect, useState, type RefObject } from "react";
import type { GuidePlacement, GuideTargetId } from "./types";

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

function resolveTarget(root: HTMLElement, targetId?: GuideTargetId, targetSelector?: string): HTMLElement | null {
  if (targetSelector) {
    const selectorTarget = root.querySelector<HTMLElement>(targetSelector);
    if (selectorTarget) return selectorTarget;
    const documentSelectorTarget = document.querySelector<HTMLElement>(targetSelector);
    if (documentSelectorTarget) return documentSelectorTarget;
  }
  if (!targetId) return null;
  return root.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`)
    ?? document.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`);
}

function toRelativeRect(root: HTMLElement, target: HTMLElement, padding: number): SpotlightRect {
  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return {
    x: targetRect.left - rootRect.left - padding,
    y: targetRect.top - rootRect.top - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };
}

function clampSpotlight(rect: SpotlightRect, cw: number, ch: number): SpotlightRect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(cw, rect.x + rect.width);
  const bottom = Math.min(ch, rect.y + rect.height);
  return { x, y, width: right - x, height: bottom - y };
}

function buildClipPath(spotlight: SpotlightRect | null, cw: number, ch: number): string {
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

function samePositionState(a: PositionState | null, b: PositionState | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    rectSignature(a.spotlight) === rectSignature(b.spotlight)
    && a.cardLeft === b.cardLeft
    && a.cardTop === b.cardTop
    && a.resolvedPlacement === b.resolvedPlacement
    && a.isMobile === b.isMobile
    && a.containerWidth === b.containerWidth
    && a.containerHeight === b.containerHeight
    && a.clipPath === b.clipPath
  );
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

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const allowsScroll = (value: string) =>
    value === "auto" || value === "scroll" || value === "overlay";

  return (
    (allowsScroll(overflowY) && element.scrollHeight > element.clientHeight + 1)
    || (allowsScroll(overflowX) && element.scrollWidth > element.clientWidth + 1)
  );
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

function scrollTargetIntoVisibleArea(target: HTMLElement, root: HTMLElement): void {
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

  scrollContainer.scrollBy({
    top: delta.top,
    left: delta.left,
    behavior: "smooth",
  });
}

function placementOrder(preferred: GuidePlacement): GuidePlacement[] {
  switch (preferred) {
    case "top": return ["top", "bottom", "right", "left"];
    case "right": return ["right", "left", "bottom", "top"];
    case "left": return ["left", "right", "bottom", "top"];
    case "bottom": return ["bottom", "top", "right", "left"];
    case "center":
    default: return ["center"];
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
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function rectDistanceSquared(a: SpotlightRect, b: SpotlightRect): number {
  const dx = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)));
  const dy = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
  return dx * dx + dy * dy;
}

function preferredAnchorOffsetSquared(
  candidate: RectCandidate,
  preferred: GuidePlacement,
  spotlight: SpotlightRect,
  centeredLeft: number,
  centeredTop: number,
  cardW: number,
  cardH: number,
): number {
  switch (preferred) {
    case "top":
      return (candidate.left - centeredLeft) ** 2
        + (candidate.top - (spotlight.y - cardH)) ** 2;
    case "bottom":
      return (candidate.left - centeredLeft) ** 2
        + (candidate.top - (spotlight.y + spotlight.height)) ** 2;
    case "left":
      return (candidate.left - (spotlight.x - cardW)) ** 2
        + (candidate.top - centeredTop) ** 2;
    case "right":
      return (candidate.left - (spotlight.x + spotlight.width)) ** 2
        + (candidate.top - centeredTop) ** 2;
    case "center":
    default:
      return (candidate.left - centeredLeft) ** 2
        + (candidate.top - centeredTop) ** 2;
  }
}

function placementPenalty(candidate: GuidePlacement, preferred: GuidePlacement): number {
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
  if (vertical === "top" && horizontal === "overlap") return "top";
  if (vertical === "bottom" && horizontal === "overlap") return "bottom";
  if (horizontal === "left" && vertical === "overlap") return "left";
  if (horizontal === "right" && vertical === "overlap") return "right";
  if (preferred !== "center") return preferred;
  if (vertical === "top") return "top";
  if (vertical === "bottom") return "bottom";
  if (horizontal === "left") return "left";
  if (horizontal === "right") return "right";
  return "center";
}

function computePosition(
  placement: GuidePlacement,
  cw: number,
  ch: number,
  spotlight: SpotlightRect | null,
  cardW: number,
  cardH: number,
  isMobile: boolean,
  centerAnchor?: SpotlightRect | null,
): { left: number; top: number; resolved: GuidePlacement } {
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

  const centeredLeft = clamp(spotlight.x + spotlight.width / 2 - cardW / 2, xMin, xMax);
  const centeredTop = clamp(spotlight.y + spotlight.height / 2 - cardH / 2, yMin, yMax);

  const horizontalIntervals = [
    buildInterval(xMin, Math.min(xMax, spotlight.x - cardW), "left"),
    buildInterval(
      Math.max(xMin, spotlight.x - cardW),
      Math.min(xMax, spotlight.x + spotlight.width),
      "overlap",
    ),
    buildInterval(Math.max(xMin, spotlight.x + spotlight.width), xMax, "right"),
  ].filter((interval): interval is AxisInterval<HorizontalRegion> => interval !== null);

  const verticalIntervals = [
    buildInterval(yMin, Math.min(yMax, spotlight.y - cardH), "top"),
    buildInterval(
      Math.max(yMin, spotlight.y - cardH),
      Math.min(yMax, spotlight.y + spotlight.height),
      "overlap",
    ),
    buildInterval(Math.max(yMin, spotlight.y + spotlight.height), yMax, "bottom"),
  ].filter((interval): interval is AxisInterval<VerticalRegion> => interval !== null);

  const legalCandidates: RectCandidate[] = [];
  for (const horizontal of horizontalIntervals) {
    for (const vertical of verticalIntervals) {
      if (horizontal.region === "overlap" && vertical.region === "overlap") {
        continue;
      }

      legalCandidates.push({
        left: chooseAxisCoordinate(horizontal, centeredLeft),
        top: chooseAxisCoordinate(vertical, centeredTop),
        resolved: resolveCandidatePlacement(horizontal.region, vertical.region, placement),
      });
    }
  }

  const fallbackCandidates: RectCandidate[] = [
    { left: centeredLeft, top: yMin, resolved: "top" },
    { left: centeredLeft, top: yMax, resolved: "bottom" },
    { left: xMin, top: centeredTop, resolved: "left" },
    { left: xMax, top: centeredTop, resolved: "right" },
    { left: centeredLeft, top: centeredTop, resolved: isMobile ? "bottom" : placement },
    { left: xMin, top: yMin, resolved: "top" },
    { left: xMax, top: yMin, resolved: "top" },
    { left: xMin, top: yMax, resolved: "bottom" },
    { left: xMax, top: yMax, resolved: "bottom" },
  ];

  const scored = (legalCandidates.length > 0 ? legalCandidates : fallbackCandidates).map((candidate) => {
    const cardRect: SpotlightRect = {
      x: candidate.left,
      y: candidate.top,
      width: cardW,
      height: cardH,
    };
    return {
      ...candidate,
      overlap: overlapArea(cardRect, spotlight),
      penalty: placementPenalty(candidate.resolved, placement),
      anchorOffset: preferredAnchorOffsetSquared(
        candidate,
        placement,
        spotlight,
        centeredLeft,
        centeredTop,
        cardW,
        cardH,
      ),
      distance: rectDistanceSquared(cardRect, spotlight),
    };
  });

  scored.sort((a, b) =>
    a.overlap - b.overlap
    || a.penalty - b.penalty
    || a.anchorOffset - b.anchorOffset
    || a.distance - b.distance,
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

export function useGuidePositioning(
  rootRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>,
  targetId: GuideTargetId | undefined,
  targetSelector: string | undefined,
  positionTargetId: GuideTargetId | undefined,
  positionTargetSelector: string | undefined,
  waitForLayoutTargetId: GuideTargetId | undefined,
  waitForLayoutTargetSelector: string | undefined,
  placement: GuidePlacement,
  spotlightPadding: number | undefined,
  stepKey: string,
): PositionState | null {
  const [state, setState] = useState<PositionState | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) {
      return;
    }

    let animationFrameId: number | null = null;
    let stableFrameCount = 0;
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
      const posTarget = resolveTarget(r, positionTargetId, positionTargetSelector);
      const waitTarget = resolveTarget(r, waitForLayoutTargetId, waitForLayoutTargetSelector);
      const nextObserved = [target, posTarget, waitTarget].filter(
        (element): element is HTMLElement => element !== null,
      );

      const requiresWaitTarget = !!(waitForLayoutTargetId || waitForLayoutTargetSelector);
      if (requiresWaitTarget && (!waitTarget || !hasVisibleArea(waitTarget))) {
        return {
          state: null,
          signature: waitTarget ? `waiting:${stepKey}:hidden` : `waiting:${stepKey}:missing`,
          target,
          observedElements: nextObserved,
        };
      }

      const cw = r.clientWidth;
      const ch = r.clientHeight;
      const padding = spotlightPadding ?? SPOTLIGHT_PADDING;
      const rawSpotlight = target ? toRelativeRect(r, target, padding) : null;
      const spotlight = rawSpotlight ? clampSpotlight(rawSpotlight, cw, ch) : null;
      const cardRect = c.getBoundingClientRect();
      const isMobile = cw <= MOBILE_BREAKPOINT;
      const centerAnchor = posTarget ? toRelativeRect(r, posTarget, 0) : null;
      const pos = computePosition(
        placement,
        cw,
        ch,
        spotlight,
        cardRect.width,
        cardRect.height,
        isMobile,
        centerAnchor,
      );

      const nextState = {
        spotlight,
        cardLeft: pos.left,
        cardTop: pos.top,
        resolvedPlacement: pos.resolved,
        isMobile,
        containerWidth: cw,
        containerHeight: ch,
        clipPath: buildClipPath(spotlight, cw, ch),
      };

      return {
        state: nextState,
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
        observedElements: nextObserved,
      };
    };

    const syncObservedElements = (elements: HTMLElement[]) => {
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

    const runStabilityCheck = () => {
      animationFrameId = null;
      if (!active) {
        return;
      }

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

      if (stableFrameCount < LAYOUT_STABILITY_FRAMES) {
        scheduleUpdate();
        return;
      }

      setState((current) => (
        samePositionState(current, measurement.state) ? current : measurement.state
      ));
    };

    const scheduleUpdate = () => {
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
      stableFrameCount = 0;
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

    return () => {
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

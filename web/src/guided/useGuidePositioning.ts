import { useLayoutEffect, useState, type RefObject } from "react";
import type { GuideCardPlacement, GuidePlacement, GuideTargetId } from "./types";

const CARD_MARGIN = 12;
const SPOTLIGHT_PADDING = 12;
const MOBILE_BREAKPOINT = 640;

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
  const r = Math.min(Math.min(width, height) * 0.2, 24);
  const l = x;
  const t = y;
  const ri = x + width;
  const b = y + height;

  return [
    `polygon(`,
    // outer rectangle (clockwise)
    `0 0, ${cw}px 0, ${cw}px ${ch}px, 0 ${ch}px, 0 0,`,
    // cutout (counter-clockwise with rounded corners approximated)
    `${l + r}px ${t}px,`,
    `${l}px ${t}px, ${l}px ${t + r}px,`,
    `${l}px ${b - r}px, ${l}px ${b}px, ${l + r}px ${b}px,`,
    `${ri - r}px ${b}px, ${ri}px ${b}px, ${ri}px ${b - r}px,`,
    `${ri}px ${t + r}px, ${ri}px ${t}px, ${ri - r}px ${t}px,`,
    `${l + r}px ${t}px`,
    `)`,
  ].join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
): { left: number; top: number; resolved: GuidePlacement } {
  const xMin = CARD_MARGIN;
  const yMin = CARD_MARGIN;
  const xMax = Math.max(CARD_MARGIN, cw - cardW - CARD_MARGIN);
  const yMax = Math.max(CARD_MARGIN, ch - cardH - CARD_MARGIN);

  if (!spotlight || placement === "center") {
    return {
      left: clamp(cw / 2 - cardW / 2, xMin, xMax),
      top: clamp(ch / 2 - cardH / 2, yMin, yMax),
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
  _positionTargetId: GuideTargetId | undefined,
  _positionTargetSelector: string | undefined,
  placement: GuidePlacement,
  _cardPlacement: GuideCardPlacement | undefined,
  _mobileCardPlacement: GuideCardPlacement | undefined,
  spotlightPadding: number | undefined,
  stepKey: string,
): PositionState | null {
  const [state, setState] = useState<PositionState | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) return;

    const update = () => {
      const r = rootRef.current;
      const c = cardRef.current;
      if (!r || !c) return;

      const cw = r.clientWidth;
      const ch = r.clientHeight;
      const target = resolveTarget(r, targetId, targetSelector);
      const padding = spotlightPadding ?? SPOTLIGHT_PADDING;
      const rawSpotlight = target ? toRelativeRect(r, target, padding) : null;
      const spotlight = rawSpotlight ? clampSpotlight(rawSpotlight, cw, ch) : null;
      const cardRect = c.getBoundingClientRect();
      const isMobile = cw <= MOBILE_BREAKPOINT;
      const pos = computePosition(
        placement,
        cw,
        ch,
        spotlight,
        cardRect.width,
        cardRect.height,
        isMobile,
      );

      setState({
        spotlight,
        cardLeft: pos.left,
        cardTop: pos.top,
        resolvedPlacement: pos.resolved,
        isMobile,
        containerWidth: cw,
        containerHeight: ch,
        clipPath: buildClipPath(spotlight, cw, ch),
      });
    };

    const target = resolveTarget(root, targetId, targetSelector);
    if (target) {
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }

    update();
    const delayedUpdate = setTimeout(update, 350);

    const ro = new ResizeObserver(update);
    ro.observe(root);
    ro.observe(card);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      clearTimeout(delayedUpdate);
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [
    rootRef,
    cardRef,
    targetId,
    targetSelector,
    placement,
    spotlightPadding,
    stepKey,
  ]);

  return state;
}

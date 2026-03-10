import { useLayoutEffect, useState, type RefObject } from "react";
import type { GuidePlacement, GuideTargetId } from "./types";

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

function resolveTarget(root: HTMLElement, targetId?: GuideTargetId): HTMLElement | null {
  if (!targetId) return null;
  return root.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`);
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

function computePosition(
  placement: GuidePlacement,
  cw: number,
  ch: number,
  spotlight: SpotlightRect | null,
  cardW: number,
  cardH: number,
  isMobile: boolean,
): { left: number; top: number; resolved: GuidePlacement } {
  if (!spotlight || placement === "center") {
    return {
      left: clamp(cw / 2 - cardW / 2, CARD_MARGIN, Math.max(CARD_MARGIN, cw - cardW - CARD_MARGIN)),
      top: clamp(ch / 2 - cardH / 2, CARD_MARGIN, Math.max(CARD_MARGIN, ch - cardH - CARD_MARGIN)),
      resolved: "center",
    };
  }

  if (isMobile) {
    const gap = 12;
    let top = spotlight.y + spotlight.height + gap;
    if (top + cardH > ch - 8) {
      top = spotlight.y - cardH - gap;
    }
    top = clamp(top, 8, Math.max(8, ch - cardH - 8));
    return { left: 8, top, resolved: top > spotlight.y ? "bottom" : "top" };
  }

  const centeredLeft = clamp(
    spotlight.x + spotlight.width / 2 - cardW / 2,
    CARD_MARGIN, Math.max(CARD_MARGIN, cw - cardW - CARD_MARGIN),
  );
  const centeredTop = clamp(
    spotlight.y + spotlight.height / 2 - cardH / 2,
    CARD_MARGIN, Math.max(CARD_MARGIN, ch - cardH - CARD_MARGIN),
  );

  const candidates = {
    top: { left: centeredLeft, top: spotlight.y - cardH - CARD_MARGIN },
    bottom: { left: centeredLeft, top: spotlight.y + spotlight.height + CARD_MARGIN },
    left: { left: spotlight.x - cardW - CARD_MARGIN, top: centeredTop },
    right: { left: spotlight.x + spotlight.width + CARD_MARGIN, top: centeredTop },
  };

  for (const p of placementOrder(placement)) {
    if (p === "center") continue;
    const c = candidates[p];
    if (
      c.left >= CARD_MARGIN &&
      c.left + cardW <= cw - CARD_MARGIN &&
      c.top >= CARD_MARGIN &&
      c.top + cardH <= ch - CARD_MARGIN
    ) {
      return { left: c.left, top: c.top, resolved: p };
    }
  }

  return {
    left: centeredLeft,
    top: clamp(spotlight.y + spotlight.height + CARD_MARGIN, CARD_MARGIN, Math.max(CARD_MARGIN, ch - cardH - CARD_MARGIN)),
    resolved: "bottom",
  };
}

export function useGuidePositioning(
  rootRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>,
  targetId: GuideTargetId | undefined,
  placement: GuidePlacement,
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
      const target = resolveTarget(r, targetId);
      const padding = spotlightPadding ?? SPOTLIGHT_PADDING;
      const rawSpotlight = target ? toRelativeRect(r, target, padding) : null;
      const spotlight = rawSpotlight ? clampSpotlight(rawSpotlight, cw, ch) : null;
      const isMobile = cw <= MOBILE_BREAKPOINT;
      const cardRect = c.getBoundingClientRect();
      const pos = computePosition(placement, cw, ch, spotlight, cardRect.width, cardRect.height, isMobile);

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

    const target = resolveTarget(root, targetId);
    if (target) {
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }

    update();

    const ro = new ResizeObserver(update);
    ro.observe(root);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [rootRef, cardRef, targetId, placement, spotlightPadding, stepKey]);

  return state;
}

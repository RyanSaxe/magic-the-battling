/**
 * Shared viewport, collapsed-height observation, and pointer drag/resize hooks
 * for floating windows (`RulesPanel` and `ServerStatusWindow`).
 */
import { useState, type RefObject } from "react";
import {
  DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  DESKTOP_BREAKPOINT_PX,
  type ViewportBox,
} from "../../components/rulesPanelWindow";
import {
  useBodyDragCursor,
  useResizeObserver,
  useWindowEvent,
} from "../useDomEffects";

export function isDesktopViewport(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT_PX
  );
}

export function currentViewportBox(): ViewportBox {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, left: 0, top: 0 };
  }
  const viewport = window.visualViewport;
  return viewport
    ? {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        left: Math.round(viewport.offsetLeft),
        top: Math.round(viewport.offsetTop),
      }
    : {
        width: window.innerWidth,
        height: window.innerHeight,
        left: 0,
        top: 0,
      };
}

export function useCollapsedPanelHeight(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  deps: readonly unknown[],
): number {
  const [height, setHeight] = useState(DEFAULT_COLLAPSED_PANEL_HEIGHT_PX);

  useResizeObserver(
    ref,
    (node) => {
      const nextHeight = Math.max(
        DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
        Math.ceil(node.getBoundingClientRect().height),
      );
      setHeight((previous) =>
        previous === nextHeight ? previous : nextHeight,
      );
    },
    enabled,
    deps,
  );

  return height;
}

export function useFloatingWindowPointerInteraction({
  active,
  cursor,
  onMove,
  onEnd,
}: {
  active: boolean;
  cursor: string;
  onMove: (event: PointerEvent) => void;
  onEnd: () => void;
}): void {
  useBodyDragCursor(active, cursor);
  useWindowEvent("pointermove", onMove, { enabled: active });
  useWindowEvent("pointerup", onEnd, { enabled: active });
}

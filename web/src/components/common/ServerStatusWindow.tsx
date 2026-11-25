import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  currentViewportBox,
  isDesktopViewport,
  useCollapsedPanelHeight,
  useFloatingWindowPointerInteraction,
} from "../../hooks/ui/useFloatingWindowLayout";
import {
  useLocalStorageSync,
  useResizeObserver,
  useViewportSync,
} from "../../hooks/useDomEffects";
import type { ServerNoticeStatus } from "../../types";
import { FloatingWindow } from "./FloatingWindow";
import {
  DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  WINDOW_MARGIN_PX,
  clampDesktopPanelOrigin,
  collapsedPanelSize,
  parseStoredWindowState,
  serializeStoredWindowState,
  type DesktopWindowState,
  type ViewportBox,
} from "../rulesPanelWindow";

const WINDOW_STORAGE_KEY = "mtb_server_notice_window:v1";
const MOBILE_PANEL_TOP_GAP_PX = 48;
const MOBILE_PANEL_MAX_WIDTH_PX = 640;
const DEFAULT_EXPANDED_HEIGHT_PX = 260;
const DEFAULT_EXPANDED_WIDTH_PX = 520;
const MIN_EXPANDED_WIDTH_PX = 320;
const SCHEDULED_UTC_IN_TEXT_RE =
  /scheduled for \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/i;

interface ServerStatusWindowProps {
  status: ServerNoticeStatus;
  hidden: boolean;
  onDismiss: () => void;
  inGame?: boolean;
  zIndex?: number;
}

type InteractionState = {
  type: "drag";
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
} | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function availableExpandedSize(viewport: ViewportBox) {
  return {
    width: Math.max(1, viewport.width - WINDOW_MARGIN_PX * 2),
    height: Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2),
  };
}

function clampExpandedWindowState(
  state: DesktopWindowState,
  viewport: ViewportBox,
): DesktopWindowState {
  const available = availableExpandedSize(viewport);
  const width = clamp(
    state.width,
    Math.min(MIN_EXPANDED_WIDTH_PX, available.width),
    available.width,
  );
  const height = clamp(state.height, 1, available.height);
  return {
    width,
    height,
    x: clamp(
      state.x,
      viewport.left + WINDOW_MARGIN_PX,
      Math.max(
        viewport.left + WINDOW_MARGIN_PX,
        viewport.left + viewport.width - width - WINDOW_MARGIN_PX,
      ),
    ),
    y: clamp(
      state.y,
      viewport.top + WINDOW_MARGIN_PX,
      Math.max(
        viewport.top + WINDOW_MARGIN_PX,
        viewport.top + viewport.height - height - WINDOW_MARGIN_PX,
      ),
    ),
  };
}

function clampServerWindowForMode(
  state: DesktopWindowState,
  viewport: ViewportBox,
  isCollapsed: boolean,
  collapsedHeight: number,
): DesktopWindowState {
  if (!isCollapsed) {
    return clampExpandedWindowState(state, viewport);
  }
  const expanded = clampExpandedWindowState(state, viewport);
  return {
    ...expanded,
    ...clampDesktopPanelOrigin(
      expanded.x,
      expanded.y,
      collapsedPanelSize(viewport, collapsedHeight),
      viewport,
    ),
  };
}

function getServerDesktopPanelRect(
  state: DesktopWindowState,
  viewport: ViewportBox,
  isCollapsed: boolean,
  collapsedHeight: number,
): DesktopWindowState {
  if (!isCollapsed) {
    return clampExpandedWindowState(state, viewport);
  }
  const expanded = clampExpandedWindowState(state, viewport);
  const panel = collapsedPanelSize(viewport, collapsedHeight);
  return {
    width: panel.width,
    height: panel.height,
    ...clampDesktopPanelOrigin(expanded.x, expanded.y, panel, viewport),
  };
}

function defaultServerWindowState(viewport: ViewportBox): DesktopWindowState {
  const width = Math.min(
    DEFAULT_EXPANDED_WIDTH_PX,
    Math.max(MIN_EXPANDED_WIDTH_PX, viewport.width - WINDOW_MARGIN_PX * 2),
  );
  const height = Math.min(
    DEFAULT_EXPANDED_HEIGHT_PX,
    Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2),
  );
  return {
    width,
    height,
    x: Math.round(viewport.left + viewport.width - width - WINDOW_MARGIN_PX),
    y: Math.round(viewport.top + WINDOW_MARGIN_PX),
  };
}

function loadStoredWindowState() {
  if (typeof window === "undefined") {
    return null;
  }
  return parseStoredWindowState(
    window.localStorage.getItem(WINDOW_STORAGE_KEY),
  );
}

function resolveInitialDesktopWindowState(): DesktopWindowState | null {
  if (!isDesktopViewport()) {
    return null;
  }
  const viewport = currentViewportBox();
  const stored = loadStoredWindowState();
  return clampServerWindowForMode(
    stored?.windowState ?? defaultServerWindowState(viewport),
    viewport,
    stored?.isCollapsed ?? false,
    DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  );
}

function resolveInitialCollapsedState(): boolean {
  return loadStoredWindowState()?.isCollapsed ?? false;
}

function defaultMobileCollapsedOrigin(
  viewport: ViewportBox,
  collapsedHeight: number,
) {
  const panel = collapsedPanelSize(viewport, collapsedHeight);
  return clampDesktopPanelOrigin(
    viewport.left + viewport.width - panel.width - WINDOW_MARGIN_PX,
    viewport.top + WINDOW_MARGIN_PX,
    panel,
    viewport,
  );
}

function formatEasternTime(isoUtc: string): string | null {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function drainingMessageWithEasternTime(
  message: string,
  easternTime: string | null,
): string {
  if (!message) return "";
  if (!easternTime) return message;
  return message.replace(
    SCHEDULED_UTC_IN_TEXT_RE,
    `scheduled for ${easternTime}`,
  );
}

export function ServerStatusWindow({
  status,
  hidden,
  onDismiss,
  inGame = false,
  zIndex = 2147483647,
}: ServerStatusWindowProps) {
  const [isDesktop, setIsDesktop] = useState(() => isDesktopViewport());
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState | null>(
    () => resolveInitialDesktopWindowState(),
  );
  const [isCollapsed, setIsCollapsed] = useState(() =>
    resolveInitialCollapsedState(),
  );
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [mobileCollapsedOrigin, setMobileCollapsedOrigin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const collapsedPanelRef = useRef<HTMLDivElement | null>(null);
  const expandedPanelRef = useRef<HTMLDivElement | null>(null);

  const isDraining = status.mode === "draining";
  const easternScheduled = status.scheduled_for_utc
    ? formatEasternTime(status.scheduled_for_utc)
    : null;
  const heading = isDraining ? "Scheduled Server Update" : "Server Maintenance";
  const fallbackMessage = isDraining
    ? "A server update is scheduled soon. New games are paused while current games continue."
    : inGame
      ? "The server is temporarily unavailable while maintenance is in progress."
      : "The server is currently updating. Please wait a few minutes and retry.";
  const displayMessage = isDraining
    ? drainingMessageWithEasternTime(status.message, easternScheduled)
    : status.message;
  const recoveryHint = status.estimated_recovery_minutes
    ? `Estimated recovery: about ${status.estimated_recovery_minutes} minute${status.estimated_recovery_minutes === 1 ? "" : "s"}.`
    : null;
  const collapsedLabel = isDraining ? "Server Update" : "Maintenance";

  const stopInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  const collapsedPanelHeight = useCollapsedPanelHeight(
    collapsedPanelRef,
    isCollapsed,
    [collapsedLabel],
  );

  const syncDesktopWindow = useCallback(
    (collapsed: boolean) => {
      if (!isDesktopViewport()) {
        return;
      }
      const viewport = currentViewportBox();
      setDesktopWindow((previous) =>
        clampServerWindowForMode(
          previous ??
            loadStoredWindowState()?.windowState ??
            defaultServerWindowState(viewport),
          viewport,
          collapsed,
          collapsedPanelHeight,
        ),
      );
    },
    [collapsedPanelHeight],
  );

  useViewportSync(() => {
    const desktop = isDesktopViewport();
    setIsDesktop(desktop);
    if (!desktop) {
      stopInteraction();
      return;
    }
    syncDesktopWindow(isCollapsed);
  });

  const handleCollapse = useCallback(() => {
    stopInteraction();
    if (isDesktopViewport()) {
      syncDesktopWindow(true);
    }
    setIsCollapsed(true);
  }, [stopInteraction, syncDesktopWindow]);

  const handleRestore = useCallback(() => {
    stopInteraction();
    if (isDesktopViewport()) {
      syncDesktopWindow(false);
    }
    setIsCollapsed(false);
  }, [stopInteraction, syncDesktopWindow]);

  const handleDismiss = useCallback(() => {
    stopInteraction();
    onDismiss();
  }, [onDismiss, stopInteraction]);

  const badge = isDraining ? "Update" : "Maintenance";
  const desktopViewport = isDesktop ? currentViewportBox() : null;
  const resolvedDesktopWindow =
    isDesktop && desktopViewport
      ? clampServerWindowForMode(
          desktopWindow ?? defaultServerWindowState(desktopViewport),
          desktopViewport,
          isCollapsed,
          collapsedPanelHeight,
        )
      : null;
  const desktopPanel =
    resolvedDesktopWindow && desktopViewport
      ? getServerDesktopPanelRect(
          resolvedDesktopWindow,
          desktopViewport,
          isCollapsed,
          collapsedPanelHeight,
        )
      : null;
  const mobileViewport = !isDesktop ? currentViewportBox() : null;
  const mobileCollapsedRect = mobileViewport
    ? (() => {
        const panel = collapsedPanelSize(mobileViewport, collapsedPanelHeight);
        const origin =
          mobileCollapsedOrigin ??
          defaultMobileCollapsedOrigin(mobileViewport, collapsedPanelHeight);
        return {
          width: panel.width,
          height: panel.height,
          ...clampDesktopPanelOrigin(origin.x, origin.y, panel, mobileViewport),
        };
      })()
    : null;

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isDesktop) {
        if (!desktopPanel) {
          return;
        }
        event.preventDefault();
        setInteraction({
          type: "drag",
          startPointerX: event.clientX,
          startPointerY: event.clientY,
          startX: desktopPanel.x,
          startY: desktopPanel.y,
        });
        return;
      }

      if (!isCollapsed || !mobileCollapsedRect) {
        return;
      }
      event.preventDefault();
      setInteraction({
        type: "drag",
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: mobileCollapsedRect.x,
        startY: mobileCollapsedRect.y,
      });
    },
    [desktopPanel, isCollapsed, isDesktop, mobileCollapsedRect],
  );

  useResizeObserver(
    expandedPanelRef,
    (node) => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setDesktopWindow((previous) => {
        if (!previous || previous.height === nextHeight) {
          return previous;
        }
        return { ...previous, height: nextHeight };
      });
    },
    !isCollapsed && isDesktop,
    [displayMessage, heading, recoveryHint],
  );

  useLocalStorageSync(
    WINDOW_STORAGE_KEY,
    desktopWindow
      ? serializeStoredWindowState({
          windowState: desktopWindow,
          isCollapsed,
        })
      : null,
  );

  useFloatingWindowPointerInteraction({
    active: Boolean(interaction && !hidden && (isDesktop || isCollapsed)),
    cursor: "grabbing",
    onMove: (event) => {
      if (!interaction) return;
      if (!isDesktop) {
        const viewport = currentViewportBox();
        const panel = collapsedPanelSize(viewport, collapsedPanelHeight);
        const nextX =
          interaction.startX + (event.clientX - interaction.startPointerX);
        const nextY =
          interaction.startY + (event.clientY - interaction.startPointerY);
        setMobileCollapsedOrigin(
          clampDesktopPanelOrigin(nextX, nextY, panel, viewport),
        );
        return;
      }

      setDesktopWindow((previous) => {
        const viewport = currentViewportBox();
        const current = previous ?? defaultServerWindowState(viewport);
        const nextX =
          interaction.startX + (event.clientX - interaction.startPointerX);
        const nextY =
          interaction.startY + (event.clientY - interaction.startPointerY);
        return clampServerWindowForMode(
          { ...current, x: nextX, y: nextY },
          viewport,
          isCollapsed,
          collapsedPanelHeight,
        );
      });
    },
    onEnd: stopInteraction,
  });

  if (hidden) {
    return null;
  }

  const body = (
    <>
      <p className="text-sm text-[var(--ivory)] leading-snug">
        {displayMessage || fallbackMessage}
      </p>
      {isDraining ? (
        <p className="mt-1 text-xs text-[var(--ivory-muted)] leading-snug">
          {inGame
            ? "New games are paused temporarily. Your current game can continue and reconnect automatically if needed."
            : "New games are paused temporarily. Active games may continue and reconnect automatically."}
        </p>
      ) : (
        <p className="mt-1 text-xs text-[var(--ivory-muted)] leading-snug">
          {inGame
            ? "Keep this tab open and we'll reconnect automatically when service returns."
            : "Please wait a few minutes and retry once maintenance is complete."}
        </p>
      )}
      {recoveryHint && (
        <p className="mt-2 text-xs text-amber-200/90">{recoveryHint}</p>
      )}
    </>
  );

  if (!isDesktop) {
    if (!mobileViewport) {
      return null;
    }

    const expandedWidth = Math.min(
      MOBILE_PANEL_MAX_WIDTH_PX,
      mobileViewport.width - WINDOW_MARGIN_PX * 2,
    );
    const expandedLeft =
      mobileViewport.left +
      Math.round((mobileViewport.width - expandedWidth) / 2);

    return (
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
        <FloatingWindow
          ref={isCollapsed ? collapsedPanelRef : expandedPanelRef}
          name="server notice"
          title="Server Notice"
          badge={badge}
          collapsed={isCollapsed}
          draggable={isCollapsed}
          dragging={interaction?.type === "drag"}
          onDragStart={beginDrag}
          onMinimize={handleCollapse}
          onRestore={handleRestore}
          onClose={handleDismiss}
          closeLabel="Dismiss"
          collapsedCaption="Current notice"
          collapsedText={collapsedLabel}
          instant={!!interaction}
          style={{
            left: isCollapsed ? mobileCollapsedRect?.x : expandedLeft,
            top: isCollapsed
              ? mobileCollapsedRect?.y
              : mobileViewport.top + MOBILE_PANEL_TOP_GAP_PX,
            width: isCollapsed ? mobileCollapsedRect?.width : expandedWidth,
            maxHeight: mobileViewport.height - WINDOW_MARGIN_PX * 2,
          }}
        >
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="px-4 py-4 overflow-y-auto">
              <h2 className="text-base font-semibold text-[var(--ivory)]">
                {heading}
              </h2>
              <div className="mt-3">{body}</div>
            </div>
          </div>
        </FloatingWindow>
      </div>
    );
  }

  if (!desktopViewport || !desktopPanel) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <FloatingWindow
        ref={isCollapsed ? collapsedPanelRef : expandedPanelRef}
        name="server notice"
        title="Server Notice"
        badge={badge}
        collapsed={isCollapsed}
        draggable
        dragging={interaction?.type === "drag"}
        onDragStart={beginDrag}
        onMinimize={handleCollapse}
        onRestore={handleRestore}
        onClose={handleDismiss}
        closeLabel="Dismiss"
        collapsedCaption="Current notice"
        collapsedText={collapsedLabel}
        instant={!!interaction}
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          maxWidth: Math.max(1, desktopViewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, desktopViewport.height - WINDOW_MARGIN_PX * 2),
        }}
      >
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <div className="px-4 py-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--ivory)]">
              {heading}
            </h2>
            <div className="mt-3">{body}</div>
          </div>
        </div>
      </FloatingWindow>
    </div>
  );
}

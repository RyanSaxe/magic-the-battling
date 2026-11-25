import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
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
import { readMigratedItem } from "../../utils/storage";
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

const WINDOW_STORAGE_KEY = "pitfight_server_notice_window:v1";
const LEGACY_WINDOW_STORAGE_KEY = "mtb_server_notice_window:v1";
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

interface WindowClampOptions {
  state: DesktopWindowState;
  viewport: ViewportBox;
  isCollapsed: boolean;
  collapsedHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function availableExpandedSize(viewport: ViewportBox): {
  width: number;
  height: number;
} {
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

function clampServerWindowForMode({
  state,
  viewport,
  isCollapsed,
  collapsedHeight,
}: WindowClampOptions): DesktopWindowState {
  if (!isCollapsed) {
    return clampExpandedWindowState(state, viewport);
  }
  const expanded = clampExpandedWindowState(state, viewport);
  return {
    ...expanded,
    ...clampDesktopPanelOrigin(
      { x: expanded.x, y: expanded.y },
      collapsedPanelSize(viewport, collapsedHeight),
      viewport,
    ),
  };
}

function getServerDesktopPanelRect({
  state,
  viewport,
  isCollapsed,
  collapsedHeight,
}: WindowClampOptions): DesktopWindowState {
  if (!isCollapsed) {
    return clampExpandedWindowState(state, viewport);
  }
  const expanded = clampExpandedWindowState(state, viewport);
  const panel = collapsedPanelSize(viewport, collapsedHeight);
  return {
    width: panel.width,
    height: panel.height,
    ...clampDesktopPanelOrigin(
      { x: expanded.x, y: expanded.y },
      panel,
      viewport,
    ),
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

function loadStoredWindowState(): ReturnType<typeof parseStoredWindowState> {
  if (typeof window === "undefined") {
    return null;
  }
  return parseStoredWindowState(
    readMigratedItem(
      window.localStorage,
      WINDOW_STORAGE_KEY,
      LEGACY_WINDOW_STORAGE_KEY,
    ),
  );
}

function resolveInitialDesktopWindowState(): DesktopWindowState | null {
  if (!isDesktopViewport()) {
    return null;
  }
  const viewport = currentViewportBox();
  const stored = loadStoredWindowState();
  return clampServerWindowForMode({
    state: stored?.windowState ?? defaultServerWindowState(viewport),
    viewport,
    isCollapsed: stored?.isCollapsed ?? false,
    collapsedHeight: DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  });
}

function resolveInitialCollapsedState(): boolean {
  return loadStoredWindowState()?.isCollapsed ?? false;
}

function defaultMobileCollapsedOrigin(
  viewport: ViewportBox,
  collapsedHeight: number,
): { x: number; y: number } {
  const panel = collapsedPanelSize(viewport, collapsedHeight);
  return clampDesktopPanelOrigin(
    {
      x: viewport.left + viewport.width - panel.width - WINDOW_MARGIN_PX,
      y: viewport.top + WINDOW_MARGIN_PX,
    },
    panel,
    viewport,
  );
}

function computeMobileCollapsedRect(
  viewport: ViewportBox,
  originOverride: { x: number; y: number } | null,
  collapsedHeight: number,
): DesktopWindowState {
  const panel = collapsedPanelSize(viewport, collapsedHeight);
  const origin =
    originOverride ?? defaultMobileCollapsedOrigin(viewport, collapsedHeight);
  return {
    width: panel.width,
    height: panel.height,
    ...clampDesktopPanelOrigin(origin, panel, viewport),
  };
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

interface ServerNoticeCopy {
  isDraining: boolean;
  heading: string;
  badge: string;
  collapsedLabel: string;
  primaryMessage: string;
  secondaryMessage: string;
  recoveryHint: string | null;
}

function resolveFallbackMessage(isDraining: boolean, inGame: boolean): string {
  if (isDraining) {
    return "A server update is scheduled soon. New games are paused while current games continue.";
  }
  if (inGame) {
    return "The server is temporarily unavailable while maintenance is in progress.";
  }
  return "The server is currently updating. Please wait a few minutes and retry.";
}

function resolveSecondaryMessage(isDraining: boolean, inGame: boolean): string {
  if (isDraining) {
    return inGame
      ? "New games are paused temporarily. Your current game can continue and reconnect automatically if needed."
      : "New games are paused temporarily. Active games may continue and reconnect automatically.";
  }
  return inGame
    ? "Keep this tab open and we'll reconnect automatically when service returns."
    : "Please wait a few minutes and retry once maintenance is complete.";
}

function resolveServerNoticeCopy(
  status: ServerNoticeStatus,
  inGame: boolean,
): ServerNoticeCopy {
  const isDraining = status.mode === "draining";
  const easternScheduled = status.scheduled_for_utc
    ? formatEasternTime(status.scheduled_for_utc)
    : null;
  const displayMessage = isDraining
    ? drainingMessageWithEasternTime(status.message, easternScheduled)
    : status.message;
  const recoveryMinutes = status.estimated_recovery_minutes;
  const recoveryHint = recoveryMinutes
    ? `Estimated recovery: about ${recoveryMinutes} minute${recoveryMinutes === 1 ? "" : "s"}.`
    : null;

  return {
    isDraining,
    heading: isDraining ? "Scheduled Server Update" : "Server Maintenance",
    badge: isDraining ? "Update" : "Maintenance",
    collapsedLabel: isDraining ? "Server Update" : "Maintenance",
    primaryMessage:
      displayMessage || resolveFallbackMessage(isDraining, inGame),
    secondaryMessage: resolveSecondaryMessage(isDraining, inGame),
    recoveryHint,
  };
}

function computeServerWindowLayout(options: {
  isDesktop: boolean;
  desktopWindow: DesktopWindowState | null;
  mobileCollapsedOrigin: { x: number; y: number } | null;
  isCollapsed: boolean;
  collapsedPanelHeight: number;
}): {
  dragOrigin: { x: number; y: number } | null;
  style: CSSProperties | null;
} {
  const viewport = currentViewportBox();
  if (options.isDesktop) {
    const resolved = clampServerWindowForMode({
      state: options.desktopWindow ?? defaultServerWindowState(viewport),
      viewport,
      isCollapsed: options.isCollapsed,
      collapsedHeight: options.collapsedPanelHeight,
    });
    const panel = getServerDesktopPanelRect({
      state: resolved,
      viewport,
      isCollapsed: options.isCollapsed,
      collapsedHeight: options.collapsedPanelHeight,
    });
    return {
      dragOrigin: { x: panel.x, y: panel.y },
      style: {
        left: panel.x,
        top: panel.y,
        width: panel.width,
        maxWidth: Math.max(1, viewport.width - WINDOW_MARGIN_PX * 2),
        maxHeight: Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2),
      },
    };
  }

  const collapsedRect = computeMobileCollapsedRect(
    viewport,
    options.mobileCollapsedOrigin,
    options.collapsedPanelHeight,
  );
  const expandedWidth = Math.min(
    MOBILE_PANEL_MAX_WIDTH_PX,
    viewport.width - WINDOW_MARGIN_PX * 2,
  );
  const expandedLeft =
    viewport.left + Math.round((viewport.width - expandedWidth) / 2);

  return {
    dragOrigin: options.isCollapsed
      ? { x: collapsedRect.x, y: collapsedRect.y }
      : null,
    style: {
      left: options.isCollapsed ? collapsedRect.x : expandedLeft,
      top: options.isCollapsed
        ? collapsedRect.y
        : viewport.top + MOBILE_PANEL_TOP_GAP_PX,
      width: options.isCollapsed ? collapsedRect.width : expandedWidth,
      maxHeight: viewport.height - WINDOW_MARGIN_PX * 2,
    },
  };
}

function ServerNoticeBody({
  copy,
  isDesktop,
}: {
  copy: ServerNoticeCopy;
  isDesktop: boolean;
}): ReactElement {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="px-4 py-4 overflow-y-auto">
        <h2
          className={`${isDesktop ? "text-lg" : "text-base"} font-semibold text-[var(--ivory)]`}
        >
          {copy.heading}
        </h2>
        <div className="mt-3">
          <p className="text-sm text-[var(--ivory)] leading-snug">
            {copy.primaryMessage}
          </p>
          <p className="mt-1 text-xs text-[var(--ivory-muted)] leading-snug">
            {copy.secondaryMessage}
          </p>
          {copy.recoveryHint && (
            <p className="mt-2 text-xs text-amber-200/90">
              {copy.recoveryHint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function useServerStatusDrag(options: {
  interaction: InteractionState;
  hidden: boolean;
  isDesktop: boolean;
  isCollapsed: boolean;
  collapsedPanelHeight: number;
  setMobileCollapsedOrigin: (origin: { x: number; y: number }) => void;
  setDesktopWindow: React.Dispatch<
    React.SetStateAction<DesktopWindowState | null>
  >;
  onEnd: () => void;
}): void {
  const {
    interaction,
    hidden,
    isDesktop,
    isCollapsed,
    collapsedPanelHeight,
    setMobileCollapsedOrigin,
    setDesktopWindow,
    onEnd,
  } = options;
  useFloatingWindowPointerInteraction({
    active: Boolean(interaction && !hidden && (isDesktop || isCollapsed)),
    cursor: "grabbing",
    onMove: (event) => {
      if (!interaction) return;
      const viewport = currentViewportBox();
      const nextX =
        interaction.startX + (event.clientX - interaction.startPointerX);
      const nextY =
        interaction.startY + (event.clientY - interaction.startPointerY);
      if (!isDesktop) {
        const panel = collapsedPanelSize(viewport, collapsedPanelHeight);
        setMobileCollapsedOrigin(
          clampDesktopPanelOrigin({ x: nextX, y: nextY }, panel, viewport),
        );
        return;
      }
      setDesktopWindow((previous) => {
        const current = previous ?? defaultServerWindowState(viewport);
        return clampServerWindowForMode({
          state: { ...current, x: nextX, y: nextY },
          viewport,
          isCollapsed,
          collapsedHeight: collapsedPanelHeight,
        });
      });
    },
    onEnd,
  });
}

export function ServerStatusWindow({
  status,
  hidden,
  onDismiss,
  inGame = false,
  zIndex = 2147483647,
}: ServerStatusWindowProps): ReactElement | null {
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

  const copy = resolveServerNoticeCopy(status, inGame);
  const stopInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  const collapsedPanelHeight = useCollapsedPanelHeight(
    collapsedPanelRef,
    isCollapsed,
    [copy.collapsedLabel],
  );

  const syncDesktopWindow = useCallback(
    (collapsed: boolean) => {
      if (!isDesktopViewport()) return;
      const viewport = currentViewportBox();
      setDesktopWindow((previous) =>
        clampServerWindowForMode({
          state:
            previous ??
            loadStoredWindowState()?.windowState ??
            defaultServerWindowState(viewport),
          viewport,
          isCollapsed: collapsed,
          collapsedHeight: collapsedPanelHeight,
        }),
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

  const handleToggleCollapsed = useCallback(
    (nextCollapsed: boolean) => {
      stopInteraction();
      if (isDesktopViewport()) syncDesktopWindow(nextCollapsed);
      setIsCollapsed(nextCollapsed);
    },
    [stopInteraction, syncDesktopWindow],
  );

  const handleDismiss = useCallback(() => {
    stopInteraction();
    onDismiss();
  }, [onDismiss, stopInteraction]);

  const layout = computeServerWindowLayout({
    isDesktop,
    desktopWindow,
    mobileCollapsedOrigin,
    isCollapsed,
    collapsedPanelHeight,
  });

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!layout.dragOrigin) return;
      event.preventDefault();
      setInteraction({
        type: "drag",
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: layout.dragOrigin.x,
        startY: layout.dragOrigin.y,
      });
    },
    [layout.dragOrigin],
  );

  useResizeObserver(
    expandedPanelRef,
    (node) => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setDesktopWindow((previous) => {
        if (!previous || previous.height === nextHeight) return previous;
        return { ...previous, height: nextHeight };
      });
    },
    {
      enabled: !isCollapsed && isDesktop,
      deps: [copy.primaryMessage, copy.heading, copy.recoveryHint],
    },
  );

  useLocalStorageSync(
    WINDOW_STORAGE_KEY,
    desktopWindow
      ? serializeStoredWindowState({ windowState: desktopWindow, isCollapsed })
      : null,
  );

  useServerStatusDrag({
    interaction,
    hidden,
    isDesktop,
    isCollapsed,
    collapsedPanelHeight,
    setMobileCollapsedOrigin,
    setDesktopWindow,
    onEnd: stopInteraction,
  });

  if (hidden || !layout.style) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <FloatingWindow
        ref={isCollapsed ? collapsedPanelRef : expandedPanelRef}
        name="server notice"
        title="Server Notice"
        badge={copy.badge}
        collapsed={isCollapsed}
        draggable={isDesktop || isCollapsed}
        dragging={interaction?.type === "drag"}
        onDragStart={beginDrag}
        onMinimize={() => handleToggleCollapsed(true)}
        onRestore={() => handleToggleCollapsed(false)}
        onClose={handleDismiss}
        closeLabel="Dismiss"
        collapsedCaption="Current notice"
        collapsedText={copy.collapsedLabel}
        instant={Boolean(interaction)}
        style={layout.style}
      >
        <ServerNoticeBody copy={copy} isDesktop={isDesktop} />
      </FloatingWindow>
    </div>
  );
}

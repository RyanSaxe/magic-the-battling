import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ServerNoticeStatus } from "../../types";
import {
  DESKTOP_BREAKPOINT_PX,
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
const SCHEDULED_UTC_IN_TEXT_RE = /scheduled for \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/i;

interface ServerStatusWindowProps {
  status: ServerNoticeStatus;
  hidden: boolean;
  onDismiss: () => void;
  inGame?: boolean;
  zIndex?: number;
}

type InteractionState =
  | {
      type: "drag";
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
    }
  | null;

interface WindowControlButtonProps {
  ariaLabel: string;
  title: string;
  colorClassName: string;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT_PX;
}

function currentViewportBox(): ViewportBox {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function availableExpandedSize(viewport: ViewportBox) {
  return {
    width: Math.max(1, viewport.width - WINDOW_MARGIN_PX * 2),
    height: Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2),
  };
}

function clampExpandedWindowState(state: DesktopWindowState, viewport: ViewportBox): DesktopWindowState {
  const available = availableExpandedSize(viewport);
  const width = clamp(state.width, Math.min(MIN_EXPANDED_WIDTH_PX, available.width), available.width);
  const height = clamp(state.height, 1, available.height);
  return {
    width,
    height,
    x: clamp(
      state.x,
      viewport.left + WINDOW_MARGIN_PX,
      Math.max(viewport.left + WINDOW_MARGIN_PX, viewport.left + viewport.width - width - WINDOW_MARGIN_PX),
    ),
    y: clamp(
      state.y,
      viewport.top + WINDOW_MARGIN_PX,
      Math.max(viewport.top + WINDOW_MARGIN_PX, viewport.top + viewport.height - height - WINDOW_MARGIN_PX),
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
  const width = Math.min(DEFAULT_EXPANDED_WIDTH_PX, Math.max(MIN_EXPANDED_WIDTH_PX, viewport.width - WINDOW_MARGIN_PX * 2));
  const height = Math.min(DEFAULT_EXPANDED_HEIGHT_PX, Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2));
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
  return parseStoredWindowState(window.localStorage.getItem(WINDOW_STORAGE_KEY));
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

function defaultMobileCollapsedOrigin(viewport: ViewportBox, collapsedHeight: number) {
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

function drainingMessageWithEasternTime(message: string, easternTime: string | null): string {
  if (!message) return "";
  if (!easternTime) return message;
  return message.replace(SCHEDULED_UTC_IN_TEXT_RE, `scheduled for ${easternTime}`);
}

function WindowControlButton({
  ariaLabel,
  title,
  colorClassName,
  onClick,
  onPointerDown,
  disabled = false,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      className={`h-3.5 w-3.5 rounded-full border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-opacity ${
        disabled ? `${colorClassName} cursor-default opacity-45` : `${colorClassName} hover:opacity-90`
      }`}
    />
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
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState | null>(() =>
    resolveInitialDesktopWindowState(),
  );
  const [isCollapsed, setIsCollapsed] = useState(() => resolveInitialCollapsedState());
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [collapsedPanelHeight, setCollapsedPanelHeight] = useState(DEFAULT_COLLAPSED_PANEL_HEIGHT_PX);
  const [mobileCollapsedOrigin, setMobileCollapsedOrigin] = useState<{ x: number; y: number } | null>(null);
  const collapsedPanelRef = useRef<HTMLDivElement | null>(null);
  const expandedPanelRef = useRef<HTMLDivElement | null>(null);

  const isDraining = status.mode === "draining";
  const easternScheduled = status.scheduled_for_utc ? formatEasternTime(status.scheduled_for_utc) : null;
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

  const syncDesktopWindow = useCallback((collapsed: boolean) => {
    if (!isDesktopViewport()) {
      return;
    }
    const viewport = currentViewportBox();
    setDesktopWindow((previous) =>
      clampServerWindowForMode(
        previous ?? loadStoredWindowState()?.windowState ?? defaultServerWindowState(viewport),
        viewport,
        collapsed,
        collapsedPanelHeight,
      ),
    );
  }, [collapsedPanelHeight]);

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

  const resetWindow = useCallback(() => {
    stopInteraction();
    setIsCollapsed(false);
    if (!isDesktopViewport()) {
      return;
    }
    setDesktopWindow(defaultServerWindowState(currentViewportBox()));
  }, [stopInteraction]);

  const handleGreenControl = useCallback(() => {
    if (isCollapsed) {
      handleRestore();
      return;
    }
    resetWindow();
  }, [handleRestore, isCollapsed, resetWindow]);

  const handleDismiss = useCallback(() => {
    stopInteraction();
    onDismiss();
  }, [onDismiss, stopInteraction]);

  const handleControlPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  const desktopViewport = isDesktop ? currentViewportBox() : null;
  const resolvedDesktopWindow = isDesktop && desktopViewport
    ? clampServerWindowForMode(
        desktopWindow ?? defaultServerWindowState(desktopViewport),
        desktopViewport,
        isCollapsed,
        collapsedPanelHeight,
      )
    : null;
  const desktopPanel = resolvedDesktopWindow && desktopViewport
    ? getServerDesktopPanelRect(resolvedDesktopWindow, desktopViewport, isCollapsed, collapsedPanelHeight)
    : null;
  const mobileViewport = !isDesktop ? currentViewportBox() : null;
  const mobileCollapsedRect = mobileViewport
    ? (() => {
        const panel = collapsedPanelSize(mobileViewport, collapsedPanelHeight);
        const origin = mobileCollapsedOrigin ?? defaultMobileCollapsedOrigin(mobileViewport, collapsedPanelHeight);
        return {
          width: panel.width,
          height: panel.height,
          ...clampDesktopPanelOrigin(origin.x, origin.y, panel, mobileViewport),
        };
      })()
    : null;

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [desktopPanel, isCollapsed, isDesktop, mobileCollapsedRect]);

  useEffect(() => {
    const syncViewport = () => {
      const desktop = isDesktopViewport();
      setIsDesktop(desktop);
      if (!desktop) {
        stopInteraction();
        return;
      }
      syncDesktopWindow(isCollapsed);
    };

    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
    };
  }, [isCollapsed, stopInteraction, syncDesktopWindow]);

  useLayoutEffect(() => {
    if (!isCollapsed) {
      return;
    }
    const node = collapsedPanelRef.current;
    if (!node) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = Math.max(
        DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
        Math.ceil(node.getBoundingClientRect().height),
      );
      setCollapsedPanelHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    };
    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isCollapsed, collapsedLabel]);

  useLayoutEffect(() => {
    if (isCollapsed || !isDesktop) {
      return;
    }
    const node = expandedPanelRef.current;
    if (!node) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setDesktopWindow((previous) => {
        if (!previous || previous.height === nextHeight) {
          return previous;
        }
        return { ...previous, height: nextHeight };
      });
    };
    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayMessage, heading, isCollapsed, isDesktop, recoveryHint]);

  useEffect(() => {
    if (!desktopWindow) {
      return;
    }
    try {
      window.localStorage.setItem(
        WINDOW_STORAGE_KEY,
        serializeStoredWindowState({
          windowState: desktopWindow,
          isCollapsed,
        }),
      );
    } catch {
      // Best effort only.
    }
  }, [desktopWindow, isCollapsed]);

  useEffect(() => {
    if (!interaction || hidden || (!isDesktop && !isCollapsed)) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDesktop) {
        const viewport = currentViewportBox();
        const panel = collapsedPanelSize(viewport, collapsedPanelHeight);
        const nextX = interaction.startX + (event.clientX - interaction.startPointerX);
        const nextY = interaction.startY + (event.clientY - interaction.startPointerY);
        setMobileCollapsedOrigin(clampDesktopPanelOrigin(nextX, nextY, panel, viewport));
        return;
      }

      setDesktopWindow((previous) => {
        const viewport = currentViewportBox();
        const current = previous ?? defaultServerWindowState(viewport);
        const nextX = interaction.startX + (event.clientX - interaction.startPointerX);
        const nextY = interaction.startY + (event.clientY - interaction.startPointerY);
        return clampServerWindowForMode(
          { ...current, x: nextX, y: nextY },
          viewport,
          isCollapsed,
          collapsedPanelHeight,
        );
      });
    };

    const handlePointerUp = () => {
      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [collapsedPanelHeight, hidden, interaction, isCollapsed, isDesktop]);

  if (hidden) {
    return null;
  }

  const body = (
    <>
      <p className="text-sm text-gray-100 leading-snug">{displayMessage || fallbackMessage}</p>
      {isDraining ? (
        <p className="mt-1 text-xs text-gray-300 leading-snug">
          {inGame
            ? "New games are paused temporarily. Your current game can continue and reconnect automatically if needed."
            : "New games are paused temporarily. Active games may continue and reconnect automatically."}
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-300 leading-snug">
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

    const expandedWidth = Math.min(MOBILE_PANEL_MAX_WIDTH_PX, mobileViewport.width - WINDOW_MARGIN_PX * 2);
    const expandedLeft = mobileViewport.left + Math.round((mobileViewport.width - expandedWidth) / 2);

    return (
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
        <div
          ref={isCollapsed ? collapsedPanelRef : expandedPanelRef}
          className={`absolute pointer-events-auto modal-chrome felt-raised-panel border gold-border rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden ${
            interaction ? "transition-none" : "transition-[left,top,width,height] duration-200 ease-out"
          }`}
          style={{
            left: isCollapsed ? mobileCollapsedRect?.x : expandedLeft,
            top: isCollapsed ? mobileCollapsedRect?.y : mobileViewport.top + MOBILE_PANEL_TOP_GAP_PX,
            width: isCollapsed ? mobileCollapsedRect?.width : expandedWidth,
            height: undefined,
            maxHeight: mobileViewport.height - WINDOW_MARGIN_PX * 2,
          }}
        >
          <div
            className={`relative flex items-center gap-3 px-4 py-3 shrink-0 select-none border-b border-[rgba(212,175,55,0.3)] bg-black/30 ${
              isCollapsed
                ? interaction?.type === "drag"
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : ""
            }`}
            onPointerDown={beginDrag}
            style={{ touchAction: isCollapsed ? "none" : undefined }}
          >
            <div className="flex items-center gap-2 shrink-0">
              <WindowControlButton
                ariaLabel="Close server notice"
                title="Close"
                colorClassName="bg-[#ff5f57]"
                onClick={handleDismiss}
                onPointerDown={handleControlPointerDown}
              />
              <WindowControlButton
                ariaLabel="Minimize server notice"
                title="Minimize"
                colorClassName="bg-[#febc2e]"
                onClick={handleCollapse}
                onPointerDown={handleControlPointerDown}
                disabled={isCollapsed}
              />
              <WindowControlButton
                ariaLabel={isCollapsed ? "Open server notice" : "Reset server notice window"}
                title={isCollapsed ? "Open" : "Reset"}
                colorClassName="bg-[#28c840]"
                onClick={handleGreenControl}
                onPointerDown={handleControlPointerDown}
              />
            </div>
            <div className="absolute inset-x-0 flex justify-center pointer-events-none px-20">
              <span className="truncate text-[0.7rem] uppercase tracking-[0.2em] text-amber-100/70">
                Server Notice
              </span>
            </div>
          </div>

          {isCollapsed ? (
            <div className="flex flex-1 min-h-0 flex-col justify-center px-4 pb-3 pt-2">
              <span className="text-[0.58rem] uppercase tracking-[0.18em] text-amber-200/45">
                Current notice
              </span>
              <span className="mt-1 text-sm font-medium leading-snug text-amber-50/95 break-words">
                {collapsedLabel}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <div className="px-4 py-4 overflow-y-auto">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-full border gold-border text-amber-200 text-[10px] uppercase tracking-wide px-2 py-0.5">
                    {isDraining ? "Update" : "Maintenance"}
                  </span>
                  <h2 className="text-base font-semibold text-amber-200">{heading}</h2>
                </div>
                <div className="mt-3">{body}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!desktopViewport || !desktopPanel) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        ref={isCollapsed ? collapsedPanelRef : expandedPanelRef}
        className={`absolute pointer-events-auto modal-chrome felt-raised-panel border gold-border rounded-2xl flex flex-col overflow-hidden shadow-[0_36px_96px_rgba(0,0,0,0.72),0_14px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,236,181,0.08)] ${
          interaction ? "transition-none" : "transition-[left,top,width,height] duration-200 ease-out"
        }`}
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          height: undefined,
          maxWidth: Math.max(1, desktopViewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, desktopViewport.height - WINDOW_MARGIN_PX * 2),
        }}
      >
        <div
          className={`relative flex items-center gap-3 px-4 py-3 shrink-0 select-none border-b border-[rgba(212,175,55,0.3)] bg-black/30 ${interaction?.type === "drag" ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={beginDrag}
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <WindowControlButton
              ariaLabel="Close server notice"
              title="Close"
              colorClassName="bg-[#ff5f57]"
              onClick={handleDismiss}
              onPointerDown={handleControlPointerDown}
            />
            <WindowControlButton
              ariaLabel="Minimize server notice"
              title="Minimize"
              colorClassName="bg-[#febc2e]"
              onClick={handleCollapse}
              onPointerDown={handleControlPointerDown}
              disabled={isCollapsed}
            />
            <WindowControlButton
              ariaLabel={isCollapsed ? "Open server notice" : "Reset server notice window"}
              title={isCollapsed ? "Open" : "Reset"}
              colorClassName="bg-[#28c840]"
              onClick={handleGreenControl}
              onPointerDown={handleControlPointerDown}
            />
          </div>
          <div className="absolute inset-x-0 flex justify-center pointer-events-none px-20">
            <span className="truncate text-[0.7rem] uppercase tracking-[0.2em] text-amber-100/70">
              Server Notice
            </span>
          </div>
        </div>

        {isCollapsed ? (
          <div className="flex flex-1 min-h-0 flex-col justify-center px-4 pb-3 pt-2">
            <span className="text-[0.58rem] uppercase tracking-[0.18em] text-amber-200/45">
              Current notice
            </span>
            <span className="mt-1 text-sm font-medium leading-snug text-amber-50/95 break-words">
              {collapsedLabel}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="px-4 py-4 overflow-y-auto">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center rounded-full border gold-border text-amber-200 text-[10px] uppercase tracking-wide px-2 py-0.5">
                  {isDraining ? "Update" : "Maintenance"}
                </span>
                <h2 className="text-lg font-semibold text-amber-200">{heading}</h2>
              </div>
              <div className="mt-3">{body}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

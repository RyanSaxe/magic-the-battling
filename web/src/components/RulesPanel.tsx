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
} from "../hooks/ui/useFloatingWindowLayout";
import {
  useEscapeKey,
  useLocalStorageSync,
  useViewportSync,
} from "../hooks/useDomEffects";
import { QuickGuide } from "./QuickGuide";
import { FloatingWindow } from "./common/FloatingWindow";
import {
  DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  WINDOW_MARGIN_PX,
  clampDesktopPanelOrigin,
  clampDesktopWindowForMode,
  clampDesktopWindowState,
  collapsedPanelSize,
  defaultDesktopWindowState,
  getDesktopPanelRect,
  parseStoredWindowState,
  serializeStoredWindowState,
  type DesktopWindowState,
} from "./rulesPanelWindow";

export interface RulesPanelTarget {
  docId?: string;
  tab?: string;
}

interface RulesPanelProps {
  onClose: () => void;
  /** The page owns this, so opening the Guide restores it, and a minimized one leaves the page's hotkeys on. */
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  /** A panel is open over the minimized window, so Escape closes that panel and not the Guide. */
  behindPanel?: boolean;
  /** A new object each time a link is taken, so the same link again goes back to its page. */
  target?: RulesPanelTarget;
  gameId?: string;
  playerName?: string;
  useUpgrades?: boolean;
  useVanguards?: boolean;
}

type InteractionState =
  | {
      type: "drag";
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
    }
  | {
      type: "resize";
      startPointerX: number;
      startPointerY: number;
      startWidth: number;
      startHeight: number;
    }
  | null;

const WINDOW_STORAGE_KEY = "mtb_rules_panel_window:v2";
const LEGACY_WINDOW_STORAGE_KEY = "mtb_rules_panel_window:v1";
const MOBILE_PANEL_TOP_GAP_PX = 48;
const MOBILE_PANEL_BOTTOM_GAP_PX = 24;
const MOBILE_PANEL_MIN_HEIGHT_PX = 280;
const MOBILE_PANEL_MAX_WIDTH_PX = 720;
const COLLAPSED_LABEL_FALLBACK = "Rules";

function sameWindowState(
  a: DesktopWindowState | null,
  b: DesktopWindowState | null,
): boolean {
  return (
    !!a &&
    !!b &&
    a.width === b.width &&
    a.height === b.height &&
    a.x === b.x &&
    a.y === b.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadStoredWindowState() {
  if (typeof window === "undefined") {
    return null;
  }
  return parseStoredWindowState(
    window.localStorage.getItem(WINDOW_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_WINDOW_STORAGE_KEY),
  );
}

function resolveInitialDesktopWindowState(): DesktopWindowState | null {
  if (!isDesktopViewport()) {
    return null;
  }
  const viewport = currentViewportBox();
  const stored = loadStoredWindowState();
  return clampDesktopWindowForMode(
    stored?.windowState ?? defaultDesktopWindowState(viewport),
    viewport,
    false,
    DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  );
}

export function RulesPanel({
  onClose,
  minimized: isCollapsed,
  onMinimizedChange,
  behindPanel = false,
  target,
  gameId,
  playerName,
  useUpgrades,
  useVanguards,
}: RulesPanelProps) {
  const [visit, setVisit] = useState({ target, count: 0 });
  if (target !== visit.target) setVisit({ target, count: visit.count + 1 });
  const [isDesktop, setIsDesktop] = useState(() => isDesktopViewport());
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState | null>(
    () => resolveInitialDesktopWindowState(),
  );
  const [navigationHint, setNavigationHint] = useState(
    COLLAPSED_LABEL_FALLBACK,
  );
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const collapsedPanelRef = useRef<HTMLDivElement | null>(null);

  const stopInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  const collapsedPanelHeight = useCollapsedPanelHeight(
    collapsedPanelRef,
    isCollapsed,
    [isDesktop, navigationHint],
  );

  const syncDesktopWindow = useCallback(
    (collapsed: boolean) => {
      if (!isDesktopViewport()) {
        return;
      }
      const viewport = currentViewportBox();
      setDesktopWindow((previous) => {
        const fallback =
          previous ??
          loadStoredWindowState()?.windowState ??
          defaultDesktopWindowState(viewport);
        const next = clampDesktopWindowForMode(
          fallback,
          viewport,
          collapsed,
          collapsedPanelHeight,
        );
        return sameWindowState(previous, next) ? previous : next;
      });
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

  const desktopViewport = isDesktop ? currentViewportBox() : null;
  const resolvedDesktopWindow =
    isDesktop && desktopViewport
      ? clampDesktopWindowForMode(
          desktopWindow ?? defaultDesktopWindowState(desktopViewport),
          desktopViewport,
          isCollapsed,
          collapsedPanelHeight,
        )
      : null;
  const desktopPanel =
    resolvedDesktopWindow && desktopViewport
      ? getDesktopPanelRect(
          resolvedDesktopWindow,
          desktopViewport,
          isCollapsed,
          collapsedPanelHeight,
        )
      : null;
  const mobileViewport = !isDesktop ? currentViewportBox() : null;

  const handleCollapse = useCallback(() => {
    stopInteraction();
    if (isDesktopViewport()) {
      syncDesktopWindow(true);
    }
    onMinimizedChange(true);
  }, [onMinimizedChange, stopInteraction, syncDesktopWindow]);

  const handleRestore = useCallback(() => {
    stopInteraction();
    if (isDesktopViewport()) {
      syncDesktopWindow(false);
    }
    onMinimizedChange(false);
  }, [onMinimizedChange, stopInteraction, syncDesktopWindow]);

  const resetWindow = useCallback(() => {
    stopInteraction();
    onMinimizedChange(false);
    if (!isDesktopViewport()) {
      return;
    }
    setDesktopWindow(defaultDesktopWindowState(currentViewportBox()));
  }, [onMinimizedChange, stopInteraction]);

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    },
    [desktopPanel],
  );

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isDesktop || !desktopPanel || isCollapsed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setInteraction({
        type: "resize",
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: desktopPanel.width,
        startHeight: desktopPanel.height,
      });
    },
    [desktopPanel, isCollapsed, isDesktop],
  );

  useEscapeKey((event) => {
    if (!event.defaultPrevented && !behindPanel) {
      onClose();
    }
  });

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
    active: Boolean(interaction && isDesktop),
    cursor: interaction?.type === "drag" ? "grabbing" : "se-resize",
    onMove: (event) => {
      if (!interaction) return;
      setDesktopWindow((previous) => {
        const viewport = currentViewportBox();
        const current = previous ?? defaultDesktopWindowState(viewport);

        if (interaction.type === "drag") {
          const nextX =
            interaction.startX + (event.clientX - interaction.startPointerX);
          const nextY =
            interaction.startY + (event.clientY - interaction.startPointerY);

          if (isCollapsed) {
            const origin = clampDesktopPanelOrigin(
              nextX,
              nextY,
              collapsedPanelSize(viewport, collapsedPanelHeight),
              viewport,
            );
            return clampDesktopWindowForMode(
              {
                ...current,
                ...origin,
              },
              viewport,
              true,
              collapsedPanelHeight,
            );
          }

          return clampDesktopWindowState(
            {
              ...current,
              x: nextX,
              y: nextY,
            },
            viewport,
          );
        }

        const width =
          interaction.startWidth + (event.clientX - interaction.startPointerX);
        const height =
          interaction.startHeight + (event.clientY - interaction.startPointerY);
        return clampDesktopWindowState(
          {
            ...current,
            width,
            height,
          },
          viewport,
        );
      });
    },
    onEnd: stopInteraction,
  });

  if (!isDesktop) {
    if (!mobileViewport) {
      return null;
    }

    const expandedHeight = clamp(
      mobileViewport.height -
        MOBILE_PANEL_TOP_GAP_PX -
        MOBILE_PANEL_BOTTOM_GAP_PX,
      MOBILE_PANEL_MIN_HEIGHT_PX,
      Math.max(
        MOBILE_PANEL_MIN_HEIGHT_PX,
        mobileViewport.height - MOBILE_PANEL_BOTTOM_GAP_PX,
      ),
    );
    const expandedWidth = Math.min(
      MOBILE_PANEL_MAX_WIDTH_PX,
      mobileViewport.width - WINDOW_MARGIN_PX * 2,
    );
    const expandedLeft =
      mobileViewport.left +
      Math.round((mobileViewport.width - expandedWidth) / 2);
    const collapsedLocation = navigationHint || COLLAPSED_LABEL_FALLBACK;

    return (
      // Minimized, a phone's Guide is the dot on its button. It stays laid out, so it opens at the same place.
      <div
        className="fixed inset-0 z-50 pointer-events-none"
        style={{ visibility: isCollapsed ? "hidden" : undefined }}
      >
        <FloatingWindow
          name="guide"
          title="Guide"
          collapsed={false}
          draggable={false}
          dragging={false}
          onDragStart={beginDrag}
          onMinimize={handleCollapse}
          onRestore={handleRestore}
          onReset={resetWindow}
          onClose={onClose}
          collapsedCaption="Current section"
          collapsedText={collapsedLocation}
          instant={false}
          style={{
            left: expandedLeft,
            top: mobileViewport.top + MOBILE_PANEL_TOP_GAP_PX,
            width: expandedWidth,
            height: expandedHeight,
            maxHeight: mobileViewport.height - WINDOW_MARGIN_PX * 2,
          }}
        >
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <QuickGuide
              key={visit.count}
              initialDocId={target?.docId}
              initialTab={target?.tab}
              gameId={gameId}
              playerName={playerName}
              useUpgrades={useUpgrades}
              useVanguards={useVanguards}
              onLocationChange={setNavigationHint}
            />
          </div>
        </FloatingWindow>
      </div>
    );
  }

  if (!desktopViewport || !desktopPanel) {
    return null;
  }

  const collapsedLocation = navigationHint || COLLAPSED_LABEL_FALLBACK;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <FloatingWindow
        ref={isCollapsed ? collapsedPanelRef : null}
        name="guide"
        title="Guide"
        collapsed={isCollapsed}
        draggable
        dragging={interaction?.type === "drag"}
        onDragStart={beginDrag}
        onMinimize={handleCollapse}
        onRestore={handleRestore}
        onReset={resetWindow}
        onClose={onClose}
        collapsedCaption="Current section"
        collapsedText={collapsedLocation}
        instant={!!interaction}
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          height: isCollapsed ? undefined : desktopPanel.height,
          maxWidth: Math.max(1, desktopViewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, desktopViewport.height - WINDOW_MARGIN_PX * 2),
        }}
      >
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <QuickGuide
            key={visit.count}
            initialDocId={target?.docId}
            initialTab={target?.tab}
            gameId={gameId}
            playerName={playerName}
            useUpgrades={useUpgrades}
            useVanguards={useVanguards}
            onLocationChange={setNavigationHint}
          />
        </div>

        {!isCollapsed && (
          <button
            type="button"
            aria-label="Resize guide window"
            title="Resize"
            onPointerDown={beginResize}
            className="absolute right-0 bottom-0 h-5 w-5 cursor-se-resize bg-transparent"
          />
        )}
      </FloatingWindow>
    </div>
  );
}

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
  type StoredRulesPanelWindowState,
  type ViewportBox,
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

function loadStoredWindowState(): StoredRulesPanelWindowState | null {
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
    {
      isCollapsed: false,
      collapsedHeight: DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
    },
  );
}

function applyPointerMove(options: {
  previous: DesktopWindowState | null;
  interaction: NonNullable<InteractionState>;
  clientX: number;
  clientY: number;
  isCollapsed: boolean;
  collapsedPanelHeight: number;
}): DesktopWindowState {
  const viewport = currentViewportBox();
  const current = options.previous ?? defaultDesktopWindowState(viewport);
  const { interaction } = options;

  if (interaction.type === "drag") {
    const nextX =
      interaction.startX + (options.clientX - interaction.startPointerX);
    const nextY =
      interaction.startY + (options.clientY - interaction.startPointerY);

    if (options.isCollapsed) {
      const origin = clampDesktopPanelOrigin(
        { x: nextX, y: nextY },
        collapsedPanelSize(viewport, options.collapsedPanelHeight),
        viewport,
      );
      return clampDesktopWindowForMode({ ...current, ...origin }, viewport, {
        isCollapsed: true,
        collapsedHeight: options.collapsedPanelHeight,
      });
    }

    return clampDesktopWindowState(
      { ...current, x: nextX, y: nextY },
      viewport,
    );
  }

  const width =
    interaction.startWidth + (options.clientX - interaction.startPointerX);
  const height =
    interaction.startHeight + (options.clientY - interaction.startPointerY);
  return clampDesktopWindowState({ ...current, width, height }, viewport);
}

interface GuideBodyProps {
  visitCount: number;
  target?: RulesPanelTarget;
  gameId?: string;
  playerName?: string;
  useUpgrades?: boolean;
  useVanguards?: boolean;
  onLocationChange: (label: string) => void;
}

function GuideBody({
  visitCount,
  target,
  gameId,
  playerName,
  useUpgrades,
  useVanguards,
  onLocationChange,
}: GuideBodyProps): ReactNode {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <QuickGuide
        key={visitCount}
        initialDocId={target?.docId}
        initialTab={target?.tab}
        gameId={gameId}
        playerName={playerName}
        useUpgrades={useUpgrades}
        useVanguards={useVanguards}
        onLocationChange={onLocationChange}
      />
    </div>
  );
}

interface MobileRulesWindowProps {
  viewport: ViewportBox;
  isCollapsed: boolean;
  collapsedLocation: string;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMinimize: () => void;
  onRestore: () => void;
  onReset: () => void;
  onClose: () => void;
  guideBody: ReactNode;
}

function MobileRulesWindow({
  viewport,
  isCollapsed,
  collapsedLocation,
  onDragStart,
  onMinimize,
  onRestore,
  onReset,
  onClose,
  guideBody,
}: MobileRulesWindowProps): ReactNode {
  const expandedHeight = clamp(
    viewport.height - MOBILE_PANEL_TOP_GAP_PX - MOBILE_PANEL_BOTTOM_GAP_PX,
    MOBILE_PANEL_MIN_HEIGHT_PX,
    Math.max(
      MOBILE_PANEL_MIN_HEIGHT_PX,
      viewport.height - MOBILE_PANEL_BOTTOM_GAP_PX,
    ),
  );
  const expandedWidth = Math.min(
    MOBILE_PANEL_MAX_WIDTH_PX,
    viewport.width - WINDOW_MARGIN_PX * 2,
  );
  const expandedLeft =
    viewport.left + Math.round((viewport.width - expandedWidth) / 2);

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
        onDragStart={onDragStart}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onReset={onReset}
        onClose={onClose}
        collapsedCaption="Current section"
        collapsedText={collapsedLocation}
        instant={false}
        style={{
          left: expandedLeft,
          top: viewport.top + MOBILE_PANEL_TOP_GAP_PX,
          width: expandedWidth,
          height: expandedHeight,
          maxHeight: viewport.height - WINDOW_MARGIN_PX * 2,
        }}
      >
        {guideBody}
      </FloatingWindow>
    </div>
  );
}

interface DesktopRulesWindowProps {
  viewport: ViewportBox;
  panel: DesktopWindowState;
  isCollapsed: boolean;
  collapsedPanelRef: RefObject<HTMLDivElement | null>;
  collapsedLocation: string;
  interaction: InteractionState;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMinimize: () => void;
  onRestore: () => void;
  onReset: () => void;
  onClose: () => void;
  guideBody: ReactNode;
}

function DesktopRulesWindow({
  viewport,
  panel,
  isCollapsed,
  collapsedPanelRef,
  collapsedLocation,
  interaction,
  onDragStart,
  onResizeStart,
  onMinimize,
  onRestore,
  onReset,
  onClose,
  guideBody,
}: DesktopRulesWindowProps): ReactNode {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <FloatingWindow
        ref={isCollapsed ? collapsedPanelRef : null}
        name="guide"
        title="Guide"
        collapsed={isCollapsed}
        draggable
        dragging={interaction?.type === "drag"}
        onDragStart={onDragStart}
        onMinimize={onMinimize}
        onRestore={onRestore}
        onReset={onReset}
        onClose={onClose}
        collapsedCaption="Current section"
        collapsedText={collapsedLocation}
        instant={Boolean(interaction)}
        style={{
          left: panel.x,
          top: panel.y,
          width: panel.width,
          height: isCollapsed ? undefined : panel.height,
          maxWidth: Math.max(1, viewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, viewport.height - WINDOW_MARGIN_PX * 2),
        }}
      >
        {guideBody}

        {!isCollapsed && (
          <button
            type="button"
            aria-label="Resize guide window"
            title="Resize"
            onPointerDown={onResizeStart}
            className="absolute right-0 bottom-0 h-5 w-5 cursor-se-resize bg-transparent"
          />
        )}
      </FloatingWindow>
    </div>
  );
}

function resolveDesktopPanel(options: {
  isDesktop: boolean;
  desktopWindow: DesktopWindowState | null;
  isCollapsed: boolean;
  collapsedPanelHeight: number;
}): { viewport: ViewportBox; panel: DesktopWindowState } | null {
  if (!options.isDesktop) return null;
  const viewport = currentViewportBox();
  const mode = {
    isCollapsed: options.isCollapsed,
    collapsedHeight: options.collapsedPanelHeight,
  };
  const resolvedWindow = clampDesktopWindowForMode(
    options.desktopWindow ?? defaultDesktopWindowState(viewport),
    viewport,
    mode,
  );
  return {
    viewport,
    panel: getDesktopPanelRect(resolvedWindow, viewport, mode),
  };
}

function serializeDesktopWindowOrNull(
  windowState: DesktopWindowState | null,
  isCollapsed: boolean,
): string | null {
  if (!windowState) return null;
  return serializeStoredWindowState({ windowState, isCollapsed });
}

function getInteractionCursor(
  interaction: InteractionState,
): "grabbing" | "se-resize" {
  return interaction?.type === "drag" ? "grabbing" : "se-resize";
}

export function RulesPanel({
  onClose,
  minimized: isCollapsed,
  onMinimizedChange,
  behindPanel,
  target,
  gameId,
  playerName,
  useUpgrades,
  useVanguards,
}: RulesPanelProps): ReactNode {
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
        const next = clampDesktopWindowForMode(fallback, viewport, {
          isCollapsed: collapsed,
          collapsedHeight: collapsedPanelHeight,
        });
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

  const desktopLayout = resolveDesktopPanel({
    isDesktop,
    desktopWindow,
    isCollapsed,
    collapsedPanelHeight,
  });
  const desktopPanel = desktopLayout?.panel ?? null;

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
    serializeDesktopWindowOrNull(desktopWindow, isCollapsed),
  );

  useFloatingWindowPointerInteraction({
    active: Boolean(interaction && isDesktop),
    cursor: getInteractionCursor(interaction),
    onMove: (event) => {
      if (!interaction) return;
      setDesktopWindow((previous) =>
        applyPointerMove({
          previous,
          interaction,
          clientX: event.clientX,
          clientY: event.clientY,
          isCollapsed,
          collapsedPanelHeight,
        }),
      );
    },
    onEnd: stopInteraction,
  });

  const collapsedLocation = navigationHint || COLLAPSED_LABEL_FALLBACK;
  const guideBody = (
    <GuideBody
      visitCount={visit.count}
      target={target}
      gameId={gameId}
      playerName={playerName}
      useUpgrades={useUpgrades}
      useVanguards={useVanguards}
      onLocationChange={setNavigationHint}
    />
  );

  if (!desktopLayout) {
    return (
      <MobileRulesWindow
        viewport={currentViewportBox()}
        isCollapsed={isCollapsed}
        collapsedLocation={collapsedLocation}
        onDragStart={beginDrag}
        onMinimize={handleCollapse}
        onRestore={handleRestore}
        onReset={resetWindow}
        onClose={onClose}
        guideBody={guideBody}
      />
    );
  }

  return (
    <DesktopRulesWindow
      viewport={desktopLayout.viewport}
      panel={desktopLayout.panel}
      isCollapsed={isCollapsed}
      collapsedPanelRef={collapsedPanelRef}
      collapsedLocation={collapsedLocation}
      interaction={interaction}
      onDragStart={beginDrag}
      onResizeStart={beginResize}
      onMinimize={handleCollapse}
      onRestore={handleRestore}
      onReset={resetWindow}
      onClose={onClose}
      guideBody={guideBody}
    />
  );
}

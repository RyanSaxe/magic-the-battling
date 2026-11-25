/**
 * Single owner for all in-game UI surfaces (players drawer, scouting panel,
 * Quick Guide, server status window, card action menu, zone panels, and modals/popovers).
 *
 * Enforces stack layering, Escape peeling, phase/fight teardown, selected-card lifetime,
 * and shared open-surface queries for both hotkeys and Guided Mode.
 */
import { useCallback, useMemo, useState } from "react";
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { ZoneOwner } from "../dnd/types";
import type {
  BattleCardMenu,
  BattleSelectedCard,
} from "../pages/phases/Battle";
import type { ServerNoticeStatus } from "../types";

const PANEL_ZONES = ["sideboard", "graveyard", "exile", "library"] as const;
export type PanelZone = (typeof PANEL_ZONES)[number];
export type UpgradesWindowMode = "auto" | "view" | "reveal";
export type ScoutingTab = "seen" | "overview";

export interface GuideSurface {
  kind: "guide";
  target?: RulesPanelTarget;
  minimized?: boolean;
}

export interface ScoutingSurface {
  kind: "scouting";
  player: string;
  tab: ScoutingTab;
}

export interface ZonePanelSurface {
  kind: "zone";
  zone: PanelZone;
  owner: ZoneOwner;
}

export interface UpgradesSurface {
  kind: "upgrades";
  mode: UpgradesWindowMode;
  targetId?: string;
  upgradeId?: string;
  revealIds: string[];
}

export interface CardMenuSurface {
  kind: "cardMenu";
  menu: BattleCardMenu;
}

/**
 * Discriminated surface union for every panel, menu, popover, and modal in a game.
 *
 * `reduceGameSurfaces` maintains a small bottom-to-top stack:
 * - `guide` sits at the bottom when kept: behind `players`/`scouting` (open or minimized),
 *   beside `zone`/`actions`/`cardMenu` (minimized), or hidden behind `submitResult` (minimized).
 * - `scouting` sits over `players` when opened from the drawer, or alone/over `guide` when docked.
 * - `cardMenu` sits over `zone` and/or a minimized `guide`, so Escape closes it before the panel under it.
 * - `submitHand`, `upgrades`, and `share` are exclusive and replace the stack.
 */
export type GameSurface =
  | GuideSurface
  | { kind: "players" }
  | ScoutingSurface
  | ZonePanelSurface
  | { kind: "actions" }
  | CardMenuSurface
  | { kind: "submitHand" }
  | { kind: "submitResult" }
  | UpgradesSurface
  | { kind: "share" };

export type GameSurfaceKind = GameSurface["kind"];

export interface GameSurfacesState {
  phase: string | undefined;
  surfaces: readonly GameSurface[];
  selectedCard: BattleSelectedCard | null;
  dismissedServerNoticeAt: string | null;
}

export type GameSurfacesEvent =
  | { type: "open"; surface: GameSurface }
  | { type: "toggle"; surface: GameSurface }
  | { type: "close"; kind: GameSurfaceKind }
  | { type: "escape" }
  | { type: "scout"; player: string; tab: ScoutingTab }
  | { type: "guideMinimized"; minimized: boolean }
  | { type: "closeOverlays"; except?: GameSurfaceKind }
  | { type: "phaseChanged"; phase: string | undefined }
  | { type: "fightEnded" }
  | { type: "selectCard"; card: BattleSelectedCard | null }
  | { type: "cardMoved"; cardId: string }
  | { type: "dismissServerStatus"; updatedAt: string };

export interface GameSurfacesView {
  topSurface: GameSurface | null;
  guideSurface: GuideSurface | null;
  guideOnScreen: boolean;
  guideExpanded: boolean;
  guideMinimized: boolean;
  drawerOpen: boolean;
  scouting: { player: string; tab: ScoutingTab; fromDrawer: boolean } | null;
  zonePanel: { zone: PanelZone; owner: ZoneOwner } | null;
  cardMenu: BattleCardMenu | null;
  upgradesWindow: UpgradesSurface | null;
  actionMenuOpen: boolean;
  submitHandOpen: boolean;
  submitResultOpen: boolean;
  shareOpen: boolean;
  /** True when an open surface blocks gameplay hotkeys (zone panels and minimized Guide leave them on). */
  blocksHotkeys: boolean;
  /** True when an open surface blocks Guided Mode from starting a new walkthrough. */
  blocksGuides: boolean;
}

const PHASE_OF: Partial<Record<GameSurfaceKind, string>> = {
  zone: "battle",
  actions: "battle",
  cardMenu: "battle",
  submitResult: "battle",
  submitHand: "build",
};

export function createGameSurfacesState(phase?: string): GameSurfacesState {
  const surfaces: readonly GameSurface[] = [];
  return {
    phase,
    surfaces,
    selectedCard: null,
    dismissedServerNoticeAt: null,
  };
}

function findGuide(surfaces: readonly GameSurface[]): GuideSurface | null {
  for (const surface of surfaces) {
    if (surface.kind === "guide") return surface;
  }
  return null;
}

function findZone(surfaces: readonly GameSurface[]): ZonePanelSurface | null {
  for (const surface of surfaces) {
    if (surface.kind === "zone") return surface;
  }
  return null;
}

function isSameSurface(a: GameSurface, b: GameSurface): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "zone" && b.kind === "zone") {
    return a.zone === b.zone && a.owner === b.owner;
  }
  if (a.kind === "scouting" && b.kind === "scouting") {
    return a.player === b.player && a.tab === b.tab;
  }
  return true;
}

function openOverlaySurface(
  surfaces: readonly GameSurface[],
  surface: Extract<
    GameSurface,
    { kind: "zone" | "actions" | "submitResult" | "cardMenu" }
  >,
  keptGuide: GuideSurface | null,
): readonly GameSurface[] {
  if (surface.kind === "cardMenu") {
    const base: GameSurface[] = [];
    if (keptGuide?.minimized) base.push(keptGuide);
    const openZone = findZone(surfaces);
    if (openZone) base.push(openZone);
    base.push(surface);
    return base;
  }
  return keptGuide?.minimized ? [keptGuide, surface] : [surface];
}

function openScoutingSurface(
  surfaces: readonly GameSurface[],
  surface: ScoutingSurface,
  keptGuide: GuideSurface | null,
): readonly GameSurface[] {
  const base: GameSurface[] = [];
  if (keptGuide) base.push(keptGuide);
  if (surfaces.some((item) => item.kind === "players")) {
    base.push({ kind: "players" });
  }
  base.push(surface);
  return base;
}

function openSurfaceStack(
  surfaces: readonly GameSurface[],
  surface: GameSurface,
): readonly GameSurface[] {
  const keptGuide = findGuide(surfaces);

  if (surface.kind === "guide") {
    return [{ kind: "guide", target: surface.target ?? keptGuide?.target }];
  }
  if (surface.kind === "players") {
    return keptGuide ? [keptGuide, surface] : [surface];
  }
  if (surface.kind === "scouting") {
    return openScoutingSurface(surfaces, surface, keptGuide);
  }
  if (
    surface.kind === "submitHand" ||
    surface.kind === "upgrades" ||
    surface.kind === "share"
  ) {
    return [surface];
  }
  return openOverlaySurface(surfaces, surface, keptGuide);
}

function closeSurfaceKind(
  surfaces: readonly GameSurface[],
  kind: GameSurfaceKind,
): readonly GameSurface[] {
  if (!surfaces.some((surface) => surface.kind === kind)) return surfaces;

  if (kind === "players") {
    // Closing the drawer also closes any scouting panel opened from it.
    return surfaces.filter(
      (surface) => surface.kind !== "players" && surface.kind !== "scouting",
    );
  }

  if (kind === "zone") {
    // Closing a zone panel also closes any card menu opened over that panel.
    return surfaces.filter(
      (surface) => surface.kind !== "zone" && surface.kind !== "cardMenu",
    );
  }

  return surfaces.filter((surface) => surface.kind !== kind);
}

function closeOverlaySurfaces(
  surfaces: readonly GameSurface[],
  except?: GameSurfaceKind,
): readonly GameSurface[] {
  if (surfaces.length === 0) return surfaces;

  if (
    surfaces.some(
      (surface) => surface.kind === "players" || surface.kind === "scouting",
    )
  ) {
    if (except === "guide") return surfaces;
    return surfaces.filter((surface) => surface.kind !== "guide");
  }

  if (except === "guide") {
    const keptGuide = findGuide(surfaces);
    return keptGuide ? [keptGuide] : [];
  }

  const top = surfaces[surfaces.length - 1];
  if (except && top.kind === except) {
    return [top];
  }

  return [];
}

function clearSurfacesForPhase(
  surfaces: readonly GameSurface[],
  phase: string | undefined,
): readonly GameSurface[] {
  if (surfaces.length === 0) return surfaces;
  let changed = false;
  const next: GameSurface[] = [];
  for (const surface of surfaces) {
    if (surface.kind === "scouting") {
      changed = true;
      continue;
    }
    const requiredPhase = PHASE_OF[surface.kind];
    if (requiredPhase && requiredPhase !== phase) {
      changed = true;
      continue;
    }
    next.push(surface);
  }
  return changed ? next : surfaces;
}

const FIGHT_END_CLOSED_KINDS = new Set<GameSurfaceKind>([
  "zone",
  "actions",
  "cardMenu",
  "submitResult",
  "scouting",
]);

function isClosedOnFightEnd(surface: GameSurface): boolean {
  return (
    FIGHT_END_CLOSED_KINDS.has(surface.kind) ||
    (surface.kind === "upgrades" && surface.mode === "reveal")
  );
}

function clearSurfacesForFightEnd(
  surfaces: readonly GameSurface[],
): readonly GameSurface[] {
  if (surfaces.length === 0) return surfaces;
  const next = surfaces.filter((surface) => !isClosedOnFightEnd(surface));
  return next.length === surfaces.length ? surfaces : next;
}

function keepsSelectedCard(
  prevSurfaces: readonly GameSurface[],
  nextSurfaces: readonly GameSurface[],
  selectedCard: BattleSelectedCard | null,
): boolean {
  if (!selectedCard) return false;
  if (!PANEL_ZONES.some((zone) => zone === selectedCard.zone)) return true;

  // Out of sight, a panel's card stays selected only for Actions to act on, or to move into a panel Actions opens.
  if (nextSurfaces.some((surface) => surface.kind === "actions")) return true;
  const nextZone = findZone(nextSurfaces);
  if (!nextZone) return false;

  const prevZone = findZone(prevSurfaces);
  if (
    prevSurfaces.some((surface) => surface.kind === "actions") ||
    (prevZone &&
      prevZone.zone === nextZone.zone &&
      prevZone.owner === nextZone.owner)
  ) {
    return true;
  }

  return (
    nextZone.zone === selectedCard.zone && nextZone.owner === selectedCard.owner
  );
}

function withSurfaces(
  state: GameSurfacesState,
  nextSurfaces: readonly GameSurface[],
): GameSurfacesState {
  if (nextSurfaces === state.surfaces) return state;
  const nextSelected = keepsSelectedCard(
    state.surfaces,
    nextSurfaces,
    state.selectedCard,
  )
    ? state.selectedCard
    : null;
  return {
    ...state,
    surfaces: nextSurfaces,
    selectedCard: nextSelected,
  };
}

function reducePhaseChanged(
  state: GameSurfacesState,
  phase: string | undefined,
): GameSurfacesState {
  const nextSurfaces = clearSurfacesForPhase(state.surfaces, phase);
  const keepSelected =
    phase === "battle" &&
    keepsSelectedCard(state.surfaces, nextSurfaces, state.selectedCard);
  const nextSelected = keepSelected ? state.selectedCard : null;
  if (
    state.phase === phase &&
    nextSurfaces === state.surfaces &&
    nextSelected === state.selectedCard
  ) {
    return state;
  }
  return {
    ...state,
    phase,
    surfaces: nextSurfaces,
    selectedCard: nextSelected,
  };
}

function reduceSurfaceNavigationEvent(
  state: GameSurfacesState,
  event: Extract<
    GameSurfacesEvent,
    { type: "open" | "toggle" | "close" | "escape" | "scout" | "closeOverlays" }
  >,
): GameSurfacesState {
  switch (event.type) {
    case "open":
      return withSurfaces(
        state,
        openSurfaceStack(state.surfaces, event.surface),
      );
    case "toggle": {
      const top = state.surfaces[state.surfaces.length - 1];
      if (top && isSameSurface(top, event.surface)) {
        return withSurfaces(state, state.surfaces.slice(0, -1));
      }
      return withSurfaces(
        state,
        openSurfaceStack(state.surfaces, event.surface),
      );
    }
    case "close":
      return withSurfaces(state, closeSurfaceKind(state.surfaces, event.kind));
    case "escape":
      return state.surfaces.length === 0
        ? state
        : withSurfaces(state, state.surfaces.slice(0, -1));
    case "scout":
      return withSurfaces(
        state,
        openSurfaceStack(state.surfaces, {
          kind: "scouting",
          player: event.player,
          tab: event.tab,
        }),
      );
    case "closeOverlays":
      return withSurfaces(
        state,
        closeOverlaySurfaces(state.surfaces, event.except),
      );
    default:
      return state;
  }
}

function reduceSurfaceSelectionEvent(
  state: GameSurfacesState,
  event: Extract<
    GameSurfacesEvent,
    { type: "selectCard" | "cardMoved" | "dismissServerStatus" }
  >,
): GameSurfacesState {
  if (event.type === "selectCard") {
    return event.card === state.selectedCard
      ? state
      : { ...state, selectedCard: event.card };
  }
  if (event.type === "cardMoved") {
    return event.cardId === state.selectedCard?.card.id
      ? { ...state, selectedCard: null }
      : state;
  }
  return state.dismissedServerNoticeAt === event.updatedAt
    ? state
    : { ...state, dismissedServerNoticeAt: event.updatedAt };
}

function reduceSurfaceLifecycleEvent(
  state: GameSurfacesState,
  event: Extract<
    GameSurfacesEvent,
    { type: "guideMinimized" | "phaseChanged" | "fightEnded" }
  >,
): GameSurfacesState {
  if (event.type === "guideMinimized") {
    const guide = findGuide(state.surfaces);
    if (!guide || Boolean(guide.minimized) === event.minimized) return state;
    return withSurfaces(state, [{ ...guide, minimized: event.minimized }]);
  }
  if (event.type === "phaseChanged") {
    return reducePhaseChanged(state, event.phase);
  }
  const nextSurfaces = clearSurfacesForFightEnd(state.surfaces);
  if (nextSurfaces === state.surfaces && state.selectedCard === null) {
    return state;
  }
  return { ...state, surfaces: nextSurfaces, selectedCard: null };
}

export function reduceGameSurfaces(
  state: GameSurfacesState,
  event: GameSurfacesEvent,
): GameSurfacesState {
  if (
    event.type === "selectCard" ||
    event.type === "cardMoved" ||
    event.type === "dismissServerStatus"
  ) {
    return reduceSurfaceSelectionEvent(state, event);
  }
  if (
    event.type === "guideMinimized" ||
    event.type === "phaseChanged" ||
    event.type === "fightEnded"
  ) {
    return reduceSurfaceLifecycleEvent(state, event);
  }
  return reduceSurfaceNavigationEvent(state, event);
}

interface ExtractedSurfaces {
  guide: GuideSurface | null;
  scouting: ScoutingSurface | null;
  zone: ZonePanelSurface | null;
  cardMenu: CardMenuSurface | null;
  upgrades: UpgradesSurface | null;
  kinds: Set<GameSurfaceKind>;
}

function extractSurfaces(surfaces: readonly GameSurface[]): ExtractedSurfaces {
  let guide: GuideSurface | null = null;
  let scouting: ScoutingSurface | null = null;
  let zone: ZonePanelSurface | null = null;
  let cardMenu: CardMenuSurface | null = null;
  let upgrades: UpgradesSurface | null = null;
  const kinds = new Set<GameSurfaceKind>();

  for (const surface of surfaces) {
    kinds.add(surface.kind);
    if (surface.kind === "guide") guide = surface;
    else if (surface.kind === "scouting") scouting = surface;
    else if (surface.kind === "zone") zone = surface;
    else if (surface.kind === "cardMenu") cardMenu = surface;
    else if (surface.kind === "upgrades") upgrades = surface;
  }

  return { guide, scouting, zone, cardMenu, upgrades, kinds };
}

function computeGuideVisibility(
  guide: GuideSurface | null,
  topSurface: GameSurface | null,
): {
  guideOnScreen: boolean;
  guideExpanded: boolean;
  guideMinimized: boolean;
  guideBlocksGuides: boolean;
} {
  const guideMinimized = Boolean(guide?.minimized);
  const notSubmitResult = topSurface?.kind !== "submitResult";
  const guideOnScreen =
    topSurface?.kind === "guide" || (guideMinimized && notSubmitResult);
  return {
    guideOnScreen,
    guideExpanded: guideOnScreen && !guideMinimized,
    guideMinimized,
    guideBlocksGuides: guide !== null && notSubmitResult,
  };
}

function hasModalBlockingSurface(found: ExtractedSurfaces): boolean {
  return (
    found.upgrades !== null ||
    found.kinds.has("actions") ||
    found.kinds.has("share") ||
    found.cardMenu !== null
  );
}

export function selectGameSurfacesView(
  state: GameSurfacesState,
): GameSurfacesView {
  const { surfaces } = state;
  const topSurface = surfaces[surfaces.length - 1] ?? null;
  const found = extractSurfaces(surfaces);
  const drawerOpen = found.kinds.has("players");
  const guideVis = computeGuideVisibility(found.guide, topSurface);
  const modalBlocking = hasModalBlockingSurface(found);

  return {
    topSurface,
    guideSurface: found.guide,
    guideOnScreen: guideVis.guideOnScreen,
    guideExpanded: guideVis.guideExpanded,
    guideMinimized: guideVis.guideMinimized,
    drawerOpen,
    scouting: found.scouting
      ? {
          player: found.scouting.player,
          tab: found.scouting.tab,
          fromDrawer: drawerOpen,
        }
      : null,
    zonePanel: found.zone
      ? { zone: found.zone.zone, owner: found.zone.owner }
      : null,
    cardMenu: found.cardMenu?.menu ?? null,
    upgradesWindow: found.upgrades,
    actionMenuOpen: found.kinds.has("actions"),
    submitHandOpen: found.kinds.has("submitHand"),
    submitResultOpen: found.kinds.has("submitResult"),
    shareOpen: found.kinds.has("share"),
    blocksHotkeys: guideVis.guideExpanded || modalBlocking,
    blocksGuides: guideVis.guideBlocksGuides || modalBlocking,
  };
}

export function isZonePanelOpen(
  state: GameSurfacesState,
  zone: PanelZone,
  owner: ZoneOwner,
): boolean {
  const openZone = findZone(state.surfaces);
  return openZone?.zone === zone && openZone.owner === owner;
}

export function isServerStatusHidden(
  state: GameSurfacesState,
  notice: ServerNoticeStatus | null | undefined,
): boolean {
  if (!notice) return false;
  return state.dismissedServerNoticeAt === notice.updated_at;
}

export interface UseGameSurfacesResult extends Omit<
  GameSurfacesView,
  "scouting"
> {
  state: GameSurfacesState;
  scouting: { player: string; tab: ScoutingTab } | null;
  selectedCard: BattleSelectedCard | null;
  isZonePanelOpen: (zone: PanelZone, owner: ZoneOwner) => boolean;
  isServerStatusHidden: (
    notice: ServerNoticeStatus | null | undefined,
  ) => boolean;
  open: (surface: GameSurface) => void;
  toggle: (surface: GameSurface) => void;
  close: (kind: GameSurfaceKind) => void;
  escape: () => void;
  scout: (player: string | null, tab?: ScoutingTab) => void;
  setDrawerOpen: (openDrawer: boolean) => void;
  setGuideMinimized: (minimized: boolean) => void;
  closeOverlays: (except?: GameSurfaceKind) => void;
  fightEnded: () => void;
  setSelectedCard: (card: BattleSelectedCard | null) => void;
  notifyCardMoved: (cardId: string) => void;
  setCardMenu: (menu: BattleCardMenu | null) => void;
  dismissServerStatus: (updatedAt: string) => void;
}

export function useGameSurfaces(
  phase: string | undefined,
): UseGameSurfacesResult {
  const [state, setState] = useState<GameSurfacesState>(() =>
    createGameSurfacesState(phase),
  );

  // Clear transient surfaces synchronously when phase changes so no stale frame renders.
  if (state.phase !== phase) {
    setState((current) =>
      reduceGameSurfaces(current, { type: "phaseChanged", phase }),
    );
  }

  const dispatch = useCallback((event: GameSurfacesEvent) => {
    setState((current) => reduceGameSurfaces(current, event));
  }, []);

  const open = useCallback(
    (surface: GameSurface) => dispatch({ type: "open", surface }),
    [dispatch],
  );
  const toggle = useCallback(
    (surface: GameSurface) => dispatch({ type: "toggle", surface }),
    [dispatch],
  );
  const close = useCallback(
    (kind: GameSurfaceKind) => dispatch({ type: "close", kind }),
    [dispatch],
  );
  const escape = useCallback(() => dispatch({ type: "escape" }), [dispatch]);
  const scout = useCallback(
    (player: string | null, tab: ScoutingTab = "seen") =>
      dispatch(
        player
          ? { type: "scout", player, tab }
          : { type: "close", kind: "scouting" },
      ),
    [dispatch],
  );
  const setDrawerOpen = useCallback(
    (openDrawer: boolean) =>
      dispatch(
        openDrawer
          ? { type: "open", surface: { kind: "players" } }
          : { type: "close", kind: "players" },
      ),
    [dispatch],
  );
  const setGuideMinimized = useCallback(
    (minimized: boolean) => dispatch({ type: "guideMinimized", minimized }),
    [dispatch],
  );
  const closeOverlays = useCallback(
    (except?: GameSurfaceKind) => dispatch({ type: "closeOverlays", except }),
    [dispatch],
  );
  const fightEnded = useCallback(
    () => dispatch({ type: "fightEnded" }),
    [dispatch],
  );
  const setSelectedCard = useCallback(
    (card: BattleSelectedCard | null) => dispatch({ type: "selectCard", card }),
    [dispatch],
  );
  const notifyCardMoved = useCallback(
    (cardId: string) => dispatch({ type: "cardMoved", cardId }),
    [dispatch],
  );
  const setCardMenu = useCallback(
    (menu: BattleCardMenu | null) =>
      dispatch(
        menu
          ? { type: "open", surface: { kind: "cardMenu", menu } }
          : { type: "close", kind: "cardMenu" },
      ),
    [dispatch],
  );
  const dismissServerStatus = useCallback(
    (updatedAt: string) => dispatch({ type: "dismissServerStatus", updatedAt }),
    [dispatch],
  );

  const view = useMemo(() => selectGameSurfacesView(state), [state]);
  const scouting = useMemo(
    () =>
      view.scouting
        ? { player: view.scouting.player, tab: view.scouting.tab }
        : null,
    [view.scouting],
  );

  return {
    state,
    ...view,
    scouting,
    selectedCard: state.selectedCard,
    isZonePanelOpen: (zone: PanelZone, owner: ZoneOwner): boolean =>
      isZonePanelOpen(state, zone, owner),
    isServerStatusHidden: (
      notice: ServerNoticeStatus | null | undefined,
    ): boolean => isServerStatusHidden(state, notice),
    open,
    toggle,
    close,
    escape,
    scout,
    setDrawerOpen,
    setGuideMinimized,
    closeOverlays,
    fightEnded,
    setSelectedCard,
    notifyCardMoved,
    setCardMenu,
    dismissServerStatus,
  };
}

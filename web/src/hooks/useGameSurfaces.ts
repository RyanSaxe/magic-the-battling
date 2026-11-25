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

function openSurfaceStack(
  surfaces: readonly GameSurface[],
  surface: GameSurface,
): readonly GameSurface[] {
  const keptGuide = findGuide(surfaces);

  switch (surface.kind) {
    case "guide":
      return [
        {
          kind: "guide",
          target: surface.target ?? keptGuide?.target,
        },
      ];
    case "players":
      return keptGuide ? [keptGuide, surface] : [surface];
    case "scouting": {
      const base: GameSurface[] = [];
      if (keptGuide) base.push(keptGuide);
      if (surfaces.some((item) => item.kind === "players")) {
        base.push({ kind: "players" });
      }
      base.push(surface);
      return base;
    }
    case "zone":
    case "actions":
    case "submitResult":
      return keptGuide?.minimized ? [keptGuide, surface] : [surface];
    case "cardMenu": {
      const base: GameSurface[] = [];
      if (keptGuide?.minimized) base.push(keptGuide);
      const openZone = findZone(surfaces);
      if (openZone) base.push(openZone);
      base.push(surface);
      return base;
    }
    case "submitHand":
    case "upgrades":
    case "share":
      return [surface];
  }
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

function clearSurfacesForFightEnd(
  surfaces: readonly GameSurface[],
): readonly GameSurface[] {
  if (surfaces.length === 0) return surfaces;
  let changed = false;
  const next: GameSurface[] = [];
  for (const surface of surfaces) {
    if (
      surface.kind === "zone" ||
      surface.kind === "actions" ||
      surface.kind === "cardMenu" ||
      surface.kind === "submitResult" ||
      surface.kind === "scouting" ||
      (surface.kind === "upgrades" && surface.mode === "reveal")
    ) {
      changed = true;
      continue;
    }
    next.push(surface);
  }
  return changed ? next : surfaces;
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

export function reduceGameSurfaces(
  state: GameSurfacesState,
  event: GameSurfacesEvent,
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

    case "escape": {
      if (state.surfaces.length === 0) return state;
      return withSurfaces(state, state.surfaces.slice(0, -1));
    }

    case "scout":
      return withSurfaces(
        state,
        openSurfaceStack(state.surfaces, {
          kind: "scouting",
          player: event.player,
          tab: event.tab,
        }),
      );

    case "guideMinimized": {
      const guide = findGuide(state.surfaces);
      if (!guide || !!guide.minimized === event.minimized) return state;
      return withSurfaces(state, [{ ...guide, minimized: event.minimized }]);
    }

    case "closeOverlays":
      return withSurfaces(
        state,
        closeOverlaySurfaces(state.surfaces, event.except),
      );

    case "phaseChanged": {
      const nextSurfaces = clearSurfacesForPhase(state.surfaces, event.phase);
      const nextSelected =
        event.phase !== "battle"
          ? null
          : keepsSelectedCard(state.surfaces, nextSurfaces, state.selectedCard)
            ? state.selectedCard
            : null;
      if (
        state.phase === event.phase &&
        nextSurfaces === state.surfaces &&
        nextSelected === state.selectedCard
      ) {
        return state;
      }
      return {
        ...state,
        phase: event.phase,
        surfaces: nextSurfaces,
        selectedCard: nextSelected,
      };
    }

    case "fightEnded": {
      const nextSurfaces = clearSurfacesForFightEnd(state.surfaces);
      if (nextSurfaces === state.surfaces && state.selectedCard === null) {
        return state;
      }
      return {
        ...state,
        surfaces: nextSurfaces,
        selectedCard: null,
      };
    }

    case "selectCard":
      return event.card === state.selectedCard
        ? state
        : { ...state, selectedCard: event.card };

    case "cardMoved":
      return event.cardId === state.selectedCard?.card.id
        ? { ...state, selectedCard: null }
        : state;

    case "dismissServerStatus":
      return state.dismissedServerNoticeAt === event.updatedAt
        ? state
        : { ...state, dismissedServerNoticeAt: event.updatedAt };
  }
}

export function selectGameSurfacesView(
  state: GameSurfacesState,
): GameSurfacesView {
  const { surfaces } = state;
  const topSurface = surfaces[surfaces.length - 1] ?? null;
  let guideSurface: GuideSurface | null = null;
  let scoutingSurface: ScoutingSurface | null = null;
  let zoneSurface: ZonePanelSurface | null = null;
  let cardMenuSurface: CardMenuSurface | null = null;
  let upgradesWindow: UpgradesSurface | null = null;
  let drawerOpen = false;
  let actionMenuOpen = false;
  let submitHandOpen = false;
  let submitResultOpen = false;
  let shareOpen = false;

  for (const surface of surfaces) {
    switch (surface.kind) {
      case "guide":
        guideSurface = surface;
        break;
      case "players":
        drawerOpen = true;
        break;
      case "scouting":
        scoutingSurface = surface;
        break;
      case "zone":
        zoneSurface = surface;
        break;
      case "actions":
        actionMenuOpen = true;
        break;
      case "cardMenu":
        cardMenuSurface = surface;
        break;
      case "submitHand":
        submitHandOpen = true;
        break;
      case "submitResult":
        submitResultOpen = true;
        break;
      case "upgrades":
        upgradesWindow = surface;
        break;
      case "share":
        shareOpen = true;
        break;
    }
  }

  const guideMinimized = !!guideSurface?.minimized;
  const guideOnScreen =
    topSurface?.kind === "guide" ||
    (guideMinimized && topSurface?.kind !== "submitResult");
  const guideExpanded = guideOnScreen && !guideMinimized;
  const modalBlocking =
    upgradesWindow !== null ||
    actionMenuOpen ||
    shareOpen ||
    cardMenuSurface !== null;

  return {
    topSurface,
    guideSurface,
    guideOnScreen,
    guideExpanded,
    guideMinimized,
    drawerOpen,
    scouting: scoutingSurface
      ? {
          player: scoutingSurface.player,
          tab: scoutingSurface.tab,
          fromDrawer: drawerOpen,
        }
      : null,
    zonePanel: zoneSurface
      ? { zone: zoneSurface.zone, owner: zoneSurface.owner }
      : null,
    cardMenu: cardMenuSurface?.menu ?? null,
    upgradesWindow,
    actionMenuOpen,
    submitHandOpen,
    submitResultOpen,
    shareOpen,
    blocksHotkeys: guideExpanded || modalBlocking,
    blocksGuides:
      (guideSurface !== null && topSurface?.kind !== "submitResult") ||
      modalBlocking,
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

export function useGameSurfaces(phase: string | undefined) {
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
    isZonePanelOpen: (zone: PanelZone, owner: ZoneOwner) =>
      isZonePanelOpen(state, zone, owner),
    isServerStatusHidden: (notice: ServerNoticeStatus | null | undefined) =>
      isServerStatusHidden(state, notice),
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

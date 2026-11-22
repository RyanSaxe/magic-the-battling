import type { RulesPanelTarget } from "../components/RulesPanel";
import type { ZoneOwner } from "../dnd/types";
import type { BattleSelectedCard } from "./phases/Battle";

/** The zones whose cards are only in sight, and selectable, in a panel. */
const PANEL_ZONES = ["sideboard", "graveyard", "exile", "library"] as const;
export type PanelZone = (typeof PANEL_ZONES)[number];
export type UpgradesWindowMode = "auto" | "view" | "reveal";
export type ScoutingTab = "seen" | "overview";

interface GuideSurface {
  kind: "guide";
  target?: RulesPanelTarget;
  minimized?: boolean;
}

/**
 * A panel, menu or window that a game opens over the board. At most one is open at a time,
 * so opening one closes whichever was open before, except that a pile's panel, Actions, the
 * player list and scouting keep a minimized Guide, which is back on its own when they close.
 */
export type GameSurface =
  | { kind: "zone"; zone: PanelZone; owner: ZoneOwner; guide?: GuideSurface }
  | { kind: "players"; guide?: GuideSurface }
  /** A player's scouting panel, beside the player list. From the drawer, closing it goes back to the drawer. */
  | { kind: "scouting"; player: string; tab: ScoutingTab; fromDrawer: boolean; guide?: GuideSurface }
  | { kind: "actions"; guide?: GuideSurface }
  | { kind: "submitHand" }
  | { kind: "submitResult" }
  | GuideSurface
  | { kind: "upgrades"; mode: UpgradesWindowMode; targetId?: string; upgradeId?: string; revealIds: string[] }
  | { kind: "share" };

export type GameSurfaceKind = GameSurface["kind"];

export type GameSurfaceEvent =
  | { type: "open"; surface: GameSurface }
  /** Opens the surface, or closes it when it is the one already open. */
  | { type: "toggle"; surface: GameSurface }
  /** Closes the surface of this kind, and leaves any other open one alone. */
  | { type: "close"; kind: GameSurfaceKind }
  /** Opens a player's scouting panel on a tab, from the drawer when the drawer is open. */
  | { type: "scout"; player: string; tab: ScoutingTab }
  /** The Guide was minimized or restored. Restored, it takes the place of the panel it was kept beside. */
  | { type: "guideMinimized"; minimized: boolean }
  /**
   * Closes the open menu, panel or window, except the player list, scouting and the surface of kind `except`.
   * A minimized Guide kept beside one of them is a window, so it closes unless it's `except`.
   */
  | { type: "closeOverlays"; except?: GameSurfaceKind }
  | { type: "phaseChanged"; phase: string | undefined };

/** The surfaces that only make sense in one phase, which close when the player leaves it. */
const PHASE_OF: Partial<Record<GameSurfaceKind, string>> = {
  zone: "battle",
  actions: "battle",
  submitResult: "battle",
  submitHand: "build",
};

type BesideGuide = Extract<GameSurface, { guide?: GuideSurface }>;

function canSitBesideGuide(surface: GameSurface | null): surface is BesideGuide {
  return surface?.kind === "zone" || surface?.kind === "players" || surface?.kind === "scouting" || surface?.kind === "actions";
}

function isSameSurface(a: GameSurface, b: GameSurface): boolean {
  if (a.kind === "zone" && b.kind === "zone") return a.zone === b.zone && a.owner === b.owner;
  return a.kind === b.kind;
}

export function reduceGameSurface(open: GameSurface | null, event: GameSurfaceEvent): GameSurface | null {
  switch (event.type) {
    case "open":
      if (canSitBesideGuide(event.surface)) return { ...event.surface, guide: minimizedGuide(open) };
      // The Guide's window stays as it is when it's sent to another page.
      if (event.surface.kind === "guide") return { ...event.surface, minimized: guideShowing(open)?.minimized };
      return event.surface;
    case "toggle":
      return open && isSameSurface(open, event.surface) ? null : event.surface;
    case "close":
      if (canSitBesideGuide(open)) {
        if (event.kind === "guide") return withoutGuide(open);
        if (event.kind === "scouting" && open.kind === "scouting") return closeScouting(open);
        // The drawer holds the player list that a scouting panel opened from it sits beside.
        if (event.kind === "players" && isDrawerOpen(open)) return open.guide ?? null;
        return open.kind === event.kind ? (open.guide ?? null) : open;
      }
      return open?.kind === event.kind ? null : open;
    case "scout":
      return {
        kind: "scouting",
        player: event.player,
        tab: event.tab,
        fromDrawer: isDrawerOpen(open),
        guide: minimizedGuide(open),
      };
    case "guideMinimized": {
      const guide = guideShowing(open);
      return guide && !!guide.minimized !== event.minimized ? { ...guide, minimized: event.minimized } : open;
    }
    case "closeOverlays":
      if (open?.kind === "players" || open?.kind === "scouting") {
        return event.except === "guide" ? open : withoutGuide(open);
      }
      if (event.except === "guide") return guideShowing(open) ?? null;
      if (!open || open.kind !== event.except) return null;
      return canSitBesideGuide(open) ? withoutGuide(open) : open;
    case "phaseChanged": {
      if (open?.kind === "scouting") return closeScouting(open);
      const phase = open ? PHASE_OF[open.kind] : undefined;
      if (!phase || phase === event.phase) return open;
      return canSitBesideGuide(open) ? (open.guide ?? null) : null;
    }
  }
}

function closeScouting({ fromDrawer, guide }: Extract<GameSurface, { kind: "scouting" }>): GameSurface | null {
  return fromDrawer ? { kind: "players", guide } : (guide ?? null);
}

function withoutGuide(open: BesideGuide): GameSurface {
  return open.guide ? { ...open, guide: undefined } : open;
}

/** The Guide on screen, on its own or minimized beside what's open. */
export function guideShowing(open: GameSurface | null): GuideSurface | undefined {
  if (open?.kind === "guide") return open;
  return canSitBesideGuide(open) ? open.guide : undefined;
}

function minimizedGuide(open: GameSurface | null): GuideSurface | undefined {
  const guide = guideShowing(open);
  return guide?.minimized ? guide : undefined;
}

/** What's open over the board, and the card selected on it or in one of its panels. */
export interface GameBoard {
  open: GameSurface | null;
  selectedCard: BattleSelectedCard | null;
}

export type GameBoardEvent =
  | GameSurfaceEvent
  | { type: "select"; card: BattleSelectedCard | null }
  /** A card left its zone by a drag or a hotkey, so it's no longer selected there. */
  | { type: "cardMoved"; cardId: string };

export function reduceGameBoard(board: GameBoard, event: GameBoardEvent): GameBoard {
  if (event.type === "select") {
    return event.card === board.selectedCard ? board : { ...board, selectedCard: event.card };
  }
  if (event.type === "cardMoved") {
    return event.cardId === board.selectedCard?.card.id ? { ...board, selectedCard: null } : board;
  }
  const open = reduceGameSurface(board.open, event);
  if (open === board.open) return board;
  return { open, selectedCard: keepsSelectedCard(board, open) ? board.selectedCard : null };
}

function keepsSelectedCard({ open, selectedCard }: GameBoard, next: GameSurface | null): boolean {
  if (!selectedCard || !PANEL_ZONES.some((zone) => zone === selectedCard.zone)) return true;
  // Out of sight, a panel's card stays selected only for Actions to act on, or to move into a panel Actions opens.
  if (next?.kind === "actions") return true;
  if (next?.kind !== "zone") return false;
  if (open?.kind === "actions" || (open && isSameSurface(open, next))) return true;
  return next.zone === selectedCard.zone && next.owner === selectedCard.owner;
}

/** The player list is showing in the drawer, with or without a scouting panel beside it. */
export function isDrawerOpen(open: GameSurface | null): boolean {
  return open?.kind === "players" || (open?.kind === "scouting" && open.fromDrawer);
}

export function isZonePanelOpen(open: GameSurface | null, zone: PanelZone, owner: ZoneOwner): boolean {
  return open?.kind === "zone" && open.zone === zone && open.owner === owner;
}

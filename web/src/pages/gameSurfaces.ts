import type { RulesPanelTarget } from "../components/RulesPanel";
import type { ZoneOwner } from "../dnd/types";

export type PanelZone = "sideboard" | "graveyard" | "exile" | "library";
export type UpgradesWindowMode = "auto" | "view" | "reveal";

/**
 * A panel, menu or window that a game opens over the board. At most one is open at a time,
 * so opening one closes whichever was open before.
 */
export type GameSurface =
  | { kind: "zone"; zone: PanelZone; owner: ZoneOwner }
  | { kind: "players" }
  | { kind: "actions" }
  | { kind: "submitHand" }
  | { kind: "submitResult" }
  | { kind: "guide"; target?: RulesPanelTarget }
  | { kind: "upgrades"; mode: UpgradesWindowMode; targetId?: string; upgradeId?: string; revealIds: string[] }
  | { kind: "share" };

export type GameSurfaceKind = GameSurface["kind"];

export type GameSurfaceEvent =
  | { type: "open"; surface: GameSurface }
  /** Opens the surface, or closes it when it is the one already open. */
  | { type: "toggle"; surface: GameSurface }
  /** Closes the surface of this kind, and leaves any other open one alone. */
  | { type: "close"; kind: GameSurfaceKind }
  | { type: "closeAll"; except?: GameSurfaceKind }
  | { type: "phaseChanged"; phase: string | undefined };

/** The surfaces that only make sense in one phase, which close when the player leaves it. */
const PHASE_OF: Partial<Record<GameSurfaceKind, string>> = {
  zone: "battle",
  actions: "battle",
  submitResult: "battle",
  submitHand: "build",
};

function isSameSurface(a: GameSurface, b: GameSurface): boolean {
  if (a.kind === "zone" && b.kind === "zone") return a.zone === b.zone && a.owner === b.owner;
  return a.kind === b.kind;
}

export function reduceGameSurface(open: GameSurface | null, event: GameSurfaceEvent): GameSurface | null {
  switch (event.type) {
    case "open":
      return event.surface;
    case "toggle":
      return open && isSameSurface(open, event.surface) ? null : event.surface;
    case "close":
      return open?.kind === event.kind ? null : open;
    case "closeAll":
      return open && open.kind === event.except ? open : null;
    case "phaseChanged": {
      const phase = open ? PHASE_OF[open.kind] : undefined;
      return phase && phase !== event.phase ? null : open;
    }
  }
}

export function isZonePanelOpen(open: GameSurface | null, zone: PanelZone, owner: ZoneOwner): boolean {
  return open?.kind === "zone" && open.zone === zone && open.owner === owner;
}

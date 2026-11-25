import type { PlayerView } from "../types";

export function comparePlayersForSidebar(a: PlayerView, b: PlayerView): number {
  if (a.placement === 0 && b.placement === 0) {
    const poisonDiff = a.poison - b.poison;
    // A tie keeps the server's order, which is the Lobby's: people as they joined, then puppets.
    return poisonDiff;
  }

  if (a.placement === 0) return -1;
  if (b.placement === 0) return 1;

  if (a.placement !== b.placement) {
    return a.placement - b.placement;
  }

  return a.name.localeCompare(b.name);
}

export function suddenDeathDecidesGame(players: PlayerView[]): boolean {
  return !players.some(
    (player) => !player.in_sudden_death && player.placement === 0,
  );
}

export function getSidebarPlayerOrder(players: PlayerView[]): PlayerView[] {
  return [...players].sort(comparePlayersForSidebar);
}

/** Alive, fighting on as the Ghost (the most recently eliminated player), or out of the game. */
export type Standing = "alive" | "ghost" | "out";

export function getStanding(player: PlayerView): Standing {
  if (!player.is_ghost) return "alive";
  return player.is_most_recent_ghost ? "ghost" : "out";
}

function isTiedOnPoison(a: PlayerView, b: PlayerView): boolean {
  return a.placement === 0 && b.placement === 0 && a.poison === b.poison;
}

export function getSidebarPlacementRank(
  player: PlayerView,
  players: PlayerView[],
): number {
  const index = getSidebarPlayerOrder(players).findIndex(
    (candidate) =>
      candidate.name === player.name || isTiedOnPoison(candidate, player),
  );

  return index >= 0 ? index + 1 : players.length;
}

/** Every player sharing the bottom rank is last, unless every player shares it, as before anyone takes poison. */
export function isSidebarLastPlace(
  player: PlayerView,
  players: PlayerView[],
): boolean {
  const ranks = players.map((candidate) =>
    getSidebarPlacementRank(candidate, players),
  );
  const lastRank = Math.max(...ranks);
  return lastRank > 1 && getSidebarPlacementRank(player, players) === lastRank;
}

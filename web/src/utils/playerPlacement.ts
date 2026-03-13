import type { PlayerView } from "../types";

export function comparePlayersForSidebar(
  a: PlayerView,
  b: PlayerView,
): number {
  if (a.placement === 0 && b.placement === 0) {
    const poisonDiff = a.poison - b.poison;
    if (poisonDiff !== 0) return poisonDiff;
    return a.name.localeCompare(b.name);
  }

  if (a.placement === 0) return -1;
  if (b.placement === 0) return 1;

  if (a.placement !== b.placement) {
    return a.placement - b.placement;
  }

  return a.name.localeCompare(b.name);
}

export function getSidebarPlayerOrder(players: PlayerView[]): PlayerView[] {
  return [...players].sort(comparePlayersForSidebar);
}

export function getSidebarPlacementRank(
  player: PlayerView,
  players: PlayerView[],
): number {
  const index = getSidebarPlayerOrder(players).findIndex(
    (candidate) => candidate.name === player.name,
  );

  return index >= 0 ? index + 1 : players.length;
}

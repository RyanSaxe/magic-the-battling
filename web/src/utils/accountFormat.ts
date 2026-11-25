import type { ResumableSeat } from "../hooks/useResumableGames";
import { formatTimeSince, parseServerTime } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "1 opponent", "3 opponents". */
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** What players call a play mode: a Cube is drafted (limited), a Deck is brought (constructed). */
export function modeLabel(
  playMode: string | null | undefined,
): "Cube" | "Deck" {
  return playMode === "constructed" ? "Deck" : "Cube";
}

export function upgradesLabel(useUpgrades: boolean): string {
  return useUpgrades ? "Upgrades On" : "Upgrades Off";
}

/** The name a player gave a saved cube or deck, else the cube's own name, else its CubeCobra id. */
export function cubeTitle(cube: {
  display_name?: string | null;
  cube_name?: string | null;
  cube_id: string;
}): string {
  return cube.display_name || cube.cube_name || cube.cube_id;
}

/** "4 min ago" within a day, then a date: "Nov 19", with the year when it isn't this year. */
export function formatWhen(isoTime: string, now: number = Date.now()): string {
  const time = parseServerTime(isoTime);
  if (now - time < DAY_MS) return formatTimeSince(isoTime, now);
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "1 human, 3 puppets", "4 humans". */
export function seatsLabel(humanCount: number, puppetCount: number): string {
  const humans = countLabel(humanCount, "human");
  return puppetCount > 0
    ? `${humans}, ${countLabel(puppetCount, "puppet")}`
    : humans;
}

/** "38%", rounded; 0% before the first game. */
export function winRate(wins: number, games: number): string {
  return `${games > 0 ? Math.round((wins / games) * 100) : 0}%`;
}

/** "9 wins (38%)". */
export function winsLabel(wins: number, games: number): string {
  return `${countLabel(wins, "win")} (${winRate(wins, games)})`;
}

/** "In progress · Stage 2, Round 4" or "Lobby waiting · Code ABCD". */
export function resumeHeadline(seat: ResumableSeat): string {
  if (seat.kind === "lobby")
    return seat.joinCode
      ? `Lobby waiting · Code ${seat.joinCode}`
      : "Lobby waiting";
  return seat.stage !== null && seat.round !== null
    ? `In progress · Stage ${seat.stage}, Round ${seat.round}`
    : "In progress";
}

/** "Cube · Upgrades On · 4 players · 2 poison"; a lobby has no poison yet. */
export function resumeDetail(seat: ResumableSeat): string {
  const parts = [
    modeLabel(seat.playMode),
    upgradesLabel(seat.useUpgrades),
    countLabel(seat.playerCount, "player"),
  ];
  if (seat.poison !== null) parts.push(`${seat.poison} poison`);
  return parts.join(" · ");
}

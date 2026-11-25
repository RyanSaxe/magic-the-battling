import type { LastResult, Phase, PlayerView } from "../types";

const ACTIVITY_WORDS: Partial<Record<Phase, string>> = {
  draft: "Drafting",
  build: "Building",
  battle: "Fighting",
  reward: "Wrap-Up",
  awaiting_elimination: "Waiting",
  winner: "Winner",
};

export function getOrdinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/** A player's last fight in one word, the same on their card and in their scouting Overview. */
export function getLastResultWord(result: LastResult): string {
  if (result === "win") return "Won";
  if (result === "loss") return "Lost";
  return "Drew";
}

/** What a player still in the game is doing, or nothing once the game is over for them. */
export function getPlayerActivity({
  phase,
  build_ready,
}: Pick<PlayerView, "phase" | "build_ready">): string | undefined {
  return phase === "build" && build_ready ? "Ready" : ACTIVITY_WORDS[phase];
}

const HAS_ZONE = /(?:Z|[+-]\d\d:\d\d)$/;

/** The server stores UTC and sends some times without a zone, which Date.parse would read as the player's own. */
export function parseServerTime(isoTime: string): number {
  return Date.parse(HAS_ZONE.test(isoTime) ? isoTime : `${isoTime}Z`);
}

/** How long ago a moment was, in the rough terms a player needs: "just now", "4 min ago", "2 h ago", "3 days ago". */
export function formatTimeSince(
  isoTime: string,
  now: number = Date.now(),
): string {
  const minutes = Math.floor((now - parseServerTime(isoTime)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

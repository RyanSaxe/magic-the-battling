import type { Phase } from "../types"

export function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

export function getPlayerPhaseStatusLabel(phase: Phase, buildReady: boolean): string {
  if (phase === "build" && buildReady) return "ready"
  if (phase === "reward") return "end"
  if (phase === "battle") return "fight"
  return phase
}

/** How long ago a moment was, in the rough terms a player needs: "just now", "4 min ago", "2 h ago", "3 days ago". */
export function formatTimeSince(isoTime: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(isoTime)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

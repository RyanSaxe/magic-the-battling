import type { CSSProperties } from "react";
import type { PlayerView } from "../../types";
import { getOrdinal } from "../../utils/format";
import { getSidebarPlacementRank } from "../../utils/playerPlacement";

interface PlacementBadgeProps {
  player: PlayerView;
  players: PlayerView[];
  className?: string;
  variant?: "inline" | "corner";
}

function getPlacementTextColor(rank: number, total: number): string {
  if (rank === 1) return "#f8e7b0";
  if (rank === total) return "#f2d1c2";
  if (rank <= 3) return "#e8dcc0";
  return "#dac8a1";
}

function getPlacementBackground(rank: number, total: number): string {
  if (rank === 1) {
    return "linear-gradient(180deg, rgba(109, 83, 25, 0.92) 0%, rgba(76, 58, 18, 0.96) 100%)";
  }

  if (rank === total) {
    return "linear-gradient(180deg, rgba(88, 39, 26, 0.9) 0%, rgba(60, 24, 16, 0.95) 100%)";
  }

  if (rank <= 3) {
    return "linear-gradient(180deg, rgba(84, 70, 42, 0.9) 0%, rgba(58, 48, 28, 0.95) 100%)";
  }

  return "linear-gradient(180deg, rgba(62, 50, 34, 0.9) 0%, rgba(40, 32, 22, 0.95) 100%)";
}

function getPlacementStyle(rank: number, total: number, variant: "inline" | "corner"): CSSProperties {
  return {
    background: getPlacementBackground(rank, total),
    color: getPlacementTextColor(rank, total),
    borderColor: "var(--gold-border)",
    borderTopColor: variant === "corner" ? "transparent" : "var(--gold-border)",
    borderLeftColor: variant === "corner" ? "transparent" : "var(--gold-border)",
    boxShadow: variant === "corner"
      ? "inset 0 1px 0 rgba(255, 231, 163, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.34)"
      : "inset 0 1px 0 rgba(255, 231, 163, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.34), 0 1px 2px rgba(0, 0, 0, 0.18)",
  };
}

export function PlacementBadge({
  player,
  players,
  className = "",
  variant = "inline",
}: PlacementBadgeProps) {
  const rank = getSidebarPlacementRank(player, players);
  const total = players.length;
  const baseClassName = variant === "corner"
    ? "inline-flex min-w-[1.55rem] items-center justify-center rounded-br-[6px] border-b border-r px-1 py-[2px] text-[7px] font-semibold leading-none tracking-[0.03em] uppercase"
    : "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-[0.08em] uppercase";

  return (
    <span
      className={`${baseClassName} ${className}`.trim()}
      style={getPlacementStyle(rank, total, variant)}
    >
      {getOrdinal(rank)}
    </span>
  );
}

import type { PlayerView } from '../../types'
import { getOrdinal, getPlacementBadgeColor } from '../../utils/format'

interface PlacementBadgeProps {
  player: PlayerView
  players: PlayerView[]
}

export function PlacementBadge({ player, players }: PlacementBadgeProps) {
  const total = players.length

  if (player.placement !== 0) {
    const colors = getPlacementBadgeColor(player.placement, total)
    return (
      <span
        className="absolute -top-1.5 -left-1.5 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {getOrdinal(player.placement)}
      </span>
    )
  }

  const alivePlayers = players.filter((p) => p.placement === 0 && !p.is_ghost)
  const lowerPoisonCount = alivePlayers.filter((p) => p.poison < player.poison).length
  const rank = 1 + lowerPoisonCount
  const colors = getPlacementBadgeColor(rank, total)

  return (
    <span
      className="absolute -top-1.5 -left-1.5 z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {getOrdinal(rank)}
    </span>
  )
}

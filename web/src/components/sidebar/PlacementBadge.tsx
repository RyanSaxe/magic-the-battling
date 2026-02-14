import type { PlayerView } from '../../types'
import { getOrdinal, getPlacementBadgeColor } from '../../utils/format'

interface PlacementBadgeProps {
  player: PlayerView
  players: PlayerView[]
}

export function PlacementBadge({ player, players }: PlacementBadgeProps) {
  const total = players.length

  if (player.placement !== 0) {
    return (
      <span
        className="absolute -top-1.5 -left-1.5 z-10 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        style={{ backgroundColor: getPlacementBadgeColor(player.placement, total) }}
      >
        {getOrdinal(player.placement)}
      </span>
    )
  }

  const alivePlayers = players.filter((p) => p.placement === 0 && !p.is_ghost)
  const lowerPoisonCount = alivePlayers.filter((p) => p.poison < player.poison).length
  const rank = 1 + lowerPoisonCount

  return (
    <span
      className="absolute -top-1.5 -left-1.5 z-10 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
      style={{ backgroundColor: getPlacementBadgeColor(rank, total) }}
    >
      {getOrdinal(rank)}
    </span>
  )
}

import type { PlayerView } from '../../types'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface PlacementBadgeProps {
  player: PlayerView
  players: PlayerView[]
}

export function PlacementBadge({ player, players }: PlacementBadgeProps) {
  if (player.placement !== 0) {
    return (
      <span className="absolute -top-1.5 -left-1.5 z-10 bg-gray-600 text-gray-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
        {ordinal(player.placement)}
      </span>
    )
  }

  const alivePlayers = players.filter((p) => p.placement === 0 && !p.is_ghost)
  const lowerPoisonCount = alivePlayers.filter((p) => p.poison < player.poison).length
  const rank = 1 + lowerPoisonCount

  return (
    <span className="absolute -top-1.5 -left-1.5 z-10 bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
      {ordinal(rank)}
    </span>
  )
}

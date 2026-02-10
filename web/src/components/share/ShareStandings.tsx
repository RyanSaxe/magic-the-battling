import type { SharePlayerData } from '../../types'
import { getOrdinal } from '../../utils/format'

interface ShareStandingsProps {
  players: SharePlayerData[]
}

export function ShareStandings({ players }: ShareStandingsProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.final_placement === null && b.final_placement === null) {
      return a.final_poison - b.final_poison
    }
    if (a.final_placement === null) return 1
    if (b.final_placement === null) return 1
    return a.final_placement - b.final_placement
  })

  return (
    <div className="bg-black/30 rounded-lg border border-gray-600/40 p-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 justify-center">
        {sorted.map((player) => {
          const placement = player.final_placement
          const label = placement ? getOrdinal(placement) : '?'
          const isWinner = placement === 1
          return (
            <span
              key={player.name}
              className={`text-sm ${isWinner ? 'text-amber-400 font-bold' : 'text-gray-300'}`}
            >
              {label}: {player.name} ({player.final_poison} poison)
            </span>
          )
        })}
      </div>
    </div>
  )
}

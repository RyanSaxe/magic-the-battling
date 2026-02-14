import type { SharePlayerData } from '../../types'
import { getOrdinal, getPlacementBadgeColor } from '../../utils/format'

interface SharePlayerToggleProps {
  players: SharePlayerData[]
  selectedPlayer: string
  ownerName: string
  onSelectPlayer: (name: string) => void
  currentRound: string
  gameFinished?: boolean
}

function isPlayerEliminatedAtRound(
  player: SharePlayerData,
  roundKey: string,
): boolean {
  if (roundKey === 'final') return false
  const [stageStr, roundStr] = roundKey.split('_')
  const stage = parseInt(stageStr)
  const round = parseInt(roundStr)
  return !player.snapshots.some((s) => s.stage === stage && s.round === round)
}

function PlacementBadge({ placement, totalPlayers, gameFinished }: {
  placement: number | null
  totalPlayers: number
  gameFinished: boolean
}) {
  if (placement && placement > 0) {
    const color = getPlacementBadgeColor(placement, totalPlayers)
    return (
      <span
        className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        style={{ backgroundColor: color + '30', color }}
      >
        {getOrdinal(placement)}
      </span>
    )
  }

  if (!gameFinished) {
    return (
      <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none bg-emerald-500/20 text-emerald-400">
        Alive
      </span>
    )
  }

  return null
}

export function SharePlayerToggle({
  players,
  selectedPlayer,
  ownerName,
  onSelectPlayer,
  currentRound,
  gameFinished = true,
}: SharePlayerToggleProps) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {players.map((player) => {
        const isActive = player.name === selectedPlayer
        const isEliminated = isPlayerEliminatedAtRound(player, currentRound)
        const suffix = player.name === ownerName ? ' (You)' : ''

        return (
          <button
            key={player.name}
            className={[
              'px-3 py-1 rounded text-sm whitespace-nowrap transition-colors flex items-center',
              isActive ? 'bg-amber-600 text-white' : 'bg-gray-800 border border-gray-600',
              isEliminated && !isActive ? 'opacity-40' : '',
              !isActive ? 'text-gray-300 hover:bg-gray-700' : '',
            ].join(' ')}
            onClick={() => onSelectPlayer(player.name)}
          >
            {player.name}{suffix}
            <PlacementBadge
              placement={player.final_placement}
              totalPlayers={players.length}
              gameFinished={gameFinished}
            />
          </button>
        )
      })}
    </div>
  )
}

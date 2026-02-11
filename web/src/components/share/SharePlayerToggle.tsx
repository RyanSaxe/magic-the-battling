import type { SharePlayerData } from '../../types'

interface SharePlayerToggleProps {
  players: SharePlayerData[]
  selectedPlayer: string
  ownerName: string
  onSelectPlayer: (name: string) => void
  currentRound: string
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

export function SharePlayerToggle({
  players,
  selectedPlayer,
  ownerName,
  onSelectPlayer,
  currentRound,
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
              'px-3 py-1 rounded text-sm whitespace-nowrap transition-colors',
              isActive ? 'bg-amber-600 text-white' : 'bg-gray-800 border border-gray-600',
              isEliminated && !isActive ? 'opacity-40' : '',
              !isActive ? 'text-gray-300 hover:bg-gray-700' : '',
            ].join(' ')}
            onClick={() => onSelectPlayer(player.name)}
          >
            {player.name}{suffix}
          </button>
        )
      })}
    </div>
  )
}

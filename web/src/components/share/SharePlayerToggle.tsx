import type { SharePlayerData } from '../../types'
import { getOrdinal } from '../../utils/format'

interface SharePlayerToggleProps {
  players: SharePlayerData[]
  selectedPlayer: string
  ownerName: string
  onSelectPlayer: (name: string) => void
}

function sortByPlacement(players: SharePlayerData[]): SharePlayerData[] {
  return [...players].sort((a, b) => {
    if (a.final_placement != null && b.final_placement != null) {
      return a.final_placement - b.final_placement
    }
    if (a.final_placement != null) return -1
    if (b.final_placement != null) return 1
    return 0
  })
}

function playerLabel(player: SharePlayerData, ownerName: string): string {
  const placement = player.final_placement
    ? `${getOrdinal(player.final_placement)} - `
    : ''
  const suffix = player.name === ownerName ? ' (You)' : ''
  return `${placement}${player.name}${suffix}`
}

export function SharePlayerToggle({
  players,
  selectedPlayer,
  ownerName,
  onSelectPlayer,
}: SharePlayerToggleProps) {
  const sorted = sortByPlacement(players)

  return (
    <select
      className="bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-1.5 text-sm min-w-0"
      value={selectedPlayer}
      onChange={(e) => onSelectPlayer(e.target.value)}
    >
      {sorted.map((player) => (
        <option key={player.name} value={player.name}>
          {playerLabel(player, ownerName)}
        </option>
      ))}
    </select>
  )
}

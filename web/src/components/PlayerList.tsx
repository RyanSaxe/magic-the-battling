import type { PlayerView } from '../types'

interface PlayerListProps {
  players: PlayerView[]
  currentPlayerName?: string
}

export function PlayerList({ players, currentPlayerName }: PlayerListProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-medium mb-3">Players</h3>
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.name}
            className={`flex items-center justify-between p-2 rounded ${
              player.name === currentPlayerName ? 'bg-blue-900' : 'bg-gray-700'
            } ${player.is_ghost ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{player.name}</span>
              {player.name === currentPlayerName && (
                <span className="text-xs text-blue-400">(You)</span>
              )}
              {player.is_ghost && (
                <span className="text-xs text-red-400">Eliminated</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-purple-400" title="Poison">
                ☠ {player.poison}
              </span>
              <span className="text-yellow-400" title="Treasures">
                💎 {player.treasures}
              </span>
              <span className="text-gray-400" title="Round">
                R{player.round}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

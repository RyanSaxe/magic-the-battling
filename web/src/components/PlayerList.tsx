import type { PlayerView, LastResult } from '../types'
import { PoisonIcon, MoneyBagIcon } from './icons'
import { useContextStrip } from '../contexts'

interface PlayerListProps {
  players: PlayerView[]
  currentPlayerName?: string
}

function ResultBadge({ result }: { result: LastResult | null }) {
  if (result === null) return null

  if (result === 'win') {
    return (
      <span className="text-[10px] font-bold text-green-400 bg-green-900/50 py-0.5 px-2 rounded">
        W
      </span>
    )
  }
  if (result === 'draw') {
    return (
      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/50 py-0.5 px-2 rounded">
        D
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold text-red-400 bg-red-900/50 py-0.5 px-2 rounded">
      L
    </span>
  )
}

function PairingProbability({ probability }: { probability: number | null }) {
  if (probability === null) {
    return (
      <span className="text-[10px] text-gray-500">
        ??%
      </span>
    )
  }
  const pct = Math.round(probability * 100)
  return (
    <span className="text-[10px] text-blue-400">
      {pct}%
    </span>
  )
}

export function PlayerList({ players, currentPlayerName }: PlayerListProps) {
  const { state, setRevealedPlayer } = useContextStrip()

  const handlePlayerClick = (player: PlayerView) => {
    if (state.revealedPlayer?.name === player.name) {
      setRevealedPlayer(null)
    } else {
      setRevealedPlayer(player)
    }
  }

  return (
    <div className="relative">
      <h3 className="text-white font-medium mb-3">Players</h3>
      <div className="space-y-2">
        {players.map((player) => {
          const isSelected = state.revealedPlayer?.name === player.name
          return (
          <div
            key={player.name}
            className={`p-3 rounded-lg transition-colors cursor-pointer hover:bg-gray-800/50 ${
              isSelected
                ? 'ring-2 ring-blue-500'
                : ''
            } ${
              player.name === currentPlayerName
                ? 'bg-amber-900/30 border border-amber-700/50'
                : player.is_bot
                  ? 'bg-cyan-900/20 border border-cyan-800/30'
                  : 'bg-black/30'
            } ${player.is_ghost ? 'opacity-50' : ''}`}
            onClick={() => handlePlayerClick(player)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{player.name}</span>
                {player.name === currentPlayerName && (
                  <span className="text-xs text-amber-400">(You)</span>
                )}
                {player.is_bot && (
                  <span className="text-[10px] text-cyan-400 bg-cyan-900/50 px-1 rounded">BOT</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {player.name !== currentPlayerName && !player.is_ghost && (
                  <PairingProbability probability={player.pairing_probability} />
                )}
                <ResultBadge result={player.last_result} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-purple-400" title="Poison">
                <PoisonIcon size="sm" /> {player.poison}
              </span>
              <span className="flex items-center gap-1 text-amber-400" title="Treasures">
                <MoneyBagIcon size="sm" /> {player.treasures}
              </span>
              <span className="text-gray-500">
                {player.hand_size}-{player.round} @ {player.phase}
              </span>
            </div>
            {player.is_ghost && (
              <div className="text-xs text-red-400 mt-1">
                {player.is_bot ? 'Bot Eliminated' : 'Eliminated'}
              </div>
            )}
            {player.most_recently_revealed_cards.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {player.most_recently_revealed_cards.length} revealed card(s)
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}

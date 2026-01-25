import type { PlayerView, Phase } from '../types'
import { PoisonIcon, MoneyBagIcon } from './icons'
import { useContextStrip } from '../contexts'

interface PlayerListProps {
  players: PlayerView[]
  currentPlayerName?: string
}

const phaseBadgeClass: Record<Phase, string> = {
  draft: 'draft',
  build: 'build',
  battle: 'battle',
  reward: 'reward',
  eliminated: 'battle',
}

export function PlayerList({ players, currentPlayerName }: PlayerListProps) {
  const { setRevealedPlayer } = useContextStrip()

  return (
    <div className="relative">
      <h3 className="text-white font-medium mb-3">Players</h3>
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.name}
            className={`p-3 rounded-lg transition-colors cursor-pointer hover:bg-gray-800/50 ${
              player.name === currentPlayerName
                ? 'bg-amber-900/30 border border-amber-700/50'
                : player.is_bot
                  ? 'bg-cyan-900/20 border border-cyan-800/30'
                  : 'bg-black/30'
            } ${player.is_ghost ? 'opacity-50' : ''}`}
            onMouseEnter={() => setRevealedPlayer(player)}
            onMouseLeave={() => setRevealedPlayer(null)}
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
              <span
                className={`phase-badge ${phaseBadgeClass[player.phase]} text-[10px] py-0.5 px-2`}
              >
                {player.phase}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-purple-400" title="Poison">
                <PoisonIcon size="sm" /> {player.poison}
              </span>
              <span className="flex items-center gap-1 text-amber-400" title="Treasures">
                <MoneyBagIcon size="sm" /> {player.treasures}
              </span>
              <span className="text-gray-500">
                Stage {player.stage} R{player.round}
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
        ))}
      </div>
    </div>
  )
}

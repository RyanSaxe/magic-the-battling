import type { LastBattleResult, PlayerView } from '../../types'
import { POISON_COUNTER_IMAGE } from '../../constants/assets'
import { PlayerList } from '../PlayerList'

interface RewardSidebarContentProps {
  lastBattleResult: LastBattleResult
  playerName: string
  players: PlayerView[]
}

export function RewardSidebarContent({ lastBattleResult, playerName, players }: RewardSidebarContentProps) {
  const isWinner = lastBattleResult.winner_name === playerName

  return (
    <div className="flex flex-col h-full">
      {/* Battle result */}
      <div className="p-4 border-b border-gray-700 text-center">
        <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">
          Battle vs {lastBattleResult.opponent_name}
        </div>
        {lastBattleResult.is_draw ? (
          <div className="text-2xl font-bold text-yellow-400">Draw</div>
        ) : isWinner ? (
          <div className="text-2xl font-bold text-green-400">Victory!</div>
        ) : (
          <div className="text-2xl font-bold text-red-400">Defeat</div>
        )}
        {(lastBattleResult.poison_dealt > 0 || lastBattleResult.poison_taken > 0) && (
          <div className="flex justify-center gap-4 mt-2 text-sm">
            {lastBattleResult.poison_dealt > 0 && (
              <div className="flex items-center gap-1">
                <img
                  src={POISON_COUNTER_IMAGE}
                  alt="Poison"
                  className="w-4 h-4 rounded object-cover"
                />
                <span className="text-purple-400">+{lastBattleResult.poison_dealt}</span>
              </div>
            )}
            {lastBattleResult.poison_taken > 0 && (
              <div className="flex items-center gap-1">
                <img
                  src={POISON_COUNTER_IMAGE}
                  alt="Poison"
                  className="w-4 h-4 rounded object-cover"
                />
                <span className="text-red-400">-{lastBattleResult.poison_taken}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player list */}
      <div className="p-4 overflow-auto flex-1">
        <PlayerList players={players} currentPlayerName={playerName} />
      </div>
    </div>
  )
}

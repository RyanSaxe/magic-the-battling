import type { LastBattleResult } from '../../types'

interface RewardSidebarContentProps {
  lastBattleResult: LastBattleResult
  playerName: string
}

export function RewardSidebarContent({ lastBattleResult, playerName }: RewardSidebarContentProps) {
  const isWinner = lastBattleResult.winner_name === playerName

  return (
    <div className="flex flex-col h-full">
      {/* Battle result */}
      <div className="p-4 text-center">
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
          <div className="mt-2 text-sm space-y-1 text-center">
            {lastBattleResult.poison_dealt > 0 && (
              <div className="text-purple-400">
                You gave {lastBattleResult.poison_dealt} poison to {lastBattleResult.opponent_name}
              </div>
            )}
            {lastBattleResult.poison_taken > 0 && (
              <div className="text-red-400">
                {lastBattleResult.opponent_name} gave you {lastBattleResult.poison_taken} poison
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

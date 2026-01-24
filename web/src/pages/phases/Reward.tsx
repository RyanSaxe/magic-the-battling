import { useState } from 'react'
import { Card } from '../../components/card'
import { THE_VANQUISHER_IMAGE, TREASURE_TOKEN_IMAGE } from '../../constants/assets'
import type { GameState, Card as CardType } from '../../types'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardDone: (upgradeId?: string) => void
  }
}

export function RewardPhase({ gameState, actions }: RewardPhaseProps) {
  const [selectedStageUpgrade, setSelectedStageUpgrade] = useState<CardType | null>(null)

  const { self_player, available_upgrades } = gameState
  const { last_battle_result } = self_player
  const isStageIncreasing = self_player.is_stage_increasing

  const isWinner = last_battle_result?.winner_name === self_player.name

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-auto">
      {/* Battle Results */}
      {last_battle_result && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-6 text-center">
          <div className="text-gray-400 text-sm uppercase tracking-wide mb-2">
            Battle vs {last_battle_result.opponent_name}
          </div>
          {last_battle_result.is_draw ? (
            <div className="text-2xl font-bold text-yellow-400">Draw</div>
          ) : isWinner ? (
            <div className="text-2xl font-bold text-green-400">Victory!</div>
          ) : (
            <div className="text-2xl font-bold text-red-400">Defeat</div>
          )}
          {last_battle_result.poison_dealt > 0 && (
            <div className="text-purple-400 mt-2">
              Dealt {last_battle_result.poison_dealt} poison damage
            </div>
          )}
          {last_battle_result.poison_taken > 0 && (
            <div className="text-red-400 mt-2">
              Took {last_battle_result.poison_taken} poison damage
            </div>
          )}
        </div>
      )}

      {/* Resources Earned */}
      {last_battle_result && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="text-gray-400 text-sm uppercase tracking-wide mb-3">
            Rewards Earned
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {last_battle_result.treasures_gained > 0 && (
              <div className="flex flex-col items-center gap-2 bg-amber-950/50 rounded-lg px-4 py-3">
                <img
                  src={TREASURE_TOKEN_IMAGE}
                  alt="Treasure"
                  className="w-20 h-28 rounded object-cover"
                />
                <span className="text-amber-400 text-sm">+{last_battle_result.treasures_gained} Treasure</span>
              </div>
            )}
            {last_battle_result.vanquisher_gained && (
              <div className="flex flex-col items-center gap-2 bg-purple-950/50 rounded-lg px-4 py-3">
                <img
                  src={THE_VANQUISHER_IMAGE}
                  alt="The Vanquisher"
                  className="w-20 h-28 rounded object-cover"
                />
                <span className="text-purple-400 text-sm">+1 Hand Size</span>
              </div>
            )}
            {last_battle_result.card_gained && (
              <div className="flex flex-col items-center gap-2 bg-blue-950/50 rounded-lg px-4 py-3">
                <span className="text-blue-400 text-sm">New Card</span>
                <Card card={last_battle_result.card_gained} size="sm" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage upgrade selection (required at stage boundaries) */}
      {isStageIncreasing && available_upgrades.length > 0 && (
        <div className="bg-amber-950/30 rounded-lg p-4 border-2 border-amber-500">
          <h3 className="text-amber-400 font-medium mb-2">Stage Complete!</h3>
          <p className="text-gray-400 text-sm mb-4">
            Select an upgrade to claim as your vanquisher reward:
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            {available_upgrades.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                size="lg"
                selected={selectedStageUpgrade?.id === upgrade.id}
                onClick={() => setSelectedStageUpgrade(
                  selectedStageUpgrade?.id === upgrade.id ? null : upgrade
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-center mt-auto pt-4">
        <button
          onClick={() => actions.rewardDone(selectedStageUpgrade?.id)}
          disabled={isStageIncreasing && available_upgrades.length > 0 && !selectedStageUpgrade}
          className="btn btn-primary px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStageIncreasing
            ? selectedStageUpgrade
              ? 'Claim Upgrade & Continue'
              : 'Select an Upgrade Above'
            : 'Continue to Next Round'}
        </button>
      </div>
    </div>
  )
}

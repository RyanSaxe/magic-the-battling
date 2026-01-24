import { useState } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType } from '../../types'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardApplyUpgrade: (upgradeId: string, targetCardId: string) => void
    rewardDone: (upgradeId?: string) => void
  }
}

export function RewardPhase({ gameState, actions }: RewardPhaseProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<CardType | null>(null)
  const [selectedStageUpgrade, setSelectedStageUpgrade] = useState<CardType | null>(null)

  const { self_player, available_upgrades } = gameState
  const { last_battle_result } = self_player
  const isStageIncreasing = self_player.is_stage_increasing

  const unappliedUpgrades = self_player.upgrades.filter((u) => !u.upgrade_target)

  const handlePickUpgrade = (upgrade: CardType) => {
    actions.rewardPickUpgrade(upgrade.id)
  }

  const handleSelectUpgrade = (upgrade: CardType) => {
    if (selectedUpgrade?.id === upgrade.id) {
      setSelectedUpgrade(null)
    } else {
      setSelectedUpgrade(upgrade)
    }
    setSelectedTarget(null)
  }

  const handleSelectTarget = (card: CardType) => {
    if (selectedTarget?.id === card.id) {
      setSelectedTarget(null)
    } else {
      setSelectedTarget(card)
    }
  }

  const handleApplyUpgrade = () => {
    if (selectedUpgrade && selectedTarget) {
      actions.rewardApplyUpgrade(selectedUpgrade.id, selectedTarget.id)
      setSelectedUpgrade(null)
      setSelectedTarget(null)
    }
  }

  const allCards = [...self_player.hand, ...self_player.sideboard]

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
          {last_battle_result.poison_dealt > 0 && isWinner && (
            <div className="text-purple-400 mt-2">
              Dealt {last_battle_result.poison_dealt} poison damage
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
              <div className="flex items-center gap-2 bg-amber-950/50 rounded-lg px-4 py-2">
                <span className="text-amber-400 text-xl">+{last_battle_result.treasures_gained}</span>
                <span className="text-gray-300">Treasure</span>
              </div>
            )}
            {last_battle_result.vanquisher_gained && (
              <div className="flex items-center gap-2 bg-purple-950/50 rounded-lg px-4 py-2">
                <span className="text-purple-400 text-xl">+1</span>
                <span className="text-gray-300">Hand Size</span>
              </div>
            )}
            {last_battle_result.card_gained && (
              <div className="flex items-center gap-2 bg-blue-950/50 rounded-lg px-4 py-2">
                <span className="text-blue-400">New Card:</span>
                <span className="text-white">{last_battle_result.card_gained}</span>
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

      {/* Pick upgrade section (for non-stage-increasing rounds) */}
      {!isStageIncreasing && available_upgrades.length > 0 && (
        <div className="bg-amber-950/30 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Available Upgrades</h3>
          <div className="flex gap-4 justify-center flex-wrap">
            {available_upgrades.map((upgrade) => (
              <div key={upgrade.id} className="flex flex-col items-center gap-2">
                <Card card={upgrade} size="md" />
                <button
                  onClick={() => handlePickUpgrade(upgrade)}
                  className="btn btn-primary text-sm"
                >
                  Pick This
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply upgrades section */}
      {unappliedUpgrades.length > 0 && (
        <div className="bg-purple-950/30 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3">Apply Upgrades</h3>
          <div className="flex gap-3 flex-wrap mb-4">
            {unappliedUpgrades.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                onClick={() => handleSelectUpgrade(upgrade)}
                selected={selectedUpgrade?.id === upgrade.id}
                size="sm"
              />
            ))}
          </div>

          {selectedUpgrade && (
            <div className="border-t border-gray-700 pt-4 mt-4">
              <p className="text-gray-400 mb-3 text-sm">
                Select a card to apply <span className="text-white">{selectedUpgrade.name}</span> to:
              </p>
              <div className="flex gap-2 flex-wrap max-h-[200px] overflow-auto">
                {allCards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    onClick={() => handleSelectTarget(card)}
                    selected={selectedTarget?.id === card.id}
                    size="sm"
                  />
                ))}
              </div>
              {selectedTarget && (
                <button
                  onClick={handleApplyUpgrade}
                  className="btn btn-primary mt-4"
                >
                  Apply to {selectedTarget.name}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-center mt-auto pt-4">
        <button
          onClick={() => actions.rewardDone(selectedStageUpgrade?.id)}
          disabled={isStageIncreasing && !selectedStageUpgrade}
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

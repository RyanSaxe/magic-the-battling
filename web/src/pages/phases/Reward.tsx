import { useState } from 'react'
import { Card } from '../../components/Card'
import { CardZone } from '../../components/CardZone'
import type { GameState, Card as CardType } from '../../types'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardApplyUpgrade: (upgradeId: string, targetCardId: string) => void
    rewardDone: () => void
  }
}

export function RewardPhase({ gameState, actions }: RewardPhaseProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<CardType | null>(null)

  const { self_player, available_upgrades } = gameState

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

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-2">Rewards</h2>
        <div className="flex gap-6 text-white">
          <span>
            Poison: <span className="text-purple-400">{self_player.poison}</span>
          </span>
          <span>
            Treasures: <span className="text-yellow-400">{self_player.treasures}</span>
          </span>
        </div>
      </div>

      {available_upgrades.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3">Pick an Upgrade</h3>
          <div className="flex gap-4 flex-wrap">
            {available_upgrades.map((upgrade) => (
              <div key={upgrade.id} className="text-center">
                <Card
                  card={upgrade}
                  onClick={() => handlePickUpgrade(upgrade)}
                  size="md"
                />
                <button
                  onClick={() => handlePickUpgrade(upgrade)}
                  className="mt-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-1 rounded text-sm"
                >
                  Pick
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unappliedUpgrades.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-3">Apply Upgrades</h3>
          <div className="flex gap-4 flex-wrap mb-4">
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
            <div className="mt-4">
              <p className="text-gray-400 mb-2">
                Select a card to apply "{selectedUpgrade.name}" to:
              </p>
              <div className="flex gap-2 flex-wrap">
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
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                >
                  Apply Upgrade
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardZone title="Hand" cards={self_player.hand} />
        <CardZone title="Sideboard" cards={self_player.sideboard} />
      </div>

      <div className="flex justify-center">
        <button
          onClick={actions.rewardDone}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded font-medium"
        >
          Continue to Next Round
        </button>
      </div>
    </div>
  )
}

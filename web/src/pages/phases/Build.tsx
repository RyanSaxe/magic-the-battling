import { useState, useCallback } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { Card } from '../../components/card'
import { UpgradeDisplay } from '../../components/sidebar'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSubmit: (basics: string[]) => void
    buildReady: (basics: string[]) => void
    buildUnready: () => void
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void
  }
}

type SelectionZone = 'hand' | 'sideboard'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
}

export function BuildPhase({ gameState, actions }: BuildPhaseProps) {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)

  const { self_player } = gameState
  const maxHandSize = self_player.hand_size

  const handleCardClick = useCallback(
    (card: CardType, index: number, zone: SelectionZone) => {
      // If selecting a target for upgrade application
      if (selectedUpgrade) {
        actions.buildApplyUpgrade(selectedUpgrade.id, card.id)
        setSelectedUpgrade(null)
        return
      }

      // If clicking the same card, deselect
      if (selectedCard?.card.id === card.id) {
        setSelectedCard(null)
        return
      }

      // If no card selected, select this one
      if (!selectedCard) {
        setSelectedCard({ card, index, zone })
        return
      }

      // If clicking card in same zone, switch selection
      if (selectedCard.zone === zone) {
        setSelectedCard({ card, index, zone })
        return
      }

      // Swap between zones
      const fromZone = selectedCard.zone
      const toZone = zone
      actions.buildMove(selectedCard.card.id, fromZone, toZone)
      actions.buildMove(card.id, toZone, fromZone)
      setSelectedCard(null)
    },
    [selectedCard, selectedUpgrade, actions]
  )

  const handleUpgradeClick = (upgrade: CardType) => {
    if (selectedUpgrade?.id === upgrade.id) {
      setSelectedUpgrade(null)
    } else {
      setSelectedUpgrade(upgrade)
      setSelectedCard(null)
    }
  }

  const unappliedUpgrades = self_player.upgrades.filter((u) => !u.upgrade_target)

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Hand area - large cards at top */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="flex justify-between items-center w-full max-w-4xl mb-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Your Hand
          </span>
          <span
            className={`text-sm ${
              self_player.hand.length > maxHandSize ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            {self_player.hand.length} / {maxHandSize}
          </span>
        </div>
        {self_player.hand.length === 0 ? (
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">Hand is empty</div>
            <p className="text-gray-500 text-sm">
              Click a card from your pool to add it to your hand
            </p>
          </div>
        ) : (
          <div className="flex gap-4 justify-center flex-wrap overflow-auto">
            {self_player.hand.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card, index, 'hand')}
                selected={selectedCard?.card.id === card.id}
                glow={selectedUpgrade ? 'green' : 'none'}
                size="lg"
              />
            ))}
          </div>
        )}
      </div>

      {/* Upgrade application instruction */}
      {selectedUpgrade && (
        <div className="bg-purple-900/40 rounded-lg p-3 text-center">
          <span className="text-purple-400 text-sm">
            Click a card to apply "{selectedUpgrade.name}" to it
          </span>
          <button
            onClick={() => setSelectedUpgrade(null)}
            className="ml-4 text-gray-400 text-sm hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pool and Upgrades side by side */}
      <div className="flex gap-4 max-h-[280px]">
        {/* Pool (sideboard) */}
        <div className="bg-slate-800/50 rounded-lg p-3 flex-1 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              Your Pool
            </span>
            <span className="text-sm text-gray-400">
              {self_player.sideboard.length} cards
            </span>
          </div>
          {self_player.sideboard.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              All cards are in your hand
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {self_player.sideboard.map((card, index) => (
                <Card
                  key={card.id}
                  card={card}
                  onClick={() => handleCardClick(card, index, 'sideboard')}
                  selected={selectedCard?.card.id === card.id}
                  glow={selectedUpgrade ? 'green' : 'none'}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>

        {/* Upgrades display */}
        {self_player.upgrades.length > 0 && (
          <div className="bg-purple-950/30 rounded-lg p-3 w-64 flex-shrink-0 overflow-auto">
            <UpgradeDisplay
              upgrades={self_player.upgrades.filter((u) => u.upgrade_target)}
              label="Applied Upgrades"
            />
            {unappliedUpgrades.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Apply Upgrade
                </div>
                <div className="flex flex-col gap-2">
                  {unappliedUpgrades.map((upgrade) => (
                    <Card
                      key={upgrade.id}
                      card={upgrade}
                      size="sm"
                      selected={selectedUpgrade?.id === upgrade.id}
                      onClick={() => handleUpgradeClick(upgrade)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hand size warning */}
      {self_player.hand.length > maxHandSize && (
        <div className="text-red-400 text-sm text-center">
          Hand size exceeds limit. Move {self_player.hand.length - maxHandSize} card(s) to
          pool before submitting.
        </div>
      )}
    </div>
  )
}

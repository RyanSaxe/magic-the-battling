import { useState, useCallback, useEffect, useRef } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { Card } from '../../components/card'
import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSwap: (cardAId: string, sourceA: BuildSource, cardBId: string, sourceB: BuildSource) => void
    buildReady: (basics: string[]) => void
    buildUnready: () => void
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void
  }
  selectedBasics: string[]
  onBasicsChange: (basics: string[]) => void
}

type SelectionZone = 'hand' | 'sideboard'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
}

export function BuildPhase({ gameState, actions, selectedBasics, onBasicsChange }: BuildPhaseProps) {
  const { self_player } = gameState
  const maxHandSize = self_player.hand_size

  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const hasUserInteracted = useRef(false)

  useEffect(() => {
    if (!hasUserInteracted.current && self_player.chosen_basics?.length && selectedBasics.length === 0) {
      onBasicsChange([...self_player.chosen_basics])
    }
  }, [self_player.chosen_basics, selectedBasics.length, onBasicsChange])

  const addBasic = (name: string) => {
    hasUserInteracted.current = true
    if (selectedBasics.length < 3) {
      onBasicsChange([...selectedBasics, name])
    }
  }

  const removeBasic = (name: string) => {
    hasUserInteracted.current = true
    const idx = selectedBasics.indexOf(name)
    if (idx !== -1) {
      onBasicsChange([...selectedBasics.slice(0, idx), ...selectedBasics.slice(idx + 1)])
    }
  }

  const countBasic = (basic: string) => selectedBasics.filter((b) => b === basic).length

  const handleCardClick = useCallback(
    (card: CardType, index: number, zone: SelectionZone) => {
      if (selectedUpgrade) {
        actions.buildApplyUpgrade(selectedUpgrade.id, card.id)
        setSelectedUpgrade(null)
        return
      }

      if (selectedCard?.card.id === card.id) {
        setSelectedCard(null)
        return
      }

      if (!selectedCard) {
        setSelectedCard({ card, index, zone })
        return
      }

      if (selectedCard.zone === zone) {
        setSelectedCard({ card, index, zone })
        return
      }

      actions.buildSwap(selectedCard.card.id, selectedCard.zone, card.id, zone)
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
  const handExceedsLimit = self_player.hand.length > maxHandSize

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Sudden Death Banner */}
      {gameState.self_player.in_sudden_death && (
        <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center">
          <div className="text-red-100 font-bold text-lg tracking-wider uppercase animate-pulse">
            Sudden Death
          </div>
          <div className="text-red-200/80 text-xs mt-1">
            Build your deck - fight to survive!
          </div>
        </div>
      )}

      {/* Hand area - large cards at top */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="flex justify-between items-center w-full max-w-4xl mb-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Your Hand</span>
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

      {/* Basic lands - horizontal row */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Basic Lands</span>
            <span className="text-xs text-gray-400">({selectedBasics.length}/3)</span>
          </div>
          <div className="flex gap-3 flex-1 justify-center">
            {BASIC_LANDS.map(({ name }) => {
              const count = countBasic(name)
              return (
                <div key={name} className="flex items-center gap-1">
                  <img
                    src={BASIC_LAND_IMAGES[name]}
                    alt={name}
                    className="rounded object-cover shadow-lg"
                    style={{ width: 60, height: 84 }}
                    title={name}
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => addBasic(name)}
                      disabled={selectedBasics.length >= 3}
                      className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                    >
                      +
                    </button>
                    <span className="text-white text-xs w-5 text-center">{count}</span>
                    <button
                      onClick={() => removeBasic(name)}
                      disabled={count === 0}
                      className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                    >
                      -
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {handExceedsLimit && !self_player.build_ready && (
            <div className="text-red-400 text-xs">
              Hand exceeds limit ({self_player.hand.length}/{maxHandSize})
            </div>
          )}
        </div>
      </div>

      {/* Pool and Upgrades side by side */}
      <div className="flex gap-4 max-h-[240px]">
        {/* Pool (sideboard) */}
        <div className="bg-slate-800/50 rounded-lg p-3 flex-1 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Your Pool</span>
            <span className="text-sm text-gray-400">{self_player.sideboard.length} cards</span>
          </div>
          {self_player.sideboard.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              All cards are in your hand
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center max-w-[1100px] mx-auto">
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

        {/* Unapplied upgrades */}
        {unappliedUpgrades.length > 0 && (
          <div className="bg-purple-950/30 rounded-lg p-3 w-48 flex-shrink-0 overflow-auto">
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
    </div>
  )
}

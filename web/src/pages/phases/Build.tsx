import { useState, useEffect } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { GameDndProvider, useDndActions, DraggableCard, DroppableZone } from '../../dnd'
import { Card } from '../../components/card'
import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSubmit: (basics: string[]) => void
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void
  }
}

export function BuildPhase({ gameState, actions }: BuildPhaseProps) {
  const [selectedBasics, setSelectedBasics] = useState<string[]>(
    gameState.self_player.chosen_basics
  )
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    source: BuildSource
  } | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<CardType | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: 'build',
    buildMove: actions.buildMove,
  })

  const { self_player } = gameState
  const numBasicsNeeded = 3
  const maxHandSize = self_player.hand_size

  const addBasic = (basic: string) => {
    if (selectedBasics.length < numBasicsNeeded) {
      setSelectedBasics([...selectedBasics, basic])
    }
  }

  const removeBasic = (basic: string) => {
    const idx = selectedBasics.indexOf(basic)
    if (idx !== -1) {
      setSelectedBasics([...selectedBasics.slice(0, idx), ...selectedBasics.slice(idx + 1)])
    }
  }

  const countBasic = (basic: string) => selectedBasics.filter((b) => b === basic).length

  const handleCardClick = (card: CardType, source: BuildSource) => {
    if (selectedCard?.card.id === card.id) {
      setSelectedCard(null)
    } else {
      setSelectedCard({ card, source })
    }
  }

  const handleSubmit = () => {
    if (selectedBasics.length === numBasicsNeeded) {
      actions.buildSubmit(selectedBasics)
    }
  }

  const unappliedUpgrades = self_player.upgrades.filter((u) => !u.upgrade_target)
  const allCards = [...self_player.hand, ...self_player.sideboard]

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
      actions.buildApplyUpgrade(selectedUpgrade.id, selectedTarget.id)
      setSelectedUpgrade(null)
      setSelectedTarget(null)
    }
  }

  return (
    <GameDndProvider key={isMounted ? 'mounted' : 'initial'} onCardMove={handleCardMove} validDropZones={getValidDropZones}>
      <div className="flex flex-col h-full gap-4 p-4">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Build Your Deck</h2>
          <p className="text-gray-400 text-sm">
            Drag cards between hand and sideboard. Hand size limit: {maxHandSize}
          </p>
        </div>

        {/* Card zones */}
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Hand zone */}
          <DroppableZone
            zone="hand"
            validFromZones={['sideboard']}
            className="bg-blue-950/30 rounded-lg p-4 overflow-auto"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Hand
              </span>
              <span className={`text-sm ${self_player.hand.length > maxHandSize ? 'text-red-400' : 'text-gray-400'}`}>
                {self_player.hand.length} / {maxHandSize}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {self_player.hand.length === 0 ? (
                <div className="text-gray-500 text-sm">Drag cards here</div>
              ) : (
                self_player.hand.map((card) => (
                  <DraggableCard
                    key={card.id}
                    card={card}
                    zone="hand"
                    size="sm"
                    selected={selectedCard?.card.id === card.id}
                    onClick={() => handleCardClick(card, 'hand')}
                  />
                ))
              )}
            </div>
          </DroppableZone>

          {/* Sideboard zone */}
          <DroppableZone
            zone="sideboard"
            validFromZones={['hand']}
            className="bg-purple-950/30 rounded-lg p-4 overflow-auto"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Sideboard
              </span>
              <span className="text-sm text-gray-400">
                {self_player.sideboard.length} cards
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {self_player.sideboard.length === 0 ? (
                <div className="text-gray-500 text-sm">Empty</div>
              ) : (
                self_player.sideboard.map((card) => (
                  <DraggableCard
                    key={card.id}
                    card={card}
                    zone="sideboard"
                    size="sm"
                    selected={selectedCard?.card.id === card.id}
                    onClick={() => handleCardClick(card, 'sideboard')}
                  />
                ))
              )}
            </div>
          </DroppableZone>
        </div>

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

        {/* Basic lands selector */}
        <div className="bg-black/30 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-white font-medium">Choose {numBasicsNeeded} Basic Lands</span>
            <span className="text-sm text-gray-400">
              {selectedBasics.length} / {numBasicsNeeded}
            </span>
          </div>
          <div className="flex justify-center gap-4">
            {BASIC_LANDS.map(({ name }) => {
              const count = countBasic(name)
              return (
                <div key={name} className="flex flex-col items-center gap-2">
                  <img
                    src={BASIC_LAND_IMAGES[name]}
                    alt={name}
                    className="w-16 h-22 rounded object-cover shadow-lg"
                  />
                  <span className="text-gray-400 text-xs">{name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => removeBasic(name)}
                      disabled={count === 0}
                      className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="text-white w-4 text-center">{count}</span>
                    <button
                      onClick={() => addBasic(name)}
                      disabled={selectedBasics.length >= numBasicsNeeded}
                      className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Submit button */}
        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={selectedBasics.length !== numBasicsNeeded}
            className="btn btn-primary px-8 py-3 text-lg"
          >
            Submit Deck
          </button>
        </div>
      </div>
    </GameDndProvider>
  )
}

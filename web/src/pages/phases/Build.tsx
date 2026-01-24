import { useState } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { GameDndProvider, useDndActions, DraggableCard, DroppableZone } from '../../dnd'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSubmit: (basics: string[]) => void
  }
}

const BASIC_LANDS = [
  { name: 'Plains', symbol: 'W', color: 'bg-amber-100 text-amber-900' },
  { name: 'Island', symbol: 'U', color: 'bg-blue-400 text-blue-900' },
  { name: 'Swamp', symbol: 'B', color: 'bg-gray-800 text-gray-200' },
  { name: 'Mountain', symbol: 'R', color: 'bg-red-500 text-red-100' },
  { name: 'Forest', symbol: 'G', color: 'bg-green-500 text-green-100' },
]

export function BuildPhase({ gameState, actions }: BuildPhaseProps) {
  const [selectedBasics, setSelectedBasics] = useState<string[]>(
    gameState.self_player.chosen_basics
  )
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    source: BuildSource
  } | null>(null)

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

  return (
    <GameDndProvider onCardMove={handleCardMove} validDropZones={getValidDropZones}>
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

        {/* Basic lands selector */}
        <div className="bg-black/30 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-white font-medium">Choose {numBasicsNeeded} Basic Lands</span>
            <span className="text-sm text-gray-400">
              {selectedBasics.length} / {numBasicsNeeded}
            </span>
          </div>
          <div className="flex justify-center gap-3">
            {BASIC_LANDS.map(({ name, symbol, color }) => {
              const count = countBasic(name)
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-xl font-bold shadow-lg`}
                  >
                    {symbol}
                  </div>
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

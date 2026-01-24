import { useState } from 'react'
import { CardZone } from '../../components/CardZone'
import type { GameState, Card as CardType, BuildSource } from '../../types'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSubmit: (basics: string[]) => void
  }
}

const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']

export function BuildPhase({ gameState, actions }: BuildPhaseProps) {
  const [selectedBasics, setSelectedBasics] = useState<string[]>(
    gameState.self_player.chosen_basics
  )
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    source: BuildSource
  } | null>(null)

  const { self_player } = gameState
  const numBasicsNeeded = 3

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

  const handleMove = (destination: BuildSource) => {
    if (selectedCard && selectedCard.source !== destination) {
      actions.buildMove(selectedCard.card.id, selectedCard.source, destination)
      setSelectedCard(null)
    }
  }

  const handleSubmit = () => {
    if (selectedBasics.length === numBasicsNeeded) {
      actions.buildSubmit(selectedBasics)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Build Your Deck</h2>
        <p className="text-gray-400 mb-4">
          Move cards between your hand and sideboard. Your hand will be your starting
          cards for battle.
        </p>

        <div className="flex items-center gap-4 mb-4 text-white">
          <span>Hand: {self_player.hand.length} cards</span>
          <span>Max starting hand: {self_player.stage + self_player.vanquishers}</span>
        </div>

        {selectedCard && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => handleMove('hand')}
              disabled={selectedCard.source === 'hand'}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
            >
              Move to Hand
            </button>
            <button
              onClick={() => handleMove('sideboard')}
              disabled={selectedCard.source === 'sideboard'}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
            >
              Move to Sideboard
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardZone
          title="Hand"
          cards={self_player.hand}
          onCardClick={(card) => handleCardClick(card, 'hand')}
          selectedCardId={selectedCard?.card.id}
          maxHeight="max-h-96"
        />
        <CardZone
          title="Sideboard"
          cards={self_player.sideboard}
          onCardClick={(card) => handleCardClick(card, 'sideboard')}
          selectedCardId={selectedCard?.card.id}
          maxHeight="max-h-96"
        />
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">
          Choose {numBasicsNeeded} Basic Lands
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {BASIC_LANDS.map((basic) => (
            <div key={basic} className="flex items-center gap-1 bg-gray-700 rounded px-2 py-1">
              <button
                onClick={() => removeBasic(basic)}
                disabled={countBasic(basic) === 0}
                className="w-6 h-6 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold"
              >
                -
              </button>
              <span className="text-white min-w-[80px] text-center">
                {basic} ({countBasic(basic)})
              </span>
              <button
                onClick={() => addBasic(basic)}
                disabled={selectedBasics.length >= numBasicsNeeded}
                className="w-6 h-6 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold"
              >
                +
              </button>
            </div>
          ))}
        </div>
        <p className="text-gray-400 text-sm">
          Selected: {selectedBasics.join(', ') || 'None'}
        </p>
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={selectedBasics.length !== numBasicsNeeded}
          className={`px-8 py-3 rounded font-medium ${
            selectedBasics.length === numBasicsNeeded
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          Submit Deck ({selectedBasics.length}/{numBasicsNeeded} basics selected)
        </button>
      </div>
    </div>
  )
}

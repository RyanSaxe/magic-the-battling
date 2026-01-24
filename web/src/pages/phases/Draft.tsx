import { useState } from 'react'
import { Card } from '../../components/Card'
import { CardZone } from '../../components/CardZone'
import type { GameState, Card as CardType, CardDestination } from '../../types'

interface DraftPhaseProps {
  gameState: GameState
  actions: {
    draftTake: (cardId: string, destination: CardDestination) => void
    draftSwap: (packCardId: string, playerCardId: string, destination: CardDestination) => void
    draftRoll: () => void
    draftDone: () => void
  }
}

export function DraftPhase({ gameState, actions }: DraftPhaseProps) {
  const [selectedPackCard, setSelectedPackCard] = useState<CardType | null>(null)
  const [selectedPlayerCard, setSelectedPlayerCard] = useState<CardType | null>(null)
  const [destination, setDestination] = useState<CardDestination>('hand')

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []

  const handlePackCardClick = (card: CardType) => {
    if (selectedPackCard?.id === card.id) {
      setSelectedPackCard(null)
    } else {
      setSelectedPackCard(card)
    }
    setSelectedPlayerCard(null)
  }

  const handlePlayerCardClick = (card: CardType) => {
    if (selectedPlayerCard?.id === card.id) {
      setSelectedPlayerCard(null)
    } else {
      setSelectedPlayerCard(card)
    }
  }

  const handleTake = () => {
    if (selectedPackCard) {
      actions.draftTake(selectedPackCard.id, destination)
      setSelectedPackCard(null)
    }
  }

  const handleSwap = () => {
    if (selectedPackCard && selectedPlayerCard) {
      actions.draftSwap(selectedPackCard.id, selectedPlayerCard.id, destination)
      setSelectedPackCard(null)
      setSelectedPlayerCard(null)
    }
  }

  const handleRoll = () => {
    actions.draftRoll()
    setSelectedPackCard(null)
    setSelectedPlayerCard(null)
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Current Pack</h2>
          <div className="flex items-center gap-4">
            <span className="text-yellow-400">
              Treasures: {self_player.treasures}
            </span>
            <button
              onClick={handleRoll}
              disabled={self_player.treasures <= 0 || currentPack.length === 0}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
            >
              Roll (Cost: 1)
            </button>
          </div>
        </div>

        {currentPack.length === 0 ? (
          <p className="text-gray-400">No pack available</p>
        ) : (
          <div className="flex gap-4 justify-center">
            {currentPack.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handlePackCardClick(card)}
                selected={selectedPackCard?.id === card.id}
                size="lg"
              />
            ))}
          </div>
        )}
      </div>

      {selectedPackCard && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-white">Destination:</span>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value as CardDestination)}
              className="bg-gray-700 text-white rounded px-3 py-2"
            >
              <option value="hand">Hand</option>
              <option value="sideboard">Sideboard</option>
              <option value="upgrades">Upgrades</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleTake}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              Take Card
            </button>
            {selectedPlayerCard && (
              <button
                onClick={handleSwap}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Swap with Selected
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardZone
          title="Hand"
          cards={self_player.hand}
          onCardClick={handlePlayerCardClick}
          selectedCardId={selectedPlayerCard?.id}
        />
        <CardZone
          title="Sideboard"
          cards={self_player.sideboard}
          onCardClick={handlePlayerCardClick}
          selectedCardId={selectedPlayerCard?.id}
        />
      </div>

      <CardZone
        title="Upgrades"
        cards={self_player.upgrades}
        onCardClick={handlePlayerCardClick}
        selectedCardId={selectedPlayerCard?.id}
      />

      <div className="flex justify-center">
        <button
          onClick={actions.draftDone}
          className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded font-medium"
        >
          Done Drafting
        </button>
      </div>
    </div>
  )
}

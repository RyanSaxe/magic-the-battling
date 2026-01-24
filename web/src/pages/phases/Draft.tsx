import { useState } from 'react'
import { Card } from '../../components/card'
import { TreasureIcon } from '../../components/icons'
import type { GameState, Card as CardType, CardDestination } from '../../types'

interface DraftPhaseProps {
  gameState: GameState
  actions: {
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
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header with treasures */}
      <div className="flex justify-between items-center">
        <span className="phase-badge draft">Draft</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TreasureIcon size="lg" />
            <span className="text-white font-medium">{self_player.treasures}</span>
          </div>
          <button
            onClick={handleRoll}
            disabled={self_player.treasures <= 0 || currentPack.length === 0}
            className="btn btn-secondary text-sm flex items-center gap-1"
          >
            Roll Pack (<TreasureIcon size="sm" />1)
          </button>
        </div>
      </div>

      {/* Current pack */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {currentPack.length === 0 ? (
          <div className="text-gray-400">No pack available</div>
        ) : (
          <>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-4">
              Current Pack
            </div>
            <div className="flex gap-4 justify-center flex-wrap">
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
          </>
        )}
      </div>

      {/* Action panel - requires both pack card AND player card selection */}
      {selectedPackCard && (
        <div className="bg-black/40 rounded-lg p-4">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Send to:</span>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value as CardDestination)}
                className="bg-gray-700 text-white rounded px-3 py-1.5 text-sm"
              >
                <option value="hand">Hand</option>
                <option value="sideboard">Sideboard</option>
                <option value="upgrades">Upgrades</option>
              </select>
            </div>
            {selectedPlayerCard ? (
              <button onClick={handleSwap} className="btn btn-primary">
                Swap Cards
              </button>
            ) : (
              <span className="text-amber-400 text-sm">
                Select a card from your collection to swap
              </span>
            )}
          </div>
        </div>
      )}

      {/* Your cards */}
      <div className="grid grid-cols-3 gap-4 max-h-[300px] overflow-auto">
        {/* Hand */}
        <div className="bg-blue-950/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Hand ({self_player.hand.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {self_player.hand.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handlePlayerCardClick(card)}
                selected={selectedPlayerCard?.id === card.id}
                size="sm"
              />
            ))}
          </div>
        </div>

        {/* Sideboard */}
        <div className="bg-purple-950/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Sideboard ({self_player.sideboard.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {self_player.sideboard.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handlePlayerCardClick(card)}
                selected={selectedPlayerCard?.id === card.id}
                size="sm"
              />
            ))}
          </div>
        </div>

        {/* Upgrades */}
        <div className="bg-amber-950/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Upgrades ({self_player.upgrades.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {self_player.upgrades.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handlePlayerCardClick(card)}
                selected={selectedPlayerCard?.id === card.id}
                size="sm"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Done button */}
      <div className="flex justify-center">
        <button onClick={actions.draftDone} className="btn btn-primary px-8 py-3">
          Done Drafting
        </button>
      </div>
    </div>
  )
}

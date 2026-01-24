import { useState } from 'react'
import { Card } from '../../components/card'
import { TREASURE_TOKEN_IMAGE } from '../../constants/assets'
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

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const cardPool = [...self_player.hand, ...self_player.sideboard]

  const handlePackCardClick = (card: CardType) => {
    if (selectedPackCard?.id === card.id) {
      setSelectedPackCard(null)
    } else {
      setSelectedPackCard(card)
    }
    setSelectedPlayerCard(null)
  }

  const handlePlayerCardClick = (card: CardType) => {
    if (!selectedPackCard) return

    if (selectedPlayerCard?.id === card.id) {
      setSelectedPlayerCard(null)
    } else {
      setSelectedPlayerCard(card)
    }
  }

  const handleSwap = () => {
    if (selectedPackCard && selectedPlayerCard) {
      const isInHand = self_player.hand.some(c => c.id === selectedPlayerCard.id)
      const destination: CardDestination = isInHand ? 'hand' : 'sideboard'
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
            <img src={TREASURE_TOKEN_IMAGE} alt="Treasure" className="w-8 h-10 rounded object-cover" />
            <span className="text-white font-medium">{self_player.treasures}</span>
          </div>
          <button
            onClick={handleRoll}
            disabled={self_player.treasures <= 0 || currentPack.length === 0}
            className="btn btn-secondary text-sm flex items-center gap-1"
          >
            Roll Pack (1 Treasure)
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
              Current Pack - Select a card to swap
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

      {/* Swap instruction */}
      {selectedPackCard && !selectedPlayerCard && (
        <div className="bg-amber-900/40 rounded-lg p-3 text-center">
          <span className="text-amber-400 text-sm">
            Select a card from your pool to swap with "{selectedPackCard.name}"
          </span>
        </div>
      )}

      {/* Swap confirmation */}
      {selectedPackCard && selectedPlayerCard && (
        <div className="bg-green-900/40 rounded-lg p-3 flex items-center justify-center gap-4">
          <span className="text-green-400 text-sm">
            Swap "{selectedPackCard.name}" for "{selectedPlayerCard.name}"
          </span>
          <button onClick={handleSwap} className="btn btn-primary">
            Confirm Swap
          </button>
          <button
            onClick={() => {
              setSelectedPackCard(null)
              setSelectedPlayerCard(null)
            }}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Main content area: Upgrades on left, Card Pool on right */}
      <div className="flex gap-4 max-h-[300px]">
        {/* Upgrades (read-only display) */}
        {self_player.upgrades.length > 0 && (
          <div className="bg-amber-950/30 rounded-lg p-3 w-48 flex-shrink-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Your Upgrades
            </div>
            <div className="flex flex-col gap-2 overflow-auto">
              {self_player.upgrades.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  size="sm"
                />
              ))}
            </div>
          </div>
        )}

        {/* Card Pool (hand + sideboard combined) */}
        <div className="bg-slate-800/50 rounded-lg p-3 flex-1 overflow-auto">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Your Pool ({cardPool.length} cards)
          </div>
          <div className="flex flex-wrap gap-2">
            {cardPool.map((card) => {
              const isInHand = self_player.hand.some(c => c.id === card.id)
              return (
                <div key={card.id} className="relative">
                  <Card
                    card={card}
                    onClick={() => handlePlayerCardClick(card)}
                    selected={selectedPlayerCard?.id === card.id}
                    size="sm"
                    disabled={!selectedPackCard}
                  />
                  <div className={`absolute -top-1 -right-1 text-[10px] px-1 rounded ${
                    isInHand ? 'bg-blue-600' : 'bg-purple-600'
                  }`}>
                    {isInHand ? 'H' : 'S'}
                  </div>
                </div>
              )
            })}
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

import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import { PlayerStatsBar } from '../../components/PlayerStatsBar'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useContainerCardSizes } from '../../hooks/useContainerCardSizes'

interface DraftPhaseProps {
  gameState: GameState
  actions: {
    draftSwap: (packCardId: string, playerCardId: string, destination: CardDestination) => void
    draftRoll: () => void
    draftDone: () => void
  }
}

type SelectionZone = 'pack' | 'pool'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
  isInHand: boolean
}

export function DraftPhase({ gameState, actions }: DraftPhaseProps) {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const pool = [...self_player.hand, ...self_player.sideboard]

  const [packRef, packCardDims] = useContainerCardSizes({
    cardCount: currentPack.length,
    gap: 16,
    maxCardWidth: 250,
  })
  const [poolRef, poolCardDims] = useContainerCardSizes({
    cardCount: pool.length,
    gap: 8,
    maxCardWidth: 130,
    rows: 3,
  })
  const upgradedCardIds = new Set(
    self_player.upgrades.filter((u) => u.upgrade_target).map((u) => u.upgrade_target!.id)
  )

  const handleCardClick = useCallback(
    (card: CardType, index: number, zone: SelectionZone, isInHand: boolean) => {
      if (selectedCard?.card.id === card.id) {
        setSelectedCard(null)
        return
      }

      if (!selectedCard) {
        setSelectedCard({ card, index, zone, isInHand })
        return
      }

      if (selectedCard.zone === zone) {
        setSelectedCard({ card, index, zone, isInHand })
        return
      }

      const packCard = zone === 'pack' ? card : selectedCard.card
      const poolCard = zone === 'pool' ? card : selectedCard.card
      const poolIsInHand = zone === 'pool' ? isInHand : selectedCard.isInHand
      const destination: CardDestination = poolIsInHand ? 'hand' : 'sideboard'

      actions.draftSwap(packCard.id, poolCard.id, destination)
      setSelectedCard(null)
    },
    [selectedCard, actions]
  )

  return (
    <div className="relative flex flex-col h-full gap-2 p-4">
      <PlayerStatsBar treasures={self_player.treasures} poison={self_player.poison} />

      {/* Pack area */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        {currentPack.length === 0 ? (
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">No pack available</div>
            <p className="text-gray-500 text-sm">
              Wait for the next pack or click "Done Drafting"
            </p>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-4">
              Current Pack ({currentPack.length} cards)
            </div>
            <div ref={packRef} className="flex gap-4 justify-center flex-wrap p-1 w-full">
              {currentPack.map((card, index) => (
                <Card
                  key={card.id}
                  card={card}
                  onClick={() => handleCardClick(card, index, 'pack', false)}
                  selected={selectedCard?.card.id === card.id}
                  dimensions={packCardDims}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pool */}
      <div className="p-2 max-h-[35vh] min-h-[120px] overflow-auto shrink-0">
        {pool.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">
            Swap cards from the pack to build your pool
          </div>
        ) : (
          <div ref={poolRef} className="flex flex-wrap gap-2 p-1">
            {pool.map((card, index) => {
              const isInHand = self_player.hand.some((c) => c.id === card.id)
              return (
                <Card
                  key={card.id}
                  card={card}
                  onClick={() => handleCardClick(card, index, 'pool', isInHand)}
                  selected={selectedCard?.card.id === card.id}
                  dimensions={poolCardDims}
                  upgraded={upgradedCardIds.has(card.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

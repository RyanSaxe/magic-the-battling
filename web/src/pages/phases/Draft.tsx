import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import { PlayerStatsBar } from '../../components/PlayerStatsBar'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'

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

  const [containerRef, { top: packCardDims, bottom: poolCardDims }] = useDualZoneCardSizes({
    topCount: currentPack.length,
    bottomCount: pool.length,
    topGap: 16,
    bottomGap: 8,
    fixedHeight: 30,
    topMaxWidth: 200,
    bottomMaxWidth: 130,
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
    <div ref={containerRef} className="flex flex-col h-full gap-2 p-4">
      <PlayerStatsBar treasures={self_player.treasures} poison={self_player.poison}>
        {currentPack.length === 0 ? (
          <div className="text-center">
            <div className="text-gray-400 text-sm">No pack available</div>
          </div>
        ) : (
          <div className="flex gap-4 justify-center flex-wrap p-1 w-full">
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
        )}
      </PlayerStatsBar>

      <div className="flex items-center gap-3 px-2">
        <div className="flex-1 border-t border-gray-600/40" />
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Your Pool</span>
        <div className="flex-1 border-t border-gray-600/40" />
      </div>

      {/* Pool */}
      {pool.length === 0 ? (
        <div className="flex items-center justify-center">
          <div className="text-gray-500 text-sm text-center">
            Swap cards from the pack to build your pool
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 justify-center content-start p-1">
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
  )
}

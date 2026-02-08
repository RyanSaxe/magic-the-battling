import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'
import { POISON_COUNTER_IMAGE, TREASURE_TOKEN_IMAGE } from '../../constants/assets'

interface DraftPhaseProps {
  gameState: GameState
  actions: {
    draftSwap: (packCardId: string, playerCardId: string, destination: CardDestination) => void
    draftRoll: () => void
    draftDone: () => void
  }
  isMobile?: boolean
}

type SelectionZone = 'pack' | 'pool'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
  isInHand: boolean
}

export function DraftPhase({ gameState, actions, isMobile = false }: DraftPhaseProps) {
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
    topMaxWidth: 400,
    bottomMaxWidth: 300,
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
      {currentPack.length === 0 ? (
        <div className="text-center">
          <div className="text-gray-400 text-sm">No pack available</div>
        </div>
      ) : (
        <div className="flex gap-4 justify-center flex-wrap w-full">
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

      <div className="flex items-center gap-3 px-2">
        {!isMobile && (
          <div className="flex items-center gap-2">
            <img src={POISON_COUNTER_IMAGE} alt="Poison" className="h-14 rounded" />
            <span className="text-xl font-bold text-purple-400">{self_player.poison}</span>
          </div>
        )}
        <div className="flex-1 border-t border-gray-600/40" />
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Your Pool</span>
        <div className="flex-1 border-t border-gray-600/40" />
        {!isMobile && (
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-amber-400">{self_player.treasures}</span>
            <img src={TREASURE_TOKEN_IMAGE} alt="Treasure" className="h-14 rounded" />
          </div>
        )}
      </div>

      {/* Pool */}
      {pool.length === 0 ? (
        <div className="flex items-center justify-center">
          <div className="text-gray-500 text-sm text-center">
            Swap cards from the pack to build your pool
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 justify-center content-start">
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

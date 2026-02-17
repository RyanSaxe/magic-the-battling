import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'
import { useElementHeight } from '../../hooks/useElementHeight'

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

export function DraftPhase({ gameState, actions }: DraftPhaseProps) {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const pool = [...self_player.hand, ...self_player.sideboard]

  const [separatorRef, separatorHeight] = useElementHeight()

  const [containerRef, { top: packCardDims, bottom: poolCardDims }] = useDualZoneCardSizes({
    topCount: currentPack.length,
    bottomCount: pool.length,
    topGap: 6,
    bottomGap: 6,
    fixedHeight: separatorHeight + 16,
    topMaxWidth: 400,
    bottomMaxWidth: 300,
  })
  const appliedUpgradesList = self_player.upgrades.filter((u) => u.upgrade_target)
  const upgradedCardIds = new Set(appliedUpgradesList.map((u) => u.upgrade_target!.id))
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgradesList.filter((u) => u.upgrade_target!.id === cardId)

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
    <div ref={containerRef} className="flex flex-col h-full gap-2 p-4 overflow-hidden">
      {currentPack.length === 0 ? (
        <div className="text-center">
          <div className="text-gray-400 text-sm">No pack available</div>
        </div>
      ) : separatorHeight > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${packCardDims.columns}, ${packCardDims.width}px)`,
          gap: '6px',
          justifyContent: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
        }}>
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
      ) : null}

      <div ref={separatorRef} className="flex items-center gap-3 px-2">
        <div className="flex-1 border-t border-gray-600/40" />
        <span className="text-xs text-gray-300 uppercase tracking-widest">Your Pool</span>
        <div className="flex-1 border-t border-gray-600/40" />
      </div>

      {/* Pool */}
      {pool.length === 0 ? (
        <div className="flex items-center justify-center">
          <div className="text-gray-500 text-sm text-center">
            Swap cards from the pack to build your pool
          </div>
        </div>
      ) : separatorHeight > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${poolCardDims.columns}, ${poolCardDims.width}px)`,
          gap: '6px',
          justifyContent: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
        }}>
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
                appliedUpgrades={getAppliedUpgrades(card.id)}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

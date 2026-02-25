import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useCardLayout } from '../../hooks/useCardLayout'
import { badgeCls } from '../../components/common/ZoneLayout'
import { TREASURE_TOKEN_IMAGE, POISON_COUNTER_IMAGE } from '../../constants/assets'

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

export function DraftPhase({ gameState, actions, isMobile }: DraftPhaseProps) {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const pool = [...self_player.hand, ...self_player.sideboard]

  const [containerRef, { pool: poolDims, pack: packDims }] = useCardLayout({
    zones: {
      pool: { count: pool.length, maxCardWidth: 300, weight: 1 },
      pack: { count: currentPack.length, maxCardWidth: 400, weight: 2 },
    },
    layout: { top: ['pool'], bottomLeft: ['pack'] },
    fixedHeight: 65,
    padding: 24,
  })
  const appliedUpgradesList = self_player.upgrades.filter((u) => u.upgrade_target)
  const upgradedCardIds = new Set(appliedUpgradesList.map((u) => u.upgrade_target!.id))
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgradesList.filter((u) => u.upgrade_target!.id === cardId)

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.card')) {
      setSelectedCard(null)
    }
  }, [])

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
    <div ref={containerRef} className="bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col h-full" onClick={handleBackgroundClick}>
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: 1 }}>
        {/* Pool */}
        <div className="bg-black/30 px-3 pt-5 pb-3 relative">
          <span className={badgeCls}>Pool</span>
          {pool.length === 0 ? (
            <div className="flex items-center justify-center">
              <div className="text-gray-500 text-sm text-center">
                Swap cards from the pack to build your pool
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${poolDims.columns}, ${poolDims.width}px)`,
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
                    dimensions={poolDims}
                    upgraded={upgradedCardIds.has(card.id)}
                    appliedUpgrades={getAppliedUpgrades(card.id)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Pack */}
        <div className="bg-black/30 px-3 pt-5 pb-3 relative flex-1">
          {isMobile && (
            <>
              <div className="absolute bottom-2 left-2 pointer-events-none z-10">
                <div className="relative">
                  <img src={TREASURE_TOKEN_IMAGE} alt="Treasure" className="h-12 rounded-sm shadow-lg" />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-amber-400 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {self_player.treasures}
                  </span>
                </div>
              </div>
              <div className="absolute bottom-2 right-2 pointer-events-none z-10">
                <div className="relative">
                  <img src={POISON_COUNTER_IMAGE} alt="Poison" className="h-12 rounded-sm shadow-lg" />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-purple-400 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {self_player.poison}
                  </span>
                </div>
              </div>
            </>
          )}
          <span className={badgeCls}>Pack</span>
          {currentPack.length === 0 ? (
            <div className="text-center">
              <div className="text-gray-400 text-sm">No pack available</div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${packDims.columns}, ${packDims.width}px)`,
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
                  dimensions={packDims}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

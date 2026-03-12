import { useState, useCallback, useRef } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { useCardLayout } from '../../hooks/useCardLayout'
import { ZoneDivider } from '../../components/common/ZoneDivider'
import { LayoutResetControl } from '../../components/common/LayoutResetControl'
import { ZoneLabel } from '../../components/common/ZoneLabel'
import { usePersistedConstraints } from '../../hooks/usePersistedConstraints'
import { useZoneDividers } from '../../hooks/useZoneDividers'
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
  const packZoneRef = useRef<HTMLDivElement | null>(null)
  const poolZoneRef = useRef<HTMLDivElement | null>(null)

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const pool = [...self_player.hand, ...self_player.sideboard]

  const {
    constraints,
    setConstraints,
    clearConstraints,
    resolution: persistedLayout,
  } = usePersistedConstraints({
    scopeKey: 'phase:draft',
    stage: self_player.stage,
    round: self_player.round,
  })

  const draftDefaultLayoutConfig = {
    zones: {
      pool: { count: pool.length, maxCardWidth: 300 },
      pack: { count: currentPack.length, maxCardWidth: 400 },
    },
    layout: { top: ['pack'], bottomLeft: ['pool'] },
    fixedHeight: 65,
    padding: 24,
  }

  const draftConstrainedLayoutConfig = {
    zones: draftDefaultLayoutConfig.zones,
    layout: draftDefaultLayoutConfig.layout,
    sectionPadH: 12,
    sectionPadTop: 20,
    sectionPadBottom: 12,
    sectionGap: 2,
  }

  const activeLayoutConfig = constraints
    ? draftConstrainedLayoutConfig
    : draftDefaultLayoutConfig

  const [containerRef, { pool: poolDims, pack: packDims }, containerSize, zoneFrames] = useCardLayout({
    ...activeLayoutConfig,
    constraints,
  })

  const packStyle = zoneFrames?.pack
    ? { height: zoneFrames.pack.outerHeight, flex: '0 0 auto' as const }
    : undefined
  const poolStyle = zoneFrames?.pool
    ? { minHeight: zoneFrames.pool.outerHeight, flex: '1 1 auto' as const }
    : undefined

  const dividerCallbacks = useZoneDividers({
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    currentLayout: { pool: poolDims, pack: packDims },
    layoutConfig: activeLayoutConfig,
    allowHorizontalResize: !isMobile,
    measureInitialConstraints: () => {
      const packOuter = packZoneRef.current?.getBoundingClientRect().height ?? 0
      const poolOuter = poolZoneRef.current?.getBoundingClientRect().height ?? 0
      const usableH = packOuter + poolOuter

      return usableH > 0
        ? {
            topFraction: packOuter / usableH,
            leftFraction: 0.7,
            bottomLeftSplit: 0.5,
            usableHeight: usableH,
            usableWidth: containerSize.width,
          }
        : null
    },
    constraints,
    onConstraintsChange: setConstraints,
    onConstraintsClear: clearConstraints,
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
    <div ref={containerRef} className="relative zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col h-full" onClick={handleBackgroundClick}>
      {persistedLayout.canReset && (
        <LayoutResetControl
          phaseLabel="Draft"
          currentStage={self_player.stage}
          currentRound={self_player.round}
          originStage={persistedLayout.originStage}
          originRound={persistedLayout.originRound}
          isInherited={persistedLayout.source === 'inherited'}
          onConfirm={clearConstraints}
          position={isMobile ? 'bottom-right' : 'top-right'}
        />
      )}
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: dividerCallbacks.topDivider ? 0 : 2 }}>
        {/* Pack */}
        <div
          ref={packZoneRef}
          className="zone-pack w-full px-3 pt-5 pb-3 relative flex flex-col min-h-0"
          style={packStyle}
          data-guide-target="draft-pack"
        >
          <div className="absolute top-0 left-0 pointer-events-none z-10">
            <div
              className="relative draft-token-frame draft-token-frame--treasure"
              data-guide-target="draft-mobile-treasure"
            >
              <img
                src={TREASURE_TOKEN_IMAGE}
                alt="Treasure"
                className="h-[56px] sm:h-[84px] block shadow-lg"
                style={{ borderRadius: 'var(--card-border-radius)' }}
              />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-amber-400 text-xs sm:text-sm font-bold px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
                {self_player.treasures}
              </span>
            </div>
          </div>
          <div className="absolute top-0 right-0 pointer-events-none z-10">
            <div className="relative draft-token-frame draft-token-frame--poison">
              <img
                src={POISON_COUNTER_IMAGE}
                alt="Poison"
                className="h-[56px] sm:h-[84px] block shadow-lg"
                style={{ borderRadius: 'var(--card-border-radius)' }}
              />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-purple-400 text-xs sm:text-sm font-bold px-1.5 sm:px-2 py-0.5 rounded-full leading-none">
                {self_player.poison}
              </span>
            </div>
          </div>
          <ZoneLabel>Pack</ZoneLabel>
          <div className="flex-1 min-h-0 overflow-auto">
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

        {dividerCallbacks.topDivider && (
          <ZoneDivider
            orientation="horizontal"
            interactive={!isMobile}
            {...dividerCallbacks.topDivider}
          />
        )}

        {/* Pool */}
        <div
          ref={poolZoneRef}
          className={`zone-sideboard w-full px-3 pt-5 pb-3 relative flex flex-col min-h-0 ${zoneFrames ? '' : 'flex-1'}`}
          style={poolStyle}
          data-guide-target="draft-pool"
        >
          <ZoneLabel dragCallbacks={dividerCallbacks.topDivider}>
            Pool
          </ZoneLabel>
          <div className="flex-1 min-h-0 overflow-auto">
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
        </div>
      </div>
    </div>
  )
}

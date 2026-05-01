import { useState, useCallback } from 'react'
import { Card } from '../../components/card'
import type { GameState, Card as CardType, CardDestination } from '../../types'
import { LayoutResetControl } from '../../components/common/LayoutResetControl'
import { UpgradeGrid } from '../../components/common/UpgradeGrid'
import { ZoneLayout } from '../../components/common/ZoneLayout'
import { ZONE_LAYOUT_PADDING } from '../../hooks/useCardLayout'
import { usePersistedConstraints } from '../../hooks/usePersistedConstraints'
import { useResizableLayout } from '../../hooks/useResizableLayout'
import { TREASURE_TOKEN_IMAGE, POISON_COUNTER_IMAGE } from '../../constants/assets'
import { getUpgradeGridColumns } from '../../utils/upgradeGrid'

interface DraftPhaseProps {
  gameState: GameState
  actions: {
    draftSwap: (packCardId: string, playerCardId: string, destination: CardDestination) => void
    draftRoll: () => void
    draftDone: () => void
  }
  isMobile?: boolean
  showDesktopUpgradeRail?: boolean
}

type SelectionZone = 'pack' | 'pool'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
  isInHand: boolean
}

export function DraftPhase({ gameState, actions, isMobile, showDesktopUpgradeRail = false }: DraftPhaseProps) {
  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)

  const { self_player } = gameState
  const currentPack = self_player.current_pack ?? []
  const pool = [...self_player.hand, ...self_player.sideboard]
  const hasDesktopUpgradeRail = showDesktopUpgradeRail && self_player.upgrades.length > 0

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

  const upgradeCount = hasDesktopUpgradeRail ? self_player.upgrades.length : 0
  const upgradeColumns = getUpgradeGridColumns(upgradeCount)
  const layoutConfig = {
    zones: {
      pool: { count: pool.length, maxCardWidth: 300 },
      pack: { count: currentPack.length, maxCardWidth: 400 },
      upgrades: {
        count: upgradeCount,
        maxCardWidth: 200,
        minColumns: upgradeColumns,
        maxColumns: upgradeColumns,
      },
    },
    layout: {
      top: ['pack'],
      bottomLeft: ['pool'],
      bottomRight: hasDesktopUpgradeRail ? ['upgrades'] : [],
    },
    ...ZONE_LAYOUT_PADDING,
  }

  const { containerRef, dims, zoneFrames, zoneRefs, dividerCallbacks } =
    useResizableLayout({
      layoutConfig,
      constraints,
      onConstraintsChange: setConstraints,
      onConstraintsClear: clearConstraints,
      allowHorizontalResize: !isMobile,
    })
  const packDims = dims.pack
  const poolDims = dims.pool
  const upgradesDims = dims.upgrades
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

  const packContent = (
    <div className="flex h-full min-h-0 flex-col">
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
  )

  const poolContent = (
    <div className="flex h-full min-h-0 flex-col">
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
  )

  // Anchored to the outer ZoneLayout container (via the `overlay` slot) so the
  // tokens sit at the page's bottom corners regardless of inner zone layout —
  // when the upgrade rail exists, the pool zone's right edge is in the middle
  // of the page, and we don't want poison to land there.
  const tokensOverlay = (
    <>
      <div className="absolute bottom-0 left-0 pointer-events-none z-20 flex">
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
      <div className="absolute bottom-0 right-0 pointer-events-none z-20 flex">
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
    </>
  )

  return (
    <ZoneLayout
      containerRef={containerRef}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      zoneHeights={{
        hand: zoneFrames.pack.outerHeight,
        sideboard: zoneFrames.pool.outerHeight,
        upgrades: hasDesktopUpgradeRail ? zoneFrames.upgrades.outerHeight : undefined,
      }}
      zoneWidths={hasDesktopUpgradeRail ? {
        upgrades: zoneFrames.upgrades.outerWidth,
      } : null}
      zoneRefs={{
        hand: zoneRefs.pack,
        sideboard: zoneRefs.pool,
        upgrades: zoneRefs.upgrades,
      }}
      overlay={
        <>
          {tokensOverlay}
          {persistedLayout.canReset ? (
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
          ) : null}
        </>
      }
      hasHand={true}
      hasBattlefield={false}
      hasSideboard={true}
      hasUpgrades={hasDesktopUpgradeRail}
      dividerCallbacks={dividerCallbacks}
      zoneTargetIds={{
        hand: 'draft-pack',
        sideboard: 'draft-pool',
      }}
      handLabel="Pack"
      handContent={packContent}
      battlefieldLabel={null}
      battlefieldContent={null}
      sideboardLabel="Pool"
      sideboardContent={poolContent}
      upgradesLabel="Upgrades"
      upgradesContent={
        hasDesktopUpgradeRail ? (
          <UpgradeGrid
            upgrades={self_player.upgrades}
            fallbackDims={{
              width: upgradesDims.width,
              height: upgradesDims.height,
              rows: upgradesDims.rows,
              columns: upgradesDims.columns,
            }}
            frame={zoneFrames.upgrades}
          />
        ) : null
      }
    />
  )
}

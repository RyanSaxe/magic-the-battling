import { useState, useCallback, useMemo } from 'react'
import type { Card as CardType } from '../../types'
import type { ZoneConstraints } from '../../hooks/computeConstrainedLayout'
import { Card } from '../card'
import { useResizableLayout } from '../../hooks/useResizableLayout'
import { BasicLandCard } from './BasicLandCard'
import { CardGrid } from './CardGrid'
import { LayoutResetControl } from './LayoutResetControl'
import { TreasureCard } from './TreasureCard'
import { PoisonCard } from './PoisonCard'
import { ZoneLayout } from './ZoneLayout'
import { badgeCls } from './ZoneLabel'
import { UpgradeGrid } from './UpgradeGrid'
import { deckLayoutConfig } from './deckLayout'
import { buildAppliedUpgradeMap, type UpgradeDisplayScope } from '../../utils/upgrades'

export interface DeckDisplayResizeState {
  constraints: ZoneConstraints | null
  setConstraints: (constraints: ZoneConstraints) => void
  clearConstraints: () => void
}

export type HiddenDeckZone = 'hand' | 'sideboard' | 'upgrades'

const NARROW_HIDDEN_ZONE_WIDTH = 200

function HiddenZonePill({ compact = false }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className={badgeCls}>{compact ? 'Hidden' : 'Hidden until game over'}</span>
    </div>
  )
}

interface DeckDisplayResetControl {
  phaseLabel: string
  currentStage: number
  currentRound: number
  message?: string
}

interface DeckDisplayProps {
  hand: CardType[]
  sideboard: CardType[]
  basics: string[]
  treasures: number
  poison: number
  upgrades: CardType[]
  companionIds: Set<string>
  className?: string
  enableResize?: boolean
  isMobile?: boolean
  layoutStateKey?: string
  resizeState?: DeckDisplayResizeState
  resetControl?: DeckDisplayResetControl
  upgradeDisplayScope?: UpgradeDisplayScope
  hiddenZones?: readonly HiddenDeckZone[]
}

export function DeckDisplay({
  hand,
  sideboard,
  basics,
  treasures,
  poison,
  upgrades,
  companionIds,
  className,
  enableResize = false,
  isMobile = false,
  layoutStateKey,
  resizeState,
  resetControl,
  upgradeDisplayScope = 'all_applied',
  hiddenZones = [],
}: DeckDisplayProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const localLayoutStateKey = layoutStateKey ?? '__default__'
  const [localConstraintState, setLocalConstraintState] = useState<{
    key: string
    constraints: ZoneConstraints | null
  }>({
    key: localLayoutStateKey,
    constraints: null,
  })
  const handleCardClick = useCallback((cardId: string) => {
    setSelectedCardId((prev) => prev === cardId ? null : cardId)
  }, [])
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.card')) {
      setSelectedCardId(null)
    }
  }, [])

  const handHidden = hiddenZones.includes('hand')
  const sideboardHidden = hiddenZones.includes('sideboard')
  const upgradesHidden = hiddenZones.includes('upgrades')
  // A hidden zone is laid out as if it held one card, so its size says nothing about what it holds.
  const handCount = handHidden ? 1 : hand.length
  const sideboardCount = sideboardHidden ? 1 : sideboard.length
  const battlefieldCount = basics.length + 2
  const commandZoneCount = upgradesHidden ? 1 : upgrades.length
  const { upgradedCardIds, appliedUpgradesByCardId } = useMemo(
    () => buildAppliedUpgradeMap(upgrades, upgradeDisplayScope),
    [upgradeDisplayScope, upgrades],
  )

  const hasHand = handCount > 0
  const hasSideboard = sideboardCount > 0
  const hasUpgrades = commandZoneCount > 0
  const localConstraints =
    localConstraintState.key === localLayoutStateKey
      ? localConstraintState.constraints
      : null
  const activeConstraints = resizeState?.constraints ?? localConstraints
  const clearLocalConstraints = useCallback(() => {
    setLocalConstraintState({ key: localLayoutStateKey, constraints: null })
  }, [localLayoutStateKey])
  const setLocalConstraints = useCallback((constraints: ZoneConstraints) => {
    setLocalConstraintState({ key: localLayoutStateKey, constraints })
  }, [localLayoutStateKey])
  const setConstraints = resizeState?.setConstraints ?? setLocalConstraints
  const clearConstraints = resizeState?.clearConstraints ?? clearLocalConstraints
  const showResetControl = enableResize && !!activeConstraints && !!resetControl

  const layoutConfig = useMemo(
    () => deckLayoutConfig({
      handCount,
      battlefieldCount,
      sideboardCount,
      upgradeCount: commandZoneCount,
    }),
    [battlefieldCount, commandZoneCount, handCount, sideboardCount],
  )

  const { containerRef, dims, zoneFrames, zoneRefs, dividerCallbacks } =
    useResizableLayout({
      layoutConfig,
      constraints: enableResize ? activeConstraints : null,
      onConstraintsChange: setConstraints,
      onConstraintsClear: clearConstraints,
    })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }
  const bfDims = { width: dims.battlefield.width, height: dims.battlefield.height }
  const czDims = {
    width: dims.commandZone.width,
    height: dims.commandZone.height,
    rows: dims.commandZone.rows,
    columns: dims.commandZone.columns,
  }

  return (
    <ZoneLayout
      containerRef={containerRef}
      className={className}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      zoneHeights={enableResize ? {
        hand: zoneFrames.hand.outerHeight,
        battlefield: zoneFrames.battlefield.outerHeight,
        sideboard: zoneFrames.sideboard.outerHeight,
        upgrades: zoneFrames.commandZone.outerHeight,
      } : null}
      zoneWidths={enableResize && hasUpgrades ? {
        upgrades: zoneFrames.commandZone.outerWidth,
      } : null}
      zoneRefs={enableResize ? {
        hand: zoneRefs.hand,
        battlefield: zoneRefs.battlefield,
        sideboard: zoneRefs.sideboard,
        upgrades: zoneRefs.commandZone,
      } : undefined}
      hasHand={hasHand}
      hasBattlefield={battlefieldCount > 0}
      hasSideboard={hasSideboard}
      hasUpgrades={hasUpgrades}
      dividerCallbacks={enableResize ? dividerCallbacks : null}
      overlay={showResetControl ? (
        <LayoutResetControl
          phaseLabel={resetControl.phaseLabel}
          currentStage={resetControl.currentStage}
          currentRound={resetControl.currentRound}
          originStage={null}
          originRound={null}
          isInherited={false}
          onConfirm={clearConstraints}
          position={isMobile ? 'bottom-right' : 'top-right'}
          message={resetControl.message}
        />
      ) : null}
      handLabel="Hand"
      handContent={handHidden ? <HiddenZonePill /> : (
        <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
          {hand.map((card) => (
            <Card
              key={card.id}
              card={card}
              dimensions={handDims}
              isCompanion={companionIds.has(card.id)}
              onClick={() => handleCardClick(card.id)}
              selected={selectedCardId === card.id}
              upgraded={upgradedCardIds.has(card.id)}
              appliedUpgrades={appliedUpgradesByCardId.get(card.id)}
            />
          ))}
        </CardGrid>
      )}
      battlefieldLabel="Battlefield"
      battlefieldContent={
        <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
          {basics.map((name, i) => (
            <BasicLandCard key={`${name}-${i}`} name={name} dimensions={bfDims} />
          ))}
          <TreasureCard count={treasures} dimensions={bfDims} />
          <PoisonCard count={poison} dimensions={bfDims} />
        </CardGrid>
      }
      sideboardLabel="Sideboard"
      sideboardContent={sideboardHidden ? <HiddenZonePill /> : (
        <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
          {sideboard.map((card) => (
            <Card
              key={card.id}
              card={card}
              dimensions={sideboardDims}
              isCompanion={companionIds.has(card.id)}
              onClick={() => handleCardClick(card.id)}
              selected={selectedCardId === card.id}
              upgraded={upgradedCardIds.has(card.id)}
              appliedUpgrades={appliedUpgradesByCardId.get(card.id)}
            />
          ))}
        </CardGrid>
      )}
      upgradesLabel="Upgrades"
      upgradesContent={upgradesHidden ? (
        <HiddenZonePill compact={zoneFrames.commandZone.outerWidth < NARROW_HIDDEN_ZONE_WIDTH} />
      ) : (
        <UpgradeGrid
          upgrades={upgrades}
          fallbackDims={czDims}
          frame={zoneFrames.commandZone}
        />
      )}
    />
  )
}

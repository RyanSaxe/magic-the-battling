import { useState, useCallback, useMemo, useRef } from 'react'
import type { Card as CardType } from '../../types'
import type { ZoneConstraints } from '../../hooks/computeConstrainedLayout'
import { Card } from '../card'
import { useCardLayout, ZONE_LAYOUT_PADDING } from '../../hooks/useCardLayout'
import { useZoneDividers } from '../../hooks/useZoneDividers'
import { BasicLandCard } from './BasicLandCard'
import { CardGrid } from './CardGrid'
import { LayoutResetControl } from './LayoutResetControl'
import { TreasureCard } from './TreasureCard'
import { PoisonCard } from './PoisonCard'
import { ZoneLayout } from './ZoneLayout'
import { UpgradeGrid } from './UpgradeGrid'
import { buildAppliedUpgradeMap, type UpgradeDisplayScope } from '../../utils/upgrades'

export interface DeckDisplayResizeState {
  constraints: ZoneConstraints | null
  setConstraints: (constraints: ZoneConstraints) => void
  clearConstraints: () => void
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
  const handZoneRef = useRef<HTMLDivElement | null>(null)
  const battlefieldZoneRef = useRef<HTMLDivElement | null>(null)
  const sideboardZoneRef = useRef<HTMLDivElement | null>(null)
  const upgradesZoneRef = useRef<HTMLDivElement | null>(null)

  const handleCardClick = useCallback((cardId: string) => {
    setSelectedCardId((prev) => prev === cardId ? null : cardId)
  }, [])
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.card')) {
      setSelectedCardId(null)
    }
  }, [])

  const battlefieldCount = basics.length + 2
  const commandZoneCount = upgrades.length
  const { upgradedCardIds, appliedUpgradesByCardId } = useMemo(
    () => buildAppliedUpgradeMap(upgrades, upgradeDisplayScope),
    [upgradeDisplayScope, upgrades],
  )

  const hasHand = hand.length > 0
  const hasSideboard = sideboard.length > 0
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

  const layoutConfig = useMemo(() => ({
    zones: {
      hand: { count: hasHand ? hand.length : 0 },
      battlefield: { count: battlefieldCount, priority: 'fill' as const, maxRows: 1 },
      sideboard: { count: sideboard.length },
      commandZone: { count: commandZoneCount },
    },
    layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
    ...ZONE_LAYOUT_PADDING,
  }), [battlefieldCount, commandZoneCount, hand.length, hasHand, sideboard.length])

  const [ref, dims, containerSize, zoneFrames] = useCardLayout({
    ...layoutConfig,
    constraints: enableResize ? activeConstraints : null,
  })

  const dividerCallbacks = useZoneDividers({
    containerHeight: containerSize.height,
    containerWidth: containerSize.width,
    currentLayout: dims,
    layoutConfig,
    measureInitialConstraints: enableResize
      ? () => {
          const handOuter = handZoneRef.current?.getBoundingClientRect().height ?? 0
          const battlefieldRect = battlefieldZoneRef.current?.getBoundingClientRect()
          const sideboardOuter = sideboardZoneRef.current?.getBoundingClientRect().height ?? 0
          const upgradesRect = upgradesZoneRef.current?.getBoundingClientRect()
          const battlefieldOuter = battlefieldRect?.height ?? 0
          const upgradesOuter = upgradesRect?.height ?? 0
          const battlefieldOuterWidth = battlefieldRect?.width ?? 0
          const upgradesOuterWidth = upgradesRect?.width ?? 0
          const sectionGap = ZONE_LAYOUT_PADDING.sectionGap
          const sectionPadV =
            ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom

          const bottomLeftOuter =
            battlefieldOuter + (hasSideboard ? sideboardOuter + sectionGap : 0)
          const bottomOuter = Math.max(bottomLeftOuter, upgradesOuter)
          const usableHeight = handOuter + bottomOuter
          const totalBottomWidth = battlefieldOuterWidth + (hasUpgrades ? upgradesOuterWidth + sectionGap : 0)
          const leftFraction =
            hasUpgrades && totalBottomWidth > sectionGap
              ? battlefieldOuterWidth / (totalBottomWidth - sectionGap)
              : 0.7

          let bottomLeftSplit = 0.5
          if (hasSideboard) {
            const battlefieldInner = Math.max(0, battlefieldOuter - sectionPadV)
            const sideboardInner = Math.max(0, sideboardOuter - sectionPadV)
            const totalInner = battlefieldInner + sideboardInner
            if (totalInner > 0) {
              bottomLeftSplit = battlefieldInner / totalInner
            }
          }

          return bottomOuter > 0
            ? {
                topFraction: usableHeight > 0 ? handOuter / usableHeight : 0,
                leftFraction,
                bottomLeftSplit,
                usableHeight,
                bottomInnerHeight: Math.max(
                  0,
                  bottomLeftOuter -
                    (hasSideboard ? sectionGap : 0) -
                    ((hasSideboard ? 2 : 1) * sectionPadV),
                ),
                usableWidth: totalBottomWidth > 0 ? totalBottomWidth : containerSize.width,
              }
            : null
        }
      : undefined,
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
      containerRef={ref}
      className={className}
      onClick={handleBackgroundClick}
      isMobile={isMobile}
      zoneHeights={enableResize && zoneFrames ? {
        hand: zoneFrames.hand.outerHeight,
        battlefield: zoneFrames.battlefield.outerHeight,
        sideboard: zoneFrames.sideboard.outerHeight,
        upgrades: zoneFrames.commandZone.outerHeight,
      } : null}
      zoneRefs={enableResize ? {
        hand: (node) => {
          handZoneRef.current = node
        },
        battlefield: (node) => {
          battlefieldZoneRef.current = node
        },
        sideboard: (node) => {
          sideboardZoneRef.current = node
        },
        upgrades: (node) => {
          upgradesZoneRef.current = node
        },
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
      handContent={
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
      }
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
      sideboardContent={
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
      }
      upgradesLabel="Upgrades"
      upgradesContent={
        <UpgradeGrid
          upgrades={upgrades}
          fallbackDims={czDims}
          frame={zoneFrames?.commandZone}
        />
      }
    />
  )
}

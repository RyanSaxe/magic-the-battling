import { useState, useCallback } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { useCardLayout, ZONE_LAYOUT_PADDING } from '../../hooks/useCardLayout'
import { BasicLandCard } from './BasicLandCard'
import { CardGrid } from './CardGrid'
import { TreasureCard } from './TreasureCard'
import { PoisonCard } from './PoisonCard'
import { ZoneLayout } from './ZoneLayout'

interface DeckDisplayProps {
  hand: CardType[]
  sideboard: CardType[]
  basics: string[]
  treasures: number
  poison: number
  upgrades: CardType[]
  companionIds: Set<string>
  className?: string
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
}: DeckDisplayProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
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

  const hasHand = hand.length > 0
  const hasSideboard = sideboard.length > 0

  const [ref, dims] = useCardLayout({
    zones: {
      hand: { count: hasHand ? hand.length : 0 },
      battlefield: { count: battlefieldCount, priority: 'fill', maxRows: 1 },
      sideboard: { count: sideboard.length },
      commandZone: { count: commandZoneCount },
    },
    layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
    ...ZONE_LAYOUT_PADDING,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }
  const bfDims = { width: dims.battlefield.width, height: dims.battlefield.height }
  const czDims = { width: dims.commandZone.width, height: dims.commandZone.height }

  return (
    <ZoneLayout
      containerRef={ref}
      className={className}
      onClick={handleBackgroundClick}
      hasHand={hasHand}
      hasBattlefield={battlefieldCount > 0}
      hasSideboard={hasSideboard}
      hasUpgrades={commandZoneCount > 0}
      handLabel="Hand"
      handContent={
        <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
          {hand.map((card) => (
            <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} onClick={() => handleCardClick(card.id)} selected={selectedCardId === card.id} />
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
            <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} onClick={() => handleCardClick(card.id)} selected={selectedCardId === card.id} />
          ))}
        </CardGrid>
      }
      upgradesLabel="Upgrades"
      upgradesContent={
        <CardGrid columns={dims.commandZone.columns} cardWidth={czDims.width}>
          {upgrades.map((upgrade) => (
            <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
          ))}
        </CardGrid>
      }
    />
  )
}

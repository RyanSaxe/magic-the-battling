import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'
import { BasicLandCard } from './BasicLandCard'
import { CardGrid } from './CardGrid'
import { TreasureCard } from './TreasureCard'
import { PoisonCard } from './PoisonCard'

const badgeCls =
  'absolute left-1/2 -translate-x-1/2 -top-[9px] z-10 ' +
  'bg-gray-800 text-gray-400 text-[10px] uppercase tracking-widest ' +
  'px-2.5 py-0.5 rounded-full border border-gray-600/40 whitespace-nowrap'

interface DeckDisplayProps {
  hand: CardType[]
  sideboard: CardType[]
  collapsedBasics: { name: string; count: number }[]
  treasures: number
  poison: number
  appliedUpgrades: CardType[]
  companionIds: Set<string>
}

export function DeckDisplay({
  hand,
  sideboard,
  collapsedBasics,
  treasures,
  poison,
  appliedUpgrades,
  companionIds,
}: DeckDisplayProps) {
  const battlefieldCount = collapsedBasics.length + 2
  const commandZoneCount = appliedUpgrades.length

  const hasHand = hand.length > 0
  const hasSideboard = sideboard.length > 0

  const [ref, dims] = useGameSummaryCardSize({
    handCount: hasHand ? hand.length : 0,
    sideboardCount: sideboard.length,
    battlefieldCount,
    commandZoneCount,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }
  const bfDims = { width: dims.battlefield.width, height: dims.battlefield.height }
  const czDims = { width: dims.commandZone.width, height: dims.commandZone.height }

  const hasBattlefield = battlefieldCount > 0
  const hasCommandZone = commandZoneCount > 0
  const hasLower = hasBattlefield || hasSideboard || hasCommandZone
  const hasRight = hasBattlefield || hasSideboard

  return (
    <div ref={ref} className="rounded-lg bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col">
      <div className="flex flex-col flex-1 min-h-0" style={{ gap: 1 }}>
        {hasHand && (
          <div className="bg-black/30 px-3 pt-5 pb-3 relative">
            <span className={badgeCls}>Hand</span>
            <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
              {hand.map((card) => (
                <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} />
              ))}
            </CardGrid>
          </div>
        )}
        {hasLower && (
          <div className="flex flex-1" style={{ gap: 1 }}>
            {hasRight && (
              <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
                {hasBattlefield && (
                  <div className="bg-black/30 px-3 pt-5 pb-3 relative">
                    <span className={badgeCls}>Battlefield</span>
                    <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
                      {collapsedBasics.map((land) => (
                        <BasicLandCard key={land.name} name={land.name} count={land.count} dimensions={bfDims} />
                      ))}
                      <TreasureCard count={treasures} dimensions={bfDims} />
                      <PoisonCard count={poison} dimensions={bfDims} />
                    </CardGrid>
                  </div>
                )}
                {hasSideboard && (
                  <div className="bg-black/30 px-3 pt-5 pb-3 relative flex-1">
                    <span className={badgeCls}>Sideboard</span>
                    <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                      {sideboard.map((card) => (
                        <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                      ))}
                    </CardGrid>
                  </div>
                )}
              </div>
            )}
            {hasCommandZone && (
              <div className="bg-black/30 px-3 pt-5 pb-3 relative flex items-center justify-center">
                <span className={badgeCls}>CMD</span>
                <div className="overflow-hidden">
                  <CardGrid columns={dims.commandZone.columns} cardWidth={czDims.width}>
                    {appliedUpgrades.map((upgrade) => (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
                    ))}
                  </CardGrid>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

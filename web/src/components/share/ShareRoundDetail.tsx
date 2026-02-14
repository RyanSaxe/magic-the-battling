import type { SharePlayerSnapshot } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { BasicLandCard, CardGrid, TreasureCard } from '../common'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'
import { collapseDuplicateBasics } from '../../utils/format'
import { POISON_COUNTER_IMAGE } from '../../constants/assets'

const badgeCls =
  'absolute left-1/2 -translate-x-1/2 -top-[9px] z-10 ' +
  'bg-gray-800 text-gray-400 text-[10px] uppercase tracking-widest ' +
  'px-2.5 py-0.5 rounded-full border border-gray-600/40 whitespace-nowrap'


interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
}

export function ShareRoundDetail({ snapshot, useUpgrades }: ShareRoundDetailProps) {
  const appliedUpgrades = useUpgrades ? snapshot.applied_upgrades.filter((u) => u.upgrade_target !== null) : []
  const hasHand = snapshot.hand.length > 0
  const hasSideboard = snapshot.sideboard.length > 0
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))

  const collapsedBasics = collapseDuplicateBasics(snapshot.basic_lands)
  const battlefieldCount = collapsedBasics.length + (snapshot.treasures > 0 ? 1 : 0)
  const commandZoneCount = appliedUpgrades.length

  const [ref, dims] = useGameSummaryCardSize({
    handCount: hasHand ? snapshot.hand.length : 0,
    sideboardCount: snapshot.sideboard.length,
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
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <img src={POISON_COUNTER_IMAGE} className="w-5 h-5 rounded-full" />
          <span className="text-sm text-gray-300">{snapshot.poison}/10</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div ref={ref} className="rounded-lg bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col">
          <div className="flex flex-col flex-1 min-h-0" style={{ gap: 1 }}>
            {hasHand && (
              <div className="bg-black/30 px-3 pt-5 pb-3 relative">
                <span className={badgeCls}>Hand</span>
                <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
                  {snapshot.hand.map((card) => (
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
                          {snapshot.treasures > 0 && (
                            <TreasureCard count={snapshot.treasures} dimensions={bfDims} />
                          )}
                        </CardGrid>
                      </div>
                    )}
                    {hasSideboard && (
                      <div className="bg-black/30 px-3 pt-5 pb-3 relative flex-1">
                        <span className={badgeCls}>Sideboard</span>
                        <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                          {snapshot.sideboard.map((card) => (
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
                    <CardGrid columns={dims.commandZone.columns} cardWidth={czDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
                      ))}
                    </CardGrid>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

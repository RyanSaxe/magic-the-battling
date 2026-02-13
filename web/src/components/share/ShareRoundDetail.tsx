import type { SharePlayerSnapshot } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { BasicLandCard, CardGrid, LabeledDivider, TreasureCard } from '../common'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'
import { collapseDuplicateBasics } from '../../utils/format'
import { POISON_COUNTER_IMAGE } from '../../constants/assets'

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
  const hasMiddle = hasBattlefield || hasCommandZone

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <img src={POISON_COUNTER_IMAGE} className="w-5 h-5 rounded-full" />
          <span className="text-sm text-gray-300">{snapshot.poison}/10</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div ref={ref} className="bg-black/30 rounded-lg p-4 h-full overflow-hidden border border-gray-600/40">
          <div className="flex flex-col gap-2">
            {hasHand && (
              <div>
                <LabeledDivider label="Hand" />
                <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
                  {snapshot.hand.map((card) => (
                    <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} />
                  ))}
                </CardGrid>
              </div>
            )}
            {hasMiddle && (
              <div className="flex gap-4">
                {hasBattlefield && (
                  <div className={hasCommandZone ? 'flex-1 min-w-0' : 'w-full'}>
                    <LabeledDivider label="Battlefield" />
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
                {hasCommandZone && (
                  <div className={hasBattlefield ? 'flex-1 min-w-0' : 'w-full'}>
                    <LabeledDivider label="Command Zone" />
                    <CardGrid columns={dims.commandZone.columns} cardWidth={czDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
                      ))}
                    </CardGrid>
                  </div>
                )}
              </div>
            )}
            {hasSideboard && (
              <div>
                <LabeledDivider label="Sideboard" />
                <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                  {snapshot.sideboard.map((card) => (
                    <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                  ))}
                </CardGrid>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

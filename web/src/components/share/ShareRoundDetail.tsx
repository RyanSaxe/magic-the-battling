import type { SharePlayerSnapshot } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid, LabeledDivider, VerticalDivider, TreasureCard } from '../common'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'
import { BASIC_LAND_SYMBOLS, POISON_COUNTER_IMAGE } from '../../constants/assets'

interface ShareRoundDetailProps {
  snapshot: SharePlayerSnapshot
  useUpgrades: boolean
}

export function ShareRoundDetail({ snapshot, useUpgrades }: ShareRoundDetailProps) {
  const appliedUpgrades = useUpgrades ? snapshot.applied_upgrades.filter((u) => u.upgrade_target !== null) : []
  const hasHand = snapshot.hand.length > 0
  const hasSideboard = snapshot.sideboard.length > 0
  const companionIds = new Set(snapshot.command_zone.map((c) => c.id))
  const hasExtras = appliedUpgrades.length > 0 || snapshot.treasures > 0
  const extrasCount = appliedUpgrades.length + (snapshot.treasures > 0 ? 1 : 0)

  const [ref, dims] = useGameSummaryCardSize({
    handCount: hasHand ? snapshot.hand.length : 0,
    extrasCount: hasExtras ? extrasCount : 0,
    sideboardCount: snapshot.sideboard.length,
    hasExtras,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const extrasDims = { width: dims.extras.width, height: dims.extras.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <img src={POISON_COUNTER_IMAGE} className="w-5 h-5 rounded-full" />
          <span className="text-sm text-gray-300">{snapshot.poison}/10</span>
        </div>
        {snapshot.basic_lands.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-1">Basics:</span>
            {snapshot.basic_lands.map((land, i) => {
              const symbol = BASIC_LAND_SYMBOLS[land]
              return symbol ? (
                <img key={i} src={symbol} className="w-4 h-4" title={land} />
              ) : (
                <span key={i} className="text-xs text-gray-400">{land}</span>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <div ref={ref} className="bg-black/30 rounded-lg p-4 h-full overflow-hidden border border-gray-600/40">
          {dims.isVertical ? (
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
              {hasExtras && (
                <div>
                  <LabeledDivider label="Extras" />
                  <CardGrid columns={dims.extras.columns} cardWidth={extrasDims.width}>
                    {appliedUpgrades.map((upgrade) => (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={extrasDims} />
                    ))}
                    {snapshot.treasures > 0 && (
                      <TreasureCard count={snapshot.treasures} dimensions={extrasDims} />
                    )}
                  </CardGrid>
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
          ) : (
            <div className="flex h-full">
              <div className="flex-1 flex flex-col gap-2">
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
                {hasExtras && (
                  <div>
                    <LabeledDivider label="Extras" />
                    <CardGrid columns={dims.extras.columns} cardWidth={extrasDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={extrasDims} />
                      ))}
                      {snapshot.treasures > 0 && (
                        <TreasureCard count={snapshot.treasures} dimensions={extrasDims} />
                      )}
                    </CardGrid>
                  </div>
                )}
              </div>
              <VerticalDivider label="Sideboard" />
              <div className="flex-1 flex flex-col justify-center">
                {hasSideboard && (
                  <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                    {snapshot.sideboard.map((card) => (
                      <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </CardGrid>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { Card } from '../../components/card'
import { THE_VANQUISHER_IMAGE, TREASURE_TOKEN_IMAGE } from '../../constants/assets'
import type { GameState, Card as CardType } from '../../types'
import { useContainerCardSizes } from '../../hooks/useContainerCardSizes'
import { useCardLayout } from '../../hooks/useCardLayout'
import { useElementHeight } from '../../hooks/useElementHeight'
import { badgeCls } from '../../components/common/ZoneLayout'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardDone: (upgradeId?: string) => void
  }
  selectedUpgradeId: string | null
  onUpgradeSelect: (upgradeId: string | null) => void
  selectedPoolCardId: string | null
  onPoolCardSelect: (cardId: string | null) => void
}

const REWARD_COMPACT_DIMS = { width: 50, height: 70 }

function RewardCard({
  imageUrl,
  label,
  sublabel,
  compact,
  dimensions,
}: {
  imageUrl: string
  label: string
  sublabel?: string
  compact?: boolean
  dimensions?: { width: number; height: number }
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <img
          src={imageUrl}
          alt={label}
          className="object-cover shadow-lg shrink-0"
          style={{ width: REWARD_COMPACT_DIMS.width, height: REWARD_COMPACT_DIMS.height, borderRadius: 'var(--card-border-radius)' }}
        />
        <div>
          <div className="text-white text-sm font-medium">{label}</div>
          {sublabel && <div className="text-gray-400 text-xs">{sublabel}</div>}
        </div>
      </div>
    )
  }

  const dims = dimensions ?? { width: 143, height: 200 }

  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={imageUrl}
        alt={label}
        className="object-cover shadow-lg"
        style={{ width: dims.width, height: dims.height, borderRadius: 'var(--card-border-radius)' }}
      />
      <div className="text-center">
        <div className="text-white font-medium">{label}</div>
        {sublabel && <div className="text-gray-400 text-sm">{sublabel}</div>}
      </div>
    </div>
  )
}

export function RewardPhase({ gameState, selectedUpgradeId, onUpgradeSelect, selectedPoolCardId, onPoolCardSelect }: RewardPhaseProps) {
  const { self_player, available_upgrades } = gameState
  const { last_battle_result } = self_player
  const isStageIncreasing = self_player.is_stage_increasing
  const hasUpgradeSection = gameState.use_upgrades && isStageIncreasing && available_upgrades.length > 0
  const appliedUpgradesList = self_player.upgrades.filter((u) => u.upgrade_target)
  const upgradedCardIds = new Set(appliedUpgradesList.map((u) => u.upgrade_target!.id))
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgradesList.filter((u) => u.upgrade_target!.id === cardId)

  const rewardCount =
    (last_battle_result?.treasures_gained ? 1 : 0) +
    (last_battle_result?.vanquisher_gained ? 1 : 0) +
    (last_battle_result?.card_gained ? 1 : 0)
  const [rewardRef, rewardCardDims] = useContainerCardSizes({
    cardCount: Math.max(rewardCount, 1),
    gap: 24,
    maxCardWidth: 300,
  })

  const poolCards = [...self_player.hand, ...self_player.sideboard]

  const [upgradeHeaderRef, upgradeHeaderHeight] = useElementHeight()
  const fixedHeight = upgradeHeaderHeight + 56

  const [dualRef, { upgrades: upgradeCardDims, pool: poolCardDims }] = useCardLayout({
    zones: {
      upgrades: { count: available_upgrades.length, maxCardWidth: 200 },
      pool: { count: poolCards.length, maxCardWidth: 180 },
    },
    layout: { top: ['upgrades'], bottomLeft: ['pool'] },
    fixedHeight,
  })

  const handleUpgradeClick = (upgrade: CardType) => {
    if (selectedUpgradeId === upgrade.id) {
      onUpgradeSelect(null)
    } else {
      onUpgradeSelect(upgrade.id)
    }
  }

  const isWinner = last_battle_result?.winner_name === self_player.name
  const isDraw = last_battle_result?.is_draw

  return (
    <div className={`flex flex-col h-full overflow-hidden ${hasUpgradeSection ? '' : 'gap-4 p-4'}`}>
      {/* Battle result header */}
      {last_battle_result && (
        <div className={`flex items-center justify-center gap-4 shrink-0 text-sm ${hasUpgradeSection ? 'px-4 pt-4' : ''}`}>
          {isDraw ? (
            <span className="text-yellow-400 font-bold">Draw</span>
          ) : isWinner ? (
            <span className="text-green-400 font-bold">Victory!</span>
          ) : (
            <span className="text-red-400 font-bold">Defeat</span>
          )}
          <span className="text-gray-500">vs {last_battle_result.opponent_name}</span>
          {last_battle_result.poison_dealt > 0 && (
            <span className="text-purple-400">Dealt {last_battle_result.poison_dealt} poison</span>
          )}
          {last_battle_result.poison_taken > 0 && (
            <span className="text-red-400">Took {last_battle_result.poison_taken} poison</span>
          )}
        </div>
      )}

      {/* Rewards */}
      {last_battle_result && (
        <div className={hasUpgradeSection ? 'shrink-0 px-4 mt-3' : 'flex-1 flex flex-col items-center justify-center'}>
          {!hasUpgradeSection && (
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-6">Your Rewards</div>
          )}
          <div ref={hasUpgradeSection ? undefined : rewardRef} className="flex justify-center gap-6 w-full">
            {last_battle_result.treasures_gained > 0 && (
              <RewardCard
                imageUrl={TREASURE_TOKEN_IMAGE}
                label={`+${last_battle_result.treasures_gained} Treasure`}
                compact={hasUpgradeSection}
                dimensions={hasUpgradeSection ? undefined : rewardCardDims}
              />
            )}
            {last_battle_result.vanquisher_gained && (
              <RewardCard
                imageUrl={THE_VANQUISHER_IMAGE}
                label="Vanquisher"
                sublabel="+1 Hand Size"
                compact={hasUpgradeSection}
                dimensions={hasUpgradeSection ? undefined : rewardCardDims}
              />
            )}
            {last_battle_result.card_gained && (
              hasUpgradeSection ? (
                <RewardCard
                  imageUrl={(last_battle_result.card_gained.png_url ?? last_battle_result.card_gained.image_url)!}
                  label={`New: ${last_battle_result.card_gained.name}`}
                  compact
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Card card={last_battle_result.card_gained} dimensions={rewardCardDims} />
                  <div className="text-center">
                    <div className="text-white font-medium">New Card</div>
                    <div className="text-gray-400 text-sm">{last_battle_result.card_gained.name}</div>
                  </div>
                </div>
              )
            )}
            {!last_battle_result.treasures_gained &&
              !last_battle_result.vanquisher_gained &&
              !last_battle_result.card_gained && (
                <div className="text-gray-500 text-center">No rewards this round</div>
              )}
          </div>
        </div>
      )}

      {/* Stage upgrade selection */}
      {hasUpgradeSection && (
        <div ref={dualRef} className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col mt-3">
          <div className="flex flex-col flex-1 min-h-0" style={{ gap: 2 }}>
            <div className="zone-upgrades px-3 pt-5 pb-3 relative shrink-0 flex flex-col">
              <span className={badgeCls}>Upgrades</span>
              <div ref={upgradeHeaderRef} className="text-center mb-2 shrink-0">
                <h3 className="text-lg font-bold text-amber-400">Stage Complete! Select an upgrade</h3>
              </div>
              <div className="shrink-0" style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${upgradeCardDims.columns}, ${upgradeCardDims.width}px)`,
                gap: '6px',
                justifyContent: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
              }}>
                {available_upgrades.map((upgrade) => (
                  <Card
                    key={upgrade.id}
                    card={upgrade}
                    dimensions={upgradeCardDims}
                    selected={selectedUpgradeId === upgrade.id}
                    onClick={() => handleUpgradeClick(upgrade)}
                  />
                ))}
              </div>
            </div>

            <div className="zone-sideboard px-3 pt-5 pb-3 relative flex-1 min-h-0 flex flex-col">
              <span className={badgeCls}>Pool</span>
              <div className="overflow-auto flex-1 min-h-0 p-1" style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${poolCardDims.columns}, ${poolCardDims.width}px)`,
                gap: '6px',
                justifyContent: 'center',
                alignContent: 'start',
                maxWidth: '100%',
              }}>
                {poolCards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    dimensions={poolCardDims}
                    upgraded={upgradedCardIds.has(card.id)}
                    appliedUpgrades={getAppliedUpgrades(card.id)}
                    selected={selectedPoolCardId === card.id}
                    onClick={() => onPoolCardSelect(selectedPoolCardId === card.id ? null : card.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

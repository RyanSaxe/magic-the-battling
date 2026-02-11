import { Card } from '../../components/card'
import { THE_VANQUISHER_IMAGE, TREASURE_TOKEN_IMAGE } from '../../constants/assets'
import type { GameState, Card as CardType } from '../../types'
import { useContainerCardSizes } from '../../hooks/useContainerCardSizes'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'
import { useElementHeight } from '../../hooks/useElementHeight'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardDone: (upgradeId?: string) => void
  }
  selectedUpgradeId: string | null
  onUpgradeSelect: (upgradeId: string | null) => void
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
          className="rounded object-cover shadow-lg shrink-0"
          style={{ width: REWARD_COMPACT_DIMS.width, height: REWARD_COMPACT_DIMS.height }}
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
        className="rounded-lg object-cover shadow-lg"
        style={{ width: dims.width, height: dims.height }}
      />
      <div className="text-center">
        <div className="text-white font-medium">{label}</div>
        {sublabel && <div className="text-gray-400 text-sm">{sublabel}</div>}
      </div>
    </div>
  )
}

export function RewardPhase({ gameState, selectedUpgradeId, onUpgradeSelect }: RewardPhaseProps) {
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
  const [poolLabelRef, poolLabelHeight] = useElementHeight()
  const fixedHeight = upgradeHeaderHeight + poolLabelHeight + 44

  const [dualRef, { top: upgradeCardDims, bottom: poolCardDims }] = useDualZoneCardSizes({
    topCount: available_upgrades.length,
    bottomCount: poolCards.length,
    topGap: 6,
    bottomGap: 6,
    fixedHeight,
    topMaxWidth: 200,
    bottomMaxWidth: 120,
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
    <div className="flex flex-col h-full gap-4 p-4 overflow-hidden">
      {/* Battle result header */}
      {last_battle_result && (
        <div className="flex items-center justify-center gap-4 shrink-0 text-sm">
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
        <div className={hasUpgradeSection ? 'shrink-0' : 'flex-1 flex flex-col items-center justify-center'}>
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
        <div ref={dualRef} className="flex-1 min-h-0 flex flex-col bg-amber-950/30 rounded-lg p-4 border-2 border-amber-500 overflow-hidden">
          <div ref={upgradeHeaderRef} className="text-center mb-3 shrink-0">
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

          {/* Pool reference panel */}
          <div className="mt-3 pt-3 border-t border-amber-500/30 flex-1 min-h-0 flex flex-col">
            <div ref={poolLabelRef} className="text-xs text-gray-400 uppercase tracking-wide mb-2 text-center shrink-0">
              Your Pool ({self_player.hand.length + self_player.sideboard.length} cards)
            </div>
            <div className="overflow-auto flex-1 min-h-0 p-1" style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${poolCardDims.columns}, ${poolCardDims.width}px)`,
              gap: '6px',
              justifyContent: 'center',
              alignContent: 'start',
              maxWidth: '100%',
            }}>
              {poolCards.map((card) => (
                <Card key={card.id} card={card} dimensions={poolCardDims} upgraded={upgradedCardIds.has(card.id)} appliedUpgrades={getAppliedUpgrades(card.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

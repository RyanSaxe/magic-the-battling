import { Card } from '../../components/card'
import { THE_VANQUISHER_IMAGE, TREASURE_TOKEN_IMAGE } from '../../constants/assets'
import type { GameState, Card as CardType } from '../../types'

interface RewardPhaseProps {
  gameState: GameState
  actions: {
    rewardPickUpgrade: (upgradeId: string) => void
    rewardDone: (upgradeId?: string) => void
  }
  selectedUpgradeId: string | null
  onUpgradeSelect: (upgradeId: string | null) => void
}

function RewardCard({
  imageUrl,
  label,
  sublabel,
}: {
  imageUrl: string
  label: string
  sublabel?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={imageUrl}
        alt={label}
        className="w-[200px] h-[280px] rounded-lg object-cover shadow-lg"
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

  const isWinner = last_battle_result?.winner_name === self_player.name

  const handleUpgradeClick = (upgrade: CardType) => {
    if (selectedUpgradeId === upgrade.id) {
      onUpgradeSelect(null)
    } else {
      onUpgradeSelect(upgrade.id)
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 p-4 overflow-auto">
      {/* Battle Results Header */}
      {last_battle_result && (
        <div className="text-center">
          <div className="text-gray-400 text-sm uppercase tracking-wide mb-2">
            Battle vs {last_battle_result.opponent_name}
          </div>
          {last_battle_result.is_draw ? (
            <div className="text-3xl font-bold text-yellow-400">Draw</div>
          ) : isWinner ? (
            <div className="text-3xl font-bold text-green-400">Victory!</div>
          ) : (
            <div className="text-3xl font-bold text-red-400">Defeat</div>
          )}
          {(last_battle_result.poison_dealt > 0 || last_battle_result.poison_taken > 0) && (
            <div className="flex justify-center gap-6 mt-2 text-sm">
              {last_battle_result.poison_dealt > 0 && (
                <span className="text-purple-400">
                  Dealt {last_battle_result.poison_dealt} poison
                </span>
              )}
              {last_battle_result.poison_taken > 0 && (
                <span className="text-red-400">Took {last_battle_result.poison_taken} poison</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rewards - shown as big cards */}
      {last_battle_result && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-6">Your Rewards</div>
          <div className="flex gap-8 justify-center flex-wrap">
            {last_battle_result.treasures_gained > 0 && (
              <RewardCard
                imageUrl={TREASURE_TOKEN_IMAGE}
                label={`+${last_battle_result.treasures_gained} Treasure`}
              />
            )}
            {last_battle_result.vanquisher_gained && (
              <RewardCard
                imageUrl={THE_VANQUISHER_IMAGE}
                label="Vanquisher"
                sublabel="+1 Hand Size"
              />
            )}
            {last_battle_result.card_gained && (
              <div className="flex flex-col items-center gap-2">
                <Card card={last_battle_result.card_gained} size="lg" />
                <div className="text-center">
                  <div className="text-white font-medium">New Card</div>
                  <div className="text-gray-400 text-sm">{last_battle_result.card_gained.name}</div>
                </div>
              </div>
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
      {isStageIncreasing && available_upgrades.length > 0 && (
        <div className="bg-amber-950/30 rounded-lg p-6 border-2 border-amber-500">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-amber-400 mb-2">Stage Complete!</h3>
            <p className="text-gray-400">Select an upgrade to claim as your vanquisher reward</p>
          </div>
          <div className="flex gap-6 justify-center flex-wrap">
            {available_upgrades.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                size="lg"
                selected={selectedUpgradeId === upgrade.id}
                onClick={() => handleUpgradeClick(upgrade)}
              />
            ))}
          </div>

          {/* Pool reference panel */}
          <div className="mt-6 pt-4 border-t border-amber-500/30">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-3 text-center">
              Your Pool ({self_player.hand.length + self_player.sideboard.length} cards)
            </div>
            <div className="flex flex-wrap gap-1 justify-center max-h-[200px] overflow-auto">
              {[...self_player.hand, ...self_player.sideboard].map((card) => (
                <Card key={card.id} card={card} size="sm" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

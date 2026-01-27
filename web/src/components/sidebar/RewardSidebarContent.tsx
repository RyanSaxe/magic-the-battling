import type { LastBattleResult, PlayerView } from '../../types'
import { PlayerList } from '../PlayerList'
import { ZoneDisplay } from './ZoneDisplay'
import { useContextStrip } from '../../contexts'

interface RewardSidebarContentProps {
  lastBattleResult: LastBattleResult
  playerName: string
  players: PlayerView[]
}

export function RewardSidebarContent({ lastBattleResult, playerName, players }: RewardSidebarContentProps) {
  const isWinner = lastBattleResult.winner_name === playerName
  const { state } = useContextStrip()

  const currentPlayer = players.find(p => p.name === playerName)
  const revealedPlayer = state.revealedPlayerName
    ? players.find(p => p.name === state.revealedPlayerName)
    : null
  const displayPlayer = revealedPlayer ?? currentPlayer

  const appliedUpgrades = displayPlayer?.upgrades.filter(u => u.upgrade_target !== null) ?? []
  const pendingUpgrades = currentPlayer?.upgrades.filter(u => u.upgrade_target === null) ?? []
  const isViewingSelf = displayPlayer?.name === currentPlayer?.name

  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades

  return (
    <div className="flex flex-col h-full">
      {/* Battle result */}
      <div className="p-4 border-b border-gray-700 text-center">
        <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">
          Battle vs {lastBattleResult.opponent_name}
        </div>
        {lastBattleResult.is_draw ? (
          <div className="text-2xl font-bold text-yellow-400">Draw</div>
        ) : isWinner ? (
          <div className="text-2xl font-bold text-green-400">Victory!</div>
        ) : (
          <div className="text-2xl font-bold text-red-400">Defeat</div>
        )}
        {(lastBattleResult.poison_dealt > 0 || lastBattleResult.poison_taken > 0) && (
          <div className="mt-2 text-sm space-y-1 text-center">
            {lastBattleResult.poison_dealt > 0 && (
              <div className="text-purple-400">
                You gave {lastBattleResult.poison_dealt} poison to {lastBattleResult.opponent_name}
              </div>
            )}
            {lastBattleResult.poison_taken > 0 && (
              <div className="text-red-400">
                {lastBattleResult.opponent_name} gave you {lastBattleResult.poison_taken} poison
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player list */}
      <div className="p-4 border-b border-gray-700">
        <PlayerList players={players} currentPlayerName={playerName} />
      </div>

      {/* Upgrades and revealed cards */}
      {displayPlayer && (
        <div className="p-4 overflow-auto flex-1">
          <h3 className="text-white font-medium mb-3">
            {isViewingSelf ? 'Your Cards' : `${displayPlayer.name}'s Cards`}
          </h3>
          <div className="flex flex-wrap gap-2">
            <ZoneDisplay title="Upgrades" cards={allUpgrades} maxThumbnails={6} showUpgradeTargets />
            <ZoneDisplay title="Revealed" cards={displayPlayer.most_recently_revealed_cards} maxThumbnails={6} />
          </div>
          {allUpgrades.length === 0 && displayPlayer.most_recently_revealed_cards.length === 0 && (
            <div className="text-gray-500 text-sm">No cards to display</div>
          )}
        </div>
      )}
    </div>
  )
}

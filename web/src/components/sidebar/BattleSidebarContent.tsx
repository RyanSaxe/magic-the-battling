import type { Card as CardType } from '../../types'
import { LifeCounter } from './LifeCounter'
import { PoisonDisplay } from './PoisonDisplay'
import { SidebarPile } from './SidebarPile'
import { UpgradeDisplay } from './UpgradeDisplay'

interface PlayerBattleState {
  name: string
  poison: number
  graveyard: CardType[]
  exile: CardType[]
  upgrades: CardType[]
}

interface BattleSidebarContentProps {
  opponent: PlayerBattleState
  self: PlayerBattleState
}

function PlayerSection({
  player,
  isOpponent,
}: {
  player: PlayerBattleState
  isOpponent: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide">
        {isOpponent ? player.name : 'You'}
      </div>

      <LifeCounter label="Life" />

      <div className="bg-black/30 rounded-lg p-3">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
          Poison
        </div>
        <PoisonDisplay count={player.poison} />
      </div>

      <div className="flex gap-2">
        <SidebarPile
          label="GY"
          cards={player.graveyard}
          bgColor="bg-red-950/40"
        />
        <SidebarPile
          label="Exile"
          cards={player.exile}
          bgColor="bg-purple-950/40"
        />
      </div>

      {player.upgrades.length > 0 && (
        <UpgradeDisplay upgrades={player.upgrades} />
      )}
    </div>
  )
}

export function BattleSidebarContent({
  opponent,
  self,
}: BattleSidebarContentProps) {
  return (
    <div className="space-y-6 mt-4">
      <PlayerSection player={opponent} isOpponent />
      <div className="border-t border-gray-700/50" />
      <PlayerSection player={self} isOpponent={false} />
    </div>
  )
}

import { useState } from 'react'
import type { SelfPlayerView } from '../types'
import { DeckDisplay } from './common'

interface GameSummaryProps {
  player: SelfPlayerView
  useUpgrades?: boolean
  compact?: boolean
}

export function GameSummary({
  player,
  useUpgrades = true,
  compact = false,
}: GameSummaryProps) {
  const [frozenPlayer] = useState(() => ({
    hand: [...player.hand],
    sideboard: [...player.sideboard],
    upgrades: [...player.upgrades],
    command_zone: [...player.command_zone],
    chosen_basics: [...player.chosen_basics],
    stage: player.stage,
    round: player.round,
    name: player.name,
    preBattleTreasures: player.last_battle_result?.pre_battle_treasures ?? 0,
    poison: player.poison,
  }))

  const upgrades = useUpgrades ? frozenPlayer.upgrades : []
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))

  return (
    <div className="flex-1 flex flex-col items-center min-h-0">
      <div className="w-full flex-1 min-h-0 flex flex-col">
        <DeckDisplay
          hand={frozenPlayer.hand}
          sideboard={frozenPlayer.sideboard}
          basics={frozenPlayer.chosen_basics}
          treasures={frozenPlayer.preBattleTreasures}
          poison={frozenPlayer.poison}
          upgrades={upgrades}
          companionIds={companionIds}
          className={compact ? 'zone-divider-bg p-[1px] flex-1 min-h-0 flex flex-col' : undefined}
        />
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { DeckDisplay } from './common'
import { getOrdinal } from '../utils/format'
import { ShareModal } from './ShareModal'

interface GameSummaryProps {
  player: SelfPlayerView
  players: PlayerView[]
  useUpgrades?: boolean
  gameId?: string
  compact?: boolean
}

export function GameSummary({
  player,
  players,
  useUpgrades = true,
  gameId,
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

  const selfPlayer = players.find((p) => p.name === frozenPlayer.name)
  const displayPlacement = selfPlayer?.placement ?? 0
  const isWinner = displayPlacement === 1

  const placementText = getOrdinal(displayPlacement)
  const placementColor = isWinner ? 'text-amber-400' : 'text-gray-300'

  const appliedUpgrades = useUpgrades ? frozenPlayer.upgrades.filter((u) => u.upgrade_target !== null) : []
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))
  const [shareOpen, setShareOpen] = useState(false)

  const shareUrl = gameId
    ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(frozenPlayer.name)}`
    : ''
  const shareText = isWinner
    ? 'Just won a game of Magic: The Battling! Check out the game:'
    : `Just finished ${placementText} in Magic: The Battling! Check out the game:`

  return (
    <div className={`flex-1 flex flex-col items-center min-h-0 ${compact ? '' : 'p-4'}`}>
      {gameId && (
        <div className="shrink-0 text-center mb-3">
          <div className="flex items-center justify-center gap-3">
            <h2 className={`text-4xl font-bold ${placementColor}`}>
              {placementText} Place
            </h2>
            <button
              className="text-xs font-medium rounded-full px-4 py-1.5 transition-colors duration-200 bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-400/30 cursor-pointer"
              onClick={() => setShareOpen(true)}
            >
              Share Game
            </button>
          </div>
        </div>
      )}

      <div className={`w-full flex-1 min-h-0 flex flex-col ${compact ? '' : 'pt-2 max-w-5xl'}`}>
        <DeckDisplay
          hand={frozenPlayer.hand}
          sideboard={frozenPlayer.sideboard}
          basics={frozenPlayer.chosen_basics}
          treasures={frozenPlayer.preBattleTreasures}
          poison={frozenPlayer.poison}
          appliedUpgrades={appliedUpgrades}
          companionIds={companionIds}
          className={compact ? 'bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col' : undefined}
        />
      </div>

      {shareOpen && (
        <ShareModal url={shareUrl} shareText={shareText} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}

import { useState, useCallback } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { DeckDisplay } from './common'
import { getOrdinal } from '../utils/format'

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
  const [copied, setCopied] = useState(false)
  const handleShare = useCallback(async () => {
    if (!gameId) return
    const url = `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(frozenPlayer.name)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [gameId, frozenPlayer.name])

  return (
    <div className={`flex-1 flex flex-col items-center overflow-hidden ${compact ? '' : 'p-4'}`}>
      {gameId && (
        <div className="shrink-0 text-center mb-3">
          <div className="flex items-center justify-center gap-3">
            <h2 className={`text-4xl font-bold ${placementColor}`}>
              {placementText} Place
            </h2>
            <button
              className={`text-xs font-medium rounded-full px-4 py-1.5 transition-colors duration-200 ${
                copied
                  ? 'bg-emerald-600/80 text-emerald-100 border border-emerald-400/30'
                  : 'bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-400/30'
              }`}
              onClick={handleShare}
            >
              {copied ? 'Link Copied!' : 'Share Game'}
            </button>
          </div>
        </div>
      )}

      <div className={`w-full flex-1 min-h-0 flex flex-col ${compact ? '' : 'max-w-5xl'}`}>
        <DeckDisplay
          hand={frozenPlayer.hand}
          sideboard={frozenPlayer.sideboard}
          basics={frozenPlayer.chosen_basics}
          treasures={frozenPlayer.preBattleTreasures}
          poison={frozenPlayer.poison}
          appliedUpgrades={appliedUpgrades}
          companionIds={companionIds}
        />
      </div>
    </div>
  )
}

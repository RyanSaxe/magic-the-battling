import { useState, useCallback } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'
import { useGameSummaryCardSize } from '../hooks/useGameSummaryCardSize'
import { BasicLandCard, CardGrid, TreasureCard } from './common'
import { getOrdinal, collapseDuplicateBasics } from '../utils/format'

const badgeCls =
  'absolute left-1/2 -translate-x-1/2 -top-[9px] z-10 ' +
  'bg-gray-800 text-gray-400 text-[10px] uppercase tracking-widest ' +
  'px-2.5 py-0.5 rounded-full border border-gray-600/40 whitespace-nowrap'


interface GameSummaryProps {
  player: SelfPlayerView
  players: PlayerView[]
  useUpgrades?: boolean
  gameId?: string
}

export function GameSummary({
  player,
  players,
  useUpgrades = true,
  gameId,
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
  }))

  const selfPlayer = players.find((p) => p.name === frozenPlayer.name)
  const displayPlacement = selfPlayer?.placement ?? 0
  const isWinner = displayPlacement === 1

  const placementText = getOrdinal(displayPlacement)
  const placementColor = isWinner ? 'text-amber-400' : 'text-gray-300'

  const appliedUpgrades = useUpgrades ? frozenPlayer.upgrades.filter((u) => u.upgrade_target !== null) : []
  const hasHand = frozenPlayer.hand.length > 0
  const hasSideboard = frozenPlayer.sideboard.length > 0
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))
  const preBattleTreasures = frozenPlayer.preBattleTreasures

  const collapsedBasics = collapseDuplicateBasics(frozenPlayer.chosen_basics)
  const battlefieldCount = collapsedBasics.length + (preBattleTreasures > 0 ? 1 : 0)
  const commandZoneCount = appliedUpgrades.length

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

  const [ref, dims] = useGameSummaryCardSize({
    handCount: hasHand ? frozenPlayer.hand.length : 0,
    sideboardCount: frozenPlayer.sideboard.length,
    battlefieldCount,
    commandZoneCount,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }
  const bfDims = { width: dims.battlefield.width, height: dims.battlefield.height }
  const czDims = { width: dims.commandZone.width, height: dims.commandZone.height }

  const hasBattlefield = battlefieldCount > 0
  const hasCommandZone = commandZoneCount > 0
  const hasLower = hasBattlefield || hasSideboard || hasCommandZone
  const hasRight = hasBattlefield || hasSideboard

  return (
    <div className="flex-1 flex flex-col items-center p-4 overflow-hidden">
      <div className="shrink-0 text-center">
        <div className="flex items-center justify-center gap-3">
          <h2 className={`text-4xl font-bold ${placementColor}`}>
            {placementText} Place
          </h2>
          {gameId && (
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
          )}
        </div>
        <p className="text-gray-400 text-sm mt-1 mb-3">
          Stage {frozenPlayer.stage} &middot; Round {frozenPlayer.round} &middot; {players.length} Players
        </p>
      </div>

      <div className="max-w-5xl w-full flex-1 min-h-0 flex flex-col">
        <div ref={ref} className="rounded-lg bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col">
          <div className="flex flex-col flex-1 min-h-0" style={{ gap: 1 }}>
            {hasHand && (
              <div className="bg-black/30 px-3 pt-5 pb-3 relative">
                <span className={badgeCls}>Hand</span>
                <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
                  {frozenPlayer.hand.map((card) => (
                    <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} />
                  ))}
                </CardGrid>
              </div>
            )}
            {hasLower && (
              <div className="flex flex-1" style={{ gap: 1 }}>
                {hasRight && (
                  <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
                    {hasBattlefield && (
                      <div className="bg-black/30 px-3 pt-5 pb-3 relative">
                        <span className={badgeCls}>Battlefield</span>
                        <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
                          {collapsedBasics.map((land) => (
                            <BasicLandCard key={land.name} name={land.name} count={land.count} dimensions={bfDims} />
                          ))}
                          {preBattleTreasures > 0 && (
                            <TreasureCard count={preBattleTreasures} dimensions={bfDims} />
                          )}
                        </CardGrid>
                      </div>
                    )}
                    {hasSideboard && (
                      <div className="bg-black/30 px-3 pt-5 pb-3 relative flex-1">
                        <span className={badgeCls}>Sideboard</span>
                        <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                          {frozenPlayer.sideboard.map((card) => (
                            <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                          ))}
                        </CardGrid>
                      </div>
                    )}
                  </div>
                )}
                {hasCommandZone && (
                  <div className="bg-black/30 px-3 pt-5 pb-3 relative flex items-center justify-center">
                    <span className={badgeCls}>CMD</span>
                    <CardGrid columns={1} cardWidth={czDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
                      ))}
                    </CardGrid>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

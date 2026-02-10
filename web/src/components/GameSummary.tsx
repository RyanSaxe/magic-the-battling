import { useState } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'
import { useGameSummaryCardSize } from '../hooks/useGameSummaryCardSize'

interface GameSummaryProps {
  player: SelfPlayerView
  players: PlayerView[]
  useUpgrades?: boolean
}

function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

export function GameSummary({
  player,
  players,
  useUpgrades = true,
}: GameSummaryProps) {
  const [frozenPlayer] = useState(() => ({
    hand: [...player.hand],
    sideboard: [...player.sideboard],
    upgrades: [...player.upgrades],
    command_zone: [...player.command_zone],
    stage: player.stage,
    round: player.round,
    name: player.name,
  }))

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.placement === 0 && b.placement === 0) {
      return a.poison - b.poison
    }
    if (a.placement === 0) return -1
    if (b.placement === 0) return 1
    return a.placement - b.placement
  })

  const displayPlacement = sortedPlayers.findIndex((p) => p.name === frozenPlayer.name) + 1
  const isWinner = displayPlacement === 1

  const placementText = getOrdinal(displayPlacement)
  const placementColor = isWinner ? 'text-amber-400' : 'text-gray-300'

  const appliedUpgrades = frozenPlayer.upgrades.filter((u) => u.upgrade_target !== null)
  const hasHand = frozenPlayer.hand.length > 0
  const hasUpgrades = useUpgrades && appliedUpgrades.length > 0
  const hasSideboard = frozenPlayer.sideboard.length > 0
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))

  const [ref, cardDims] = useGameSummaryCardSize({
    handCount: hasHand ? frozenPlayer.hand.length : 0,
    upgradeCount: hasUpgrades ? appliedUpgrades.length : 0,
    sideboardCount: frozenPlayer.sideboard.length,
  })

  const dims = { width: cardDims.width, height: cardDims.height }

  return (
    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
      <div className="text-center max-w-5xl w-full">
        <h2 className={`text-4xl font-bold mb-2 ${placementColor}`}>
          {placementText} Place
        </h2>
        <p className="text-gray-400 mb-6">
          Stage {frozenPlayer.stage} - Round {frozenPlayer.round} | {players.length} Players
        </p>

        <div ref={ref} className="bg-black/30 rounded-lg p-4">
          {cardDims.isNarrow ? (
            <div className="flex flex-col gap-2">
              {hasHand && (
                <div>
                  <h3 className="text-xs text-gray-400 mb-1">Hand</h3>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {frozenPlayer.hand.map((card) => (
                      <Card key={card.id} card={card} dimensions={dims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </div>
                </div>
              )}
              {hasUpgrades && (
                <div>
                  <h3 className="text-xs text-gray-400 mb-1">Upgrades</h3>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {appliedUpgrades.map((upgrade) => (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={dims} />
                    ))}
                  </div>
                </div>
              )}
              {hasSideboard && (
                <div>
                  <h3 className="text-xs text-gray-400 mb-1">Sideboard</h3>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {frozenPlayer.sideboard.map((card) => (
                      <Card key={card.id} card={card} dimensions={dims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-4">
              {(hasHand || hasUpgrades) && (
                <div className="flex-1 flex flex-col gap-2">
                  {hasHand && (
                    <div>
                      <h3 className="text-xs text-gray-400 mb-1">Hand</h3>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {frozenPlayer.hand.map((card) => (
                          <Card key={card.id} card={card} dimensions={dims} isCompanion={companionIds.has(card.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {hasUpgrades && (
                    <div>
                      <h3 className="text-xs text-gray-400 mb-1">Upgrades</h3>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {appliedUpgrades.map((upgrade) => (
                          <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={dims} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {hasSideboard && (
                <div className={hasHand || hasUpgrades ? 'flex-1' : 'w-full'}>
                  <h3 className="text-xs text-gray-400 mb-1">Sideboard</h3>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {frozenPlayer.sideboard.map((card) => (
                      <Card key={card.id} card={card} dimensions={dims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useCallback } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'
import { useGameSummaryCardSize } from '../hooks/useGameSummaryCardSize'
import { CardGrid, LabeledDivider, VerticalDivider, TreasureCard } from './common'
import { getOrdinal } from '../utils/format'

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
    stage: player.stage,
    round: player.round,
    name: player.name,
    preBattleTreasures: player.last_battle_result?.pre_battle_treasures ?? 0,
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

  const appliedUpgrades = useUpgrades ? frozenPlayer.upgrades.filter((u) => u.upgrade_target !== null) : []
  const hasHand = frozenPlayer.hand.length > 0
  const hasSideboard = frozenPlayer.sideboard.length > 0
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))
  const preBattleTreasures = frozenPlayer.preBattleTreasures
  const hasExtras = appliedUpgrades.length > 0 || preBattleTreasures > 0
  const extrasCount = appliedUpgrades.length + (preBattleTreasures > 0 ? 1 : 0)

  const [copied, setCopied] = useState(false)
  const handleShare = useCallback(() => {
    if (!gameId) return
    const url = `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(frozenPlayer.name)}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [gameId, frozenPlayer.name])

  const [ref, dims] = useGameSummaryCardSize({
    handCount: hasHand ? frozenPlayer.hand.length : 0,
    extrasCount: hasExtras ? extrasCount : 0,
    sideboardCount: frozenPlayer.sideboard.length,
    hasExtras,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const extrasDims = { width: dims.extras.width, height: dims.extras.height }
  const sideboardDims = { width: dims.sideboard.width, height: dims.sideboard.height }

  return (
    <div className="flex-1 flex flex-col items-center p-4 overflow-hidden">
      <div className="text-center shrink-0">
        <h2 className={`text-4xl font-bold mb-2 ${placementColor}`}>
          {placementText} Place
        </h2>
        <p className="text-gray-400 mb-2">
          Stage {frozenPlayer.stage} - Round {frozenPlayer.round} | {players.length} Players
        </p>
        {gameId && (
          <button
            className="text-xs bg-gray-800 border border-gray-600 text-gray-300 rounded px-3 py-1 hover:bg-gray-700 mb-4"
            onClick={handleShare}
          >
            {copied ? 'Link Copied!' : 'Share Game'}
          </button>
        )}
        {!gameId && <div className="mb-4" />}
      </div>

      <div className="max-w-5xl w-full flex-1 min-h-0">
        <div ref={ref} className="bg-black/30 rounded-lg p-4 h-full overflow-hidden border border-gray-600/40">
          {dims.isVertical ? (
            <div className="flex flex-col gap-2">
              {hasHand && (
                <div>
                  <LabeledDivider label="Hand" />
                  <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
                    {frozenPlayer.hand.map((card) => (
                      <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </CardGrid>
                </div>
              )}
              {hasExtras && (
                <div>
                  <LabeledDivider label="Extras" />
                  <CardGrid columns={dims.extras.columns} cardWidth={extrasDims.width}>
                    {appliedUpgrades.map((upgrade) => (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={extrasDims} />
                    ))}
                    {preBattleTreasures > 0 && (
                      <TreasureCard count={preBattleTreasures} dimensions={extrasDims} />
                    )}
                  </CardGrid>
                </div>
              )}
              {hasSideboard && (
                <div>
                  <LabeledDivider label="Sideboard" />
                  <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                    {frozenPlayer.sideboard.map((card) => (
                      <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </CardGrid>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full">
              <div className="flex-1 flex flex-col gap-2">
                {hasHand && (
                  <div>
                    <LabeledDivider label="Hand" />
                    <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
                      {frozenPlayer.hand.map((card) => (
                        <Card key={card.id} card={card} dimensions={handDims} isCompanion={companionIds.has(card.id)} />
                      ))}
                    </CardGrid>
                  </div>
                )}
                {hasExtras && (
                  <div>
                    <LabeledDivider label="Extras" />
                    <CardGrid columns={dims.extras.columns} cardWidth={extrasDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={extrasDims} />
                      ))}
                      {preBattleTreasures > 0 && (
                        <TreasureCard count={preBattleTreasures} dimensions={extrasDims} />
                      )}
                    </CardGrid>
                  </div>
                )}
              </div>
              <VerticalDivider label="Sideboard" />
              <div className="flex-1 flex flex-col justify-center">
                {hasSideboard && (
                  <CardGrid columns={dims.sideboard.columns} cardWidth={sideboardDims.width}>
                    {frozenPlayer.sideboard.map((card) => (
                      <Card key={card.id} card={card} dimensions={sideboardDims} isCompanion={companionIds.has(card.id)} />
                    ))}
                  </CardGrid>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

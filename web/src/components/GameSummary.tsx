import { useState, useCallback } from 'react'
import type { SelfPlayerView, PlayerView } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'
import { useGameSummaryCardSize } from '../hooks/useGameSummaryCardSize'
import { BasicLandCard, CardGrid, LabeledDivider, TreasureCard } from './common'
import { getOrdinal, collapseDuplicateBasics } from '../utils/format'

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
  const handleShare = useCallback(() => {
    if (!gameId) return
    const url = `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(frozenPlayer.name)}`
    navigator.clipboard.writeText(url)
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
  const hasMiddle = hasBattlefield || hasCommandZone

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
            {hasMiddle && (
              <div className="flex gap-4">
                {hasBattlefield && (
                  <div className={hasCommandZone ? 'flex-1 min-w-0' : 'w-full'}>
                    <LabeledDivider label="Battlefield" />
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
                {hasCommandZone && (
                  <div className={hasBattlefield ? 'flex-1 min-w-0' : 'w-full'}>
                    <LabeledDivider label="Command Zone" />
                    <CardGrid columns={dims.commandZone.columns} cardWidth={czDims.width}>
                      {appliedUpgrades.map((upgrade) => (
                        <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={czDims} />
                      ))}
                    </CardGrid>
                  </div>
                )}
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
        </div>
      </div>
    </div>
  )
}

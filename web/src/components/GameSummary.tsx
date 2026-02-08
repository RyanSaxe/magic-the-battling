import { useState } from 'react'
import type { SelfPlayerView, PlayerView, Card as CardType } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'
import { useContainerCardSizes } from '../hooks/useContainerCardSizes'

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

function CardGrid({ cards, title, maxCardWidth = 130, rows = 1, gap = 8, companionIds }: { cards: CardType[]; title: string; maxCardWidth?: number; rows?: number; gap?: number; companionIds?: Set<string> }) {
  const [ref, dims] = useContainerCardSizes({
    cardCount: cards.length,
    gap,
    maxCardWidth,
    rows,
  })

  if (cards.length === 0) return null

  return (
    <div className="bg-black/20 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-3">{title}</h3>
      <div ref={ref} className="flex flex-wrap gap-2 justify-center">
        {cards.map((card) => (
          <Card key={card.id} card={card} dimensions={dims} isCompanion={companionIds?.has(card.id)} />
        ))}
      </div>
    </div>
  )
}

function UpgradeGrid({ upgrades }: { upgrades: CardType[] }) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target !== null)
  const [ref, dims] = useContainerCardSizes({
    cardCount: appliedUpgrades.length,
    gap: 12,
    maxCardWidth: 120,
  })

  if (appliedUpgrades.length === 0) return null

  return (
    <div className="bg-black/20 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-3">Upgrades</h3>
      <div ref={ref} className="flex flex-wrap gap-3 justify-center">
        {appliedUpgrades.map((upgrade) => (
          <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={dims} />
        ))}
      </div>
    </div>
  )
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

  const hasHand = frozenPlayer.hand.length > 0
  const appliedUpgrades = frozenPlayer.upgrades.filter((u) => u.upgrade_target !== null)
  const hasUpgrades = useUpgrades && appliedUpgrades.length > 0
  const hasTopRow = hasHand || hasUpgrades
  const companionIds = new Set(frozenPlayer.command_zone.map((c) => c.id))

  return (
    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
      <div className="text-center max-w-5xl w-full">
        <h2 className={`text-4xl font-bold mb-2 ${placementColor}`}>
          {placementText} Place
        </h2>
        <p className="text-gray-400 mb-6">
          Stage {frozenPlayer.stage} - Round {frozenPlayer.round} | {players.length} Players
        </p>

        <div className="bg-black/30 rounded-lg p-6">
          {hasTopRow && (
            <div className={`grid gap-4 mb-4 ${hasHand && hasUpgrades ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <CardGrid cards={frozenPlayer.hand} title="Hand" companionIds={companionIds} />
              {useUpgrades && <UpgradeGrid upgrades={frozenPlayer.upgrades} />}
            </div>
          )}
          <CardGrid cards={frozenPlayer.sideboard} title="Sideboard" maxCardWidth={80} rows={3} companionIds={companionIds} />
        </div>
      </div>
    </div>
  )
}

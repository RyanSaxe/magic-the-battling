import { useState } from 'react'
import type { SelfPlayerView, PlayerView, Card as CardType } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'

interface GameSummaryProps {
  player: SelfPlayerView
  players: PlayerView[]
  onReturnHome: () => void
  useUpgrades?: boolean
  onRequestSpectate?: (targetPlayerName: string) => void
  spectateStatus?: 'idle' | 'waiting' | 'denied'
  spectateTarget?: string | null
}

function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

function CardGrid({ cards, title, size = 'md', companionIds }: { cards: CardType[]; title: string; size?: 'sm' | 'md' | 'lg'; companionIds?: Set<string> }) {
  if (cards.length === 0) return null

  return (
    <div className="bg-black/20 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2 justify-center">
        {cards.map((card) => (
          <Card key={card.id} card={card} size={size} isCompanion={companionIds?.has(card.id)} />
        ))}
      </div>
    </div>
  )
}

function UpgradeGrid({ upgrades }: { upgrades: CardType[] }) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target !== null)
  if (appliedUpgrades.length === 0) return null

  return (
    <div className="bg-black/20 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-3">Upgrades</h3>
      <div className="flex flex-wrap gap-3 justify-center">
        {appliedUpgrades.map((upgrade) => (
          <UpgradeStack key={upgrade.id} upgrade={upgrade} size="md" />
        ))}
      </div>
    </div>
  )
}

export function GameSummary({
  player,
  players,
  onReturnHome,
  useUpgrades = true,
  onRequestSpectate,
  spectateStatus = 'idle',
  spectateTarget,
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

  const spectateablePlayers = players.filter(
    (p) =>
      !p.is_bot &&
      p.phase !== 'eliminated' &&
      p.phase !== 'awaiting_elimination' &&
      p.phase !== 'winner' &&
      p.phase !== 'game_over' &&
      p.name !== player.name
  )

  return (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
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
          <CardGrid cards={frozenPlayer.sideboard} title="Sideboard" companionIds={companionIds} />
        </div>

        <button
          onClick={onReturnHome}
          className="btn btn-primary mt-6"
        >
          Return Home
        </button>

        {onRequestSpectate && spectateablePlayers.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            {spectateStatus === 'waiting' && (
              <div className="text-center">
                <div className="animate-spin w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-gray-300">Waiting for {spectateTarget} to respond...</p>
              </div>
            )}
            {spectateStatus === 'denied' && (
              <div className="text-center">
                <p className="text-red-400 mb-4">{spectateTarget} denied your request.</p>
                {spectateablePlayers.filter((p) => p.name !== spectateTarget).length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {spectateablePlayers
                      .filter((p) => p.name !== spectateTarget)
                      .map((p) => (
                        <button
                          key={p.name}
                          onClick={() => onRequestSpectate(p.name)}
                          className="btn btn-secondary"
                        >
                          Watch {p.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {spectateStatus === 'idle' && (
              <>
                <p className="text-gray-400 mb-3">Watch the rest of the game?</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {spectateablePlayers.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onRequestSpectate(p.name)}
                      className="btn btn-secondary"
                    >
                      Watch {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

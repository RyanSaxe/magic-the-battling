import type { SelfPlayerView, PlayerView, Card as CardType } from '../types'
import { Card } from './card'
import { UpgradeStack } from './sidebar/UpgradeStack'

interface GameSummaryProps {
  player: SelfPlayerView
  players: PlayerView[]
  onReturnHome: () => void
  useUpgrades?: boolean
}

function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

function CardGrid({ cards, title, size = 'md' }: { cards: CardType[]; title: string; size?: 'sm' | 'md' | 'lg' }) {
  if (cards.length === 0) return null

  return (
    <div className="bg-black/20 rounded-lg p-4">
      <h3 className="text-gray-400 text-sm mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2 justify-center">
        {cards.map((card) => (
          <Card key={card.id} card={card} size={size} />
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

export function GameSummary({ player, players, onReturnHome, useUpgrades = true }: GameSummaryProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.placement === 0 && b.placement === 0) {
      return a.poison - b.poison
    }
    if (a.placement === 0) return -1
    if (b.placement === 0) return 1
    return a.placement - b.placement
  })

  const displayPlacement = sortedPlayers.findIndex((p) => p.name === player.name) + 1
  const isWinner = displayPlacement === 1

  const placementText = getOrdinal(displayPlacement)
  const placementColor = isWinner ? 'text-amber-400' : 'text-gray-300'

  const hasHand = player.hand.length > 0
  const appliedUpgrades = player.upgrades.filter((u) => u.upgrade_target !== null)
  const hasUpgrades = useUpgrades && appliedUpgrades.length > 0
  const hasTopRow = hasHand || hasUpgrades

  return (
    <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
      <div className="text-center max-w-5xl w-full">
        <h2 className={`text-4xl font-bold mb-2 ${placementColor}`}>
          {placementText} Place
        </h2>
        <p className="text-gray-400 mb-6">
          Stage {player.stage} - Round {player.round} | {players.length} Players
        </p>

        <div className="bg-black/30 rounded-lg p-6">
          {hasTopRow && (
            <div className={`grid gap-4 mb-4 ${hasHand && hasUpgrades ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <CardGrid cards={player.hand} title="Hand" />
              {useUpgrades && <UpgradeGrid upgrades={player.upgrades} />}
            </div>
          )}
          <CardGrid cards={player.sideboard} title="Sideboard" />
        </div>

        <button
          onClick={onReturnHome}
          className="btn btn-primary mt-6"
        >
          Return Home
        </button>
      </div>
    </div>
  )
}

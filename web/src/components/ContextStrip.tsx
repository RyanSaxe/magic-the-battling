import { useContextStrip } from '../contexts'
import type { Card as CardType, PlayerView } from '../types'
import { Card } from './card'

interface ContextStripProps {
  upgrades: CardType[]
}

function CardPreview({ card }: { card: CardType }) {
  return (
    <div className="flex items-center gap-4 p-4">
      <img
        src={card.png_url ?? card.image_url}
        alt={card.name}
        className="h-48 rounded-lg shadow-lg"
      />
      <div className="flex flex-col gap-1">
        <div className="text-white font-medium text-lg">{card.name}</div>
        <div className="text-gray-400 text-sm">{card.type_line}</div>
      </div>
    </div>
  )
}

function RevealedCards({ player }: { player: PlayerView }) {
  const cards = player.most_recently_revealed_cards

  if (cards.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-400 text-sm">
          {player.name} has no revealed cards
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        {player.name}'s Revealed Cards
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {cards.map((card) => (
          <Card key={card.id} card={card} size="md" />
        ))}
      </div>
    </div>
  )
}

function UpgradesDisplay({ upgrades }: { upgrades: CardType[] }) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target)
  const unappliedUpgrades = upgrades.filter((u) => !u.upgrade_target)

  return (
    <div className="p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        Your Upgrades ({upgrades.length})
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {appliedUpgrades.map((upgrade) => (
          <div key={upgrade.id} className="relative">
            <Card card={upgrade} size="md" showUpgradeTarget />
          </div>
        ))}
        {unappliedUpgrades.map((upgrade) => (
          <div key={upgrade.id} className="relative opacity-60">
            <Card card={upgrade} size="md" />
            <div className="absolute bottom-1 left-1 right-1 text-center text-xs text-gray-400 bg-black/60 rounded px-1">
              Not applied
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ContextStrip({ upgrades }: ContextStripProps) {
  const { state } = useContextStrip()

  if (state.previewCard) {
    return (
      <div className="bg-black/40 border-t border-gray-700/50">
        <CardPreview card={state.previewCard} />
      </div>
    )
  }

  if (state.revealedPlayer) {
    return (
      <div className="bg-black/40 border-t border-gray-700/50">
        <RevealedCards player={state.revealedPlayer} />
      </div>
    )
  }

  if (upgrades.length > 0) {
    return (
      <div className="bg-black/40 border-t border-gray-700/50">
        <UpgradesDisplay upgrades={upgrades} />
      </div>
    )
  }

  return null
}

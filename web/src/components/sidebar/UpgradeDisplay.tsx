import type { Card as CardType } from '../../types'
import { Card } from '../card'

interface UpgradeDisplayProps {
  upgrades: CardType[]
  label?: string
}

export function UpgradeDisplay({ upgrades, label = 'Upgrades' }: UpgradeDisplayProps) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target)
  const unappliedUpgrades = upgrades.filter((u) => !u.upgrade_target)

  if (upgrades.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 uppercase tracking-wide">
        {label} ({upgrades.length})
      </div>
      <div className="flex flex-col gap-2">
        {appliedUpgrades.map((upgrade) => (
          <div
            key={upgrade.id}
            className="flex items-center gap-2 bg-purple-950/30 rounded p-1"
          >
            <Card card={upgrade} size="sm" showUpgradeTarget />
          </div>
        ))}
        {unappliedUpgrades.map((upgrade) => (
          <div
            key={upgrade.id}
            className="flex items-center gap-2 bg-gray-800/30 rounded p-1 opacity-60"
          >
            <Card card={upgrade} size="sm" />
            <span className="text-xs text-gray-400">Not applied</span>
          </div>
        ))}
      </div>
    </div>
  )
}

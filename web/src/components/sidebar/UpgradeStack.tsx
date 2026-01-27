import type { Card as CardType } from '../../types'
import { Card } from '../card'

interface UpgradeStackProps {
  upgrade: CardType
  size?: 'xs' | 'sm'
}

export function UpgradeStack({ upgrade, size = 'xs' }: UpgradeStackProps) {
  const target = upgrade.upgrade_target

  if (!target) {
    return <Card card={upgrade} size={size} />
  }

  const dimensions = size === 'xs' ? { width: 50, height: 70 } : { width: 80, height: 112 }
  const offset = size === 'xs' ? 16 : 24

  return (
    <div
      className="relative"
      style={{
        width: dimensions.width + offset,
        height: dimensions.height + offset,
      }}
    >
      <div className="absolute top-0 left-0">
        <Card card={target} size={size} />
      </div>
      <div
        className="absolute"
        style={{ bottom: 0, right: 0 }}
      >
        <Card card={upgrade} size={size} />
      </div>
    </div>
  )
}

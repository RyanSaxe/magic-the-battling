import type { Card as CardType } from '../../types'
import { Card } from '../card'

interface UpgradeStackProps {
  upgrade: CardType
  size?: 'xs' | 'sm' | 'md'
}

const DIMENSIONS = {
  xs: { width: 50, height: 70, offset: 16 },
  sm: { width: 80, height: 112, offset: 24 },
  md: { width: 120, height: 168, offset: 32 },
}

export function UpgradeStack({ upgrade, size = 'xs' }: UpgradeStackProps) {
  const target = upgrade.upgrade_target

  if (!target) {
    return <Card card={upgrade} size={size} />
  }

  const { width, height, offset } = DIMENSIONS[size]

  return (
    <div
      className="relative"
      style={{
        width: width + offset,
        height: height + offset,
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

import type { Card as CardType } from '../../types'
import { Card } from '../card'

interface UpgradeStackBaseProps {
  upgrade: CardType
  onClick?: () => void
  selected?: boolean
}

interface UpgradeStackSizeProps extends UpgradeStackBaseProps {
  size?: 'xs' | 'sm' | 'md'
  dimensions?: never
}

interface UpgradeStackDimensionsProps extends UpgradeStackBaseProps {
  dimensions: { width: number; height: number }
  size?: never
}

type UpgradeStackProps = UpgradeStackSizeProps | UpgradeStackDimensionsProps

const ASPECT_RATIO = 7 / 5

const DIMENSIONS = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
}

export function UpgradeStack({ upgrade, size, dimensions, onClick, selected }: UpgradeStackProps) {
  const target = upgrade.upgrade_target

  if (!target) {
    return dimensions
      ? <Card card={upgrade} dimensions={dimensions} onClick={onClick} selected={selected} />
      : <Card card={upgrade} size={size ?? 'xs'} onClick={onClick} selected={selected} />
  }

  const container = dimensions ?? DIMENSIONS[size ?? 'xs']
  const offset = Math.round(container.width * 0.2)
  const subWidth = container.width - offset
  const subHeight = Math.round(subWidth * ASPECT_RATIO)
  const subDims = { width: subWidth, height: subHeight }

  return (
    <div
      className="relative"
      style={{ width: container.width, height: container.height }}
      onClick={onClick}
    >
      <div className="absolute top-0 left-0">
        <Card card={target} dimensions={subDims} />
      </div>
      <div
        className="absolute"
        style={{ bottom: 0, right: 0 }}
      >
        <Card card={upgrade} dimensions={subDims} selected={selected} />
      </div>
    </div>
  )
}

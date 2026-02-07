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

const DIMENSIONS = {
  xs: { width: 50, height: 70, offset: 16 },
  sm: { width: 80, height: 112, offset: 24 },
  md: { width: 120, height: 168, offset: 32 },
}

export function UpgradeStack({ upgrade, size, dimensions, onClick, selected }: UpgradeStackProps) {
  const target = upgrade.upgrade_target

  if (!target) {
    return dimensions
      ? <Card card={upgrade} dimensions={dimensions} onClick={onClick} selected={selected} />
      : <Card card={upgrade} size={size ?? 'xs'} onClick={onClick} selected={selected} />
  }

  const resolved = dimensions
    ? { width: dimensions.width, height: dimensions.height, offset: Math.round(dimensions.width * 0.2) }
    : DIMENSIONS[size ?? 'xs']

  return (
    <div
      className="relative"
      style={{
        width: resolved.width + resolved.offset,
        height: resolved.height + resolved.offset,
      }}
      onClick={onClick}
    >
      <div className="absolute top-0 left-0">
        {dimensions
          ? <Card card={target} dimensions={dimensions} />
          : <Card card={target} size={size ?? 'xs'} />
        }
      </div>
      <div
        className="absolute"
        style={{ bottom: 0, right: 0 }}
      >
        {dimensions
          ? <Card card={upgrade} dimensions={dimensions} selected={selected} />
          : <Card card={upgrade} size={size ?? 'xs'} selected={selected} />
        }
      </div>
    </div>
  )
}

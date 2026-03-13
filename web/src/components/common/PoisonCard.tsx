import { POISON_COUNTER_IMAGE } from '../../constants/assets'
import { TokenCounterBadge } from './TokenCounterBadge'

interface PoisonCardProps {
  count: number
  dimensions: { width: number; height: number }
  className?: string
  badgeTextClassName?: string
  owner?: 'player' | 'opponent'
}

export function PoisonCard({
  count,
  dimensions,
  className = '',
  badgeTextClassName = 'text-purple-400',
  owner,
}: PoisonCardProps) {
  return (
    <div
      className={`relative overflow-hidden ${className}`.trim()}
      data-poison-owner={owner}
      style={{ width: dimensions.width, height: dimensions.height, borderRadius: 'var(--card-border-radius)' }}
    >
      <img src={POISON_COUNTER_IMAGE} alt="Poison" className="w-full h-full object-cover" />
      <TokenCounterBadge count={count} dimensions={dimensions} textClassName={badgeTextClassName} />
    </div>
  )
}

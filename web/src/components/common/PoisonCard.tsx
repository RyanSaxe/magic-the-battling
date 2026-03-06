import { POISON_COUNTER_IMAGE } from '../../constants/assets'
import { TokenCounterBadge } from './TokenCounterBadge'

export function PoisonCard({ count, dimensions }: { count: number; dimensions: { width: number; height: number } }) {
  return (
    <div className="relative overflow-hidden" style={{ width: dimensions.width, height: dimensions.height, borderRadius: 'var(--card-border-radius)' }}>
      <img src={POISON_COUNTER_IMAGE} alt="Poison" className="w-full h-full object-cover" />
      <TokenCounterBadge count={count} dimensions={dimensions} textClassName="text-purple-400" />
    </div>
  )
}

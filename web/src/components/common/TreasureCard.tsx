import { TREASURE_TOKEN_IMAGE } from '../../constants/assets'
import { TokenCounterBadge } from './TokenCounterBadge'

export function TreasureCard({ count, dimensions }: { count: number; dimensions: { width: number; height: number } }) {
  return (
    <div className="relative overflow-hidden" style={{ width: dimensions.width, height: dimensions.height, borderRadius: 'var(--card-border-radius)' }}>
      <img src={TREASURE_TOKEN_IMAGE} alt="Treasure" className="w-full h-full object-cover" />
      <TokenCounterBadge count={count} dimensions={dimensions} textClassName="text-amber-400" />
    </div>
  )
}

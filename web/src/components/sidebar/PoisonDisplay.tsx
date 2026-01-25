import { POISON_COUNTER_IMAGE } from '../../constants/assets'

interface PoisonDisplayProps {
  count: number
  maxPoison?: number
}

export function PoisonDisplay({ count, maxPoison = 10 }: PoisonDisplayProps) {
  const displayCount = Math.min(count, 5)
  const isLethal = count >= maxPoison

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {Array.from({ length: displayCount }).map((_, i) => (
          <img
            key={i}
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="w-6 h-8 rounded object-cover border border-purple-900"
          />
        ))}
      </div>
      <span className={`text-sm font-medium ${isLethal ? 'text-red-400' : 'text-purple-400'}`}>
        {count > displayCount ? `${count}` : count > 0 ? '' : '0'}
      </span>
    </div>
  )
}

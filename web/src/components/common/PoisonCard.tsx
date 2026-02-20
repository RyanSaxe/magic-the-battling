import { POISON_COUNTER_IMAGE } from '../../constants/assets'

export function PoisonCard({ count, dimensions }: { count: number; dimensions: { width: number; height: number } }) {
  return (
    <div className="relative overflow-hidden" style={{ width: dimensions.width, height: dimensions.height, borderRadius: 'var(--card-border-radius)' }}>
      <img src={POISON_COUNTER_IMAGE} className="w-full h-full object-cover" />
      <div className="absolute bottom-1 right-1 bg-black/70 text-purple-400 font-bold text-sm rounded-full w-6 h-6 flex items-center justify-center">
        {count}
      </div>
    </div>
  )
}

import { TREASURE_TOKEN_IMAGE } from '../../constants/assets'

export function TreasureCard({ count, dimensions }: { count: number; dimensions: { width: number; height: number } }) {
  return (
    <div className="relative rounded overflow-hidden" style={{ width: dimensions.width, height: dimensions.height }}>
      <img src={TREASURE_TOKEN_IMAGE} className="w-full h-full object-cover" />
      <div className="absolute bottom-1 right-1 bg-black/70 text-amber-400 font-bold text-sm rounded-full w-6 h-6 flex items-center justify-center">
        {count}
      </div>
    </div>
  )
}

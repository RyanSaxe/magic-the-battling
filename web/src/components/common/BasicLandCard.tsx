import { BASIC_LAND_IMAGES } from '../../constants/assets'

export function BasicLandCard({
  name,
  count,
  dimensions,
}: {
  name: string
  count: number
  dimensions: { width: number; height: number }
}) {
  const src = BASIC_LAND_IMAGES[name]
  if (!src) return null

  return (
    <div className="relative rounded overflow-hidden" style={{ width: dimensions.width, height: dimensions.height }}>
      <img src={src} className="w-full h-full object-cover" alt={name} />
      {count > 1 && (
        <div className="absolute bottom-1 right-1 bg-black/70 text-amber-400 font-bold text-sm rounded-full w-6 h-6 flex items-center justify-center">
          {count}
        </div>
      )}
    </div>
  )
}

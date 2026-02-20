import { BASIC_LAND_IMAGES } from '../../constants/assets'

export function BasicLandCard({
  name,
  dimensions,
}: {
  name: string
  dimensions: { width: number; height: number }
}) {
  const src = BASIC_LAND_IMAGES[name]
  if (!src) return null

  return (
    <div className="relative overflow-hidden" style={{ width: dimensions.width, height: dimensions.height, borderRadius: 'var(--card-border-radius)' }}>
      <img src={src} className="w-full h-full object-cover" alt={name} />
    </div>
  )
}

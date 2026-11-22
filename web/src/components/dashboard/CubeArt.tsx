// Scryfall's art_crop of a 2015-frame token keeps the black frame above its arched art. The URL doesn't name the
// frame, but each of its three layouts has a size of its own, and this much of it lies above the arch's ends.
const ARCH_DEPTH_BY_SIZE: Record<string, number> = { '630x550': 0.27, '627x685': 0.19, '627x448': 0.34 }

function archDepth(img: HTMLImageElement): number {
  return ARCH_DEPTH_BY_SIZE[`${img.naturalWidth}x${img.naturalHeight}`] ?? 0
}

function cropBelowArch(img: HTMLImageElement) {
  const depth = archDepth(img)
  img.style.top = depth ? 'auto' : ''
  img.style.height = depth ? `${100 / (1 - depth)}%` : ''
  img.style.objectPosition = depth ? `center ${depth * 100}%` : ''
}

/** A cube's art, filling the nearest positioned box, which clips it. */
export function CubeArt({ src, className = '', lazy = false }: { src: string; className?: string; lazy?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      loading={lazy ? 'lazy' : undefined}
      onLoad={(event) => cropBelowArch(event.currentTarget)}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  )
}

/** A cube's art across a band much wider than the art, which frames it on a point in the art below any arch. */
export function CubeBandArt({ src }: { src: string }) {
  return (
    <img
      key={src}
      src={src}
      alt=""
      onLoad={(event) => event.currentTarget.style.setProperty('--arch-depth', String(archDepth(event.currentTarget)))}
      className="cube-band-image"
    />
  )
}

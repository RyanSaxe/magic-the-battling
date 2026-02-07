import { useState, useEffect } from 'react'

export interface CardDimensions {
  width: number
  height: number
}

interface ViewportCardSizes {
  hand: CardDimensions
  battlefield: CardDimensions
  featured: CardDimensions
  pool: CardDimensions
  opponentHand: CardDimensions
  isMobile: boolean
}

function clampDims(vh: number, fraction: number, min: number, max: number): CardDimensions {
  const height = Math.round(Math.min(max, Math.max(min, vh * fraction)))
  const width = Math.round(height * 5 / 7)
  return { width, height }
}

function computeSizes(width: number, height: number): ViewportCardSizes {
  const isMobile = width < 640
  const scale = isMobile ? 0.6 : 1

  return {
    featured: clampDims(height, 0.22 * scale, 70, 250),
    pool: clampDims(height, 0.11 * scale, 50, 130),
    hand: clampDims(height, 0.14 * scale, 70, 182),
    battlefield: clampDims(height, 0.10 * scale, 50, 130),
    opponentHand: clampDims(height, 0.08 * scale, 50, 112),
    isMobile,
  }
}

export function useViewportCardSizes(): ViewportCardSizes {
  const [sizes, setSizes] = useState(() =>
    computeSizes(window.innerWidth, window.innerHeight)
  )

  useEffect(() => {
    const handleResize = () => {
      setSizes(computeSizes(window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return sizes
}

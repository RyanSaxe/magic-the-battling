import { useState, useEffect } from 'react'

export interface CardDimensions {
  width: number
  height: number
}

export const GAME_MOBILE_BREAKPOINT_PX = 1120

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

export function computeViewportCardSizes(width: number, height: number): ViewportCardSizes {
  const isMobile = width < GAME_MOBILE_BREAKPOINT_PX
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
    computeViewportCardSizes(window.innerWidth, window.innerHeight)
  )

  useEffect(() => {
    const handleResize = () => {
      setSizes(computeViewportCardSizes(window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return sizes
}

import { useState, useEffect } from 'react'

type CardSize = 'xs' | 'sm' | 'md' | 'lg'

interface ViewportCardSizes {
  hand: CardSize
  battlefield: CardSize
  featured: CardSize
  pool: CardSize
  opponentHand: CardSize
  isMobile: boolean
}

function computeSizes(width: number, height: number): ViewportCardSizes {
  if (width < 640) {
    return { hand: 'xs', battlefield: 'xs', featured: 'sm', pool: 'xs', opponentHand: 'xs', isMobile: true }
  }
  if (height >= 900) {
    return { hand: 'md', battlefield: 'sm', featured: 'lg', pool: 'md', opponentHand: 'sm', isMobile: false }
  }
  if (height >= 750) {
    return { hand: 'sm', battlefield: 'sm', featured: 'md', pool: 'sm', opponentHand: 'xs', isMobile: false }
  }
  return { hand: 'sm', battlefield: 'xs', featured: 'md', pool: 'sm', opponentHand: 'xs', isMobile: false }
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

import { useState, useCallback, useRef, useEffect } from 'react'

const CARD_ASPECT_RATIO = 7 / 5

interface DualZoneConfig {
  topCount: number
  bottomCount: number
  topGap?: number
  bottomGap?: number
  fixedHeight?: number
  topMaxWidth?: number
  bottomMaxWidth?: number
  minCardWidth?: number
}

interface ZoneDims {
  width: number
  height: number
  rows: number
}

interface DualZoneDims {
  top: ZoneDims
  bottom: ZoneDims
}

function bestFit(
  count: number,
  availWidth: number,
  availHeight: number,
  gap: number,
  maxWidth: number,
  minWidth: number
): ZoneDims {
  if (count === 0) {
    return { width: maxWidth, height: Math.round(maxWidth * CARD_ASPECT_RATIO), rows: 1 }
  }

  for (let rows = 1; rows <= count; rows++) {
    const cardsPerRow = Math.ceil(count / rows)
    const hGaps = gap * Math.max(0, cardsPerRow - 1)
    const naturalWidth = (availWidth - hGaps) / cardsPerRow

    if (naturalWidth < minWidth) continue

    const cardWidth = Math.floor(Math.min(maxWidth, naturalWidth))
    const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO)
    const totalHeight = rows * cardHeight + gap * (rows - 1)

    if (totalHeight <= availHeight) {
      return { width: cardWidth, height: cardHeight, rows }
    }
  }

  return { width: minWidth, height: Math.round(minWidth * CARD_ASPECT_RATIO), rows: 1 }
}

const TOP_FRACTIONS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
const DEFAULT_DIMS: ZoneDims = { width: 100, height: 140, rows: 1 }

function computeDualZone(
  containerWidth: number,
  containerHeight: number,
  config: Required<Pick<DualZoneConfig, 'topCount' | 'bottomCount' | 'topGap' | 'bottomGap' | 'fixedHeight' | 'topMaxWidth' | 'bottomMaxWidth' | 'minCardWidth'>>
): DualZoneDims {
  const { topCount, bottomCount, topGap, bottomGap, fixedHeight, topMaxWidth, bottomMaxWidth, minCardWidth } = config
  const availHeight = containerHeight - fixedHeight
  const availWidth = containerWidth

  if (availHeight <= 0 || availWidth <= 0) {
    return { top: DEFAULT_DIMS, bottom: DEFAULT_DIMS }
  }

  if (topCount === 0 && bottomCount === 0) {
    return { top: DEFAULT_DIMS, bottom: DEFAULT_DIMS }
  }

  if (topCount === 0) {
    const bottom = bestFit(bottomCount, availWidth, availHeight, bottomGap, bottomMaxWidth, minCardWidth)
    return { top: DEFAULT_DIMS, bottom }
  }

  if (bottomCount === 0) {
    const top = bestFit(topCount, availWidth, availHeight, topGap, topMaxWidth, minCardWidth)
    return { top, bottom: DEFAULT_DIMS }
  }

  let bestScore = -1
  let bestResult: DualZoneDims = { top: DEFAULT_DIMS, bottom: DEFAULT_DIMS }

  for (const frac of TOP_FRACTIONS) {
    const topH = availHeight * frac
    const botH = availHeight - topH

    const top = bestFit(topCount, availWidth, topH, topGap, topMaxWidth, minCardWidth)
    let bottom = bestFit(bottomCount, availWidth, botH, bottomGap, bottomMaxWidth, minCardWidth)

    if (bottom.width > top.width) {
      const clampedWidth = top.width
      const clampedHeight = Math.round(clampedWidth * CARD_ASPECT_RATIO)
      bottom = { ...bottom, width: clampedWidth, height: clampedHeight }
    }

    const score = top.width * top.height + bottom.width * bottom.height
    if (score > bestScore) {
      bestScore = score
      bestResult = { top, bottom }
    }
  }

  return bestResult
}

export function useDualZoneCardSizes(config: DualZoneConfig): [
  React.RefCallback<HTMLElement>,
  DualZoneDims
] {
  const {
    topCount,
    bottomCount,
    topGap = 16,
    bottomGap = 8,
    fixedHeight = 0,
    topMaxWidth = 200,
    bottomMaxWidth = 130,
    minCardWidth = 40,
  } = config

  const resolved = { topCount, bottomCount, topGap, bottomGap, fixedHeight, topMaxWidth, bottomMaxWidth, minCardWidth }

  const [dims, setDims] = useState<DualZoneDims>(() => ({
    top: { width: topMaxWidth, height: Math.round(topMaxWidth * CARD_ASPECT_RATIO), rows: 1 },
    bottom: { width: bottomMaxWidth, height: Math.round(bottomMaxWidth * CARD_ASPECT_RATIO), rows: 1 },
  }))

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (containerWidth: number, containerHeight: number) => {
      return computeDualZone(containerWidth, containerHeight, resolved)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topCount, bottomCount, topGap, bottomGap, fixedHeight, topMaxWidth, bottomMaxWidth, minCardWidth]
  )

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }

      elementRef.current = node

      if (!node) return

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        const next = compute(width, height)
        setDims((prev) =>
          prev.top.width === next.top.width &&
          prev.top.height === next.top.height &&
          prev.top.rows === next.top.rows &&
          prev.bottom.width === next.bottom.width &&
          prev.bottom.height === next.bottom.height &&
          prev.bottom.rows === next.bottom.rows
            ? prev
            : next
        )
      })

      observer.observe(node)
      observerRef.current = observer
    },
    [compute]
  )

  useEffect(() => {
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect()
      const next = compute(rect.width, rect.height)
      setDims((prev) =>
        prev.top.width === next.top.width &&
        prev.top.height === next.top.height &&
        prev.top.rows === next.top.rows &&
        prev.bottom.width === next.bottom.width &&
        prev.bottom.height === next.bottom.height &&
        prev.bottom.rows === next.bottom.rows
          ? prev
          : next
      )
    }
  }, [compute])

  return [refCallback, dims]
}

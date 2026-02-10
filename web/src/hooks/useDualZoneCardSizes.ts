import { useState, useCallback, useRef, useLayoutEffect } from 'react'

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
  columns: number
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
    return { width: maxWidth, height: Math.round(maxWidth * CARD_ASPECT_RATIO), rows: 1, columns: 1 }
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
      return { width: cardWidth, height: cardHeight, rows, columns: cardsPerRow }
    }
  }

  return { width: minWidth, height: Math.round(minWidth * CARD_ASPECT_RATIO), rows: 1, columns: count }
}

const DEFAULT_DIMS: ZoneDims = { width: 100, height: 140, rows: 1, columns: 1 }

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

  for (let topRows = 1; topRows <= topCount; topRows++) {
    const topCols = Math.ceil(topCount / topRows)
    const topHGaps = topGap * Math.max(0, topCols - 1)
    const topWidthCap = Math.min(topMaxWidth, Math.floor((availWidth - topHGaps) / topCols))
    if (topWidthCap < minCardWidth) continue

    for (let botRows = 1; botRows <= bottomCount; botRows++) {
      const botCols = Math.ceil(bottomCount / botRows)
      const botHGaps = bottomGap * Math.max(0, botCols - 1)
      const botWidthCap = Math.min(bottomMaxWidth, Math.floor((availWidth - botHGaps) / botCols))
      if (botWidthCap < minCardWidth) continue

      const topVGaps = topGap * (topRows - 1)
      const botVGaps = bottomGap * (botRows - 1)
      const totalVGaps = topVGaps + botVGaps
      const idealW = (availHeight - totalVGaps) / (CARD_ASPECT_RATIO * (topRows + botRows))

      let topW = Math.floor(Math.min(topWidthCap, idealW))
      let botW = Math.floor(Math.min(botWidthCap, idealW))

      if (topW < minCardWidth || botW < minCardWidth) continue

      // If one zone is capped below idealW, redistribute remaining height
      if (topW < idealW || botW < idealW) {
        const cappedW = Math.min(topW, botW)
        const cappedRows = topW <= botW ? topRows : botRows
        const otherCap = topW <= botW ? botWidthCap : topWidthCap
        const otherRows = topW <= botW ? botRows : topRows
        const otherGap = topW <= botW ? bottomGap : topGap
        const cappedHeight = cappedRows * Math.round(cappedW * CARD_ASPECT_RATIO) + (topW <= botW ? topVGaps : botVGaps)
        const remainingH = availHeight - cappedHeight
        const otherVGaps = otherGap * (otherRows - 1)
        const otherW = Math.floor(Math.min(otherCap, (remainingH - otherVGaps) / (CARD_ASPECT_RATIO * otherRows)))
        if (otherW < minCardWidth) continue
        if (topW <= botW) {
          botW = otherW
        } else {
          topW = otherW
        }
      }

      const topH = topRows * Math.round(topW * CARD_ASPECT_RATIO) + topVGaps
      const botH = botRows * Math.round(botW * CARD_ASPECT_RATIO) + botVGaps
      const totalH = topH + botH
      const fill = Math.min(1, totalH / availHeight)
      const score = Math.min(topW, botW) * fill

      if (score > bestScore) {
        bestScore = score
        bestResult = {
          top: { width: topW, height: Math.round(topW * CARD_ASPECT_RATIO), rows: topRows, columns: topCols },
          bottom: { width: botW, height: Math.round(botW * CARD_ASPECT_RATIO), rows: botRows, columns: botCols },
        }
      }
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
    topGap = 6,
    bottomGap = 6,
    fixedHeight = 0,
    topMaxWidth = 400,
    bottomMaxWidth = 300,
    minCardWidth = 40,
  } = config

  const resolved = { topCount, bottomCount, topGap, bottomGap, fixedHeight, topMaxWidth, bottomMaxWidth, minCardWidth }

  const [dims, setDims] = useState<DualZoneDims>(() => ({
    top: { width: minCardWidth, height: Math.round(minCardWidth * CARD_ASPECT_RATIO), rows: 1, columns: 1 },
    bottom: { width: minCardWidth, height: Math.round(minCardWidth * CARD_ASPECT_RATIO), rows: 1, columns: 1 },
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

      const cs = getComputedStyle(node)
      const w = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const next = compute(w, h)
      setDims((prev) =>
        prev.top.width === next.top.width &&
        prev.top.height === next.top.height &&
        prev.top.rows === next.top.rows &&
        prev.top.columns === next.top.columns &&
        prev.bottom.width === next.bottom.width &&
        prev.bottom.height === next.bottom.height &&
        prev.bottom.rows === next.bottom.rows &&
        prev.bottom.columns === next.bottom.columns
          ? prev
          : next
      )

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

  useLayoutEffect(() => {
    if (elementRef.current) {
      const cs = getComputedStyle(elementRef.current)
      const w = elementRef.current.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = elementRef.current.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const next = compute(w, h)
      setDims((prev) =>
        prev.top.width === next.top.width &&
        prev.top.height === next.top.height &&
        prev.top.rows === next.top.rows &&
        prev.top.columns === next.top.columns &&
        prev.bottom.width === next.bottom.width &&
        prev.bottom.height === next.bottom.height &&
        prev.bottom.rows === next.bottom.rows &&
        prev.bottom.columns === next.bottom.columns
          ? prev
          : next
      )
    }
  }, [compute])

  return [refCallback, dims]
}

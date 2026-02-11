import { useState, useCallback, useRef, useLayoutEffect } from 'react'

const ASPECT_RATIO = 7 / 5
const CARD_GAP = 6
const DIVIDER_HEIGHT = 20
const SECTION_GAP = 8
const NARROW_BREAKPOINT = 500
const VERTICAL_DIVIDER_WIDTH = 32

interface GameSummaryCardSizeConfig {
  handCount: number
  extrasCount: number
  sideboardCount: number
  hasExtras: boolean
  maxCardWidth?: number
  minCardWidth?: number
}

interface SectionDims {
  width: number
  height: number
  columns: number
}

export interface GameSummaryDims {
  isVertical: boolean
  hand: SectionDims
  extras: SectionDims
  sideboard: SectionDims
}

function bestFitSection(
  count: number,
  availW: number,
  availH: number,
  gap: number,
  maxW: number,
  minW: number
): SectionDims {
  if (count === 0) return { width: 0, height: 0, columns: 0 }

  let best: SectionDims = { width: minW, height: Math.round(minW * ASPECT_RATIO), columns: count }

  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows)
    const cardW = Math.min(maxW, Math.floor((availW - (cols - 1) * gap) / cols))
    if (cardW < minW) continue

    const cardH = Math.round(cardW * ASPECT_RATIO)
    const totalH = rows * cardH + (rows - 1) * gap
    if (totalH > availH) continue

    if (cardW > best.width) {
      best = { width: cardW, height: cardH, columns: cols }
    }
  }

  return best
}

function solveIdealWidths(
  sections: { rows: number; widthCap: number; idx: number }[],
  availH: number,
  minW: number
): number[] | null {
  const widths = [0, 0, 0]
  let remainingH = availH
  let uncapped = [...sections]

  while (uncapped.length > 0) {
    const totalRows = uncapped.reduce((sum, s) => sum + s.rows, 0)
    const totalInternalGaps = uncapped.reduce(
      (sum, s) => sum + Math.max(0, s.rows - 1) * CARD_GAP,
      0
    )
    const idealW = (remainingH - totalInternalGaps) / (ASPECT_RATIO * totalRows)

    if (idealW < minW) return null

    const newlyCapped = uncapped.filter((s) => s.widthCap < idealW)
    if (newlyCapped.length === 0) {
      for (const s of uncapped) {
        widths[s.idx] = Math.floor(Math.min(s.widthCap, idealW))
      }
      break
    }

    for (const s of newlyCapped) {
      widths[s.idx] = s.widthCap
      const h = Math.round(s.widthCap * ASPECT_RATIO)
      remainingH -= s.rows * h + Math.max(0, s.rows - 1) * CARD_GAP
    }
    uncapped = uncapped.filter((s) => !newlyCapped.includes(s))
  }

  return widths
}

function computeVertical(
  containerW: number,
  containerH: number,
  handCount: number,
  extrasCount: number,
  sideboardCount: number,
  maxW: number,
  minW: number
): { hand: SectionDims; extras: SectionDims; sideboard: SectionDims } {
  const counts = [handCount, extrasCount, sideboardCount]
  const visibleCount = counts.filter((c) => c > 0).length
  if (visibleCount === 0) {
    const w = maxW
    const h = Math.round(w * ASPECT_RATIO)
    const empty = { width: w, height: h, columns: 0 }
    return { hand: empty, extras: empty, sideboard: empty }
  }

  const overhead = visibleCount * DIVIDER_HEIGHT + Math.max(0, visibleCount - 1) * SECTION_GAP

  let bestScore = -1
  let bestResult = {
    hand: { width: minW, height: Math.round(minW * ASPECT_RATIO), columns: 1 } as SectionDims,
    extras: { width: minW, height: Math.round(minW * ASPECT_RATIO), columns: 1 } as SectionDims,
    sideboard: { width: minW, height: Math.round(minW * ASPECT_RATIO), columns: 1 } as SectionDims,
  }

  const maxHandRows = handCount || 1
  const maxExtrasRows = extrasCount || 1
  const maxSbRows = sideboardCount || 1

  for (let hr = 1; hr <= maxHandRows; hr++) {
    for (let er = 1; er <= maxExtrasRows; er++) {
      for (let sr = 1; sr <= maxSbRows; sr++) {
        if (handCount > 0 && Math.ceil(handCount / Math.ceil(handCount / hr)) !== hr) continue
        if (extrasCount > 0 && Math.ceil(extrasCount / Math.ceil(extrasCount / er)) !== er) continue
        if (sideboardCount > 0 && Math.ceil(sideboardCount / Math.ceil(sideboardCount / sr)) !== sr) continue

        const handRows = handCount > 0 ? hr : 0
        const extrasRows = extrasCount > 0 ? er : 0
        const sbRows = sideboardCount > 0 ? sr : 0

        const handCols = handCount > 0 ? Math.ceil(handCount / hr) : 0
        const extrasCols = extrasCount > 0 ? Math.ceil(extrasCount / er) : 0
        const sbCols = sideboardCount > 0 ? Math.ceil(sideboardCount / sr) : 0

        const handWidthCap = handCols > 0
          ? Math.min(maxW, Math.floor((containerW - (handCols - 1) * CARD_GAP) / handCols))
          : 0
        const extrasWidthCap = extrasCols > 0
          ? Math.min(maxW, Math.floor((containerW - (extrasCols - 1) * CARD_GAP) / extrasCols))
          : 0
        const sbWidthCap = sbCols > 0
          ? Math.min(maxW, Math.floor((containerW - (sbCols - 1) * CARD_GAP) / sbCols))
          : 0

        const active: { rows: number; widthCap: number; idx: number }[] = []
        if (handCount > 0) active.push({ rows: handRows, widthCap: handWidthCap, idx: 0 })
        if (extrasCount > 0) active.push({ rows: extrasRows, widthCap: extrasWidthCap, idx: 1 })
        if (sideboardCount > 0) active.push({ rows: sbRows, widthCap: sbWidthCap, idx: 2 })

        if (active.some((s) => s.widthCap < minW)) continue

        const widths = solveIdealWidths(active, containerH - overhead, minW)
        if (!widths) continue

        const handW = widths[0]
        const extrasW = widths[1]
        const sbW = widths[2]

        const handSectionH = handRows > 0
          ? handRows * Math.round(handW * ASPECT_RATIO) + (handRows - 1) * CARD_GAP : 0
        const extrasSectionH = extrasRows > 0
          ? extrasRows * Math.round(extrasW * ASPECT_RATIO) + (extrasRows - 1) * CARD_GAP : 0
        const sbSectionH = sbRows > 0
          ? sbRows * Math.round(sbW * ASPECT_RATIO) + (sbRows - 1) * CARD_GAP : 0

        const actualTotalH = handSectionH + extrasSectionH + sbSectionH + overhead
        if (actualTotalH > containerH) continue

        const activeWidths = active.map((s) => widths[s.idx])
        const minWidth = Math.min(...activeWidths)
        const fill = actualTotalH / containerH
        const score = minWidth * Math.sqrt(fill)

        if (score > bestScore) {
          bestScore = score
          bestResult = {
            hand: handCount > 0
              ? { width: handW, height: Math.round(handW * ASPECT_RATIO), columns: handCols }
              : { width: 0, height: 0, columns: 0 },
            extras: extrasCount > 0
              ? { width: extrasW, height: Math.round(extrasW * ASPECT_RATIO), columns: extrasCols }
              : { width: 0, height: 0, columns: 0 },
            sideboard: sideboardCount > 0
              ? { width: sbW, height: Math.round(sbW * ASPECT_RATIO), columns: sbCols }
              : { width: 0, height: 0, columns: 0 },
          }
        }
      }
    }
  }

  return bestResult
}

function computeTwoColumn(
  containerW: number,
  containerH: number,
  handCount: number,
  extrasCount: number,
  sideboardCount: number,
  maxW: number,
  minW: number
): { hand: SectionDims; extras: SectionDims; sideboard: SectionDims } {
  const leftW = (containerW - VERTICAL_DIVIDER_WIDTH) / 2
  const rightW = (containerW - VERTICAL_DIVIDER_WIDTH) / 2

  const sbDims = bestFitSection(sideboardCount, rightW, containerH, CARD_GAP, maxW, minW)

  const leftSections = (handCount > 0 ? 1 : 0) + (extrasCount > 0 ? 1 : 0)
  const leftOverhead = leftSections * DIVIDER_HEIGHT + Math.max(0, leftSections - 1) * SECTION_GAP

  let bestScore = -1
  let bestHand: SectionDims = { width: minW, height: Math.round(minW * ASPECT_RATIO), columns: 1 }
  let bestExtras: SectionDims = { width: 0, height: 0, columns: 0 }

  const maxHandRows = handCount || 1
  const maxExtrasRows = extrasCount || 1

  for (let hr = 1; hr <= maxHandRows; hr++) {
    for (let er = 1; er <= maxExtrasRows; er++) {
      if (handCount > 0 && Math.ceil(handCount / Math.ceil(handCount / hr)) !== hr) continue
      if (extrasCount > 0 && Math.ceil(extrasCount / Math.ceil(extrasCount / er)) !== er) continue

      const handRows = handCount > 0 ? hr : 0
      const extrasRows = extrasCount > 0 ? er : 0

      const handCols = handCount > 0 ? Math.ceil(handCount / hr) : 0
      const extrasCols = extrasCount > 0 ? Math.ceil(extrasCount / er) : 0

      const handWidthCap = handCols > 0
        ? Math.min(maxW, Math.floor((leftW - (handCols - 1) * CARD_GAP) / handCols))
        : 0
      const extrasWidthCap = extrasCols > 0
        ? Math.min(maxW, Math.floor((leftW - (extrasCols - 1) * CARD_GAP) / extrasCols))
        : 0

      const active: { rows: number; widthCap: number; idx: number }[] = []
      if (handCount > 0) active.push({ rows: handRows, widthCap: handWidthCap, idx: 0 })
      if (extrasCount > 0) active.push({ rows: extrasRows, widthCap: extrasWidthCap, idx: 1 })

      if (active.some((s) => s.widthCap < minW)) continue

      const widths = solveIdealWidths(active, containerH - leftOverhead, minW)
      if (!widths) continue

      const handW = widths[0]
      const extrasW = widths[1]

      const handSectionH = handRows > 0
        ? handRows * Math.round(handW * ASPECT_RATIO) + (handRows - 1) * CARD_GAP : 0
      const extrasSectionH = extrasRows > 0
        ? extrasRows * Math.round(extrasW * ASPECT_RATIO) + (extrasRows - 1) * CARD_GAP : 0

      const leftTotalH = handSectionH + extrasSectionH + leftOverhead
      if (leftTotalH > containerH) continue

      const activeWidths = active.map((s) => widths[s.idx])
      const minWidth = activeWidths.length > 0 ? Math.min(...activeWidths) : 0
      const fill = leftTotalH / containerH
      const score = minWidth * Math.sqrt(fill)

      if (score > bestScore) {
        bestScore = score
        bestHand = handCount > 0
          ? { width: handW, height: Math.round(handW * ASPECT_RATIO), columns: handCols }
          : { width: 0, height: 0, columns: 0 }
        bestExtras = extrasCount > 0
          ? { width: extrasW, height: Math.round(extrasW * ASPECT_RATIO), columns: extrasCols }
          : { width: 0, height: 0, columns: 0 }
      }
    }
  }

  return { hand: bestHand, extras: bestExtras, sideboard: sbDims }
}

function computeSize(
  containerW: number,
  containerH: number,
  config: GameSummaryCardSizeConfig
): GameSummaryDims {
  const { handCount, extrasCount, sideboardCount, hasExtras, maxCardWidth = 200, minCardWidth = 30 } = config

  if (containerW <= 0 || containerH <= 0) {
    const w = minCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 1 }
    return { isVertical: true, hand: d, extras: d, sideboard: d }
  }

  const isVertical = !hasExtras || containerW < NARROW_BREAKPOINT

  if (isVertical) {
    const result = computeVertical(containerW, containerH, handCount, extrasCount, sideboardCount, maxCardWidth, minCardWidth)
    return { isVertical: true, ...result }
  }

  const result = computeTwoColumn(containerW, containerH, handCount, extrasCount, sideboardCount, maxCardWidth, minCardWidth)
  return { isVertical: false, ...result }
}

function dimsEqual(a: GameSummaryDims, b: GameSummaryDims): boolean {
  return (
    a.isVertical === b.isVertical &&
    a.hand.width === b.hand.width &&
    a.hand.height === b.hand.height &&
    a.hand.columns === b.hand.columns &&
    a.extras.width === b.extras.width &&
    a.extras.height === b.extras.height &&
    a.extras.columns === b.extras.columns &&
    a.sideboard.width === b.sideboard.width &&
    a.sideboard.height === b.sideboard.height &&
    a.sideboard.columns === b.sideboard.columns
  )
}

export function useGameSummaryCardSize(
  config: GameSummaryCardSizeConfig
): [React.RefCallback<HTMLElement>, GameSummaryDims] {
  const { handCount, extrasCount, sideboardCount, hasExtras, maxCardWidth = 200, minCardWidth = 30 } = config
  const resolved = { handCount, extrasCount, sideboardCount, hasExtras, maxCardWidth, minCardWidth }

  const [dims, setDims] = useState<GameSummaryDims>(() => {
    const w = minCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 1 }
    return { isVertical: true, hand: d, extras: d, sideboard: d }
  })

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (w: number, h: number) => computeSize(w, h, resolved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handCount, extrasCount, sideboardCount, hasExtras, maxCardWidth, minCardWidth]
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
      setDims((prev) => (dimsEqual(prev, next) ? prev : next))

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        const next = compute(width, height)
        setDims((prev) => (dimsEqual(prev, next) ? prev : next))
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
      setDims((prev) => (dimsEqual(prev, next) ? prev : next))
    }
  }, [compute])

  return [refCallback, dims]
}

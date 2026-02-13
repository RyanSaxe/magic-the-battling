import { useState, useCallback, useRef, useLayoutEffect } from 'react'

const ASPECT_RATIO = 7 / 5
const CARD_GAP = 6
const DIVIDER_HEIGHT = 20
const SECTION_GAP = 8
const MIDDLE_ROW_GAP = 16

interface GameSummaryCardSizeConfig {
  handCount: number
  sideboardCount: number
  battlefieldCount: number
  commandZoneCount: number
  maxCardWidth?: number
  minCardWidth?: number
}

interface SectionDims {
  width: number
  height: number
  columns: number
}

export interface GameSummaryDims {
  hand: SectionDims
  sideboard: SectionDims
  battlefield: SectionDims
  commandZone: SectionDims
}

function sizeOneRow(
  count: number,
  availW: number,
  gap: number,
  maxW: number,
  minW: number
): SectionDims {
  if (count === 0) return { width: 0, height: 0, columns: 0 }
  const cols = count
  const cardW = Math.max(minW, Math.min(maxW, Math.floor((availW - (cols - 1) * gap) / cols)))
  return { width: cardW, height: Math.round(cardW * ASPECT_RATIO), columns: cols }
}

function computeSize(
  containerW: number,
  containerH: number,
  config: GameSummaryCardSizeConfig
): GameSummaryDims {
  const {
    handCount,
    sideboardCount,
    battlefieldCount,
    commandZoneCount,
    maxCardWidth = 200,
    minCardWidth = 30,
  } = config

  const empty: SectionDims = { width: 0, height: 0, columns: 0 }

  if (containerW <= 0 || containerH <= 0) {
    const w = minCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 1 }
    return { hand: d, sideboard: d, battlefield: d, commandZone: d }
  }

  const hasHand = handCount > 0
  const hasSideboard = sideboardCount > 0
  const hasBattlefield = battlefieldCount > 0
  const hasCommandZone = commandZoneCount > 0
  const hasMiddle = hasBattlefield || hasCommandZone

  // 1. Size middle row (always 1 row, width-determined)
  let bfDims = empty
  let czDims = empty
  if (hasMiddle) {
    if (hasBattlefield && hasCommandZone) {
      const halfW = Math.floor((containerW - MIDDLE_ROW_GAP) / 2)
      bfDims = sizeOneRow(battlefieldCount, halfW, CARD_GAP, maxCardWidth, minCardWidth)
      czDims = sizeOneRow(commandZoneCount, halfW, CARD_GAP, maxCardWidth, minCardWidth)
    } else if (hasBattlefield) {
      bfDims = sizeOneRow(battlefieldCount, containerW, CARD_GAP, maxCardWidth, minCardWidth)
    } else {
      czDims = sizeOneRow(commandZoneCount, containerW, CARD_GAP, maxCardWidth, minCardWidth)
    }
  }

  const middleGridH = Math.max(bfDims.height, czDims.height)

  // 2. Compute overhead
  const topLevelSections = (hasHand ? 1 : 0) + (hasMiddle ? 1 : 0) + (hasSideboard ? 1 : 0)
  if (topLevelSections === 0) {
    const w = maxCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 0 }
    return { hand: d, sideboard: d, battlefield: d, commandZone: d }
  }

  const overhead = topLevelSections * DIVIDER_HEIGHT + Math.max(0, topLevelSections - 1) * SECTION_GAP

  // 3. Height available for hand + sideboard grids
  const handSbAvailH = containerH - overhead - (hasMiddle ? middleGridH : 0)
  if (handSbAvailH <= 0) {
    const w = minCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 1 }
    return { hand: hasHand ? d : empty, sideboard: hasSideboard ? d : empty, battlefield: bfDims, commandZone: czDims }
  }

  // 4. Find best (handRows, sideboardRows) with height-balanced sizing
  let bestScore = -1
  let bestResult: GameSummaryDims = {
    hand: empty,
    sideboard: empty,
    battlefield: bfDims,
    commandZone: czDims,
  }

  for (let hr = hasHand ? 1 : 0; hr <= (hasHand ? handCount : 0); hr++) {
    if (hasHand) {
      const actualRows = Math.ceil(handCount / Math.ceil(handCount / hr))
      if (actualRows !== hr) continue
    }

    for (let sr = hasSideboard ? 1 : 0; sr <= (hasSideboard ? sideboardCount : 0); sr++) {
      if (hasSideboard) {
        const actualRows = Math.ceil(sideboardCount / Math.ceil(sideboardCount / sr))
        if (actualRows !== sr) continue
      }

      const handCols = hasHand ? Math.ceil(handCount / hr) : 0
      const sbCols = hasSideboard ? Math.ceil(sideboardCount / sr) : 0

      const handWidthCap = handCols > 0
        ? Math.min(maxCardWidth, Math.floor((containerW - (handCols - 1) * CARD_GAP) / handCols))
        : 0
      const sbWidthCap = sbCols > 0
        ? Math.min(maxCardWidth, Math.floor((containerW - (sbCols - 1) * CARD_GAP) / sbCols))
        : 0

      if ((hasHand && handWidthCap < minCardWidth) || (hasSideboard && sbWidthCap < minCardWidth)) continue

      const handRowGaps = hasHand ? Math.max(0, hr - 1) * CARD_GAP : 0
      const sbRowGaps = hasSideboard ? Math.max(0, sr - 1) * CARD_GAP : 0
      const heightForCards = handSbAvailH - handRowGaps - sbRowGaps

      if (heightForCards <= 0) continue

      let handW = 0
      let sbW = 0

      if (hasHand && hasSideboard) {
        const totalRows = hr + sr
        const idealW = heightForCards / (totalRows * ASPECT_RATIO)

        if (idealW >= handWidthCap && idealW >= sbWidthCap) {
          handW = handWidthCap
          sbW = sbWidthCap
        } else if (idealW >= handWidthCap) {
          handW = handWidthCap
          const remaining = heightForCards - hr * handW * ASPECT_RATIO
          sbW = Math.min(sbWidthCap, Math.floor(remaining / (sr * ASPECT_RATIO)))
        } else if (idealW >= sbWidthCap) {
          sbW = sbWidthCap
          const remaining = heightForCards - sr * sbW * ASPECT_RATIO
          handW = Math.min(handWidthCap, Math.floor(remaining / (hr * ASPECT_RATIO)))
        } else {
          handW = Math.floor(idealW)
          sbW = Math.floor(idealW)
        }
      } else if (hasHand) {
        handW = Math.min(handWidthCap, Math.floor(heightForCards / (hr * ASPECT_RATIO)))
      } else if (hasSideboard) {
        sbW = Math.min(sbWidthCap, Math.floor(heightForCards / (sr * ASPECT_RATIO)))
      }

      if ((hasHand && handW < minCardWidth) || (hasSideboard && sbW < minCardWidth)) continue

      const handH = hasHand ? hr * Math.round(handW * ASPECT_RATIO) + handRowGaps : 0
      const sbH = hasSideboard ? sr * Math.round(sbW * ASPECT_RATIO) + sbRowGaps : 0
      if (handH + sbH > handSbAvailH) continue

      const widths: number[] = []
      if (hasHand) widths.push(handW)
      if (hasSideboard) widths.push(sbW)
      const minWidth = widths.length > 0 ? Math.min(...widths) : 0

      const actualTotalH = handH + sbH + (hasMiddle ? middleGridH : 0) + overhead
      const fill = actualTotalH / containerH
      const score = minWidth * Math.sqrt(fill)

      if (score > bestScore) {
        bestScore = score
        bestResult = {
          hand: hasHand
            ? { width: handW, height: Math.round(handW * ASPECT_RATIO), columns: handCols }
            : empty,
          sideboard: hasSideboard
            ? { width: sbW, height: Math.round(sbW * ASPECT_RATIO), columns: sbCols }
            : empty,
          battlefield: bfDims,
          commandZone: czDims,
        }
      }
    }
  }

  return bestResult
}

function dimsEqual(a: GameSummaryDims, b: GameSummaryDims): boolean {
  const eq = (x: SectionDims, y: SectionDims) =>
    x.width === y.width && x.height === y.height && x.columns === y.columns
  return (
    eq(a.hand, b.hand) &&
    eq(a.sideboard, b.sideboard) &&
    eq(a.battlefield, b.battlefield) &&
    eq(a.commandZone, b.commandZone)
  )
}

export function useGameSummaryCardSize(
  config: GameSummaryCardSizeConfig
): [React.RefCallback<HTMLElement>, GameSummaryDims] {
  const {
    handCount,
    sideboardCount,
    battlefieldCount,
    commandZoneCount,
    maxCardWidth = 200,
    minCardWidth = 30,
  } = config
  const resolved = { handCount, sideboardCount, battlefieldCount, commandZoneCount, maxCardWidth, minCardWidth }

  const [dims, setDims] = useState<GameSummaryDims>(() => {
    const w = minCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 1 }
    return { hand: d, sideboard: d, battlefield: d, commandZone: d }
  })

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (w: number, h: number) => computeSize(w, h, resolved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handCount, sideboardCount, battlefieldCount, commandZoneCount, maxCardWidth, minCardWidth]
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

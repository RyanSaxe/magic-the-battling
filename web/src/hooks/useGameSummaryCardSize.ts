import { useState, useCallback, useRef, useLayoutEffect } from 'react'

const ASPECT_RATIO = 7 / 5
const CARD_GAP = 6
const BORDER = 1
const CELL_PAD = 12
const CELL_PAD_TOP = 20
const CZ_CELL_PAD = 12

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

export function computeSize(
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
  const hasLower = hasBattlefield || hasSideboard || hasCommandZone
  const hasRight = hasBattlefield || hasSideboard

  const totalSections = (hasHand ? 1 : 0) + (hasBattlefield ? 1 : 0) + (hasSideboard ? 1 : 0) + (hasCommandZone ? 1 : 0)
  if (totalSections === 0) {
    const w = maxCardWidth
    const h = Math.round(w * ASPECT_RATIO)
    const d = { width: w, height: h, columns: 0 }
    return { hand: d, sideboard: d, battlefield: d, commandZone: d }
  }

  const innerW = containerW - 2 * BORDER

  let bestScore = -1
  let bestResult: GameSummaryDims = {
    hand: empty,
    sideboard: empty,
    battlefield: empty,
    commandZone: empty,
  }

  let bestOverflow = Infinity
  let bestOverflowResult: GameSummaryDims = bestResult

  const bfCols = hasBattlefield ? battlefieldCount : 0

  for (let hr = hasHand ? 1 : 0; hr <= (hasHand ? handCount : 0); hr++) {
    if (hasHand) {
      const actualRows = Math.ceil(handCount / Math.ceil(handCount / hr))
      if (actualRows !== hr) continue
    }

    const handCols = hasHand ? Math.ceil(handCount / hr) : 0
    const handAvailW = innerW - 2 * CELL_PAD
    const handCardW = hasHand
      ? Math.min(maxCardWidth, Math.floor((handAvailW - Math.max(0, handCols - 1) * CARD_GAP) / handCols))
      : 0
    if (hasHand && handCardW < minCardWidth) continue

    const handCardH = hasHand ? Math.round(handCardW * ASPECT_RATIO) : 0
    const handGridH = hasHand ? hr * handCardH + Math.max(0, hr - 1) * CARD_GAP : 0
    const handCellH = hasHand ? CELL_PAD_TOP + handGridH + CELL_PAD : 0

    const availH = containerH - 2 * BORDER
    const gapAfterHand = (hasHand && hasLower) ? BORDER : 0
    const availBelow = availH - handCellH - gapAfterHand

    if (hasLower && availBelow <= 0) continue

    const czColVariants = hasCommandZone
      ? Array.from({ length: Math.min(2, commandZoneCount) }, (_, i) => i + 1)
      : [0]

    for (const czc of czColVariants) {
    let czCardW = 0
    let czCellW = 0
    if (hasCommandZone) {
      const czRows = Math.ceil(commandZoneCount / czc)
      const czGaps = Math.max(0, czRows - 1) * CARD_GAP
      const czAvailH = availBelow - CELL_PAD_TOP - CZ_CELL_PAD
      const czCardW_fromHeight = Math.floor(
        (czAvailH - czGaps) / (czRows * ASPECT_RATIO)
      )
      const czIdealW = hasHand ? Math.round(handCardW * 1.5) : maxCardWidth
      czCardW = Math.min(czIdealW, czCardW_fromHeight)
      if (czCardW < minCardWidth) continue
      czCellW = czc * czCardW + (czc - 1) * CARD_GAP + 2 * CELL_PAD
    }

    const rightColW = hasCommandZone
      ? innerW - czCellW - BORDER
      : innerW
    const rightAvailW = rightColW - 2 * CELL_PAD

    if (hasRight && rightAvailW <= 0) continue

    for (let sr = hasSideboard ? 1 : 0; sr <= (hasSideboard ? sideboardCount : 0); sr++) {
      if (hasSideboard) {
        const actualRows = Math.ceil(sideboardCount / Math.ceil(sideboardCount / sr))
        if (actualRows !== sr) continue
      }

      const sbCols = hasSideboard ? Math.ceil(sideboardCount / sr) : 0

      const bfWidthCap = hasBattlefield
        ? Math.floor((rightAvailW - Math.max(0, bfCols - 1) * CARD_GAP) / bfCols)
        : Infinity
      const sbWidthCap = hasSideboard
        ? Math.floor((rightAvailW - Math.max(0, sbCols - 1) * CARD_GAP) / sbCols)
        : Infinity

      const rightSections = (hasBattlefield ? 1 : 0) + (hasSideboard ? 1 : 0)
      const rightOverhead = rightSections * (CELL_PAD_TOP + CELL_PAD) + (rightSections > 1 ? BORDER : 0)
      const sbRowGaps = hasSideboard ? Math.max(0, sr - 1) * CARD_GAP : 0
      const rightAvailForGrid = availBelow - rightOverhead

      if (hasRight && rightAvailForGrid <= 0) continue

      // Weighted height allocation: bf gets "half a row" vs each sb row
      const bfWeight = hasBattlefield ? 0.5 : 0
      const totalWeight = bfWeight + sr
      const bfAvailForGrid = totalWeight > 0
        ? Math.floor(rightAvailForGrid * bfWeight / totalWeight)
        : 0
      const sbAvailForGrid = rightAvailForGrid - bfAvailForGrid

      let sbCardW = 0
      if (hasSideboard && sr > 0 && sbAvailForGrid > 0) {
        const sbCardW_height = Math.floor(
          (sbAvailForGrid - sbRowGaps) / (sr * ASPECT_RATIO)
        )
        sbCardW = Math.min(maxCardWidth, sbWidthCap, sbCardW_height)
      }
      if (hasHand) sbCardW = Math.min(sbCardW, Math.round(handCardW * 1.5))
      if (hasSideboard && sbCardW <= 0) continue

      let bfCardW = 0
      if (hasBattlefield && bfAvailForGrid > 0) {
        const bfCardW_height = Math.floor(bfAvailForGrid / ASPECT_RATIO)
        bfCardW = Math.min(maxCardWidth, bfWidthCap, bfCardW_height)
        if (hasSideboard) bfCardW = Math.min(bfCardW, sbCardW)
        if (hasHand) bfCardW = Math.min(bfCardW, Math.round(handCardW * 1.5))
      } else if (hasBattlefield) {
        bfCardW = Math.min(maxCardWidth, bfWidthCap)
        if (hasSideboard) bfCardW = Math.min(bfCardW, sbCardW)
        if (hasHand) bfCardW = Math.min(bfCardW, Math.round(handCardW * 1.5))
      }
      if (hasBattlefield && bfCardW <= 0) continue

      const bfCardH = hasBattlefield ? Math.round(bfCardW * ASPECT_RATIO) : 0
      const sbCardH = hasSideboard ? Math.round(sbCardW * ASPECT_RATIO) : 0
      const bfGridH = hasBattlefield ? bfCardH : 0
      const sbGridH = hasSideboard ? sr * sbCardH + sbRowGaps : 0
      const bfCellH = hasBattlefield ? CELL_PAD_TOP + bfGridH + CELL_PAD : 0
      const sbCellH = hasSideboard ? CELL_PAD_TOP + sbGridH + CELL_PAD : 0
      const rightColumnH = hasRight ? bfCellH + (hasBattlefield && hasSideboard ? BORDER : 0) + sbCellH : 0

      const czCardH = hasCommandZone ? Math.round(czCardW * ASPECT_RATIO) : 0
      const czRows = hasCommandZone ? Math.ceil(commandZoneCount / czc) : 0
      const czColumnH = hasCommandZone
        ? CELL_PAD_TOP + CZ_CELL_PAD + czRows * czCardH + Math.max(0, czRows - 1) * CARD_GAP
        : 0

      const lowerH = Math.max(czColumnH, rightColumnH)
      const actualTotalH = handCellH + gapAfterHand + lowerH

      const belowMin =
        (hasSideboard && sbCardW < minCardWidth) ||
        (hasBattlefield && bfCardW < minCardWidth)

      if (actualTotalH > availH || belowMin) {
        const belowMinPenalty = belowMin ? availH * 2 : 0
        const czOverflow = hasCommandZone ? Math.max(0, czColumnH - availBelow) : 0
        const rightOverflow = hasRight ? Math.max(0, rightColumnH - availBelow) : 0
        const sectionOverflow = czOverflow + rightOverflow
        const overflow = (actualTotalH - availH) + belowMinPenalty + sectionOverflow
        if (overflow < bestOverflow) {
          bestOverflow = overflow
          bestOverflowResult = {
            hand: hasHand
              ? { width: handCardW, height: handCardH, columns: handCols }
              : empty,
            sideboard: hasSideboard
              ? { width: sbCardW, height: sbCardH, columns: sbCols }
              : empty,
            battlefield: hasBattlefield
              ? { width: bfCardW, height: bfCardH, columns: bfCols }
              : empty,
            commandZone: hasCommandZone
              ? { width: czCardW, height: czCardH, columns: czc }
              : empty,
          }
        }
        continue
      }

      const fill = actualTotalH / availH
      const scoreCardW = hasSideboard ? sbCardW : (hasBattlefield ? bfCardW : (hasHand ? handCardW : czCardW))
      const score = scoreCardW * Math.sqrt(fill)

      if (score > bestScore) {
        bestScore = score
        bestResult = {
          hand: hasHand
            ? { width: handCardW, height: handCardH, columns: handCols }
            : empty,
          sideboard: hasSideboard
            ? { width: sbCardW, height: sbCardH, columns: sbCols }
            : empty,
          battlefield: hasBattlefield
            ? { width: bfCardW, height: bfCardH, columns: bfCols }
            : empty,
          commandZone: hasCommandZone
            ? { width: czCardW, height: czCardH, columns: czc }
            : empty,
        }
      }
    }
    }
  }

  if (bestScore < 0) {
    return bestOverflowResult
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

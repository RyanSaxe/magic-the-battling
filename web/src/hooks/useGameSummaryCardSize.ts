import { useState, useCallback, useRef, useEffect } from 'react'

const ASPECT_RATIO = 7 / 5
const COLUMN_GAP = 16
const CARD_GAP = 6
const SECTION_LABEL_HEIGHT = 24
const SECTION_GAP = 8
const NARROW_BREAKPOINT = 500

interface GameSummaryCardSizeConfig {
  handCount: number
  upgradeCount: number
  sideboardCount: number
  maxCardWidth?: number
  minCardWidth?: number
}

interface GameSummaryCardDims {
  width: number
  height: number
  isNarrow: boolean
  handCols: number
  sideboardCols: number
}

function computeSize(
  containerWidth: number,
  containerHeight: number,
  config: GameSummaryCardSizeConfig
): GameSummaryCardDims {
  const { handCount, upgradeCount, sideboardCount, maxCardWidth = 130, minCardWidth = 30 } = config

  if (containerWidth <= 0 || containerHeight <= 0) {
    return {
      width: maxCardWidth,
      height: Math.round(maxCardWidth * ASPECT_RATIO),
      isNarrow: true,
      handCols: Math.max(1, Math.ceil(handCount / 2)),
      sideboardCols: Math.max(1, Math.ceil(sideboardCount / 3)),
    }
  }

  const isNarrow = containerWidth < NARROW_BREAKPOINT

  const handCols = handCount > 0 ? Math.ceil(handCount / 2) : 0
  const handRows = handCount > 0 ? Math.ceil(handCount / handCols) : 0
  const upgradeCols = upgradeCount
  const upgradeRows = upgradeCount > 0 ? 1 : 0
  const sideboardCols = sideboardCount > 0 ? Math.ceil(sideboardCount / 3) : 0
  const sideboardRows = sideboardCount > 0 ? Math.ceil(sideboardCount / sideboardCols) : 0

  if (isNarrow) {
    const totalRows = handRows + upgradeRows + sideboardRows
    if (totalRows === 0) {
      return { width: maxCardWidth, height: Math.round(maxCardWidth * ASPECT_RATIO), isNarrow, handCols: 0, sideboardCols: 0 }
    }

    const sectionCount = (handCount > 0 ? 1 : 0) + (upgradeCount > 0 ? 1 : 0) + (sideboardCount > 0 ? 1 : 0)
    const labelOverhead = sectionCount * SECTION_LABEL_HEIGHT
    const sectionGapOverhead = Math.max(0, sectionCount - 1) * SECTION_GAP
    const rowGapOverhead = Math.max(0, totalRows - sectionCount) * CARD_GAP
    const availH = containerHeight - labelOverhead - sectionGapOverhead - rowGapOverhead
    const heightBased = availH / totalRows / ASPECT_RATIO

    const maxCols = Math.max(handCols || 1, upgradeCols || 1, sideboardCols || 1)
    const widthBased = (containerWidth - CARD_GAP * Math.max(0, maxCols - 1)) / maxCols

    const width = Math.round(Math.max(minCardWidth, Math.min(maxCardWidth, heightBased, widthBased)))
    return { width, height: Math.round(width * ASPECT_RATIO), isNarrow, handCols: handCols || 0, sideboardCols: sideboardCols || 0 }
  }

  // Wide layout: two columns (left = hand + upgrades, right = sideboard)
  const hasLeft = handCount > 0 || upgradeCount > 0
  const hasRight = sideboardCount > 0
  const hasBothColumns = hasLeft && hasRight

  const colWidth = hasBothColumns
    ? (containerWidth - COLUMN_GAP) / 2
    : containerWidth

  const leftRows = handRows + upgradeRows
  const rightRows = sideboardRows
  const maxRows = Math.max(leftRows, rightRows)

  if (maxRows === 0) {
    return { width: maxCardWidth, height: Math.round(maxCardWidth * ASPECT_RATIO), isNarrow, handCols: 0, sideboardCols: 0 }
  }

  const leftSectionCount = (handCount > 0 ? 1 : 0) + (upgradeCount > 0 ? 1 : 0)
  const leftSectionGaps = Math.max(0, leftSectionCount - 1) * SECTION_GAP
  const leftLabelOverhead = leftSectionCount * SECTION_LABEL_HEIGHT
  const leftRowGaps = Math.max(0, leftRows - 1) * CARD_GAP

  const rightLabelOverhead = hasRight ? SECTION_LABEL_HEIGHT : 0
  const rightRowGaps = Math.max(0, rightRows - 1) * CARD_GAP

  const candidates: number[] = []

  if (hasLeft && leftRows > 0) {
    const leftAvailH = containerHeight - leftLabelOverhead - leftSectionGaps - leftRowGaps
    candidates.push(leftAvailH / leftRows / ASPECT_RATIO)

    const leftMaxCols = Math.max(handCols || 1, upgradeCols || 1)
    candidates.push((colWidth - CARD_GAP * Math.max(0, leftMaxCols - 1)) / leftMaxCols)
  }

  if (hasRight && rightRows > 0) {
    const rightAvailH = containerHeight - rightLabelOverhead - rightRowGaps
    candidates.push(rightAvailH / rightRows / ASPECT_RATIO)
    candidates.push((colWidth - CARD_GAP * Math.max(0, (sideboardCols || 1) - 1)) / (sideboardCols || 1))
  }

  const width = Math.round(Math.max(minCardWidth, Math.min(maxCardWidth, ...candidates)))
  return { width, height: Math.round(width * ASPECT_RATIO), isNarrow, handCols: handCols || 0, sideboardCols: sideboardCols || 0 }
}

export function useGameSummaryCardSize(
  config: GameSummaryCardSizeConfig
): [React.RefCallback<HTMLElement>, GameSummaryCardDims] {
  const { handCount, upgradeCount, sideboardCount, maxCardWidth = 130, minCardWidth = 30 } = config
  const resolved = { handCount, upgradeCount, sideboardCount, maxCardWidth, minCardWidth }

  const [dims, setDims] = useState<GameSummaryCardDims>(() => ({
    width: maxCardWidth,
    height: Math.round(maxCardWidth * ASPECT_RATIO),
    isNarrow: false,
    handCols: Math.max(1, Math.ceil(handCount / 2)),
    sideboardCols: Math.max(1, Math.ceil(sideboardCount / 3)),
  }))

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (w: number, h: number) => computeSize(w, h, resolved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handCount, upgradeCount, sideboardCount, maxCardWidth, minCardWidth]
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
          prev.width === next.width && prev.height === next.height && prev.isNarrow === next.isNarrow
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
        prev.width === next.width && prev.height === next.height && prev.isNarrow === next.isNarrow
          ? prev
          : next
      )
    }
  }, [compute])

  return [refCallback, dims]
}

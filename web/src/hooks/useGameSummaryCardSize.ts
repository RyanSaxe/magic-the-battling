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
}

function computeSize(
  containerWidth: number,
  containerHeight: number,
  config: GameSummaryCardSizeConfig
): GameSummaryCardDims {
  const { handCount, upgradeCount, sideboardCount, maxCardWidth = 130, minCardWidth = 30 } = config

  if (containerWidth <= 0 || containerHeight <= 0) {
    return { width: maxCardWidth, height: Math.round(maxCardWidth * ASPECT_RATIO), isNarrow: true }
  }

  const isNarrow = containerWidth < NARROW_BREAKPOINT

  if (isNarrow) {
    const handRows = handCount > 0 ? 2 : 0
    const upgradeRows = upgradeCount > 0 ? 1 : 0
    const sideboardRows = sideboardCount > 0 ? 3 : 0
    const totalRows = handRows + upgradeRows + sideboardRows
    if (totalRows === 0) {
      return { width: maxCardWidth, height: Math.round(maxCardWidth * ASPECT_RATIO), isNarrow }
    }

    const sectionCount = (handCount > 0 ? 1 : 0) + (upgradeCount > 0 ? 1 : 0) + (sideboardCount > 0 ? 1 : 0)
    const labelOverhead = sectionCount * SECTION_LABEL_HEIGHT
    const sectionGapOverhead = Math.max(0, sectionCount - 1) * SECTION_GAP
    const rowGapOverhead = Math.max(0, totalRows - sectionCount) * CARD_GAP
    const availH = containerHeight - labelOverhead - sectionGapOverhead - rowGapOverhead
    const heightBased = availH / totalRows / ASPECT_RATIO

    const handCols = handCount > 0 ? Math.ceil(handCount / 2) : 1
    const upgradeCols = upgradeCount > 0 ? upgradeCount : 1
    const sideboardCols = sideboardCount > 0 ? Math.ceil(sideboardCount / 3) : 1
    const maxCols = Math.max(handCols, upgradeCols, sideboardCols)
    const widthBased = (containerWidth - CARD_GAP * Math.max(0, maxCols - 1)) / maxCols

    const width = Math.round(Math.max(minCardWidth, Math.min(maxCardWidth, heightBased, widthBased)))
    return { width, height: Math.round(width * ASPECT_RATIO), isNarrow }
  }

  const columnWidth = (containerWidth - COLUMN_GAP) / 2

  // Left column: hand (2 rows) + upgrades (1 row) = 3 rows
  // Right column: sideboard (3 rows) = 3 rows
  const leftSections = (handCount > 0 ? 1 : 0) + (upgradeCount > 0 ? 1 : 0)
  const leftLabelOverhead = leftSections * SECTION_LABEL_HEIGHT
  const leftSectionGap = leftSections > 1 ? SECTION_GAP : 0
  const leftRowGaps = 2 * CARD_GAP // 3 rows -> 2 gaps between rows
  const rightLabelOverhead = SECTION_LABEL_HEIGHT
  const rightRowGaps = 2 * CARD_GAP

  const leftAvailH = containerHeight - leftLabelOverhead - leftSectionGap - leftRowGaps
  const rightAvailH = containerHeight - rightLabelOverhead - rightRowGaps
  const heightBasedLeft = leftAvailH / 3 / ASPECT_RATIO
  const heightBasedRight = rightAvailH / 3 / ASPECT_RATIO

  const handCols = handCount > 0 ? Math.ceil(handCount / 2) : 1
  const upgradeCols = upgradeCount > 0 ? upgradeCount : 1
  const leftMaxCols = Math.max(handCols, upgradeCols)
  const leftWidthBased = (columnWidth - CARD_GAP * Math.max(0, leftMaxCols - 1)) / leftMaxCols

  const sideboardCols = sideboardCount > 0 ? Math.ceil(sideboardCount / 3) : 1
  const rightWidthBased = (columnWidth - CARD_GAP * Math.max(0, sideboardCols - 1)) / sideboardCols

  const width = Math.round(Math.max(
    minCardWidth,
    Math.min(maxCardWidth, heightBasedLeft, heightBasedRight, leftWidthBased, rightWidthBased)
  ))
  return { width, height: Math.round(width * ASPECT_RATIO), isNarrow }
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

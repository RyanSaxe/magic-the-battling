import { useState, useCallback, useRef, useEffect } from 'react'
import type { CardDimensions } from './useViewportCardSizes'

const CARD_ASPECT_RATIO = 7 / 5
const NUM_ROWS = 6

interface BattleZoneConfig {
  playerHandCount: number
  opponentHandCount: number
  playerLandCount: number
  playerNonlandCount: number
  opponentLandCount: number
  opponentNonlandCount: number
  handGap?: number
  battlefieldGap?: number
  fixedHeight?: number
  handMaxWidth?: number
  battlefieldMaxWidth?: number
  minCardWidth?: number
  zoneColumnWidth?: number
}

interface BattleZoneDims {
  rowHeight: number
  playerHand: CardDimensions
  opponentHand: CardDimensions
  playerLands: CardDimensions
  playerNonlands: CardDimensions
  opponentLands: CardDimensions
  opponentNonlands: CardDimensions
}

function computeZoneCards(
  count: number,
  rowH: number,
  containerW: number,
  gap: number,
  maxWidth: number,
  minWidth: number,
  padding: number,
): CardDimensions {
  const baseCardW = Math.floor(rowH / CARD_ASPECT_RATIO)

  if (count === 0) {
    const w = Math.min(baseCardW, maxWidth)
    return { width: w, height: Math.round(w * CARD_ASPECT_RATIO) }
  }

  const horizontalCap = Math.floor((containerW - padding - (count - 1) * gap) / count)
  const cardW = Math.max(minWidth, Math.min(baseCardW, horizontalCap, maxWidth))
  return { width: cardW, height: Math.round(cardW * CARD_ASPECT_RATIO) }
}

function computeBattleZones(
  containerWidth: number,
  containerHeight: number,
  config: Required<Pick<BattleZoneConfig,
    'playerHandCount' | 'opponentHandCount' |
    'playerLandCount' | 'playerNonlandCount' |
    'opponentLandCount' | 'opponentNonlandCount' |
    'handGap' | 'battlefieldGap' | 'fixedHeight' |
    'handMaxWidth' | 'battlefieldMaxWidth' | 'minCardWidth' |
    'zoneColumnWidth'
  >>
): BattleZoneDims {
  const {
    playerHandCount, opponentHandCount,
    playerLandCount, playerNonlandCount,
    opponentLandCount, opponentNonlandCount,
    handGap, battlefieldGap, fixedHeight,
    handMaxWidth, battlefieldMaxWidth, minCardWidth,
    zoneColumnWidth,
  } = config

  const availH = containerHeight - fixedHeight
  if (availH <= 0 || containerWidth <= 0) {
    const fallback: CardDimensions = { width: 100, height: 140 }
    return {
      rowHeight: 0,
      playerHand: fallback, opponentHand: fallback,
      playerLands: fallback, playerNonlands: fallback,
      opponentLands: fallback, opponentNonlands: fallback,
    }
  }

  const rowH = Math.floor(availH / NUM_ROWS)
  const handPadding = 32
  const bfPadding = 16
  const bfWidth = containerWidth - zoneColumnWidth

  return {
    rowHeight: rowH,
    playerHand: computeZoneCards(playerHandCount, rowH, containerWidth, handGap, handMaxWidth, minCardWidth, handPadding),
    opponentHand: computeZoneCards(opponentHandCount, rowH, containerWidth, handGap, handMaxWidth, minCardWidth, handPadding),
    playerLands: computeZoneCards(playerLandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, minCardWidth, bfPadding),
    playerNonlands: computeZoneCards(playerNonlandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, minCardWidth, bfPadding),
    opponentLands: computeZoneCards(opponentLandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, minCardWidth, bfPadding),
    opponentNonlands: computeZoneCards(opponentNonlandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, minCardWidth, bfPadding),
  }
}

function dimsEqual(a: BattleZoneDims, b: BattleZoneDims): boolean {
  return (
    a.rowHeight === b.rowHeight &&
    a.playerHand.width === b.playerHand.width &&
    a.playerHand.height === b.playerHand.height &&
    a.opponentHand.width === b.opponentHand.width &&
    a.opponentHand.height === b.opponentHand.height &&
    a.playerLands.width === b.playerLands.width &&
    a.playerLands.height === b.playerLands.height &&
    a.playerNonlands.width === b.playerNonlands.width &&
    a.playerNonlands.height === b.playerNonlands.height &&
    a.opponentLands.width === b.opponentLands.width &&
    a.opponentLands.height === b.opponentLands.height &&
    a.opponentNonlands.width === b.opponentNonlands.width &&
    a.opponentNonlands.height === b.opponentNonlands.height
  )
}

export function useBattleCardSizes(config: BattleZoneConfig): [
  React.RefCallback<HTMLElement>,
  BattleZoneDims
] {
  const {
    playerHandCount, opponentHandCount,
    playerLandCount, playerNonlandCount,
    opponentLandCount, opponentNonlandCount,
    handGap = 4,
    battlefieldGap = 12,
    fixedHeight = 0,
    handMaxWidth = 400,
    battlefieldMaxWidth = 300,
    minCardWidth = 40,
    zoneColumnWidth = 0,
  } = config

  const resolved = {
    playerHandCount, opponentHandCount,
    playerLandCount, playerNonlandCount,
    opponentLandCount, opponentNonlandCount,
    handGap, battlefieldGap, fixedHeight,
    handMaxWidth, battlefieldMaxWidth, minCardWidth,
    zoneColumnWidth,
  }

  const [dims, setDims] = useState<BattleZoneDims>(() => ({
    rowHeight: 0,
    playerHand: { width: handMaxWidth, height: Math.round(handMaxWidth * CARD_ASPECT_RATIO) },
    opponentHand: { width: handMaxWidth, height: Math.round(handMaxWidth * CARD_ASPECT_RATIO) },
    playerLands: { width: battlefieldMaxWidth, height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO) },
    playerNonlands: { width: battlefieldMaxWidth, height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO) },
    opponentLands: { width: battlefieldMaxWidth, height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO) },
    opponentNonlands: { width: battlefieldMaxWidth, height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO) },
  }))

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (containerWidth: number, containerHeight: number) => {
      return computeBattleZones(containerWidth, containerHeight, resolved)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      playerHandCount, opponentHandCount,
      playerLandCount, playerNonlandCount,
      opponentLandCount, opponentNonlandCount,
      handGap, battlefieldGap, fixedHeight,
      handMaxWidth, battlefieldMaxWidth, minCardWidth,
      zoneColumnWidth,
    ]
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
        setDims((prev) => dimsEqual(prev, next) ? prev : next)
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
      setDims((prev) => dimsEqual(prev, next) ? prev : next)
    }
  }, [compute])

  return [refCallback, dims]
}

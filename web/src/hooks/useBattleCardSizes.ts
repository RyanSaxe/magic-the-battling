import { useState, useCallback, useRef, useLayoutEffect } from 'react'
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
  zoneColumnWidth?: number
}

interface BattleZoneDims {
  rowHeight: number
  playerHandGap: number
  opponentHandGap: number
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
  padding: number,
): CardDimensions {
  const baseCardW = Math.floor(rowH / CARD_ASPECT_RATIO)

  if (count === 0) {
    const w = Math.min(baseCardW, maxWidth)
    return { width: w, height: Math.round(w * CARD_ASPECT_RATIO) }
  }

  const horizontalCap = Math.floor((containerW - padding - (count - 1) * gap) / count)
  const cardW = Math.max(1, Math.min(baseCardW, horizontalCap, maxWidth))
  return { width: cardW, height: Math.round(cardW * CARD_ASPECT_RATIO) }
}

function computeHandCards(
  count: number,
  rowH: number,
  containerW: number,
  defaultGap: number,
  maxWidth: number,
  padding: number,
): CardDimensions & { gap: number } {
  const baseCardW = Math.floor(rowH / CARD_ASPECT_RATIO)
  const idealW = Math.min(baseCardW, maxWidth)

  if (count <= 1) {
    return { width: idealW, height: Math.round(idealW * CARD_ASPECT_RATIO), gap: defaultGap }
  }

  const spaceNeeded = count * idealW + (count - 1) * defaultGap + padding
  if (spaceNeeded <= containerW) {
    return { width: idealW, height: Math.round(idealW * CARD_ASPECT_RATIO), gap: defaultGap }
  }

  const neededGap = Math.floor((containerW - padding - count * idealW) / (count - 1))
  const minGap = -Math.floor(idealW * 0.2)

  if (neededGap >= minGap) {
    return { width: idealW, height: Math.round(idealW * CARD_ASPECT_RATIO), gap: neededGap }
  }

  const cardW = Math.max(1, Math.floor((containerW - padding - (count - 1) * minGap) / count))
  return { width: cardW, height: Math.round(cardW * CARD_ASPECT_RATIO), gap: minGap }
}

export function computeBattleZones(
  containerWidth: number,
  containerHeight: number,
  config: Required<Pick<BattleZoneConfig,
    'playerHandCount' | 'opponentHandCount' |
    'playerLandCount' | 'playerNonlandCount' |
    'opponentLandCount' | 'opponentNonlandCount' |
    'handGap' | 'battlefieldGap' | 'fixedHeight' |
    'handMaxWidth' | 'battlefieldMaxWidth' |
    'zoneColumnWidth'
  >>
): BattleZoneDims {
  const {
    playerHandCount, opponentHandCount,
    playerLandCount, playerNonlandCount,
    opponentLandCount, opponentNonlandCount,
    handGap, battlefieldGap, fixedHeight,
    handMaxWidth, battlefieldMaxWidth,
    zoneColumnWidth,
  } = config

  const availH = containerHeight - fixedHeight
  if (availH <= 0 || containerWidth <= 0) {
    const fallback: CardDimensions = { width: 100, height: 140 }
    return {
      rowHeight: 0,
      playerHandGap: handGap,
      opponentHandGap: handGap,
      playerHand: fallback, opponentHand: fallback,
      playerLands: fallback, playerNonlands: fallback,
      opponentLands: fallback, opponentNonlands: fallback,
    }
  }

  const rowH = Math.floor(availH / NUM_ROWS)
  const handPadding = 48 // 32px from .hand-zone CSS + 16px from px-2 container
  const bfPadding = 16
  const bfWidth = containerWidth - zoneColumnWidth
  const handWidth = containerWidth - zoneColumnWidth

  const playerHandResult = computeHandCards(playerHandCount, rowH, handWidth, handGap, handMaxWidth, handPadding)
  const opponentHandResult = computeHandCards(opponentHandCount, rowH, handWidth, handGap, handMaxWidth, handPadding)

  return {
    rowHeight: rowH,
    playerHandGap: playerHandResult.gap,
    opponentHandGap: opponentHandResult.gap,
    playerHand: { width: playerHandResult.width, height: playerHandResult.height },
    opponentHand: { width: opponentHandResult.width, height: opponentHandResult.height },
    playerLands: computeZoneCards(playerLandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, bfPadding),
    playerNonlands: computeZoneCards(playerNonlandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, bfPadding),
    opponentLands: computeZoneCards(opponentLandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, bfPadding),
    opponentNonlands: computeZoneCards(opponentNonlandCount, rowH, bfWidth, battlefieldGap, battlefieldMaxWidth, bfPadding),
  }
}

function dimsEqual(a: BattleZoneDims, b: BattleZoneDims): boolean {
  return (
    a.rowHeight === b.rowHeight &&
    a.playerHandGap === b.playerHandGap &&
    a.opponentHandGap === b.opponentHandGap &&
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
    handGap = 6,
    battlefieldGap = 6,
    fixedHeight = 0,
    handMaxWidth = 400,
    battlefieldMaxWidth = 300,
    zoneColumnWidth = 0,
  } = config

  const resolved = {
    playerHandCount, opponentHandCount,
    playerLandCount, playerNonlandCount,
    opponentLandCount, opponentNonlandCount,
    handGap, battlefieldGap, fixedHeight,
    handMaxWidth, battlefieldMaxWidth,
    zoneColumnWidth,
  }

  const [dims, setDims] = useState<BattleZoneDims>(() => ({
    rowHeight: 0,
    playerHandGap: handGap,
    opponentHandGap: handGap,
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
      handMaxWidth, battlefieldMaxWidth,
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

      const cs = getComputedStyle(node)
      const w = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const next = compute(w, h)
      setDims((prev) => dimsEqual(prev, next) ? prev : next)

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

  useLayoutEffect(() => {
    if (elementRef.current) {
      const cs = getComputedStyle(elementRef.current)
      const w = elementRef.current.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = elementRef.current.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const next = compute(w, h)
      setDims((prev) => dimsEqual(prev, next) ? prev : next)
    }
  }, [compute])

  return [refCallback, dims]
}

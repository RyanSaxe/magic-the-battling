import { useState, useCallback, useRef, useLayoutEffect } from 'react'

const CARD_ASPECT_RATIO = 7 / 5

interface UseAutoFitCardSizesOptions {
  cardCount: number
  gap?: number
  padding?: number
  minCardWidth?: number
  maxCardWidth?: number
}

interface AutoFitCardDimensions {
  width: number
  height: number
  rows: number
}

export function useAutoFitCardSizes({
  cardCount,
  gap = 6,
  padding = 0,
  minCardWidth = 40,
  maxCardWidth = 200,
}: UseAutoFitCardSizesOptions): [React.RefCallback<HTMLElement>, AutoFitCardDimensions] {
  const [dims, setDims] = useState<AutoFitCardDimensions>(() => ({
    width: maxCardWidth,
    height: Math.round(maxCardWidth * CARD_ASPECT_RATIO),
    rows: 1,
  }))

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (containerWidth: number, containerHeight: number) => {
      if (cardCount === 0) {
        return { width: maxCardWidth, height: Math.round(maxCardWidth * CARD_ASPECT_RATIO), rows: 1 }
      }

      const availWidth = containerWidth - padding * 2
      let best: AutoFitCardDimensions = { width: minCardWidth, height: Math.round(minCardWidth * CARD_ASPECT_RATIO), rows: 1 }

      for (let rows = 1; rows <= cardCount; rows++) {
        const cardsPerRow = Math.ceil(cardCount / rows)
        const hGaps = gap * Math.max(0, cardsPerRow - 1)
        let cardWidth = (availWidth - hGaps) / cardsPerRow
        cardWidth = Math.min(maxCardWidth, Math.max(minCardWidth, cardWidth))
        cardWidth = Math.round(cardWidth)
        const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO)
        const vGaps = gap * (rows - 1)
        const totalHeight = rows * cardHeight + vGaps

        if (totalHeight <= containerHeight) {
          best = { width: cardWidth, height: cardHeight, rows }
        } else {
          break
        }
      }

      return best
    },
    [cardCount, gap, padding, minCardWidth, maxCardWidth]
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
        prev.width === next.width && prev.height === next.height && prev.rows === next.rows
          ? prev
          : next
      )

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        const next = compute(width, height)
        setDims((prev) =>
          prev.width === next.width && prev.height === next.height && prev.rows === next.rows
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
        prev.width === next.width && prev.height === next.height && prev.rows === next.rows
          ? prev
          : next
      )
    }
  }, [compute])

  return [refCallback, dims]
}

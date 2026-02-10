import { useState, useCallback, useRef, useLayoutEffect } from 'react'

const CARD_ASPECT_RATIO = 7 / 5

interface UseContainerCardSizesOptions {
  cardCount: number
  gap?: number
  padding?: number
  minCardWidth?: number
  maxCardWidth?: number
  rows?: number
}

interface ContainerCardDimensions {
  width: number
  height: number
  columns: number
}

export function useContainerCardSizes({
  cardCount,
  gap = 6,
  padding = 0,
  minCardWidth = 40,
  maxCardWidth = 300,
  rows = 1,
}: UseContainerCardSizesOptions): [React.RefCallback<HTMLElement>, ContainerCardDimensions] {
  const [dims, setDims] = useState<ContainerCardDimensions>(() => ({
    width: maxCardWidth,
    height: Math.round(maxCardWidth * CARD_ASPECT_RATIO),
    columns: 1,
  }))

  const observerRef = useRef<ResizeObserver | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  const compute = useCallback(
    (containerWidth: number) => {
      if (cardCount === 0) {
        return { width: maxCardWidth, height: Math.round(maxCardWidth * CARD_ASPECT_RATIO), columns: 1 }
      }

      const cardsPerRow = rows > 1 ? Math.ceil(cardCount / rows) : cardCount
      const totalGap = gap * Math.max(0, cardsPerRow - 1)
      const available = containerWidth - padding * 2 - totalGap
      const rawWidth = available / cardsPerRow
      const width = Math.round(Math.min(maxCardWidth, Math.max(minCardWidth, rawWidth)))
      const height = Math.round(width * CARD_ASPECT_RATIO)
      return { width, height, columns: cardsPerRow }
    },
    [cardCount, gap, padding, minCardWidth, maxCardWidth, rows]
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
      const next = compute(w)
      setDims((prev) => (prev.width === next.width && prev.height === next.height && prev.columns === next.columns ? prev : next))

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const containerWidth = entry.contentRect.width
        const next = compute(containerWidth)
        setDims((prev) => (prev.width === next.width && prev.height === next.height && prev.columns === next.columns ? prev : next))
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
      const next = compute(w)
      setDims((prev) => (prev.width === next.width && prev.height === next.height && prev.columns === next.columns ? prev : next))
    }
  }, [compute])

  return [refCallback, dims]
}

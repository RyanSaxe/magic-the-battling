export const CARD_ASPECT_RATIO = 7 / 5

export interface ZoneDims {
  width: number
  height: number
  rows: number
  columns: number
}

export function bestFit(
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

  let bestScore = -1
  let bestResult: ZoneDims | null = null

  for (let rows = 1; rows <= count; rows++) {
    const cardsPerRow = Math.ceil(count / rows)
    const hGaps = gap * Math.max(0, cardsPerRow - 1)
    const naturalWidth = (availWidth - hGaps) / cardsPerRow

    if (naturalWidth < minWidth) continue

    let cardWidth = Math.floor(Math.min(maxWidth, naturalWidth))
    let cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO)
    let totalHeight = rows * cardHeight + gap * (rows - 1)

    if (totalHeight > availHeight) {
      const vGaps = gap * (rows - 1)
      const maxWidthFromHeight = Math.floor((availHeight - vGaps) / (rows * CARD_ASPECT_RATIO))
      if (maxWidthFromHeight < minWidth) continue
      cardWidth = maxWidthFromHeight
      cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO)
      totalHeight = rows * cardHeight + vGaps
    }

    const score = cardWidth * Math.pow(0.90, rows - 1)
    if (score > bestScore) {
      bestScore = score
      bestResult = { width: cardWidth, height: cardHeight, rows, columns: cardsPerRow }
    }
  }

  if (bestResult) return bestResult

  return { width: minWidth, height: Math.round(minWidth * CARD_ASPECT_RATIO), rows: 1, columns: count }
}

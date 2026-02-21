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

  for (let rows = 1; rows <= count; rows++) {
    const cardsPerRow = Math.ceil(count / rows)
    const hGaps = gap * Math.max(0, cardsPerRow - 1)
    const naturalWidth = (availWidth - hGaps) / cardsPerRow

    if (naturalWidth < minWidth) continue

    const cardWidth = Math.floor(Math.min(maxWidth, naturalWidth))
    const cardHeight = Math.round(cardWidth * CARD_ASPECT_RATIO)
    const totalHeight = rows * cardHeight + gap * (rows - 1)

    if (totalHeight <= availHeight) {
      return { width: cardWidth, height: cardHeight, rows, columns: cardsPerRow }
    }
  }

  return { width: minWidth, height: Math.round(minWidth * CARD_ASPECT_RATIO), rows: 1, columns: count }
}

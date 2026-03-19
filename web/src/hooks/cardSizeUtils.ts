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

    const fill = Math.min(1, totalHeight / availHeight)
    const score = cardWidth * Math.sqrt(fill) * Math.pow(0.90, rows - 1)
    if (score > bestScore) {
      bestScore = score
      bestResult = { width: cardWidth, height: cardHeight, rows, columns: cardsPerRow }
    }
  }

  if (bestResult) return bestResult

  return { width: minWidth, height: Math.round(minWidth * CARD_ASPECT_RATIO), rows: 1, columns: count }
}

function fitsWithinBounds(
  dims: ZoneDims,
  availWidth: number,
  availHeight: number,
  gap: number,
): boolean {
  const totalWidth = dims.columns * dims.width + gap * Math.max(0, dims.columns - 1)
  const totalHeight = dims.rows * dims.height + gap * Math.max(0, dims.rows - 1)

  return totalWidth <= availWidth && totalHeight <= availHeight
}

export function bestFitNoClip(
  count: number,
  availWidth: number,
  availHeight: number,
  gap: number,
  maxWidth: number,
  preferredMinWidth: number,
): ZoneDims {
  const preferred = bestFit(count, availWidth, availHeight, gap, maxWidth, preferredMinWidth)
  if (fitsWithinBounds(preferred, availWidth, availHeight, gap)) {
    return preferred
  }

  let bestScore = -1
  let bestResult: ZoneDims | null = null

  for (let rows = 1; rows <= count; rows++) {
    const columns = Math.ceil(count / rows)
    const widthByColumns = Math.floor((availWidth - gap * Math.max(0, columns - 1)) / columns)
    const widthByRows = Math.floor(
      (availHeight - gap * Math.max(0, rows - 1)) / (rows * CARD_ASPECT_RATIO),
    )
    const cardWidth = Math.floor(Math.min(maxWidth, widthByColumns, widthByRows))
    if (cardWidth < 1) continue

    const candidate = {
      width: cardWidth,
      height: Math.round(cardWidth * CARD_ASPECT_RATIO),
      rows,
      columns,
    }

    if (!fitsWithinBounds(candidate, availWidth, availHeight, gap)) continue

    const totalHeight = rows * candidate.height + gap * Math.max(0, rows - 1)
    const fill = availHeight > 0 ? Math.min(1, totalHeight / availHeight) : 0
    const minWidthPenalty = candidate.width < preferredMinWidth ? 0.96 : 1
    const score = candidate.width * Math.sqrt(fill) * Math.pow(0.90, rows - 1) * minWidthPenalty

    if (score > bestScore) {
      bestScore = score
      bestResult = candidate
    }
  }

  if (bestResult) return bestResult

  const safeWidth = Math.max(
    1,
    Math.floor(
      Math.min(
        maxWidth,
        availWidth,
        availHeight / CARD_ASPECT_RATIO,
      ),
    ),
  )

  return {
    width: safeWidth,
    height: Math.max(1, Math.round(safeWidth * CARD_ASPECT_RATIO)),
    rows: count,
    columns: 1,
  }
}

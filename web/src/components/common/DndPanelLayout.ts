import { bestFit, type ZoneDims } from '../../hooks/cardSizeUtils'

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 }
const PANEL_GAP = 6
const PANEL_MAX_WIDTH = 200
const PANEL_MIN_WIDTH = 40

export function resolveBattlePanelLayout(count: number, width: number, height: number): ZoneDims {
  if (count <= 0 || width <= 0 || height <= 0) {
    return DEFAULT_DIMS
  }

  const baseFit = bestFit(count, width, height, PANEL_GAP, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH)
  let best = baseFit
  let bestScore = baseFit.width
    + (baseFit.columns > 1 ? 12 : 0)
    - Math.abs(baseFit.rows - baseFit.columns) * 2

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns)
    const widthByColumns = Math.floor((width - PANEL_GAP * Math.max(0, columns - 1)) / columns)
    const widthByRows = Math.floor(
      (height - PANEL_GAP * Math.max(0, rows - 1)) / rows / (7 / 5),
    )
    const cardWidth = Math.floor(Math.min(PANEL_MAX_WIDTH, widthByColumns, widthByRows))

    if (cardWidth < 1) {
      continue
    }

    const candidate = {
      width: cardWidth,
      height: Math.round(cardWidth * (7 / 5)),
      rows,
      columns,
    }

    const totalWidth = candidate.columns * candidate.width + PANEL_GAP * Math.max(0, candidate.columns - 1)
    const totalHeight = candidate.rows * candidate.height + PANEL_GAP * Math.max(0, candidate.rows - 1)
    if (totalWidth > width || totalHeight > height) {
      continue
    }

    const fill = (totalWidth * totalHeight) / Math.max(1, width * height)
    const multiColumnBonus = candidate.columns > 1 ? 14 : 0
    const balancePenalty = Math.abs(candidate.rows - candidate.columns) * 2
    const score = candidate.width + fill * 18 + multiColumnBonus - balancePenalty

    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best
}

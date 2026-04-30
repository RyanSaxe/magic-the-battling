import { describe, it, expect } from 'vitest'
import { getUpgradeGridColumns, getUpgradeGridDims } from './upgradeGrid'
import { CARD_ASPECT_RATIO } from '../hooks/cardSizeUtils'

const GAP = 6

describe('getUpgradeGridColumns', () => {
  it('returns 1 for fewer than 4 upgrades', () => {
    expect(getUpgradeGridColumns(1)).toBe(1)
    expect(getUpgradeGridColumns(2)).toBe(1)
    expect(getUpgradeGridColumns(3)).toBe(1)
  })

  it('returns 2 for 4 or more upgrades', () => {
    expect(getUpgradeGridColumns(4)).toBe(2)
    expect(getUpgradeGridColumns(5)).toBe(2)
    expect(getUpgradeGridColumns(8)).toBe(2)
  })
})

describe('getUpgradeGridDims', () => {
  describe('with frame', () => {
    it('fits cards within the provided frame', () => {
      const dims = getUpgradeGridDims(
        3,
        { innerWidth: 200, innerHeight: 600, outerWidth: 224, outerHeight: 632 },
        { width: 100, height: 140, columns: 1, rows: 3 },
      )
      expect(dims.columns).toBe(1)
      expect(dims.rows).toBe(3)
      const totalH = dims.rows * dims.height + (dims.rows - 1) * GAP
      expect(totalH).toBeLessThanOrEqual(600)
    })
  })

  describe('fallback (no frame)', () => {
    it('does not overflow when fallbackDims has different cols/rows than renderer', () => {
      // Reproduces the production bug: computeLayout chose 2x2 grid for
      // commandZone (count=3 with minColumns=1), but UpgradeGrid renders
      // 1x3 via getUpgradeGridColumns. Without re-fitting, cards would
      // render at the 2-col width but in 3 rows, overflowing massively.
      const fallbackDims = { width: 138, height: 193, columns: 2, rows: 2 }
      const availH = fallbackDims.rows * fallbackDims.height
        + (fallbackDims.rows - 1) * GAP
      const availW = fallbackDims.columns * fallbackDims.width
        + (fallbackDims.columns - 1) * GAP

      const dims = getUpgradeGridDims(3, null, fallbackDims)
      expect(dims.columns).toBe(1)
      expect(dims.rows).toBe(3)

      const renderedH = dims.rows * dims.height + (dims.rows - 1) * GAP
      const renderedW = dims.columns * dims.width + (dims.columns - 1) * GAP
      expect(renderedH).toBeLessThanOrEqual(availH)
      expect(renderedW).toBeLessThanOrEqual(availW)
      expect(dims.height).toBe(Math.round(dims.width * CARD_ASPECT_RATIO))
    })

    it('handles count=0 without crashing', () => {
      const dims = getUpgradeGridDims(0, null, { width: 100, height: 140, columns: 1, rows: 1 })
      expect(dims.width).toBe(100)
      expect(dims.height).toBe(140)
    })

    it('handles default (uncomputed) fallbackDims gracefully', () => {
      // Initial render before useCardLayout has measured the container.
      const dims = getUpgradeGridDims(3, null, { width: 100, height: 140, columns: 1, rows: 1 })
      expect(dims.columns).toBe(1)
      expect(dims.rows).toBe(3)
      // Width should be small but non-zero, not overflowing the 100x140 area.
      expect(dims.width).toBeGreaterThan(0)
      const totalH = dims.rows * dims.height + (dims.rows - 1) * GAP
      expect(totalH).toBeLessThanOrEqual(140)
    })
  })
})

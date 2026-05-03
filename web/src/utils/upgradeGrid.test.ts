import { describe, it, expect } from 'vitest'
import { getUpgradeGridDims, getUpgradeZoneLayoutBounds } from './upgradeGrid'
import { CARD_ASPECT_RATIO } from '../hooks/cardSizeUtils'

const GAP = 6

describe('getUpgradeZoneLayoutBounds', () => {
  it('locks to 1 column for count <= 2', () => {
    expect(getUpgradeZoneLayoutBounds(0)).toEqual({ minColumns: 1, maxColumns: 1 })
    expect(getUpgradeZoneLayoutBounds(1)).toEqual({ minColumns: 1, maxColumns: 1 })
    expect(getUpgradeZoneLayoutBounds(2)).toEqual({ minColumns: 1, maxColumns: 1 })
  })

  it('lets pass 1 pick 1 or 2 columns for count == 3', () => {
    expect(getUpgradeZoneLayoutBounds(3)).toEqual({ minColumns: 1, maxColumns: 2 })
  })

  it('locks to 2 columns for count >= 4', () => {
    expect(getUpgradeZoneLayoutBounds(4)).toEqual({ minColumns: 2, maxColumns: 2 })
    expect(getUpgradeZoneLayoutBounds(8)).toEqual({ minColumns: 2, maxColumns: 2 })
  })
})

describe('getUpgradeGridDims', () => {
  describe('with frame', () => {
    it('mirrors fallbackDims.columns when the layout picked 1 column', () => {
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

    it('mirrors fallbackDims.columns when the layout picked 2 columns', () => {
      const dims = getUpgradeGridDims(
        3,
        { innerWidth: 400, innerHeight: 400, outerWidth: 424, outerHeight: 432 },
        { width: 180, height: 252, columns: 2, rows: 2 },
      )
      expect(dims.columns).toBe(2)
      expect(dims.rows).toBe(2)
    })

    it('caps at 2 columns even if fallbackDims claims more', () => {
      const dims = getUpgradeGridDims(
        6,
        { innerWidth: 800, innerHeight: 400, outerWidth: 824, outerHeight: 432 },
        { width: 120, height: 168, columns: 4, rows: 2 },
      )
      expect(dims.columns).toBe(2)
    })
  })

  describe('fallback (no frame)', () => {
    it('handles count=0 without crashing', () => {
      const dims = getUpgradeGridDims(0, null, { width: 100, height: 140, columns: 1, rows: 1 })
      expect(dims.width).toBe(100)
      expect(dims.height).toBe(140)
    })

    it('handles default (uncomputed) fallbackDims gracefully', () => {
      const dims = getUpgradeGridDims(3, null, { width: 100, height: 140, columns: 1, rows: 1 })
      expect(dims.columns).toBe(1)
      expect(dims.rows).toBe(3)
      expect(dims.width).toBeGreaterThan(0)
      const totalH = dims.rows * dims.height + (dims.rows - 1) * GAP
      expect(totalH).toBeLessThanOrEqual(140)
    })

    it('returns aspect-correct cell heights', () => {
      const dims = getUpgradeGridDims(
        3,
        { innerWidth: 200, innerHeight: 600, outerWidth: 224, outerHeight: 632 },
        { width: 100, height: 140, columns: 1, rows: 3 },
      )
      expect(dims.height).toBe(Math.round(dims.width * CARD_ASPECT_RATIO))
    })
  })
})

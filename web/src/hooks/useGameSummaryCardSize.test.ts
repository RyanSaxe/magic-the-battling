import { describe, it, expect } from 'vitest'
import { computeSize } from './useGameSummaryCardSize'

const MIN_CARD_WIDTH = 30

describe('computeSize', () => {
  describe('CZ padding regression', () => {
    it('does not fall back to minCardWidth with 2 command zone items', () => {
      const result = computeSize(1000, 700, {
        handCount: 6,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 2,
      })
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('does not fall back to minCardWidth with 3 command zone items', () => {
      const result = computeSize(1000, 700, {
        handCount: 6,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 3,
      })
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('works with command zone only (no hand)', () => {
      const result = computeSize(800, 600, {
        handCount: 0,
        sideboardCount: 10,
        battlefieldCount: 2,
        commandZoneCount: 2,
      })
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })
  })

  describe('weighted bf/sb allocation', () => {
    it('produces battlefield cards smaller than or equal to sideboard cards', () => {
      const result = computeSize(1000, 600, {
        handCount: 7,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 1,
      })
      expect(result.battlefield.width).toBeLessThanOrEqual(result.sideboard.width)
    })

    it('still works with only battlefield (no sideboard)', () => {
      const result = computeSize(800, 600, {
        handCount: 5,
        sideboardCount: 0,
        battlefieldCount: 3,
        commandZoneCount: 0,
      })
      expect(result.battlefield.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.sideboard.width).toBe(0)
    })

    it('still works with only sideboard (no battlefield)', () => {
      const result = computeSize(800, 600, {
        handCount: 5,
        sideboardCount: 10,
        battlefieldCount: 0,
        commandZoneCount: 0,
      })
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.battlefield.width).toBe(0)
    })
  })

  describe('CZ multi-column', () => {
    it('selects 2 CZ columns when height is tight with multiple CZ cards', () => {
      const result = computeSize(1200, 460, {
        handCount: 7,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 4,
      })
      expect(result.commandZone.columns).toBe(2)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('keeps 1 CZ column when only 1 CZ card', () => {
      const result = computeSize(1200, 700, {
        handCount: 7,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 1,
      })
      expect(result.commandZone.columns).toBe(1)
    })
  })

  describe('overflow fallback', () => {
    it('returns non-zero dims when all layouts overflow or have below-min cards', () => {
      const result = computeSize(300, 200, {
        handCount: 7,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 1,
      })
      expect(result.hand.width).toBeGreaterThan(0)
      expect(result.sideboard.width).toBeGreaterThan(0)
    })

    it('never returns all-zero dims for wide containers with tight height', () => {
      const result = computeSize(1200, 500, {
        handCount: 5,
        sideboardCount: 8,
        battlefieldCount: 4,
        commandZoneCount: 2,
      })
      expect(result.hand.width).toBeGreaterThan(0)
      expect(result.sideboard.width).toBeGreaterThan(0)
      expect(result.battlefield.width).toBeGreaterThan(0)
      expect(result.commandZone.width).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('returns minCardWidth fallback for zero-size container', () => {
      const result = computeSize(0, 0, {
        handCount: 5,
        sideboardCount: 10,
        battlefieldCount: 3,
        commandZoneCount: 1,
      })
      expect(result.hand.width).toBe(MIN_CARD_WIDTH)
      expect(result.hand.columns).toBe(1)
    })

    it('returns empty dims when all counts are zero', () => {
      const result = computeSize(800, 600, {
        handCount: 0,
        sideboardCount: 0,
        battlefieldCount: 0,
        commandZoneCount: 0,
      })
      expect(result.hand.columns).toBe(0)
      expect(result.sideboard.columns).toBe(0)
    })

    it('respects aspect ratio for all sections', () => {
      const ASPECT_RATIO = 7 / 5
      const result = computeSize(1000, 700, {
        handCount: 7,
        sideboardCount: 12,
        battlefieldCount: 3,
        commandZoneCount: 1,
      })
      for (const section of ['hand', 'sideboard', 'battlefield', 'commandZone'] as const) {
        const { width, height } = result[section]
        if (width > 0) {
          expect(height).toBe(Math.round(width * ASPECT_RATIO))
        }
      }
    })
  })
})

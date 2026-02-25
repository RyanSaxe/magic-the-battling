import { describe, it, expect } from 'vitest'
import { computeLayout, ZONE_LAYOUT_PADDING } from './useCardLayout'
import { CARD_ASPECT_RATIO } from './cardSizeUtils'

const MIN_CARD_WIDTH = 30

describe('computeLayout', () => {
  describe('dual-zone equivalence', () => {
    it('produces reasonable sizes for top+bottomLeft (Draft-style)', () => {
      const result = computeLayout(1200, 800, {
        zones: {
          pool: { count: 10, maxCardWidth: 300 },
          pack: { count: 15, maxCardWidth: 400 },
        },
        layout: { top: ['pool'], bottomLeft: ['pack'] },
        fixedHeight: 65,
        padding: 24,
      })
      expect(result.pool.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.pack.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.pool.height).toBe(Math.round(result.pool.width * CARD_ASPECT_RATIO))
      expect(result.pack.height).toBe(Math.round(result.pack.width * CARD_ASPECT_RATIO))
    })

    it('matches computeDualZone pattern: widths are reasonable for equal counts', () => {
      const result = computeLayout(1000, 600, {
        zones: {
          top: { count: 8 },
          bottom: { count: 8 },
        },
        layout: { top: ['top'], bottomLeft: ['bottom'] },
      })
      expect(result.top.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.bottom.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })
  })

  describe('single zone', () => {
    it('uses bestFit when only one zone has count > 0', () => {
      const result = computeLayout(800, 600, {
        zones: {
          hand: { count: 7 },
          sideboard: { count: 0 },
        },
        layout: { top: ['hand'], bottomLeft: ['sideboard'] },
      })
      expect(result.hand.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.hand.rows).toBeGreaterThanOrEqual(1)
      expect(result.hand.columns).toBeGreaterThanOrEqual(1)
    })

    it('returns defaults for zones with count=0', () => {
      const result = computeLayout(800, 600, {
        zones: {
          hand: { count: 7 },
          sideboard: { count: 0 },
        },
        layout: { top: ['hand'], bottomLeft: ['sideboard'] },
      })
      expect(result.sideboard).toBeDefined()
    })
  })

  describe('fill zones', () => {
    it('battlefield (fill) gets remaining height and is ≤ sideboard', () => {
      const result = computeLayout(1000, 600, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.battlefield.width).toBeLessThanOrEqual(result.sideboard.width)
      expect(result.battlefield.width).toBeGreaterThan(0)
    })

    it('battlefield is at least 50% of smallest primary card (with minCardWidth floor)', () => {
      const result = computeLayout(1000, 600, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'] },
        ...ZONE_LAYOUT_PADDING,
      })
      const smallerPrimary = Math.min(result.hand.width, result.sideboard.width)
      const fillMin = Math.max(MIN_CARD_WIDTH, Math.round(smallerPrimary * 0.5))
      expect(result.battlefield.width).toBeGreaterThanOrEqual(fillMin)
    })

    it('works with only battlefield (no sideboard)', () => {
      const result = computeLayout(800, 600, {
        zones: {
          hand: { count: 5 },
          battlefield: { count: 3, priority: 'fill', maxRows: 1 },
          sideboard: { count: 0 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.battlefield.width).toBeGreaterThan(0)
    })
  })

  describe('right column (command zone)', () => {
    it('CZ sizes correctly in bottom-right', () => {
      const result = computeLayout(1000, 700, {
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 2 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('prefers 2 CZ columns when 1 col overflows', () => {
      const result = computeLayout(1000, 350, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 3 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.commandZone.columns).toBe(2)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('CZ cards do not overflow when top zone takes significant height', () => {
      const result = computeLayout(1100, 700, {
        zones: {
          hand: { count: 5 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 8 },
          commandZone: { count: 3 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      const handH = result.hand.rows * result.hand.height + (result.hand.rows - 1) * 6
      const topH = handH + ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom
      const bottomH = 700 - topH - ZONE_LAYOUT_PADDING.sectionGap
      const czTotalH = result.commandZone.rows * result.commandZone.height
        + (result.commandZone.rows - 1) * 6
        + ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom
      expect(czTotalH).toBeLessThanOrEqual(bottomH)
    })

    it('keeps 1 CZ column when only 1 CZ card', () => {
      const result = computeLayout(1200, 700, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 1 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.commandZone.columns).toBe(1)
    })
  })

  describe('overflow fallback', () => {
    it('returns non-zero dims even in tight containers', () => {
      const result = computeLayout(300, 200, {
        zones: {
          hand: { count: 7 },
          sideboard: { count: 12 },
        },
        layout: { top: ['hand'], bottomLeft: ['sideboard'] },
      })
      expect(result.hand.width).toBeGreaterThan(0)
      expect(result.sideboard.width).toBeGreaterThan(0)
    })

    it('never returns all-zero dims for wide containers with tight height', () => {
      const result = computeLayout(1200, 500, {
        zones: {
          hand: { count: 5 },
          battlefield: { count: 4, priority: 'fill', maxRows: 1 },
          sideboard: { count: 8 },
          commandZone: { count: 2 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.hand.width).toBeGreaterThan(0)
      expect(result.sideboard.width).toBeGreaterThan(0)
    })
  })

  describe('aspect ratio', () => {
    it('all zones maintain 7/5 ratio', () => {
      const result = computeLayout(1000, 700, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 1 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      for (const zone of ['hand', 'sideboard', 'battlefield', 'commandZone'] as const) {
        const { width, height } = result[zone]
        if (width > 0) {
          expect(height).toBe(Math.round(width * CARD_ASPECT_RATIO))
        }
      }
    })
  })

  describe('row penalty (anti-flicker)', () => {
    it('fewer rows win at crossover boundary where fill is slightly better with more rows', () => {
      const result = computeLayout(1000, 400, {
        zones: {
          cards: { count: 8 },
        },
        layout: { top: ['cards'] },
      })
      const result2 = computeLayout(1001, 400, {
        zones: {
          cards: { count: 8 },
        },
        layout: { top: ['cards'] },
      })
      expect(result.cards.rows).toBe(result2.cards.rows)
    })
  })

  describe('edge cases', () => {
    it('returns defaults for zero container', () => {
      const result = computeLayout(0, 0, {
        zones: { hand: { count: 5 } },
        layout: { top: ['hand'] },
      })
      expect(result.hand.width).toBe(100)
      expect(result.hand.height).toBe(140)
    })

    it('returns defaults for all zero counts', () => {
      const result = computeLayout(800, 600, {
        zones: {
          hand: { count: 0 },
          sideboard: { count: 0 },
        },
        layout: { top: ['hand'], bottomLeft: ['sideboard'] },
      })
      expect(result.hand).toBeDefined()
      expect(result.sideboard).toBeDefined()
    })

    it('handles only fill zones (no primary zones)', () => {
      const result = computeLayout(800, 600, {
        zones: {
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
        },
        layout: { bottomLeft: ['battlefield'] },
      })
      expect(result.battlefield.width).toBeGreaterThan(0)
    })

    it('Build.tsx scenario: hand + bf + sideboard, no CZ', () => {
      const result = computeLayout(1000, 600, {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.hand.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.battlefield.width).toBeGreaterThan(0)
      expect(result.battlefield.width).toBeLessThanOrEqual(result.sideboard.width)
    })

    it('DeckDisplay scenario: all four zones active', () => {
      const result = computeLayout(1000, 700, {
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: 'fill', maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 2 },
        },
        layout: { top: ['hand'], bottomLeft: ['battlefield', 'sideboard'], bottomRight: ['commandZone'] },
        ...ZONE_LAYOUT_PADDING,
      })
      expect(result.hand.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.sideboard.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.commandZone.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })
  })
})

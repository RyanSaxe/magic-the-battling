import { describe, it, expect } from 'vitest'
import { computeBattleZones } from './useBattleCardSizes'

const CARD_ASPECT_RATIO = 7 / 5
const NUM_ROWS = 6

const MIN_CARD_WIDTH = 40

const defaults = {
  playerHandCount: 7,
  opponentHandCount: 5,
  playerLandCount: 4,
  playerNonlandCount: 3,
  opponentLandCount: 3,
  opponentNonlandCount: 2,
  handGap: 6,
  battlefieldGap: 6,
  fixedHeight: 72,
  handMaxWidth: 400,
  battlefieldMaxWidth: 300,
  zoneColumnWidth: 0,
}

describe('computeBattleZones', () => {
  describe('normal container', () => {
    it('sizes cards appropriately on a standard viewport', () => {
      const result = computeBattleZones(1200, 800, defaults)
      expect(result.playerHand.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.playerLands.width).toBeGreaterThan(MIN_CARD_WIDTH)
      expect(result.opponentLands.width).toBeGreaterThan(MIN_CARD_WIDTH)
    })

    it('maintains aspect ratio for all zones', () => {
      const result = computeBattleZones(1200, 800, defaults)
      const zones = [
        result.playerHand, result.opponentHand,
        result.playerLands, result.playerNonlands,
        result.opponentLands, result.opponentNonlands,
      ]
      for (const z of zones) {
        expect(z.height).toBe(Math.round(z.width * CARD_ASPECT_RATIO))
      }
    })
  })

  describe('short container', () => {
    it('sizes cards smaller but proportionally on a short viewport', () => {
      const result = computeBattleZones(1200, 350, defaults)
      expect(result.playerLands.width).toBeGreaterThan(0)
      expect(result.playerNonlands.width).toBeGreaterThan(0)
      expect(result.opponentLands.width).toBeGreaterThan(0)
    })

    it('card height never exceeds row height', () => {
      const result = computeBattleZones(1200, 350, defaults)
      const rowH = Math.floor((350 - defaults.fixedHeight) / NUM_ROWS)
      const zones = [
        result.playerLands, result.playerNonlands,
        result.opponentLands, result.opponentNonlands,
      ]
      for (const z of zones) {
        expect(z.height).toBeLessThanOrEqual(rowH)
      }
    })

    it('maintains aspect ratio on short viewport', () => {
      const result = computeBattleZones(1200, 350, defaults)
      const zones = [
        result.playerHand, result.opponentHand,
        result.playerLands, result.playerNonlands,
        result.opponentLands, result.opponentNonlands,
      ]
      for (const z of zones) {
        expect(z.height).toBe(Math.round(z.width * CARD_ASPECT_RATIO))
      }
    })
  })
})

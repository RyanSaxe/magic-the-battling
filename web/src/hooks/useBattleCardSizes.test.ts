import { describe, it, expect } from "vitest";
import { CARD_ASPECT_RATIO, MIN_CARD_WIDTH } from "./cardSizeUtils";
import { computeBattleZones } from "./useBattleCardSizes";

const NUM_ROWS = 6;

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
};

describe("computeBattleZones", () => {
  describe("normal container", () => {
    it("sizes cards appropriately on a standard viewport", () => {
      const result = computeBattleZones(1200, 800, defaults);
      expect(result.playerHand.width).toBeGreaterThan(MIN_CARD_WIDTH);
      expect(result.playerLands.width).toBeGreaterThan(MIN_CARD_WIDTH);
      expect(result.opponentLands.width).toBeGreaterThan(MIN_CARD_WIDTH);
    });

    it("maintains aspect ratio for all zones", () => {
      const result = computeBattleZones(1200, 800, defaults);
      const zones = [
        result.playerHand,
        result.opponentHand,
        result.playerLands,
        result.playerNonlands,
        result.opponentLands,
        result.opponentNonlands,
      ];
      for (const z of zones) {
        expect(z.height).toBe(Math.round(z.width * CARD_ASPECT_RATIO));
      }
    });
  });

  describe("full battlefield row", () => {
    it("fits inside the zone's padding and border", () => {
      const zoneWidth = 314; // the battlefield on a 390px phone
      const paddingAndBorder = 2 * (8 + 2);
      const count = 4;
      const result = computeBattleZones(zoneWidth, 800, {
        ...defaults,
        playerNonlandCount: count,
      });
      const rowWidth =
        count * result.playerNonlands.width +
        (count - 1) * defaults.battlefieldGap;
      expect(rowWidth).toBeLessThanOrEqual(zoneWidth - paddingAndBorder);
    });
  });

  describe("short container", () => {
    it("sizes cards smaller but proportionally on a short viewport", () => {
      const result = computeBattleZones(1200, 350, defaults);
      expect(result.playerLands.width).toBeGreaterThan(0);
      expect(result.playerNonlands.width).toBeGreaterThan(0);
      expect(result.opponentLands.width).toBeGreaterThan(0);
    });

    it("card height never exceeds row height", () => {
      const result = computeBattleZones(1200, 350, defaults);
      const rowH = Math.floor((350 - defaults.fixedHeight) / NUM_ROWS);
      const zones = [
        result.playerLands,
        result.playerNonlands,
        result.opponentLands,
        result.opponentNonlands,
      ];
      for (const z of zones) {
        expect(z.height).toBeLessThanOrEqual(rowH);
      }
    });

    it("maintains aspect ratio on short viewport", () => {
      const result = computeBattleZones(1200, 350, defaults);
      const zones = [
        result.playerHand,
        result.opponentHand,
        result.playerLands,
        result.playerNonlands,
        result.opponentLands,
        result.opponentNonlands,
      ];
      for (const z of zones) {
        expect(z.height).toBe(Math.round(z.width * CARD_ASPECT_RATIO));
      }
    });

    it("allows cards below 40px on very short screens rather than hiding or scrolling", () => {
      const result = computeBattleZones(1200, 350, defaults);
      expect(result.playerHand.width).toBeLessThan(MIN_CARD_WIDTH);
      expect(result.opponentHand.width).toBeLessThan(MIN_CARD_WIDTH);
      expect(result.playerHand.width).toBeGreaterThan(0);
    });
  });

  describe("hand fanning", () => {
    it("overlaps hand cards with a negative gap before shrinking them", () => {
      const result = computeBattleZones(500, 800, {
        ...defaults,
        playerHandCount: 7,
      });
      expect(result.playerHandGap).toBeLessThan(0);
      expect(result.playerHand.width).toBeGreaterThan(0);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  computeConstrainedFrames,
  computeConstrainedLayout,
  computeConstrainedLayoutState,
  deriveConstraintsFromLayout,
} from "./computeConstrainedLayout";
import { computeLayout, ZONE_LAYOUT_PADDING } from "./useCardLayout";
import { CARD_ASPECT_RATIO } from "./cardSizeUtils";

describe("computeConstrainedLayout", () => {
  describe("single zone with constraints", () => {
    it("ignores constraints when only one zone is active", () => {
      const result = computeConstrainedLayout(
        800,
        600,
        {
          zones: { hand: { count: 7 }, sideboard: { count: 0 } },
          layout: { top: ["hand"], bottomLeft: ["sideboard"] },
        },
        { topFraction: 0.5 },
      );
      expect(result.hand.width).toBeGreaterThan(0);
      expect(result.hand.height).toBe(
        Math.round(result.hand.width * CARD_ASPECT_RATIO),
      );
    });
  });

  describe("two zones with topFraction", () => {
    it("splits evenly with topFraction = 0.5", () => {
      const result = computeConstrainedLayout(
        1000,
        600,
        {
          zones: {
            pack: { count: 10, maxCardWidth: 300 },
            pool: { count: 10, maxCardWidth: 300 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.5 },
      );
      expect(result.pack.width).toBeGreaterThan(0);
      expect(result.pool.width).toBeGreaterThan(0);
    });

    it("gives more space to top when topFraction is high", () => {
      const high = computeConstrainedLayout(
        1000,
        600,
        {
          zones: {
            pack: { count: 10, maxCardWidth: 300 },
            pool: { count: 10, maxCardWidth: 300 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.7 },
      );
      const low = computeConstrainedLayout(
        1000,
        600,
        {
          zones: {
            pack: { count: 10, maxCardWidth: 300 },
            pool: { count: 10, maxCardWidth: 300 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.3 },
      );
      expect(high.pack.width).toBeGreaterThanOrEqual(low.pack.width);
      expect(low.pool.width).toBeGreaterThanOrEqual(high.pool.width);
    });
  });

  describe("three zones with topFraction + bottomLeftSplit", () => {
    it("produces valid dimensions for all zones", () => {
      const result = computeConstrainedLayout(
        1000,
        700,
        {
          zones: {
            hand: { count: 7 },
            battlefield: { count: 5, priority: "fill", maxRows: 1 },
            sideboard: { count: 12 },
          },
          layout: {
            top: ["hand"],
            bottomLeft: ["battlefield", "sideboard"],
          },
          ...ZONE_LAYOUT_PADDING,
        },
        { topFraction: 0.4, bottomLeftSplit: 0.3 },
      );
      expect(result.hand.width).toBeGreaterThan(0);
      expect(result.battlefield.width).toBeGreaterThan(0);
      expect(result.sideboard.width).toBeGreaterThan(0);
    });

    it("returns zone frames that sum to the constrained vertical space", () => {
      const frames = computeConstrainedFrames(
        1000,
        700,
        {
          zones: {
            hand: { count: 7 },
            battlefield: { count: 5, priority: "fill", maxRows: 1 },
            sideboard: { count: 12 },
          },
          layout: {
            top: ["hand"],
            bottomLeft: ["battlefield", "sideboard"],
          },
          ...ZONE_LAYOUT_PADDING,
        },
        { topFraction: 0.4, bottomLeftSplit: 0.3 },
      );

      const usedHeight =
        frames.hand.outerHeight +
        frames.battlefield.outerHeight +
        frames.sideboard.outerHeight +
        ZONE_LAYOUT_PADDING.sectionGap * 2;

      expect(usedHeight).toBe(700);
    });

    it("derives stable frames for a top fill zone with two lower primary zones", () => {
      const config = {
        zones: {
          rewards: { count: 3, priority: "fill" as const, maxRows: 1, maxCardWidth: 300 },
          upgrades: { count: 3, maxCardWidth: 200 },
          pool: { count: 12, maxCardWidth: 180 },
        },
        layout: {
          top: ["rewards"],
          bottomLeft: ["upgrades", "pool"],
        },
        maxTopFraction: 0.2,
        ...ZONE_LAYOUT_PADDING,
      };

      const unconstrained = computeLayout(1100, 650, config);
      const derived = deriveConstraintsFromLayout(
        unconstrained,
        config,
        650,
        1100,
      );
      const frames = computeConstrainedFrames(1100, 650, config, derived);

      const usedHeight =
        frames.rewards.outerHeight +
        frames.upgrades.outerHeight +
        frames.pool.outerHeight +
        ZONE_LAYOUT_PADDING.sectionGap * 2;

      expect(frames.rewards.innerHeight).toBeGreaterThan(0);
      expect(frames.upgrades.innerHeight).toBeGreaterThan(0);
      expect(frames.pool.innerHeight).toBeGreaterThan(0);
      expect(derived.topFraction).toBeLessThanOrEqual(0.2);
      expect(usedHeight).toBe(650);
    });

    it("re-fits cards to derived frames for reward-style top fill layouts", () => {
      const config = {
        zones: {
          rewards: { count: 2, priority: "fill" as const, maxRows: 1, maxCardWidth: 300 },
          upgrades: { count: 4, maxCardWidth: 200 },
          pool: { count: 13, maxCardWidth: 180 },
        },
        layout: {
          top: ["rewards"],
          bottomLeft: ["upgrades", "pool"],
        },
        maxTopFraction: 0.2,
        ...ZONE_LAYOUT_PADDING,
      };

      const unconstrained = computeLayout(1200, 520, config);
      const derived = deriveConstraintsFromLayout(
        unconstrained,
        config,
        520,
        1200,
      );
      const { dims, frames } = computeConstrainedLayoutState(
        1200,
        520,
        config,
        derived,
      );

      const rewardsGridHeight =
        dims.rewards.rows * dims.rewards.height +
        Math.max(0, dims.rewards.rows - 1) * 6;
      const upgradesGridHeight =
        dims.upgrades.rows * dims.upgrades.height +
        Math.max(0, dims.upgrades.rows - 1) * 6;
      const poolGridHeight =
        dims.pool.rows * dims.pool.height +
        Math.max(0, dims.pool.rows - 1) * 6;

      expect(rewardsGridHeight).toBeLessThanOrEqual(frames.rewards.innerHeight);
      expect(upgradesGridHeight).toBeLessThanOrEqual(frames.upgrades.innerHeight);
      expect(poolGridHeight).toBeLessThanOrEqual(frames.pool.innerHeight);
      expect(frames.rewards.outerHeight).toBeLessThanOrEqual(
        Math.ceil((520 - ZONE_LAYOUT_PADDING.sectionGap) * 0.2),
      );
    });
  });

  describe("four zones with all constraint types", () => {
    it("handles topFraction + leftFraction + bottomLeftSplit", () => {
      const result = computeConstrainedLayout(
        1200,
        800,
        {
          zones: {
            hand: { count: 7 },
            battlefield: { count: 5, priority: "fill", maxRows: 1 },
            sideboard: { count: 12 },
            commandZone: { count: 2 },
          },
          layout: {
            top: ["hand"],
            bottomLeft: ["battlefield", "sideboard"],
            bottomRight: ["commandZone"],
          },
          ...ZONE_LAYOUT_PADDING,
        },
        { topFraction: 0.35, leftFraction: 0.75, bottomLeftSplit: 0.3 },
      );
      expect(result.hand.width).toBeGreaterThan(0);
      expect(result.battlefield.width).toBeGreaterThan(0);
      expect(result.sideboard.width).toBeGreaterThan(0);
      expect(result.commandZone.width).toBeGreaterThan(0);
    });
  });

  describe("min fraction clamping", () => {
    it("extreme topFraction values still produce valid output", () => {
      const result = computeConstrainedLayout(
        1000,
        600,
        {
          zones: {
            pack: { count: 10 },
            pool: { count: 10 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.01 },
      );
      expect(result.pack.width).toBeGreaterThan(0);
      expect(result.pool.width).toBeGreaterThan(0);
    });
  });

  describe("zero-count zones ignored", () => {
    it("only active zones get real dimensions", () => {
      const result = computeConstrainedLayout(
        1000,
        600,
        {
          zones: {
            hand: { count: 7 },
            sideboard: { count: 0 },
            battlefield: { count: 0 },
          },
          layout: {
            top: ["hand"],
            bottomLeft: ["battlefield", "sideboard"],
          },
        },
        { topFraction: 0.5 },
      );
      expect(result.hand.width).toBeGreaterThan(0);
    });
  });

  describe("aspect ratio maintained", () => {
    it("all zones maintain 7/5 ratio", () => {
      const result = computeConstrainedLayout(
        1000,
        700,
        {
          zones: {
            hand: { count: 7 },
            battlefield: { count: 5, priority: "fill", maxRows: 1 },
            sideboard: { count: 12 },
            commandZone: { count: 2 },
          },
          layout: {
            top: ["hand"],
            bottomLeft: ["battlefield", "sideboard"],
            bottomRight: ["commandZone"],
          },
          ...ZONE_LAYOUT_PADDING,
        },
        { topFraction: 0.4, leftFraction: 0.7, bottomLeftSplit: 0.4 },
      );
      for (const zone of [
        "hand",
        "sideboard",
        "battlefield",
        "commandZone",
      ] as const) {
        const { width, height } = result[zone];
        if (width > 0) {
          expect(height).toBe(Math.round(width * CARD_ASPECT_RATIO));
        }
      }
    });
  });

  describe("manual overrides ignore default max card caps", () => {
    it("allows cards to grow past the zone maxCardWidth when space exists", () => {
      const result = computeConstrainedLayout(
        1600,
        900,
        {
          zones: {
            pack: { count: 2, maxCardWidth: 120 },
            pool: { count: 2, maxCardWidth: 120 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.5 },
      );

      expect(result.pack.width).toBeGreaterThan(120);
      expect(result.pool.width).toBeGreaterThan(120);
    });
  });
});

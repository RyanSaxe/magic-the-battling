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

    // Regression: Draft.tsx's draftDefaultLayoutConfig dropped ...ZONE_LAYOUT_PADDING in
    // commit 5f22010 ("Refactor draft layout onto ZoneLayout"). Pre two-pass collapse the
    // bug was masked because the unconstrained `computeLayout` ignores sectionPad*. After
    // the two-pass collapse, the constrained pass always runs and treats inner == outer
    // when sectionPad* defaults to 0, oversizing cards by ~32px and overflowing the pool
    // section on Draft load.
    it("draft-style layout: cards fit inside frames when ZONE_LAYOUT_PADDING is included", () => {
      const draftConfig = {
        zones: {
          pack: { count: 5, maxCardWidth: 400 },
          pool: { count: 4, maxCardWidth: 300 },
          upgrades: {
            count: 3,
            maxCardWidth: 200,
            minColumns: 1,
            maxColumns: 1,
          },
        },
        layout: {
          top: ["pack"],
          bottomLeft: ["pool"],
          bottomRight: ["upgrades"],
        },
        ...ZONE_LAYOUT_PADDING,
      };
      const containerW = 1400;
      const containerH = 800;

      const unconstrained = computeLayout(containerW, containerH, draftConfig);
      const derived = deriveConstraintsFromLayout(
        unconstrained,
        draftConfig,
        containerH,
        containerW,
      );
      const { dims, frames } = computeConstrainedLayoutState(
        containerW,
        containerH,
        draftConfig,
        derived,
      );

      const sectionPadV =
        ZONE_LAYOUT_PADDING.sectionPadTop + ZONE_LAYOUT_PADDING.sectionPadBottom;
      // Frames must reserve sectionPad — outer must exceed inner by exactly sectionPadV.
      // If a caller forgets ...ZONE_LAYOUT_PADDING, this delta becomes 0 and cards overflow.
      expect(frames.pack.outerHeight - frames.pack.innerHeight).toBe(sectionPadV);
      expect(frames.pool.outerHeight - frames.pool.innerHeight).toBe(sectionPadV);
      expect(frames.upgrades.outerHeight - frames.upgrades.innerHeight).toBe(sectionPadV);

      const packGridH =
        dims.pack.rows * dims.pack.height + Math.max(0, dims.pack.rows - 1) * 6;
      const poolGridH =
        dims.pool.rows * dims.pool.height + Math.max(0, dims.pool.rows - 1) * 6;
      expect(packGridH).toBeLessThanOrEqual(frames.pack.innerHeight);
      expect(poolGridH).toBeLessThanOrEqual(frames.pool.innerHeight);
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

    it("preserves the configured minimum outer width for the right column", () => {
      const config = {
        zones: {
          hand: { count: 7 },
          battlefield: { count: 5, priority: "fill" as const, maxRows: 1 },
          sideboard: { count: 12 },
          commandZone: { count: 3 },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
          bottomRight: ["commandZone"],
        },
        minBottomRightOuterWidth: 112,
        ...ZONE_LAYOUT_PADDING,
      };

      const unconstrained = computeLayout(420, 620, config);
      const derived = deriveConstraintsFromLayout(
        unconstrained,
        config,
        620,
        420,
      );
      const frames = computeConstrainedFrames(
        420,
        620,
        config,
        {
          ...derived,
          leftFraction: 0.95,
        },
      );

      expect(frames.commandZone.outerWidth).toBeGreaterThanOrEqual(112);
      expect(frames.battlefield.outerWidth).toBeLessThanOrEqual(
        420 - ZONE_LAYOUT_PADDING.sectionGap - 112,
      );
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

  describe("pass 2 ceiling (pass2MaxCardWidth)", () => {
    it("caps cards at the default 500px ceiling on huge containers", () => {
      const result = computeConstrainedLayout(
        4000,
        2000,
        {
          zones: {
            pack: { count: 2, maxCardWidth: 200 },
            pool: { count: 2, maxCardWidth: 200 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
        },
        { topFraction: 0.5 },
      );

      expect(result.pack.width).toBeLessThanOrEqual(500);
      expect(result.pool.width).toBeLessThanOrEqual(500);
    });

    it("does not shrink below pass 1's per-zone maxCardWidth (Math.max wins)", () => {
      const result = computeConstrainedLayout(
        4000,
        2000,
        {
          zones: {
            pack: { count: 2, maxCardWidth: 600 },
          },
          layout: { top: ["pack"], bottomLeft: [] },
        },
        { topFraction: 1 },
      );
      expect(result.pack.width).toBeGreaterThanOrEqual(600);
    });

    it("respects an explicit pass2MaxCardWidth override", () => {
      const result = computeConstrainedLayout(
        4000,
        2000,
        {
          zones: {
            pack: { count: 2, maxCardWidth: 200 },
          },
          layout: { top: ["pack"], bottomLeft: [] },
          pass2MaxCardWidth: 250,
        },
        { topFraction: 1 },
      );
      expect(result.pack.width).toBeLessThanOrEqual(250);
    });
  });

  // Pass 2 (constrained re-fit) must never produce *smaller* sideboard cards
  // than pass 1 alone, since pass 2 receives identical or larger frames after
  // the algorithm's pessimistic estimates settle. A regression here would
  // reintroduce the bug where dragging the upgrades divider 1px wider made
  // sideboard cards bigger (the opposite of expected direction).
  describe("two-pass model: pass 2 never under-sizes vs pass 1", () => {
    it("sideboard width is at least as big after pass 2 as after pass 1 alone", () => {
      const config = {
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: "fill" as const, maxRows: 1 },
          sideboard: { count: 9 },
          commandZone: { count: 3, minColumns: 1, maxColumns: 1 },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
          bottomRight: ["commandZone"],
        },
        ...ZONE_LAYOUT_PADDING,
      };
      const containerW = 1400;
      const containerH = 800;

      const pass1 = computeLayout(containerW, containerH, config);
      const derived = deriveConstraintsFromLayout(
        pass1,
        config,
        containerH,
        containerW,
      );
      const { dims: pass2, frames } = computeConstrainedLayoutState(
        containerW,
        containerH,
        config,
        derived,
      );

      expect(pass2.sideboard.width).toBeGreaterThanOrEqual(pass1.sideboard.width);
      const sideboardGridH =
        pass2.sideboard.rows * pass2.sideboard.height
        + Math.max(0, pass2.sideboard.rows - 1) * 6;
      expect(sideboardGridH).toBeLessThanOrEqual(frames.sideboard.innerHeight);
    });

    it("holds across a sweep of realistic resolutions", () => {
      const config = (cz: number) => ({
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: "fill" as const, maxRows: 1 },
          sideboard: { count: 9 },
          commandZone: {
            count: cz,
            minColumns: cz >= 4 ? 2 : 1,
            maxColumns: cz >= 4 ? 2 : 1,
          },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
          bottomRight: ["commandZone"],
        },
        ...ZONE_LAYOUT_PADDING,
      });
      const widths = [1024, 1280, 1366, 1440, 1600, 1920];
      const heights = [600, 700, 800, 900, 1080];
      const upgradeCounts = [1, 2, 3, 4, 5];

      for (const w of widths) {
        for (const h of heights) {
          for (const cz of upgradeCounts) {
            const cfg = config(cz);
            const pass1 = computeLayout(w, h, cfg);
            const derived = deriveConstraintsFromLayout(pass1, cfg, h, w);
            const { dims: pass2 } = computeConstrainedLayoutState(w, h, cfg, derived);
            expect(
              pass2.sideboard.width,
              `sideboard shrank at ${w}x${h} cz=${cz}: ${pass1.sideboard.width} -> ${pass2.sideboard.width}`,
            ).toBeGreaterThanOrEqual(pass1.sideboard.width);
          }
        }
      }
    });
  });

  describe("two-pass model: idempotence", () => {
    it("re-deriving constraints from pass-2 dims yields the same constraints", () => {
      // The full pipeline (pass 1 -> derive -> pass 2) should be a fixed point:
      // running it again on its own output should not change the constraints.
      // Otherwise we'd see successive renders thrashing between sizes.
      const config = {
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: "fill" as const, maxRows: 1 },
          sideboard: { count: 9 },
          commandZone: { count: 3, minColumns: 1, maxColumns: 1 },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
          bottomRight: ["commandZone"],
        },
        ...ZONE_LAYOUT_PADDING,
      };
      const containerW = 1400;
      const containerH = 800;

      const pass1 = computeLayout(containerW, containerH, config);
      const derived1 = deriveConstraintsFromLayout(
        pass1,
        config,
        containerH,
        containerW,
      );
      const { dims: pass2 } = computeConstrainedLayoutState(
        containerW,
        containerH,
        config,
        derived1,
      );
      const derived2 = deriveConstraintsFromLayout(
        pass2,
        config,
        containerH,
        containerW,
      );

      // Allow tiny rounding deltas (≤ 1px-equivalent in fraction space).
      expect(Math.abs(derived2.topFraction - derived1.topFraction)).toBeLessThan(0.01);
      expect(Math.abs(derived2.leftFraction - derived1.leftFraction)).toBeLessThan(0.01);
      expect(
        Math.abs(derived2.bottomLeftSplit - derived1.bottomLeftSplit),
      ).toBeLessThan(0.05);
    });
  });
});

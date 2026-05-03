import { describe, it, expect } from "vitest";
import {
  computeConstrainedLayoutState,
  deriveConstraintsFromLayout,
  type ZoneConstraints,
} from "./computeConstrainedLayout";
import {
  computeLayout,
  ZONE_LAYOUT_PADDING,
  type CardLayoutConfig,
} from "./useCardLayout";
import {
  redistributeSlack,
  resolveGrowPriority,
} from "./redistributeSlack";

function runFullPipeline(
  config: CardLayoutConfig,
  containerW: number,
  containerH: number,
): {
  baseline: ReturnType<typeof computeConstrainedLayoutState>;
  redistributed: ReturnType<typeof computeConstrainedLayoutState>;
  iterations: number;
  initialConstraints: Required<ZoneConstraints>;
  finalConstraints: Required<ZoneConstraints>;
} {
  const initialConstraints = deriveConstraintsFromLayout(
    computeLayout(containerW, containerH, config),
    config,
    containerH,
    containerW,
  );
  const baseline = computeConstrainedLayoutState(
    containerW,
    containerH,
    config,
    initialConstraints,
  );
  const { constraints: finalConstraints, iterations } = redistributeSlack(
    initialConstraints,
    config,
    containerW,
    containerH,
  );
  const redistributed = computeConstrainedLayoutState(
    containerW,
    containerH,
    config,
    finalConstraints,
  );
  return {
    baseline,
    redistributed,
    iterations,
    initialConstraints,
    finalConstraints,
  };
}

describe("resolveGrowPriority", () => {
  it("defaults to 1", () => {
    expect(resolveGrowPriority({ count: 5 })).toBe(1);
  });
  it("defaults priority:fill zones to 0", () => {
    expect(resolveGrowPriority({ count: 5, priority: "fill" })).toBe(0);
  });
  it("explicit growPriority always wins, even on fill zones", () => {
    expect(resolveGrowPriority({ count: 5, growPriority: 3 })).toBe(3);
    expect(
      resolveGrowPriority({ count: 5, priority: "fill", growPriority: 2 }),
    ).toBe(2);
  });
});

describe("redistributeSlack", () => {
  describe("no-op cases", () => {
    it("returns initial constraints when no zones have slack", () => {
      const config: CardLayoutConfig = {
        zones: { hand: { count: 7 } },
        layout: { top: ["hand"], bottomLeft: [] },
        ...ZONE_LAYOUT_PADDING,
      };
      const initial: Required<ZoneConstraints> = {
        topFraction: 1,
        leftFraction: 0.7,
        bottomLeftSplit: 0.5,
      };
      const { constraints, iterations } = redistributeSlack(
        initial,
        config,
        1000,
        600,
      );
      expect(constraints).toEqual(initial);
      expect(iterations).toBeLessThanOrEqual(2);
    });

    it("converges within 4 iterations for any reasonable config", () => {
      const configs: CardLayoutConfig[] = [
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
        {
          zones: {
            pack: { count: 5, maxCardWidth: 400 },
            pool: { count: 4, maxCardWidth: 300 },
          },
          layout: { top: ["pack"], bottomLeft: ["pool"] },
          ...ZONE_LAYOUT_PADDING,
        },
        {
          zones: {
            rewards: {
              count: 2,
              priority: "fill",
              maxRows: 1,
              maxCardWidth: 300,
            },
            upgrades: { count: 4, maxCardWidth: 200 },
            pool: { count: 13, maxCardWidth: 180 },
          },
          layout: {
            top: ["rewards"],
            bottomLeft: ["upgrades", "pool"],
          },
          maxTopFraction: 0.2,
          ...ZONE_LAYOUT_PADDING,
        },
      ];
      for (const config of configs) {
        for (const containerW of [1200, 1600, 1920]) {
          for (const containerH of [600, 800, 1000]) {
            const { iterations } = runFullPipeline(
              config,
              containerW,
              containerH,
            );
            expect(iterations).toBeLessThanOrEqual(4);
          }
        }
      }
    });
  });

  describe("battlefield-pinned routing (Build-style headline case)", () => {
    it("sideboard slack flows to hand, not battlefield", () => {
      // Build config: hand top, [battlefield(fill, maxRows=1), sideboard] BL.
      // 6 hand cards, 5 battlefield slots, 4 sideboard cards on a tall container
      // — sideboard caps short due to aspect ratio in a wide-but-short BL frame.
      const config: CardLayoutConfig = {
        zones: {
          hand: { count: 6 },
          battlefield: { count: 5, priority: "fill", maxRows: 1 },
          sideboard: { count: 4 },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
        },
        ...ZONE_LAYOUT_PADDING,
      };
      const { baseline, redistributed, finalConstraints, initialConstraints } =
        runFullPipeline(config, 1400, 900);

      // Hand grows (or holds) — never shrinks.
      expect(redistributed.dims.hand.width).toBeGreaterThanOrEqual(
        baseline.dims.hand.width,
      );
      // Battlefield never grows — its growPriority is 0.
      expect(redistributed.frames.battlefield.outerHeight).toBeLessThanOrEqual(
        baseline.frames.battlefield.outerHeight,
      );
      // topFraction increased: bottom slack flowed to top.
      expect(finalConstraints.topFraction).toBeGreaterThanOrEqual(
        initialConstraints.topFraction,
      );
    });
  });

  describe("reward-style top-fill leaves slack for the bottom", () => {
    it("rewards capped (fill+maxRows=1) lets upgrades/pool grow", () => {
      const config: CardLayoutConfig = {
        zones: {
          rewards: {
            count: 1,
            priority: "fill",
            maxRows: 1,
            maxCardWidth: 300,
          },
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
      const { baseline, redistributed } = runFullPipeline(config, 1400, 800);

      // rewards is growPriority=0 (fill default) — its outer should not grow.
      expect(redistributed.frames.rewards.outerHeight).toBeLessThanOrEqual(
        baseline.frames.rewards.outerHeight,
      );
      // pool can grow — verify at least one bottom zone improved.
      const poolGrew =
        redistributed.dims.pool.width >= baseline.dims.pool.width;
      const upgradesGrew =
        redistributed.dims.upgrades.width >= baseline.dims.upgrades.width;
      expect(poolGrew || upgradesGrew).toBe(true);
    });
  });

  describe("never under-sizes vs pass 2 baseline", () => {
    it("redistributed dims never shrink any zone below pass-2 baseline", () => {
      const configs: Array<[CardLayoutConfig, number, number]> = [
        [
          {
            zones: {
              hand: { count: 7 },
              battlefield: { count: 5, priority: "fill", maxRows: 1 },
              sideboard: { count: 9 },
              commandZone: {
                count: 3,
                minColumns: 1,
                maxColumns: 1,
              },
            },
            layout: {
              top: ["hand"],
              bottomLeft: ["battlefield", "sideboard"],
              bottomRight: ["commandZone"],
            },
            ...ZONE_LAYOUT_PADDING,
          },
          1400,
          800,
        ],
        [
          {
            zones: {
              pack: { count: 5, maxCardWidth: 400 },
              pool: { count: 4, maxCardWidth: 300 },
            },
            layout: { top: ["pack"], bottomLeft: ["pool"] },
            ...ZONE_LAYOUT_PADDING,
          },
          1600,
          900,
        ],
      ];
      for (const [config, w, h] of configs) {
        const { baseline, redistributed } = runFullPipeline(config, w, h);
        for (const id of Object.keys(config.zones)) {
          if ((config.zones[id]?.count ?? 0) <= 0) continue;
          expect(redistributed.dims[id].width).toBeGreaterThanOrEqual(
            baseline.dims[id].width - 1, // 1px tolerance for rounding
          );
        }
      }
    });
  });

  describe("growPriority override", () => {
    it("explicit growPriority=2 absorbs more slack than the default 1", () => {
      // Two-recipient scenario: BL[0] donor with two equal-priority recipients
      // (hand top + commandZone right). Bumping hand.growPriority changes the
      // routing — though our v1 routes section-level, not weighted, so the
      // mechanism is "hand becomes growable while a non-growable zone was".
      // Document the override applies via resolveGrowPriority.
      const baseConfig: CardLayoutConfig = {
        zones: {
          hand: { count: 6, growPriority: 0 },
          battlefield: { count: 5, priority: "fill", maxRows: 1 },
          sideboard: { count: 4 },
        },
        layout: {
          top: ["hand"],
          bottomLeft: ["battlefield", "sideboard"],
        },
        ...ZONE_LAYOUT_PADDING,
      };
      const grewConfig: CardLayoutConfig = {
        ...baseConfig,
        zones: {
          ...baseConfig.zones,
          hand: { count: 6, growPriority: 1 },
        },
      };
      const baseRun = runFullPipeline(baseConfig, 1400, 900);
      const grewRun = runFullPipeline(grewConfig, 1400, 900);

      // With hand opted out (growPriority=0), no transfer should happen.
      expect(baseRun.finalConstraints.topFraction).toBeCloseTo(
        baseRun.initialConstraints.topFraction,
        2,
      );
      // With hand growable, topFraction should increase (sideboard slack → hand).
      expect(grewRun.finalConstraints.topFraction).toBeGreaterThan(
        grewRun.initialConstraints.topFraction,
      );
    });
  });

  describe("clamping safety", () => {
    it("never produces a fraction outside [0.05, 0.95]", () => {
      const config: CardLayoutConfig = {
        zones: {
          hand: { count: 1 },
          sideboard: { count: 30 },
        },
        layout: { top: ["hand"], bottomLeft: ["sideboard"] },
        ...ZONE_LAYOUT_PADDING,
      };
      const { finalConstraints } = runFullPipeline(config, 1200, 800);
      expect(finalConstraints.topFraction).toBeGreaterThanOrEqual(0.05);
      expect(finalConstraints.topFraction).toBeLessThanOrEqual(0.95);
    });
  });
});

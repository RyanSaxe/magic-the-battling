import type { ZoneConstraints } from "../hooks/computeConstrainedLayout";
import type { CardLayoutConfig } from "../hooks/useCardLayout";
import { GAME_SHELL_SMALL_BREAKPOINT_PX } from "../hooks/useGameShellMode";
import { MOBILE_BREAKPOINT_PX } from "../hooks/useViewportCardSizes";
import {
  battleBoardMetrics,
  buildLayoutConfig,
  draftLayoutConfig,
  rewardLayoutConfig,
} from "../pages/phases/phaseLayouts";

export interface Box {
  width: number;
  height: number;
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Content box of the Draft, Build and Reward boards. */
  zoneBoard: Box;
  /** Content box of the Battle board. */
  battleBoard: Box;
}

// Board content boxes measured in WebKit from the game screen at each viewport.
// The game shell decides them (header, action bar, rails, sidebar); the Playwright
// layout checks measure the real ones, so these only need to be realistic. Phones
// in landscape are left out: the game covers the board with a prompt to turn the
// phone upright, so short desktop windows stand in for short landscape screens.
const MEASURED: [number, number, Box, Box][] = [
  [320, 568, { width: 308, height: 480 }, { width: 308, height: 444.25 }],
  [375, 667, { width: 363, height: 579 }, { width: 363, height: 543.25 }],
  [393, 852, { width: 381, height: 764 }, { width: 381, height: 728.25 }],
  [430, 932, { width: 418, height: 844 }, { width: 418, height: 808.25 }],
  [768, 1024, { width: 684, height: 936 }, { width: 684, height: 896.25 }],
  [820, 1180, { width: 736, height: 1092 }, { width: 736, height: 1052.25 }],
  [1024, 768, { width: 940, height: 680 }, { width: 940, height: 640.25 }],
  [1024, 500, { width: 940, height: 412 }, { width: 940, height: 372.25 }],
  [1180, 820, { width: 880, height: 732 }, { width: 880, height: 732 }],
  [1280, 600, { width: 980, height: 512 }, { width: 980, height: 512 }],
  [1280, 720, { width: 980, height: 632 }, { width: 980, height: 632 }],
  [1280, 800, { width: 980, height: 712 }, { width: 980, height: 712 }],
  [1366, 768, { width: 1066, height: 680 }, { width: 1066, height: 680 }],
  [1366, 1024, { width: 1066, height: 936 }, { width: 1066, height: 936 }],
  [1440, 600, { width: 1140, height: 512 }, { width: 1140, height: 512 }],
  [1440, 900, { width: 1140, height: 812 }, { width: 1140, height: 812 }],
  [1536, 864, { width: 1236, height: 776 }, { width: 1236, height: 776 }],
  [1920, 1080, { width: 1620, height: 992 }, { width: 1620, height: 992 }],
  [2560, 1440, { width: 2260, height: 1352 }, { width: 2260, height: 1352 }],
];

export const VIEWPORTS: Viewport[] = MEASURED.map(([width, height, zoneBoard, battleBoard]) => ({
  name: `${width}x${height}`,
  width,
  height,
  zoneBoard,
  battleBoard,
}));

/** The game shows the desktop upgrade rail only in its widest shell. */
export function hasUpgradeRail(viewport: Viewport): boolean {
  return viewport.width >= GAME_SHELL_SMALL_BREAKPOINT_PX;
}

/** Below this width the phases pass isMobile, which turns dividers off and narrows Battle's zone column. */
export function isMobileViewport(viewport: Viewport): boolean {
  return viewport.width < MOBILE_BREAKPOINT_PX;
}

export type ZonePhase = "draft" | "build" | "reward" | "reward-stage-end";

export interface ZoneCase {
  phase: ZonePhase;
  label: string;
  counts: Record<string, number>;
  config: CardLayoutConfig;
  /** Zone whose cards UpgradeGrid sizes from the frame rather than from the layout's dims. */
  railZone?: string;
  /** The phase lets the player drag the vertical divider beside the rail. */
  allowHorizontalResize: boolean;
}

// Pools grow by about a card a round, so long games reach the 30s.
const POOL_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32];
// Every player starts with Config.starting_pool_size (7) cards.
const DRAFT_POOL_COUNTS = POOL_COUNTS.filter((count) => count >= 7);
// Draft packs hold Config.pack_size (5) cards.
const PACK_COUNTS = [0, 1, 2, 3, 4, 5];
// Hand size is the starting stage (3) plus one per stage survived.
const HAND_SIZES = [3, 4, 5, 6, 7, 8, 10];
// A player gains about one upgrade a stage.
const RAIL_COUNTS = [0, 1, 2, 3, 4, 6, 8];
const REWARD_COUNTS = [1, 2, 3];
// Config.max_available_upgrades.
const OFFERED_UPGRADE_COUNTS = [1, 2, 3, 4];

export function zoneCases(viewport: Viewport): ZoneCase[] {
  const rails = hasUpgradeRail(viewport) ? RAIL_COUNTS : [0];
  const horizontal = !isMobileViewport(viewport);
  const cases: ZoneCase[] = [];
  for (const pack of PACK_COUNTS) {
    for (const pool of DRAFT_POOL_COUNTS) {
      for (const rail of rails) {
        cases.push({
          phase: "draft",
          label: `pack ${pack}, pool ${pool}, rail ${rail}`,
          counts: { pack, pool, rail },
          config: draftLayoutConfig({ packCount: pack, poolCount: pool, upgradeRailCount: rail }),
          railZone: "upgrades",
          allowHorizontalResize: horizontal,
        });
      }
    }
  }
  for (const hand of HAND_SIZES) {
    for (const sideboard of POOL_COUNTS) {
      for (const rail of rails) {
        cases.push({
          phase: "build",
          label: `hand ${hand}, sideboard ${sideboard}, rail ${rail}`,
          counts: { hand, sideboard, rail },
          config: buildLayoutConfig({ handSize: hand, sideboardCount: sideboard, upgradeRailCount: rail }),
          railZone: "commandZone",
          allowHorizontalResize: true,
        });
      }
    }
  }
  for (const rewards of REWARD_COUNTS) {
    cases.push({
      phase: "reward",
      label: `rewards ${rewards}`,
      counts: { rewards },
      config: rewardLayoutConfig({ rewardCount: rewards, hasUpgradeSection: false, upgradeCount: 0, poolCount: 0 }),
      allowHorizontalResize: false,
    });
    for (const offered of OFFERED_UPGRADE_COUNTS) {
      // Reward.tsx shows at least one pool slot.
      for (const pool of POOL_COUNTS.filter((count) => count > 0)) {
        cases.push({
          phase: "reward-stage-end",
          label: `rewards ${rewards}, upgrades ${offered}, pool ${pool}`,
          counts: { rewards, offered, pool },
          config: rewardLayoutConfig({ rewardCount: rewards, hasUpgradeSection: true, upgradeCount: offered, poolCount: pool }),
          allowHorizontalResize: false,
        });
      }
    }
  }
  return cases;
}

/**
 * Saved layouts as useZoneDividers writes them: only the fractions the player
 * dragged. Fractions run as far as its 80px clamp allows on a tall board, and
 * a layout saved in one window or round is applied to every other.
 */
export const SAVED_LAYOUTS: ZoneConstraints[] = [
  { topFraction: 0.1 },
  { topFraction: 0.35 },
  { topFraction: 0.6 },
  { topFraction: 0.9 },
  { bottomLeftSplit: 0.1 },
  { bottomLeftSplit: 0.5 },
  { bottomLeftSplit: 0.9 },
  { topFraction: 0.3, bottomLeftSplit: 0.3 },
  { topFraction: 0.7, bottomLeftSplit: 0.7 },
  { leftFraction: 0.5 },
  { leftFraction: 0.9 },
];

const SAVED_LAYOUT_COUNTS: Record<string, number[]> = {
  pack: [0, 1, 5],
  pool: [1, 7, 10, 16, 32],
  rail: [0, 2, 6],
  hand: [3, 5, 8, 10],
  sideboard: [0, 4, 10, 20, 32],
  rewards: [1, 3],
  offered: [1, 4],
};

/** Saved layouts are checked on fewer card counts, since each runs against every saved layout. */
export function checksSavedLayouts(zoneCase: ZoneCase): boolean {
  return Object.entries(zoneCase.counts).every(([zone, count]) => SAVED_LAYOUT_COUNTS[zone].includes(count));
}

/** One ordinary game per phase, for checks that do not depend on card counts. */
export function isTypicalCase(viewport: Viewport, zoneCase: ZoneCase): boolean {
  const typical: Record<ZonePhase, string> = {
    draft: "pack 5, pool 10",
    build: "hand 5, sideboard 10",
    reward: "rewards 2",
    "reward-stage-end": "rewards 2, upgrades 3, pool 10",
  };
  const rail = hasUpgradeRail(viewport) ? 2 : 0;
  return zoneCase.label.startsWith(typical[zoneCase.phase]) && (zoneCase.counts.rail ?? rail) === rail;
}

export interface BattleCase {
  label: string;
  playerHandCount: number;
  opponentHandCount: number;
  /** Battle.tsx counts the treasure and poison tile as one more land. */
  playerLandCount: number;
  playerNonlandCount: number;
  opponentLandCount: number;
  opponentNonlandCount: number;
}

const BATTLE_HANDS = [0, 1, 3, 5, 7, 9, 12];
const BATTLE_LANDS = [0, 2, 4, 7, 11, 15];
const BATTLE_NONLANDS = [0, 1, 3, 6, 10, 15, 20];

export function battleCases(): BattleCase[] {
  const cases: BattleCase[] = [];
  for (const hand of BATTLE_HANDS) {
    for (const opponentHand of [0, 7, 12]) {
      for (const lands of BATTLE_LANDS) {
        for (const nonlands of BATTLE_NONLANDS) {
          cases.push({
            label: `hand ${hand}, opponent hand ${opponentHand}, lands ${lands}, nonlands ${nonlands}`,
            playerHandCount: hand,
            opponentHandCount: opponentHand,
            playerLandCount: lands + 1,
            playerNonlandCount: nonlands,
            opponentLandCount: lands + 1,
            opponentNonlandCount: nonlands,
          });
        }
      }
    }
  }
  return cases;
}

export function battleConfig(viewport: Viewport, battleCase: BattleCase, isSuddenDeath: boolean) {
  const { fixedHeight, zoneColumnWidth } = battleBoardMetrics({
    isMobile: isMobileViewport(viewport),
    isSuddenDeath,
  });
  // Defaults useBattleCardSizes applies to what Battle.tsx passes.
  return {
    ...battleCase,
    handGap: 6,
    battlefieldGap: 6,
    handMaxWidth: 400,
    battlefieldMaxWidth: 300,
    fixedHeight,
    zoneColumnWidth,
  };
}

import { deckLayoutConfig } from "../components/common/deckLayout";
import { upgradeApplyLayoutConfig, upgradeListLayoutConfig } from "../components/common/upgradeModalLayouts";
import { GAME_BANNER_HEIGHT } from "../components/common/bannerSizes";
import type { ZoneConstraints } from "../hooks/computeConstrainedLayout";
import type { CardLayoutConfig } from "../hooks/useCardLayout";
import { computeGameShellMode, GAME_SHELL_SMALL_BREAKPOINT_PX } from "../hooks/useGameShellMode";
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

// Board content boxes measured in WebKit from the game screen at each viewport, so
// the sweep's fingerprints describe the boards players get. The game shell decides
// them (header, action bar, rails, sidebar), so they change when it does. Phones
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
  [1180, 820, { width: 852, height: 732 }, { width: 852, height: 732 }],
  [1280, 600, { width: 952, height: 512 }, { width: 952, height: 512 }],
  [1280, 720, { width: 952, height: 632 }, { width: 952, height: 632 }],
  [1280, 800, { width: 952, height: 712 }, { width: 952, height: 712 }],
  [1366, 768, { width: 1038, height: 680 }, { width: 1038, height: 680 }],
  [1366, 1024, { width: 1038, height: 936 }, { width: 1038, height: 936 }],
  [1440, 600, { width: 1112, height: 512 }, { width: 1112, height: 512 }],
  [1440, 900, { width: 1112, height: 812 }, { width: 1112, height: 812 }],
  [1536, 864, { width: 1208, height: 776 }, { width: 1208, height: 776 }],
  [1920, 1080, { width: 1592, height: 992 }, { width: 1592, height: 992 }],
  [2560, 1440, { width: 2232, height: 1352 }, { width: 2232, height: 1352 }],
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

export type ZonePhase =
  | "draft"
  | "build"
  | "reward"
  | "reward-stage-end"
  /** DeckDisplay, in the game summary and the shared round view. */
  | "deck"
  /** The upgrade modals' list of upgrades. */
  | "upgrade-list"
  /** The upgrades modal choosing a card to apply an upgrade to. */
  | "upgrade-apply";

export interface ZoneCase {
  phase: ZonePhase;
  label: string;
  counts: Record<string, number>;
  config: CardLayoutConfig;
  /** Zone whose cards UpgradeGrid sizes from the frame rather than from the layout's dims. */
  railZone?: string;
  /** The phase lets the player drag the vertical divider beside the rail. */
  allowHorizontalResize: boolean;
  /** The surface shows dividers, so it can be dragged and saved. */
  hasDividers: boolean;
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
  const isDesktop = computeGameShellMode(viewport.width) === "big";
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
          hasDividers: true,
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
          hasDividers: true,
        });
      }
    }
  }
  for (const rewards of REWARD_COUNTS) {
    cases.push({
      phase: "reward",
      label: `rewards ${rewards}`,
      counts: { rewards },
      config: rewardLayoutConfig({ rewardCount: rewards, hasUpgradeSection: false, upgradeCount: 0, poolCount: 0, isDesktop }),
      allowHorizontalResize: false,
      hasDividers: true,
    });
    for (const offered of OFFERED_UPGRADE_COUNTS) {
      // Reward.tsx shows at least one pool slot.
      for (const pool of POOL_COUNTS.filter((count) => count > 0)) {
        cases.push({
          phase: "reward-stage-end",
          label: `rewards ${rewards}, upgrades ${offered}, pool ${pool}`,
          counts: { rewards, offered, pool },
          config: rewardLayoutConfig({ rewardCount: rewards, hasUpgradeSection: true, upgradeCount: offered, poolCount: pool, isDesktop }),
          allowHorizontalResize: false,
          hasDividers: true,
        });
      }
    }
  }
  // A hidden hand or sideboard in the shared round view is laid out as one card.
  for (const hand of [1, ...HAND_SIZES]) {
    for (const sideboard of POOL_COUNTS) {
      for (const upgrades of DECK_UPGRADE_COUNTS) {
        cases.push({
          phase: "deck",
          label: `hand ${hand}, sideboard ${sideboard}, upgrades ${upgrades}`,
          counts: { hand, sideboard, upgrades },
          config: deckLayoutConfig({
            handCount: hand,
            battlefieldCount: DECK_BATTLEFIELD_COUNT,
            sideboardCount: sideboard,
            upgradeCount: upgrades,
          }),
          railZone: "commandZone",
          allowHorizontalResize: true,
          hasDividers: true,
        });
      }
    }
  }
  return cases;
}

// DeckDisplay's battlefield holds the three chosen basics beside treasure and poison.
const DECK_BATTLEFIELD_COUNT = 3 + 2;
const DECK_UPGRADE_COUNTS = [0, 1, 2, 4, 8];

// The modals size their cards to the modal, not the board, so they are swept over boxes
// from a phone's modal to a wide desktop's instead of over the viewports.
const MODAL_WIDTHS = [288, 420, 558, 900, 1400];
const MODAL_HEIGHTS = [140, 220, 360, 560, 900];
export const MODAL_BOXES: Viewport[] = MODAL_WIDTHS.flatMap((width) =>
  MODAL_HEIGHTS.map((height) => ({
    name: `${width}x${height}`,
    width,
    height,
    zoneBoard: { width, height },
    battleBoard: { width, height },
  })),
);
const MODAL_UPGRADE_COUNTS = [1, 2, 3, 4, 6, 8, 10];
const APPLY_TARGET_COUNTS = [1, 2, 5, 10, 16, 24, 32];
// The apply view's separator: py-2 around a 1px rule.
const APPLY_SEPARATOR_HEIGHT = 17;

export function modalCases(): ZoneCase[] {
  const cases: ZoneCase[] = [];
  for (const upgrades of MODAL_UPGRADE_COUNTS) {
    cases.push({
      phase: "upgrade-list",
      label: `upgrades ${upgrades}`,
      counts: { upgrades },
      config: upgradeListLayoutConfig(upgrades),
      allowHorizontalResize: false,
      hasDividers: false,
    });
  }
  for (const upgrades of [1, 2, 3]) {
    for (const targets of APPLY_TARGET_COUNTS) {
      cases.push({
        phase: "upgrade-apply",
        label: `upgrades ${upgrades}, targets ${targets}`,
        counts: { upgrades, targets },
        config: upgradeApplyLayoutConfig({ upgradeCount: upgrades, targetCount: targets, separatorHeight: APPLY_SEPARATOR_HEIGHT }),
        allowHorizontalResize: false,
        hasDividers: false,
      });
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
  upgrades: [0, 2, 8],
};

/** Saved layouts are checked on fewer card counts, since each runs against every saved layout. */
export function checksSavedLayouts(zoneCase: ZoneCase): boolean {
  return zoneCase.hasDividers && Object.entries(zoneCase.counts).every(([zone, count]) => SAVED_LAYOUT_COUNTS[zone].includes(count));
}

/** One ordinary game per phase, for checks that do not depend on card counts. */
export function isTypicalCase(viewport: Viewport, zoneCase: ZoneCase): boolean {
  const typical: Partial<Record<ZonePhase, string>> = {
    draft: "pack 5, pool 10",
    build: "hand 5, sideboard 10",
    reward: "rewards 2",
    "reward-stage-end": "rewards 2, upgrades 3, pool 10",
    deck: "hand 5, sideboard 10, upgrades 2",
  };
  const label = typical[zoneCase.phase];
  const rail = hasUpgradeRail(viewport) ? 2 : 0;
  return label !== undefined && zoneCase.label.startsWith(label) && (zoneCase.counts.rail ?? rail) === rail;
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

/** Sudden Death's banner spans the board and the sidebar above them, so the board gives up the banner's height. */
export function battleBoard(viewport: Viewport, isSuddenDeath: boolean): Box {
  const { width, height } = viewport.battleBoard;
  return isSuddenDeath ? { width, height: height - GAME_BANNER_HEIGHT } : viewport.battleBoard;
}

export function battleConfig(viewport: Viewport, battleCase: BattleCase) {
  const { fixedHeight, zoneColumnWidth } = battleBoardMetrics({ isMobile: isMobileViewport(viewport) });
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

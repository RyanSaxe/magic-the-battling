import { BATTLEFIELD_INSET } from "../../hooks/useBattleCardSizes";
import {
  ZONE_LAYOUT_PADDING,
  type CardLayoutConfig,
} from "../../hooks/useCardLayout";
import { getUpgradeZoneLayoutBounds } from "../../utils/upgradeGrid";

/** Treasure and poison sit beside the three basic land slots on the Build battlefield. */
export const BUILD_BATTLEFIELD_COUNT = 3 + 1 + 1;

export function draftLayoutConfig({
  packCount,
  poolCount,
  upgradeRailCount,
}: {
  packCount: number;
  poolCount: number;
  /** Upgrades shown in the desktop rail beside the pool; 0 hides the rail. */
  upgradeRailCount: number;
}): CardLayoutConfig {
  return {
    zones: {
      pool: { count: poolCount, maxCardWidth: 300 },
      pack: { count: packCount, maxCardWidth: 400 },
      upgrades: {
        count: upgradeRailCount,
        maxCardWidth: 200,
        ...getUpgradeZoneLayoutBounds(upgradeRailCount),
      },
    },
    layout: {
      top: ["pack"],
      bottomLeft: ["pool"],
      bottomRight: upgradeRailCount > 0 ? ["upgrades"] : [],
    },
    ...ZONE_LAYOUT_PADDING,
  };
}

export function buildLayoutConfig({
  handSize,
  sideboardCount,
  upgradeRailCount,
}: {
  handSize: number;
  sideboardCount: number;
  /** Upgrades shown in the desktop rail beside the sideboard; 0 hides the rail. */
  upgradeRailCount: number;
}): CardLayoutConfig {
  return {
    zones: {
      hand: { count: handSize },
      battlefield: {
        count: BUILD_BATTLEFIELD_COUNT,
        priority: "fill",
        maxRows: 1,
      },
      sideboard: { count: sideboardCount },
      commandZone: {
        count: upgradeRailCount,
        ...getUpgradeZoneLayoutBounds(upgradeRailCount),
      },
    },
    layout: {
      top: ["hand"],
      bottomLeft: ["battlefield", "sideboard"],
      bottomRight: upgradeRailCount > 0 ? ["commandZone"] : [],
    },
    ...ZONE_LAYOUT_PADDING,
  };
}

const LOOT_MAX_CARD_WIDTH = 300;

export function rewardLayoutConfig({
  rewardCount,
  hasUpgradeSection,
  upgradeCount,
  poolCount,
  isDesktop,
}: {
  rewardCount: number;
  /** The stage-end screen, where the player picks an upgrade and sees their pool. */
  hasUpgradeSection: boolean;
  upgradeCount: number;
  poolCount: number;
  /** The widest shell, with the docked sidebar. */
  isDesktop: boolean;
}): CardLayoutConfig {
  return {
    zones: {
      rewards: {
        count: rewardCount,
        maxCardWidth: LOOT_MAX_CARD_WIDTH,
        priority: "fill",
        maxRows: 1,
      },
      upgrades: {
        count: hasUpgradeSection ? upgradeCount : 0,
        maxCardWidth: 200,
      },
      pool: { count: poolCount, maxCardWidth: 180 },
    },
    layout: { top: ["rewards"], bottomLeft: ["upgrades", "pool"] },
    ...ZONE_LAYOUT_PADDING,
    maxTopFraction: hasUpgradeSection ? 0.2 : undefined,
    // The second layout pass grows cards past their zones' maximums, up to 500px. That fills a phone or tablet,
    // but it's far too big on a desktop.
    pass2MaxCardWidth: isDesktop ? LOOT_MAX_CARD_WIDTH : undefined,
  };
}

export interface BattleBoardMetrics {
  handPadding: number;
  battlefieldPadding: number;
  midDividerHeight: number;
  /** Height of everything on the board that is not one of its six card rows. */
  fixedHeight: number;
  zoneColumnWidth: number;
}

export function battleBoardMetrics({
  isMobile,
}: {
  isMobile: boolean;
}): BattleBoardMetrics {
  const handPadding = 16;
  const battlefieldPadding = BATTLEFIELD_INSET;
  const midDividerHeight = 2;
  return {
    handPadding,
    battlefieldPadding,
    midDividerHeight,
    fixedHeight: 2 * handPadding + 2 * battlefieldPadding + midDividerHeight,
    zoneColumnWidth: isMobile ? 64 : 96,
  };
}

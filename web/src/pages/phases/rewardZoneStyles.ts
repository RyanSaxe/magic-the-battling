import type { CSSProperties } from "react";
import type { ZoneFrameResult } from "../../hooks/computeConstrainedLayout";

const fixedStyle = (height: number): CSSProperties => ({
  height,
  flex: "0 0 auto",
});

const fillStyle = (height: number): CSSProperties => ({
  minHeight: height,
  flex: "1 1 auto",
});

/**
 * Styles for the Round Wrap-Up zones. The lowest zone grows into whatever height
 * the layout leaves over, so no strip of the seam colour shows below it: the pool
 * under an upgrade section, and otherwise the Loot zone on its own.
 */
export function rewardZoneStyles(
  zoneFrames: ZoneFrameResult,
  hasUpgradeSection: boolean,
): Record<"rewards" | "upgrades" | "pool", CSSProperties> {
  return {
    rewards: hasUpgradeSection
      ? fixedStyle(zoneFrames.rewards.outerHeight)
      : fillStyle(zoneFrames.rewards.outerHeight),
    upgrades: fixedStyle(zoneFrames.upgrades.outerHeight),
    pool: fillStyle(zoneFrames.pool.outerHeight),
  };
}

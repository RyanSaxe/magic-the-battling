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
 * under an upgrade section, and otherwise the Loot zone on its own. The Loot zone
 * also holds the round progression note under its cards, which the layout leaves
 * room for outside the zones' frames.
 */
export function rewardZoneStyles(
  zoneFrames: ZoneFrameResult,
  hasUpgradeSection: boolean,
  progressionNoteHeight: number,
): Record<"rewards" | "upgrades" | "pool", CSSProperties> {
  const rewardsHeight = zoneFrames.rewards.outerHeight + progressionNoteHeight;
  return {
    rewards: hasUpgradeSection ? fixedStyle(rewardsHeight) : fillStyle(rewardsHeight),
    upgrades: fixedStyle(zoneFrames.upgrades.outerHeight),
    pool: fillStyle(zoneFrames.pool.outerHeight),
  };
}

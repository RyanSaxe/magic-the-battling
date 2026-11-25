import type { CardLayoutConfig } from "../../hooks/useCardLayout";

export function upgradeListLayoutConfig(
  upgradeCount: number,
): CardLayoutConfig {
  return {
    zones: {
      upgrades: { count: upgradeCount },
    },
    layout: { top: ["upgrades"] },
  };
}

export function upgradeApplyLayoutConfig({
  upgradeCount,
  targetCount,
  separatorHeight,
}: {
  upgradeCount: number;
  targetCount: number;
  separatorHeight: number;
}): CardLayoutConfig {
  return {
    zones: {
      upgrades: { count: upgradeCount, maxCardWidth: 200 },
      targets: { count: targetCount, maxCardWidth: 200 },
    },
    layout: { top: ["upgrades"], bottomLeft: ["targets"] },
    fixedHeight: separatorHeight,
  };
}

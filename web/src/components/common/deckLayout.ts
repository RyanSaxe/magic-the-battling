import {
  ZONE_LAYOUT_PADDING,
  type CardLayoutConfig,
} from "../../hooks/useCardLayout";
import { getUpgradeZoneLayoutBounds } from "../../utils/upgradeGrid";

export function deckLayoutConfig({
  handCount,
  battlefieldCount,
  sideboardCount,
  upgradeCount,
}: {
  handCount: number;
  battlefieldCount: number;
  sideboardCount: number;
  upgradeCount: number;
}): CardLayoutConfig {
  return {
    zones: {
      hand: { count: handCount },
      battlefield: { count: battlefieldCount, priority: "fill", maxRows: 1 },
      sideboard: { count: sideboardCount },
      commandZone: {
        count: upgradeCount,
        ...getUpgradeZoneLayoutBounds(upgradeCount),
      },
    },
    layout: {
      top: ["hand"],
      bottomLeft: ["battlefield", "sideboard"],
      bottomRight: ["commandZone"],
    },
    ...ZONE_LAYOUT_PADDING,
  };
}

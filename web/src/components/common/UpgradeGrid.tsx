import type { ReactNode } from "react";
import type { Card as CardType } from "../../types";
import type { ZoneFrame } from "../../hooks/computeConstrainedLayout";
import type { ZoneDims } from "../../hooks/cardSizeUtils";
import { getUpgradeGridDims } from "../../utils/upgradeGrid";
import { UpgradeStack } from "../sidebar/UpgradeStack";
import { CardGrid } from "./CardGrid";

interface UpgradeGridProps {
  upgrades: CardType[];
  fallbackDims: ZoneDims;
  frame?: ZoneFrame | null;
  renderOverlay?: (upgrade: CardType) => ReactNode;
}

export function UpgradeGrid({
  upgrades,
  fallbackDims,
  frame,
  renderOverlay,
}: UpgradeGridProps) {
  const dims = getUpgradeGridDims(upgrades.length, frame, fallbackDims);

  return (
    <CardGrid columns={dims.columns} cardWidth={dims.width}>
      {upgrades.map((upgrade) => (
        <div
          key={upgrade.id}
          className={renderOverlay ? "relative group" : "relative"}
        >
          <UpgradeStack
            upgrade={upgrade}
            dimensions={{ width: dims.width, height: dims.height }}
          />
          {renderOverlay?.(upgrade)}
        </div>
      ))}
    </CardGrid>
  );
}

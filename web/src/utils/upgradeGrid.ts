import type { ZoneFrame } from "../hooks/computeConstrainedLayout";
import { CARD_ASPECT_RATIO, type ZoneDims } from "../hooks/cardSizeUtils";

const UPGRADE_GRID_GAP = 6;
const UPGRADE_MAX_CARD_WIDTH = 200;

export function getUpgradeGridColumns(count: number): number {
  return count >= 4 ? 2 : 1;
}

export function getUpgradeGridDims(
  count: number,
  frame: ZoneFrame | null | undefined,
  fallbackDims: ZoneDims,
): ZoneDims {
  if (
    count <= 0 ||
    !frame ||
    frame.innerWidth <= 0 ||
    frame.innerHeight <= 0
  ) {
    return {
      ...fallbackDims,
      columns: getUpgradeGridColumns(count),
      rows: Math.max(1, Math.ceil(count / getUpgradeGridColumns(count))),
    };
  }

  const columns = getUpgradeGridColumns(count);
  const rows = Math.max(1, Math.ceil(count / columns));
  const widthByColumns = Math.floor(
    (frame.innerWidth - UPGRADE_GRID_GAP * Math.max(0, columns - 1)) / columns,
  );
  const widthByRows = Math.floor(
    (frame.innerHeight - UPGRADE_GRID_GAP * Math.max(0, rows - 1)) /
      (rows * CARD_ASPECT_RATIO),
  );
  const width = Math.max(
    1,
    Math.floor(
      Math.min(
        UPGRADE_MAX_CARD_WIDTH,
        widthByColumns,
        widthByRows,
      ),
    ),
  );

  return {
    width,
    height: Math.round(width * CARD_ASPECT_RATIO),
    columns,
    rows,
  };
}

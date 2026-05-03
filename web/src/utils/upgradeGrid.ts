import type { ZoneFrame } from "../hooks/computeConstrainedLayout";
import { CARD_ASPECT_RATIO, type ZoneDims } from "../hooks/cardSizeUtils";

const UPGRADE_GRID_GAP = 6;
const UPGRADE_MAX_CARD_WIDTH = 200;
const UPGRADE_MAX_COLUMNS = 2;

// Column bounds for the upgrade/commandZone layout. count=3 is the only
// flexible case — pass 1 picks 1 vs 2 based on container shape (cramped
// viewports get 2-col cards instead of tiny 1-col stacks). count<=2 stays
// 1-col, count>=4 stays 2-col, both because freeing those choices lets
// computeLayout starve the zone of width and produce smaller cards.
export function getUpgradeZoneLayoutBounds(count: number): {
  minColumns: number;
  maxColumns: number;
} {
  if (count >= 4) return { minColumns: 2, maxColumns: UPGRADE_MAX_COLUMNS };
  if (count === 3) return { minColumns: 1, maxColumns: UPGRADE_MAX_COLUMNS };
  return { minColumns: 1, maxColumns: 1 };
}

export function getUpgradeGridDims(
  count: number,
  frame: ZoneFrame | null | undefined,
  fallbackDims: ZoneDims,
): ZoneDims {
  const layoutColumns = fallbackDims.columns > 0 ? fallbackDims.columns : 1;
  const columns = Math.min(UPGRADE_MAX_COLUMNS, Math.max(1, layoutColumns));
  const rows = Math.max(1, Math.ceil(count / columns));

  if (count <= 0) {
    return { ...fallbackDims, columns, rows };
  }

  const availW = frame && frame.innerWidth > 0
    ? frame.innerWidth
    : fallbackDims.columns * fallbackDims.width
      + UPGRADE_GRID_GAP * Math.max(0, fallbackDims.columns - 1);
  const availH = frame && frame.innerHeight > 0
    ? frame.innerHeight
    : fallbackDims.rows * fallbackDims.height
      + UPGRADE_GRID_GAP * Math.max(0, fallbackDims.rows - 1);

  if (availW <= 0 || availH <= 0) {
    return { ...fallbackDims, columns, rows };
  }

  const widthByColumns = Math.floor(
    (availW - UPGRADE_GRID_GAP * Math.max(0, columns - 1)) / columns,
  );
  const widthByRows = Math.floor(
    (availH - UPGRADE_GRID_GAP * Math.max(0, rows - 1)) /
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

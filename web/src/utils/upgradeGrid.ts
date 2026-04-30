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
  const columns = getUpgradeGridColumns(count);
  const rows = Math.max(1, Math.ceil(count / columns));

  if (count <= 0) {
    return { ...fallbackDims, columns, rows };
  }

  // When the constrained layout supplies a frame, fit cards inside it.
  // Otherwise derive a virtual frame from fallbackDims (the grid the
  // unconstrained algorithm sized for, which may have different cols/rows
  // than this renderer wants). Re-fitting prevents overflow when the
  // algorithm picked, e.g., a 2x2 grid for count=3 while this renderer
  // wants 1x3.
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

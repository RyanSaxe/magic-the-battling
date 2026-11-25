import {
  bestFit,
  MIN_CARD_WIDTH,
  type ZoneDims,
} from "../../hooks/cardSizeUtils";

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 };
export const PANEL_GAP = 6;
export const PANEL_MAX_WIDTH = 200;

function evaluateBattlePanelCandidate(options: {
  count: number;
  columns: number;
  width: number;
  height: number;
}): { candidate: ZoneDims; score: number } | null {
  const rows = Math.ceil(options.count / options.columns);
  const widthByColumns = Math.floor(
    (options.width - PANEL_GAP * Math.max(0, options.columns - 1)) /
      options.columns,
  );
  const widthByRows = Math.floor(
    (options.height - PANEL_GAP * Math.max(0, rows - 1)) / rows / (7 / 5),
  );
  const cardWidth = Math.floor(
    Math.min(PANEL_MAX_WIDTH, widthByColumns, widthByRows),
  );
  if (cardWidth < 1) return null;

  const candidate: ZoneDims = {
    width: cardWidth,
    height: Math.round(cardWidth * (7 / 5)),
    rows,
    columns: options.columns,
  };
  const totalWidth =
    candidate.columns * candidate.width +
    PANEL_GAP * Math.max(0, candidate.columns - 1);
  const totalHeight =
    candidate.rows * candidate.height +
    PANEL_GAP * Math.max(0, candidate.rows - 1);
  if (totalWidth > options.width || totalHeight > options.height) return null;

  const fill =
    (totalWidth * totalHeight) / Math.max(1, options.width * options.height);
  const multiColumnBonus = candidate.columns > 1 ? 14 : 0;
  const balancePenalty = Math.abs(candidate.rows - candidate.columns) * 2;
  return {
    candidate,
    score: candidate.width + fill * 18 + multiColumnBonus - balancePenalty,
  };
}

export function resolveBattlePanelLayout(
  count: number,
  width: number,
  height: number,
): ZoneDims {
  if (count <= 0 || width <= 0 || height <= 0) {
    return DEFAULT_DIMS;
  }

  const baseFit = bestFit({
    count,
    availWidth: width,
    availHeight: height,
    gap: PANEL_GAP,
    maxWidth: PANEL_MAX_WIDTH,
    minWidth: MIN_CARD_WIDTH,
  });
  let best = baseFit;
  let bestScore =
    baseFit.width +
    (baseFit.columns > 1 ? 12 : 0) -
    Math.abs(baseFit.rows - baseFit.columns) * 2;

  for (let columns = 1; columns <= count; columns += 1) {
    const result = evaluateBattlePanelCandidate({
      count,
      columns,
      width,
      height,
    });
    if (result && result.score > bestScore) {
      best = result.candidate;
      bestScore = result.score;
    }
  }

  return best;
}

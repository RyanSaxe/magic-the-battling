/**
 * Single pure card-fitting engine for grids, fixed row/column rails, and fanned
 * rows. Owns aspect-ratio card sizing, the 40px minimum width floor, and
 * negative-gap fanning; contains no phase-specific slot logic.
 */
import {
  CARD_ASPECT_RATIO,
  DEFAULT_CARD_GAP,
  MIN_CARD_WIDTH,
  type ZoneDims,
} from "./types";

export interface CardFitOptions {
  count: number;
  availableWidth: number;
  availableHeight: number;
  gap?: number;
  minCardWidth?: number;
  maxCardWidth?: number;
  maxRows?: number;
  fixedRows?: number;
  fixedColumns?: number;
  maxOverlapRatio?: number;
  noClip?: boolean;
}

export interface CardFitResult extends ZoneDims {
  gap: number;
}

export function cardHeight(width: number): number {
  return Math.round(width * CARD_ASPECT_RATIO);
}

export function makeZoneDims(
  width: number,
  rows: number,
  columns: number,
): ZoneDims {
  return { width, height: cardHeight(width), rows, columns };
}

export function verticalGaps(rows: number, gap: number): number {
  return gap * Math.max(0, rows - 1);
}

export function horizontalGaps(columns: number, gap: number): number {
  return gap * Math.max(0, columns - 1);
}

export function zoneGridWidth(dims: ZoneDims, gap: number): number {
  return dims.columns * dims.width + horizontalGaps(dims.columns, gap);
}

export function zoneGridHeight(dims: ZoneDims, gap: number): number {
  return dims.rows * dims.height + verticalGaps(dims.rows, gap);
}

export function widthCapForRows(
  count: number,
  availableWidth: number,
  rows: number,
  gap: number,
  maxCardWidth: number,
): number {
  const cols = Math.ceil(count / rows);
  const hGaps = horizontalGaps(cols, gap);
  return Math.min(maxCardWidth, Math.floor((availableWidth - hGaps) / cols));
}

export function widthCapForHeight(
  availableHeight: number,
  rows: number,
  gap: number,
): number {
  return Math.floor(
    (availableHeight - verticalGaps(rows, gap)) / (rows * CARD_ASPECT_RATIO),
  );
}

function fitFannedRow(
  count: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
  maxOverlapRatio: number,
): CardFitResult {
  const heightCap = Math.floor(availableHeight / CARD_ASPECT_RATIO);
  const idealWidth = Math.min(heightCap, maxCardWidth);

  if (count <= 1) {
    return { ...makeZoneDims(idealWidth, 1, 1), gap };
  }

  const naturalSpan = count * idealWidth + (count - 1) * gap;
  if (naturalSpan <= availableWidth) {
    return { ...makeZoneDims(idealWidth, 1, count), gap };
  }

  const neededGap = Math.floor(
    (availableWidth - count * idealWidth) / (count - 1),
  );
  const minGap = -Math.floor(idealWidth * maxOverlapRatio);
  if (neededGap >= minGap) {
    return { ...makeZoneDims(idealWidth, 1, count), gap: neededGap };
  }

  const shrunkWidth = Math.max(
    minCardWidth,
    Math.floor((availableWidth - (count - 1) * minGap) / count),
  );
  return { ...makeZoneDims(shrunkWidth, 1, count), gap: minGap };
}

function fitFixedRows(
  count: number,
  rows: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
): CardFitResult {
  const safeRows = Math.max(1, rows);
  const columns = Math.ceil(count / safeRows);
  const wFromW = widthCapForRows(
    count,
    availableWidth,
    safeRows,
    gap,
    maxCardWidth,
  );
  const wFromH = widthCapForHeight(availableHeight, safeRows, gap);
  const width = Math.max(minCardWidth, Math.min(wFromW, wFromH));
  return { ...makeZoneDims(width, safeRows, columns), gap };
}

function fitFixedColumns(
  count: number,
  columns: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
): CardFitResult {
  const safeCols = Math.max(1, columns);
  const rows = Math.ceil(count / safeCols);
  const wFromW = Math.min(
    maxCardWidth,
    Math.floor((availableWidth - horizontalGaps(safeCols, gap)) / safeCols),
  );
  const wFromH = widthCapForHeight(availableHeight, rows, gap);
  const width = Math.max(minCardWidth, Math.min(wFromW, wFromH));
  return { ...makeZoneDims(width, rows, safeCols), gap };
}

function scoreGridCandidate(
  width: number,
  rows: number,
  totalHeight: number,
  availableHeight: number,
): number {
  const fill =
    availableHeight > 0 ? Math.min(1, totalHeight / availableHeight) : 0;
  return width * Math.sqrt(fill) * Math.pow(0.9, rows - 1);
}

function fitGridRowCount(
  count: number,
  rows: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
): { dims: ZoneDims; score: number } | null {
  const columns = Math.ceil(count / rows);
  const naturalWidth =
    (availableWidth - horizontalGaps(columns, gap)) / columns;
  if (naturalWidth < minCardWidth) return null;

  let width = Math.floor(Math.min(maxCardWidth, naturalWidth));
  let height = cardHeight(width);
  let totalHeight = rows * height + verticalGaps(rows, gap);

  if (totalHeight > availableHeight) {
    const wFromH = widthCapForHeight(availableHeight, rows, gap);
    if (wFromH < minCardWidth) return null;
    width = wFromH;
    height = cardHeight(width);
    totalHeight = rows * height + verticalGaps(rows, gap);
  }

  return {
    dims: { width, height, rows, columns },
    score: scoreGridCandidate(width, rows, totalHeight, availableHeight),
  };
}

function fitGridNoClip(
  count: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  preferredMinWidth: number,
  maxCardWidth: number,
): CardFitResult {
  let bestScore = -1;
  let bestDims: ZoneDims | null = null;

  for (let rows = 1; rows <= count; rows++) {
    const columns = Math.ceil(count / rows);
    const wFromW = widthCapForRows(
      count,
      availableWidth,
      rows,
      gap,
      maxCardWidth,
    );
    const wFromH = widthCapForHeight(availableHeight, rows, gap);
    const width = Math.floor(Math.min(maxCardWidth, wFromW, wFromH));
    if (width < 1) continue;

    const candidate = makeZoneDims(width, rows, columns);
    if (
      zoneGridWidth(candidate, gap) > availableWidth ||
      zoneGridHeight(candidate, gap) > availableHeight
    ) {
      continue;
    }

    const totalHeight = zoneGridHeight(candidate, gap);
    const penalty = width < preferredMinWidth ? 0.96 : 1;
    const score =
      scoreGridCandidate(width, rows, totalHeight, availableHeight) * penalty;

    if (score > bestScore) {
      bestScore = score;
      bestDims = candidate;
    }
  }

  if (bestDims) return { ...bestDims, gap };

  const safeWidth = Math.max(
    1,
    Math.floor(
      Math.min(
        maxCardWidth,
        availableWidth,
        availableHeight / CARD_ASPECT_RATIO,
      ),
    ),
  );
  return {
    width: safeWidth,
    height: Math.max(1, cardHeight(safeWidth)),
    rows: count,
    columns: 1,
    gap,
  };
}

function searchBestGrid(
  count: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
): CardFitResult {
  let bestScore = -1;
  let bestDims: ZoneDims | null = null;

  for (let rows = 1; rows <= count; rows++) {
    const candidate = fitGridRowCount(
      count,
      rows,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
    );
    if (candidate && candidate.score > bestScore) {
      bestScore = candidate.score;
      bestDims = candidate.dims;
    }
  }

  if (bestDims) return { ...bestDims, gap };
  return { ...makeZoneDims(minCardWidth, 1, count), gap };
}

function fitGridWithLimits(
  count: number,
  availableWidth: number,
  availableHeight: number,
  gap: number,
  minCardWidth: number,
  maxCardWidth: number,
  maxRows: number,
  noClip: boolean,
): CardFitResult {
  const fit = searchBestGrid(
    count,
    availableWidth,
    availableHeight,
    gap,
    minCardWidth,
    maxCardWidth,
  );

  if (fit.rows > maxRows) {
    return fitFixedRows(
      count,
      maxRows,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
    );
  }

  const overflows =
    zoneGridWidth(fit, gap) > availableWidth ||
    zoneGridHeight(fit, gap) > availableHeight;
  if (noClip && overflows) {
    return fitGridNoClip(
      count,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
    );
  }

  return fit;
}

function resolveCardFitDefaults(options: CardFitOptions) {
  return {
    gap: options.gap ?? DEFAULT_CARD_GAP,
    minCardWidth: options.minCardWidth ?? MIN_CARD_WIDTH,
    maxCardWidth: options.maxCardWidth ?? 200,
    maxRows: options.maxRows ?? Infinity,
    noClip: options.noClip ?? false,
  };
}

export function fitCards(options: CardFitOptions): CardFitResult {
  const {
    count,
    availableWidth,
    availableHeight,
    fixedRows,
    fixedColumns,
    maxOverlapRatio,
  } = options;
  const { gap, minCardWidth, maxCardWidth, maxRows, noClip } =
    resolveCardFitDefaults(options);

  if (count <= 0) {
    return { ...makeZoneDims(maxCardWidth, 1, 1), gap };
  }

  if (maxOverlapRatio !== undefined && maxOverlapRatio > 0) {
    return fitFannedRow(
      count,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
      maxOverlapRatio,
    );
  }

  if (fixedColumns !== undefined) {
    return fitFixedColumns(
      count,
      fixedColumns,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
    );
  }

  if (fixedRows !== undefined) {
    return fitFixedRows(
      count,
      fixedRows,
      availableWidth,
      availableHeight,
      gap,
      minCardWidth,
      maxCardWidth,
    );
  }

  return fitGridWithLimits(
    count,
    availableWidth,
    availableHeight,
    gap,
    minCardWidth,
    maxCardWidth,
    maxRows,
    noClip,
  );
}

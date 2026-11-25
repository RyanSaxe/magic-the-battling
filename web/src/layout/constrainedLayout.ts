/**
 * Pass 2 constrained frame construction and per-zone card fitting via fitCards.
 * Re-exports constraint derivation and clamping from constraintDerivation.ts.
 */
import { fitCards } from "./cardFit";
import {
  MIN_ZONE_CARD,
  clampSavedConstraints,
  deriveConstraintsFromLayout,
  readSectionPadding,
  resolveConstraints,
  type SectionPadding,
} from "./constraintDerivation";
import {
  DEFAULT_CARD_GAP,
  DEFAULT_PASS_2_MAX_CARD_WIDTH,
  DEFAULT_ZONE_DIMS,
  getActiveZoneIds,
  makeDefaultDims,
  makeDefaultFrames,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ConstrainedLayoutState,
  type ZoneConstraints,
  type ZoneDims,
  type ZoneFrame,
  type ZoneFrameResult,
  type ZoneSpec,
} from "./types";

export {
  MIN_ZONE_CARD,
  clampSavedConstraints,
  deriveConstraintsFromLayout,
  resolveConstraints,
};

function distributeInnerHeights(totalInner: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalInner / count);
  let remainder = totalInner - base * count;

  return Array.from({ length: count }, () => {
    if (remainder <= 0) return base;
    remainder -= 1;
    return base + 1;
  });
}

function makeFrame(
  outerWidth: number,
  outerHeight: number,
  sectionPadH: number,
  sectionPadV: number,
): ZoneFrame {
  const innerWidth = Math.max(0, outerWidth - 2 * sectionPadH);
  const innerHeight = Math.max(0, outerHeight - sectionPadV);
  return { outerWidth, outerHeight, innerWidth, innerHeight };
}

interface BandDimensions {
  topOuterH: number;
  bottomOuterH: number;
  leftOuterW: number;
  rightOuterW: number;
}

function computeVerticalBands(
  availH: number,
  hasTop: boolean,
  hasBottom: boolean,
  sectionGap: number,
  topFraction: number,
): { topOuterH: number; bottomOuterH: number } {
  if (hasTop && hasBottom) {
    const usableH = availH - sectionGap;
    const topOuterH = Math.round(usableH * topFraction);
    return { topOuterH, bottomOuterH: usableH - topOuterH };
  }
  return {
    topOuterH: hasTop ? availH : 0,
    bottomOuterH: hasBottom ? availH : 0,
  };
}

function computeHorizontalBands(
  availW: number,
  hasBL: boolean,
  hasBR: boolean,
  sectionGap: number,
  minBottomRightOuterWidth: number,
  leftFraction: number,
): { leftOuterW: number; rightOuterW: number } {
  if (!hasBR) return { leftOuterW: availW, rightOuterW: 0 };
  const lrGap = hasBL ? sectionGap : 0;
  const minRightOuterW = Math.min(
    minBottomRightOuterWidth,
    Math.max(0, availW - lrGap),
  );
  const maxLeftOuterW = Math.max(0, availW - lrGap - minRightOuterW);
  const leftOuterW = Math.min(
    Math.round((availW - lrGap) * leftFraction),
    maxLeftOuterW,
  );
  return { leftOuterW, rightOuterW: availW - leftOuterW - lrGap };
}

function computeBandDimensions(
  availW: number,
  availH: number,
  hasTop: boolean,
  hasBL: boolean,
  hasBR: boolean,
  sectionGap: number,
  minBottomRightOuterWidth: number,
  resolved: Required<ZoneConstraints>,
): BandDimensions {
  const vertical = computeVerticalBands(
    availH,
    hasTop,
    hasBL || hasBR,
    sectionGap,
    resolved.topFraction,
  );
  const horizontal = computeHorizontalBands(
    availW,
    hasBL,
    hasBR,
    sectionGap,
    minBottomRightOuterWidth,
    resolved.leftFraction,
  );
  return { ...vertical, ...horizontal };
}

function assignBottomLeftFrames(
  frames: ZoneFrameResult,
  blIds: string[],
  leftOuterW: number,
  bottomOuterH: number,
  bottomLeftSplit: number,
  pad: SectionPadding,
): void {
  if (blIds.length === 0) return;
  if (blIds.length === 1) {
    frames[blIds[0]] = makeFrame(
      leftOuterW,
      bottomOuterH,
      pad.sectionPadH,
      pad.sectionPadV,
    );
    return;
  }

  const blSectionGaps = Math.max(0, blIds.length - 1) * pad.sectionGap;
  const totalInnerH = Math.max(
    0,
    bottomOuterH - blIds.length * pad.sectionPadV - blSectionGaps,
  );
  const firstInnerH = Math.max(
    0,
    Math.min(totalInnerH, Math.round(totalInnerH * bottomLeftSplit)),
  );
  frames[blIds[0]] = makeFrame(
    leftOuterW,
    firstInnerH + pad.sectionPadV,
    pad.sectionPadH,
    pad.sectionPadV,
  );

  const remainingIds = blIds.slice(1);
  const distributed = distributeInnerHeights(
    Math.max(0, totalInnerH - firstInnerH),
    remainingIds.length,
  );
  remainingIds.forEach((id, index) => {
    frames[id] = makeFrame(
      leftOuterW,
      distributed[index] + pad.sectionPadV,
      pad.sectionPadH,
      pad.sectionPadV,
    );
  });
}

export function computeConstrainedFrames(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): ZoneFrameResult {
  const pad = readSectionPadding(config);
  const frames = makeDefaultFrames(Object.keys(config.zones));
  const availW = containerW - pad.padding;
  const availH = containerH - pad.fixedHeight;
  if (availW <= 0 || availH <= 0) return frames;

  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  if (topIds.length + blIds.length + brIds.length === 0) return frames;

  const resolved = resolveConstraints(
    containerW,
    containerH,
    config,
    constraints,
  );
  const bands = computeBandDimensions(
    availW,
    availH,
    topIds.length > 0,
    blIds.length > 0,
    brIds.length > 0,
    pad.sectionGap,
    config.minBottomRightOuterWidth ?? 0,
    resolved,
  );

  for (const id of topIds) {
    frames[id] = makeFrame(
      availW,
      bands.topOuterH,
      pad.sectionPadH,
      pad.sectionPadV,
    );
  }
  assignBottomLeftFrames(
    frames,
    blIds,
    bands.leftOuterW,
    bands.bottomOuterH,
    resolved.bottomLeftSplit,
    pad,
  );
  for (const id of brIds) {
    frames[id] = makeFrame(
      bands.rightOuterW,
      bands.bottomOuterH,
      pad.sectionPadH,
      pad.sectionPadV,
    );
  }

  return frames;
}

function fitZoneInFrame(
  spec: ZoneSpec,
  frame: ZoneFrame,
  minCardWidth: number,
  globalMaxCardWidth: number,
  pass2MaxCardWidth: number,
): ZoneDims {
  if (spec.count <= 0) return DEFAULT_ZONE_DIMS;
  // Pass 2 cap: never shrink below pass 1's per-zone allocation, but apply a
  // sanity ceiling to prevent absurd card sizes on large screens.
  const effectiveMaxWidth = Math.max(
    pass2MaxCardWidth,
    spec.maxCardWidth ?? globalMaxCardWidth,
  );
  const fit = fitCards({
    count: spec.count,
    availableWidth: frame.innerWidth,
    availableHeight: frame.innerHeight,
    gap: spec.gap ?? DEFAULT_CARD_GAP,
    minCardWidth,
    maxCardWidth: effectiveMaxWidth,
    maxRows: spec.maxRows ?? Infinity,
  });
  return {
    width: fit.width,
    height: fit.height,
    rows: fit.rows,
    columns: fit.columns,
  };
}

export function computeConstrainedLayoutState(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): ConstrainedLayoutState {
  const minCardWidth = config.minCardWidth ?? 1;
  const maxCardWidth = config.maxCardWidth ?? 200;
  const pass2MaxCardWidth =
    config.pass2MaxCardWidth ?? DEFAULT_PASS_2_MAX_CARD_WIDTH;

  const zoneIds = Object.keys(config.zones);
  const dims = makeDefaultDims(zoneIds);
  const resolved = resolveConstraints(
    containerW,
    containerH,
    config,
    constraints,
  );
  const frames = computeConstrainedFrames(
    containerW,
    containerH,
    config,
    resolved,
  );

  for (const id of zoneIds) {
    const frame = frames[id];
    if (!frame || frame.innerWidth <= 0 || frame.innerHeight <= 0) continue;
    dims[id] = fitZoneInFrame(
      config.zones[id],
      frame,
      minCardWidth,
      maxCardWidth,
      pass2MaxCardWidth,
    );
  }

  return { dims, frames, constraints: resolved };
}

export function computeConstrainedLayout(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): CardLayoutResult {
  const state = computeConstrainedLayoutState(
    containerW,
    containerH,
    config,
    constraints,
  );
  return state.dims;
}

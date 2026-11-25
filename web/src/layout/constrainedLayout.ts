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
  outer: { width: number; height: number },
  pad: Pick<SectionPadding, "sectionPadH" | "sectionPadV">,
): ZoneFrame {
  const innerWidth = Math.max(0, outer.width - 2 * pad.sectionPadH);
  const innerHeight = Math.max(0, outer.height - pad.sectionPadV);
  return {
    outerWidth: outer.width,
    outerHeight: outer.height,
    innerWidth,
    innerHeight,
  };
}

interface BandDimensions {
  topOuterH: number;
  bottomOuterH: number;
  leftOuterW: number;
  rightOuterW: number;
}

function computeVerticalBands(args: {
  availH: number;
  hasTop: boolean;
  hasBottom: boolean;
  sectionGap: number;
  topFraction: number;
}): { topOuterH: number; bottomOuterH: number } {
  const { availH, hasTop, hasBottom, sectionGap, topFraction } = args;
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

function computeHorizontalBands(args: {
  availW: number;
  hasBL: boolean;
  hasBR: boolean;
  sectionGap: number;
  minBottomRightOuterWidth: number;
  leftFraction: number;
}): { leftOuterW: number; rightOuterW: number } {
  const {
    availW,
    hasBL,
    hasBR,
    sectionGap,
    minBottomRightOuterWidth,
    leftFraction,
  } = args;
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

function computeBandDimensions(args: {
  availW: number;
  availH: number;
  hasTop: boolean;
  hasBL: boolean;
  hasBR: boolean;
  sectionGap: number;
  minBottomRightOuterWidth: number;
  resolved: Required<ZoneConstraints>;
}): BandDimensions {
  const vertical = computeVerticalBands({
    availH: args.availH,
    hasTop: args.hasTop,
    hasBottom: args.hasBL || args.hasBR,
    sectionGap: args.sectionGap,
    topFraction: args.resolved.topFraction,
  });
  const horizontal = computeHorizontalBands({
    availW: args.availW,
    hasBL: args.hasBL,
    hasBR: args.hasBR,
    sectionGap: args.sectionGap,
    minBottomRightOuterWidth: args.minBottomRightOuterWidth,
    leftFraction: args.resolved.leftFraction,
  });
  return { ...vertical, ...horizontal };
}

function assignBottomLeftFrames(args: {
  frames: ZoneFrameResult;
  blIds: string[];
  leftOuterW: number;
  bottomOuterH: number;
  bottomLeftSplit: number;
  pad: SectionPadding;
}): void {
  const { frames, blIds, leftOuterW, bottomOuterH, bottomLeftSplit, pad } =
    args;
  if (blIds.length === 0) return;
  if (blIds.length === 1) {
    frames[blIds[0]] = makeFrame(
      { width: leftOuterW, height: bottomOuterH },
      pad,
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
    { width: leftOuterW, height: firstInnerH + pad.sectionPadV },
    pad,
  );

  const remainingIds = blIds.slice(1);
  const distributed = distributeInnerHeights(
    Math.max(0, totalInnerH - firstInnerH),
    remainingIds.length,
  );
  remainingIds.forEach((id, index) => {
    frames[id] = makeFrame(
      { width: leftOuterW, height: distributed[index] + pad.sectionPadV },
      pad,
    );
  });
}

export interface ConstrainedLayoutOptions {
  containerW: number;
  containerH: number;
  config: CardLayoutConfig;
  constraints: ZoneConstraints;
}

export function computeConstrainedFrames({
  containerW,
  containerH,
  config,
  constraints,
}: ConstrainedLayoutOptions): ZoneFrameResult {
  const pad = readSectionPadding(config);
  const frames = makeDefaultFrames(Object.keys(config.zones));
  const availW = containerW - pad.padding;
  const availH = containerH - pad.fixedHeight;
  if (availW <= 0 || availH <= 0) return frames;

  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  if (topIds.length + blIds.length + brIds.length === 0) return frames;

  const resolved = resolveConstraints({
    containerW,
    containerH,
    config,
    constraints,
  });
  const bands = computeBandDimensions({
    availW,
    availH,
    hasTop: topIds.length > 0,
    hasBL: blIds.length > 0,
    hasBR: brIds.length > 0,
    sectionGap: pad.sectionGap,
    minBottomRightOuterWidth: config.minBottomRightOuterWidth ?? 0,
    resolved,
  });

  for (const id of topIds) {
    frames[id] = makeFrame({ width: availW, height: bands.topOuterH }, pad);
  }
  assignBottomLeftFrames({
    frames,
    blIds,
    leftOuterW: bands.leftOuterW,
    bottomOuterH: bands.bottomOuterH,
    bottomLeftSplit: resolved.bottomLeftSplit,
    pad,
  });
  for (const id of brIds) {
    frames[id] = makeFrame(
      { width: bands.rightOuterW, height: bands.bottomOuterH },
      pad,
    );
  }

  return frames;
}

function fitZoneInFrame(args: {
  spec: ZoneSpec;
  frame: ZoneFrame;
  minCardWidth: number;
  globalMaxCardWidth: number;
  pass2MaxCardWidth: number;
}): ZoneDims {
  const { spec, frame, minCardWidth, globalMaxCardWidth, pass2MaxCardWidth } =
    args;
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

export function computeConstrainedLayoutState({
  containerW,
  containerH,
  config,
  constraints,
}: ConstrainedLayoutOptions): ConstrainedLayoutState {
  const minCardWidth = config.minCardWidth ?? 1;
  const maxCardWidth = config.maxCardWidth ?? 200;
  const pass2MaxCardWidth =
    config.pass2MaxCardWidth ?? DEFAULT_PASS_2_MAX_CARD_WIDTH;

  const zoneIds = Object.keys(config.zones);
  const dims = makeDefaultDims(zoneIds);
  const resolved = resolveConstraints({
    containerW,
    containerH,
    config,
    constraints,
  });
  const frames = computeConstrainedFrames({
    containerW,
    containerH,
    config,
    constraints: resolved,
  });

  for (const id of zoneIds) {
    const frame = frames[id];
    if (!frame || frame.innerWidth <= 0 || frame.innerHeight <= 0) continue;
    dims[id] = fitZoneInFrame({
      spec: config.zones[id],
      frame,
      minCardWidth,
      globalMaxCardWidth: maxCardWidth,
      pass2MaxCardWidth,
    });
  }

  return { dims, frames, constraints: resolved };
}

export function computeConstrainedLayout(
  options: ConstrainedLayoutOptions,
): CardLayoutResult {
  const state = computeConstrainedLayoutState(options);
  return state.dims;
}

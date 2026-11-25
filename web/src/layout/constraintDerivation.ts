/**
 * Constraint derivation from Pass 1 layouts, partial-constraint resolution, and
 * saved-constraint clamping so every active zone keeps room for one row of cards.
 */
import { cardHeight, zoneGridHeight } from "./cardFit";
import { computePhaseLayout } from "./phaseLayout";
import {
  DEFAULT_CARD_GAP,
  MIN_CARD_WIDTH,
  getActiveZoneIds,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ZoneConstraints,
  type ZoneFrameResult,
} from "./types";

export const MIN_ZONE_CARD = {
  width: MIN_CARD_WIDTH,
  height: cardHeight(MIN_CARD_WIDTH),
};

const DEFAULT_CONSTRAINTS: Required<ZoneConstraints> = {
  topFraction: 0.5,
  leftFraction: 0.7,
  bottomLeftSplit: 0.5,
};

export interface SectionPadding {
  fixedHeight: number;
  padding: number;
  sectionPadH: number;
  sectionPadV: number;
  sectionGap: number;
}

export function readSectionPadding(config: CardLayoutConfig): SectionPadding {
  const padTop = config.sectionPadTop ?? 0;
  const padBottom = config.sectionPadBottom ?? 0;
  return {
    fixedHeight: config.fixedHeight ?? 0,
    padding: config.padding ?? 0,
    sectionPadH: config.sectionPadH ?? 0,
    sectionPadV: padTop + padBottom,
    sectionGap: config.sectionGap ?? 0,
  };
}

function clampBetween(value: number, low: number, high: number): number {
  // When the board can't give every zone its minimum, split what there is in proportion.
  if (low > high) return low / (low + 1 - high);
  return Math.max(low, Math.min(high, value));
}

function deriveTopFraction(args: {
  unconstrained: CardLayoutResult;
  config: CardLayoutConfig;
  topIds: string[];
  hasBottom: boolean;
  usableH: number;
  sectionPadV: number;
}): { topFraction: number; topPixels: number } {
  const { unconstrained, config, topIds, hasBottom, usableH, sectionPadV } =
    args;
  let topPixels = 0;
  for (const id of topIds) {
    const dims = unconstrained[id];
    const gap = config.zones[id]?.gap ?? DEFAULT_CARD_GAP;
    if (dims && dims.width > 0) {
      topPixels += zoneGridHeight(dims, gap) + sectionPadV;
    }
  }
  const hasTop = topIds.length > 0;
  const rawTopFraction =
    hasTop && hasBottom && usableH > 0 ? topPixels / usableH : 0.5;
  const topFraction =
    typeof config.maxTopFraction === "number"
      ? Math.min(rawTopFraction, config.maxTopFraction)
      : rawTopFraction;
  return { topFraction, topPixels };
}

function deriveLeftFraction(args: {
  unconstrained: CardLayoutResult;
  config: CardLayoutConfig;
  blIds: string[];
  brIds: string[];
  availW: number;
  sectionPadH: number;
  sectionGap: number;
}): number {
  const {
    unconstrained,
    config,
    blIds,
    brIds,
    availW,
    sectionPadH,
    sectionGap,
  } = args;
  let rightPixels = 0;
  for (const id of brIds) {
    const dims = unconstrained[id];
    const gap = config.zones[id]?.gap ?? DEFAULT_CARD_GAP;
    if (dims && dims.width > 0) {
      rightPixels =
        dims.columns * dims.width +
        gap * Math.max(0, dims.columns - 1) +
        2 * sectionPadH;
    }
  }
  rightPixels = Math.max(rightPixels, config.minBottomRightOuterWidth ?? 0);
  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;
  const leftPixels = availW - rightPixels - lrGap;
  return availW - lrGap > 0 ? leftPixels / (availW - lrGap) : 0.7;
}

function measureBottomLeftHeights(
  unconstrained: CardLayoutResult,
  config: CardLayoutConfig,
  blIds: string[],
): { firstGridH: number; totalGridH: number } {
  let totalGridH = 0;
  let firstGridH = 0;
  for (let i = 0; i < blIds.length; i++) {
    const dims = unconstrained[blIds[i]];
    const gap = config.zones[blIds[i]]?.gap ?? DEFAULT_CARD_GAP;
    const gridH = dims && dims.width > 0 ? zoneGridHeight(dims, gap) : 0;
    totalGridH += gridH;
    if (i === 0) firstGridH = gridH;
  }
  return { firstGridH, totalGridH };
}

function deriveBottomLeftSplit(args: {
  unconstrained: CardLayoutResult;
  config: CardLayoutConfig;
  blIds: string[];
  hasTop: boolean;
  hasBottom: boolean;
  availH: number;
  usableH: number;
  topPixels: number;
  sectionPadV: number;
  sectionGap: number;
}): number {
  const {
    unconstrained,
    config,
    blIds,
    hasTop,
    hasBottom,
    availH,
    usableH,
    topPixels,
    sectionPadV,
    sectionGap,
  } = args;
  if (blIds.length < 2) return 0.5;

  const { firstGridH, totalGridH } = measureBottomLeftHeights(
    unconstrained,
    config,
    blIds,
  );
  const totalInner = totalGridH > 0 ? totalGridH : 1;
  const blGaps = Math.max(0, blIds.length - 1) * sectionGap;
  const bottomOuterH = hasTop && hasBottom ? usableH - topPixels : availH;
  const totalInnerH = bottomOuterH - blIds.length * sectionPadV - blGaps;
  return totalInnerH > 0 && totalInner > 0 ? firstGridH / totalInner : 0.5;
}

export interface DeriveConstraintsOptions {
  unconstrained: CardLayoutResult;
  config: CardLayoutConfig;
  containerH: number;
  containerW: number;
}

export function deriveConstraintsFromLayout({
  unconstrained,
  config,
  containerH,
  containerW,
}: DeriveConstraintsOptions): Required<ZoneConstraints> {
  const pad = readSectionPadding(config);
  const availH = containerH - pad.fixedHeight;
  const availW = containerW - pad.padding;
  if (availH <= 0 || availW <= 0) return { ...DEFAULT_CONSTRAINTS };

  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const usableH = availH - (hasTop && hasBottom ? pad.sectionGap : 0);

  const { topFraction, topPixels } = deriveTopFraction({
    unconstrained,
    config,
    topIds,
    hasBottom,
    usableH,
    sectionPadV: pad.sectionPadV,
  });
  const leftFraction = deriveLeftFraction({
    unconstrained,
    config,
    blIds,
    brIds,
    availW,
    sectionPadH: pad.sectionPadH,
    sectionGap: pad.sectionGap,
  });
  const bottomLeftSplit = deriveBottomLeftSplit({
    unconstrained,
    config,
    blIds,
    hasTop,
    hasBottom,
    availH,
    usableH,
    topPixels,
    sectionPadV: pad.sectionPadV,
    sectionGap: pad.sectionGap,
  });

  return { topFraction, leftFraction, bottomLeftSplit };
}

export interface ResolveConstraintsOptions {
  containerW: number;
  containerH: number;
  config: CardLayoutConfig;
  constraints: ZoneConstraints;
}

export function resolveConstraints({
  containerW,
  containerH,
  config,
  constraints,
}: ResolveConstraintsOptions): Required<ZoneConstraints> {
  const { topFraction, leftFraction, bottomLeftSplit } = constraints;
  if (
    topFraction !== undefined &&
    leftFraction !== undefined &&
    bottomLeftSplit !== undefined
  ) {
    return { topFraction, leftFraction, bottomLeftSplit };
  }
  const derived = deriveConstraintsFromLayout({
    unconstrained: computePhaseLayout(containerW, containerH, config),
    config,
    containerH,
    containerW,
  });
  return {
    topFraction: topFraction ?? derived.topFraction,
    leftFraction: leftFraction ?? derived.leftFraction,
    bottomLeftSplit: bottomLeftSplit ?? derived.bottomLeftSplit,
  };
}

function clampTopFraction(args: {
  topFraction: number;
  topIds: string[];
  blIds: string[];
  brIds: string[];
  usableH: number;
  sectionPadV: number;
  sectionGap: number;
  automaticFrames: ZoneFrameResult;
}): number {
  const {
    topFraction,
    topIds,
    blIds,
    brIds,
    usableH,
    sectionPadV,
    sectionGap,
    automaticFrames,
  } = args;
  if (topIds.length === 0 || (blIds.length === 0 && brIds.length === 0)) {
    return topFraction;
  }
  if (usableH <= 0) return topFraction;

  const minCardOuterH = sectionPadV + MIN_ZONE_CARD.height;
  const minTopH = Math.min(
    minCardOuterH,
    automaticFrames[topIds[0]].outerHeight,
  );
  const blMinSum = blIds.reduce(
    (sum, id) => sum + Math.min(minCardOuterH, automaticFrames[id].outerHeight),
    0,
  );
  const brMinH =
    brIds.length > 0
      ? Math.min(minCardOuterH, automaticFrames[brIds[0]].outerHeight)
      : 0;
  const bottomMinH = Math.max(
    blMinSum + Math.max(0, blIds.length - 1) * sectionGap,
    brMinH,
  );
  return clampBetween(topFraction, minTopH / usableH, 1 - bottomMinH / usableH);
}

function clampBottomLeftSplitValue(args: {
  bottomLeftSplit: number;
  blIds: string[];
  bottomOuterH: number;
  sectionPadV: number;
  sectionGap: number;
  automaticFrames: ZoneFrameResult;
}): number {
  const {
    bottomLeftSplit,
    blIds,
    bottomOuterH,
    sectionPadV,
    sectionGap,
    automaticFrames,
  } = args;
  if (blIds.length < 2) return bottomLeftSplit;
  const totalInnerH =
    bottomOuterH - blIds.length * sectionPadV - (blIds.length - 1) * sectionGap;
  if (totalInnerH <= 0) return bottomLeftSplit;

  const minCardOuterH = sectionPadV + MIN_ZONE_CARD.height;
  const firstMinInnerH =
    Math.min(minCardOuterH, automaticFrames[blIds[0]].outerHeight) -
    sectionPadV;
  const restMinH = blIds
    .slice(1)
    .reduce(
      (sum, id) =>
        sum +
        Math.min(minCardOuterH, automaticFrames[id].outerHeight) -
        sectionPadV,
      0,
    );
  return clampBetween(
    bottomLeftSplit,
    firstMinInnerH / totalInnerH,
    1 - restMinH / totalInnerH,
  );
}

function clampLeftFractionValue(args: {
  leftFraction: number;
  blIds: string[];
  brIds: string[];
  availW: number;
  sectionPadH: number;
  sectionGap: number;
  automaticFrames: ZoneFrameResult;
}): number {
  const {
    leftFraction,
    blIds,
    brIds,
    availW,
    sectionPadH,
    sectionGap,
    automaticFrames,
  } = args;
  if (blIds.length === 0 || brIds.length === 0) return leftFraction;
  const rowW = availW - sectionGap;
  if (rowW <= 0) return leftFraction;

  const minCardOuterW = 2 * sectionPadH + MIN_ZONE_CARD.width;
  const blMinW = Math.min(minCardOuterW, automaticFrames[blIds[0]].outerWidth);
  const brMinW = Math.min(minCardOuterW, automaticFrames[brIds[0]].outerWidth);
  return clampBetween(leftFraction, blMinW / rowW, 1 - brMinW / rowW);
}

/**
 * Computes drawable fractions for a saved layout, moving any fraction only as
 * far as needed so every active zone keeps room for one row of cards (or the
 * automatic layout's room when that is smaller). The saved values themselves
 * stay unchanged so a larger board in the same band recovers them.
 */
export interface ClampSavedConstraintsOptions {
  containerW: number;
  containerH: number;
  config: CardLayoutConfig;
  savedFractions: ZoneConstraints;
  automaticFrames: ZoneFrameResult;
}

export function clampSavedConstraints({
  containerW,
  containerH,
  config,
  savedFractions,
  automaticFrames,
}: ClampSavedConstraintsOptions): Required<ZoneConstraints> {
  const pad = readSectionPadding(config);
  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const availH = containerH - pad.fixedHeight;
  const availW = containerW - pad.padding;
  const usableH = availH - (hasTop && hasBottom ? pad.sectionGap : 0);

  const clamped = resolveConstraints({
    containerW,
    containerH,
    config,
    constraints: savedFractions,
  });

  clamped.topFraction = clampTopFraction({
    topFraction: clamped.topFraction,
    topIds,
    blIds,
    brIds,
    usableH,
    sectionPadV: pad.sectionPadV,
    sectionGap: pad.sectionGap,
    automaticFrames,
  });

  const bottomOuterH = hasTop
    ? usableH - Math.round(usableH * clamped.topFraction)
    : availH;
  clamped.bottomLeftSplit = clampBottomLeftSplitValue({
    bottomLeftSplit: clamped.bottomLeftSplit,
    blIds,
    bottomOuterH,
    sectionPadV: pad.sectionPadV,
    sectionGap: pad.sectionGap,
    automaticFrames,
  });

  clamped.leftFraction = clampLeftFractionValue({
    leftFraction: clamped.leftFraction,
    blIds,
    brIds,
    availW,
    sectionPadH: pad.sectionPadH,
    sectionGap: pad.sectionGap,
    automaticFrames,
  });

  return clamped;
}

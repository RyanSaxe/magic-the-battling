import { bestFit, CARD_ASPECT_RATIO, type ZoneDims } from "./cardSizeUtils";
import {
  computeLayout,
  DEFAULT_PASS_2_MAX_CARD_WIDTH,
  type CardLayoutConfig,
  type CardLayoutResult,
} from "./useCardLayout";

export interface ZoneConstraints {
  topFraction?: number;
  leftFraction?: number;
  bottomLeftSplit?: number;
}

export interface ZoneFrame {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
}

export type ZoneFrameResult = Record<string, ZoneFrame>;

const DEFAULT_DIMS: ZoneDims = {
  width: 100,
  height: 140,
  rows: 1,
  columns: 1,
};

const DEFAULT_FRAME: ZoneFrame = {
  innerWidth: 0,
  innerHeight: 0,
  outerWidth: 0,
  outerHeight: 0,
};

interface ResolvedZone {
  id: string;
  count: number;
  gap: number;
  maxCardWidth: number;
  maxRows: number;
}

function zoneGridH(dims: ZoneDims, gap: number): number {
  return dims.rows * dims.height + gap * Math.max(0, dims.rows - 1);
}

function fitZone(
  zone: ResolvedZone,
  w: number,
  h: number,
  minCardWidth: number,
  effectiveMaxWidth: number,
): ZoneDims {
  if (zone.count <= 0 || w <= 0 || h <= 0) return DEFAULT_DIMS;
  const fit = bestFit(
    zone.count,
    w,
    h,
    zone.gap,
    effectiveMaxWidth,
    minCardWidth,
  );
  if (fit.rows > zone.maxRows) {
    const rows = zone.maxRows;
    const cols = Math.ceil(zone.count / rows);
    const hGaps = zone.gap * Math.max(0, cols - 1);
    const wCap = Math.min(effectiveMaxWidth, Math.floor((w - hGaps) / cols));
    const vG = zone.gap * Math.max(0, rows - 1);
    const wFromH = Math.floor((h - vG) / (rows * CARD_ASPECT_RATIO));
    const finalW = Math.max(minCardWidth, Math.min(wCap, wFromH));
    return {
      width: finalW,
      height: Math.round(finalW * CARD_ASPECT_RATIO),
      rows,
      columns: cols,
    };
  }
  return fit;
}

function makeDefaultDims(zoneIds: string[]): CardLayoutResult {
  const result: CardLayoutResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_DIMS;
  return result;
}

export function makeDefaultFrames(zoneIds: string[]): ZoneFrameResult {
  const result: ZoneFrameResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_FRAME;
  return result;
}

function getActiveIds(config: CardLayoutConfig) {
  const topIds = (config.layout.top ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const blIds = (config.layout.bottomLeft ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const brIds = (config.layout.bottomRight ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );

  return { topIds, blIds, brIds };
}

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

export function deriveConstraintsFromLayout(
  unconstrained: CardLayoutResult,
  config: CardLayoutConfig,
  containerH: number,
  containerW: number,
): Required<ZoneConstraints> {
  const fixedHeight = config.fixedHeight ?? 0;
  const padding = config.padding ?? 0;
  const availH = containerH - fixedHeight;
  const availW = containerW - padding;

  if (availH <= 0 || availW <= 0) {
    return { topFraction: 0.5, leftFraction: 0.7, bottomLeftSplit: 0.5 };
  }

  const {
    sectionPadH = 0,
    sectionPadTop = 0,
    sectionPadBottom = 0,
    sectionGap = 0,
  } = config;
  const sectionPadV = sectionPadTop + sectionPadBottom;

  const { topIds, blIds, brIds } = getActiveIds(config);
  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const columnGap = hasTop && hasBottom ? sectionGap : 0;
  const usableH = availH - columnGap;

  let topPixels = 0;
  for (const id of topIds) {
    const d = unconstrained[id];
    const gap = config.zones[id]?.gap ?? 6;
    if (d && d.width > 0) topPixels += zoneGridH(d, gap) + sectionPadV;
  }
  const rawTopFraction =
    hasTop && hasBottom && usableH > 0 ? topPixels / usableH : 0.5;
  const maxTopFraction = config.maxTopFraction;
  const topFraction =
    typeof maxTopFraction === "number"
      ? Math.min(rawTopFraction, maxTopFraction)
      : rawTopFraction;

  let rightPixels = 0;
  for (const id of brIds) {
    const d = unconstrained[id];
    const gap = config.zones[id]?.gap ?? 6;
    if (d && d.width > 0) {
      rightPixels =
        d.columns * d.width +
        gap * Math.max(0, d.columns - 1) +
        2 * sectionPadH;
    }
  }
  rightPixels = Math.max(rightPixels, config.minBottomRightOuterWidth ?? 0);
  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;
  const leftPixels = availW - rightPixels - lrGap;
  const leftFraction =
    availW - lrGap > 0 ? leftPixels / (availW - lrGap) : 0.7;

  let bottomLeftSplit = 0.5;
  if (blIds.length >= 2) {
    const blGaps = Math.max(0, blIds.length - 1) * sectionGap;
    let totalGridH = 0;
    let firstGridH = 0;
    for (let i = 0; i < blIds.length; i++) {
      const d = unconstrained[blIds[i]];
      const gap = config.zones[blIds[i]]?.gap ?? 6;
      const gh = d && d.width > 0 ? zoneGridH(d, gap) : 0;
      totalGridH += gh;
      if (i === 0) firstGridH = gh;
    }
    const totalInner = totalGridH > 0 ? totalGridH : 1;
    const bottomOuterH =
      hasTop && hasBottom ? usableH - topPixels : availH;
    const totalInnerH = bottomOuterH - blIds.length * sectionPadV - blGaps;
    if (totalInnerH > 0 && totalInner > 0) {
      bottomLeftSplit = firstGridH / totalInner;
    }
  }

  return { topFraction, leftFraction, bottomLeftSplit };
}

export function computeConstrainedFrames(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): ZoneFrameResult {
  const {
    fixedHeight = 0,
    padding = 0,
    sectionPadH = 0,
    sectionPadTop = 0,
    sectionPadBottom = 0,
    sectionGap = 0,
  } = config;

  const zoneIds = Object.keys(config.zones);
  const frames = makeDefaultFrames(zoneIds);

  const availW = containerW - padding;
  const availH = containerH - fixedHeight;
  if (availW <= 0 || availH <= 0) return frames;

  const sectionPadV = sectionPadTop + sectionPadBottom;
  const { topIds, blIds, brIds } = getActiveIds(config);
  const activeIds = [...topIds, ...blIds, ...brIds];
  if (activeIds.length === 0) return frames;

  const unconstrained = computeLayout(containerW, containerH, config);
  const derived = deriveConstraintsFromLayout(
    unconstrained,
    config,
    containerH,
    containerW,
  );

  const topFraction = constraints.topFraction ?? derived.topFraction;
  const leftFraction = constraints.leftFraction ?? derived.leftFraction;
  const bottomLeftSplit =
    constraints.bottomLeftSplit ?? derived.bottomLeftSplit;

  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const columnGap = hasTop && hasBottom ? sectionGap : 0;
  const usableH = availH - columnGap;

  const topOuterH = hasTop && hasBottom
    ? Math.round(usableH * topFraction)
    : hasTop
      ? availH
      : 0;
  const bottomOuterH = hasTop && hasBottom
    ? usableH - topOuterH
    : hasBottom
      ? availH
      : 0;

  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;
  const minRightOuterW = brIds.length > 0
    ? Math.min(config.minBottomRightOuterWidth ?? 0, Math.max(0, availW - lrGap))
    : 0;
  const maxLeftOuterW = brIds.length > 0
    ? Math.max(0, availW - lrGap - minRightOuterW)
    : availW;
  const leftOuterW = brIds.length > 0
    ? Math.min(Math.round((availW - lrGap) * leftFraction), maxLeftOuterW)
    : availW;
  const rightOuterW = brIds.length > 0 ? availW - leftOuterW - lrGap : 0;

  const assignFrame = (
    id: string,
    outerWidth: number,
    outerHeight: number,
  ) => {
    frames[id] = {
      outerWidth,
      outerHeight,
      innerWidth: Math.max(0, outerWidth - 2 * sectionPadH),
      innerHeight: Math.max(0, outerHeight - sectionPadV),
    };
  };

  for (const id of topIds) assignFrame(id, availW, topOuterH);

  if (blIds.length === 1) {
    assignFrame(blIds[0], leftOuterW, bottomOuterH);
  } else if (blIds.length >= 2) {
    const blSectionGaps = Math.max(0, blIds.length - 1) * sectionGap;
    const totalInnerH = Math.max(
      0,
      bottomOuterH - blIds.length * sectionPadV - blSectionGaps,
    );
    const firstInnerH = Math.max(
      0,
      Math.min(totalInnerH, Math.round(totalInnerH * bottomLeftSplit)),
    );
    assignFrame(blIds[0], leftOuterW, firstInnerH + sectionPadV);

    const remainingIds = blIds.slice(1);
    const remainingInnerH = Math.max(0, totalInnerH - firstInnerH);
    const distributed = distributeInnerHeights(
      remainingInnerH,
      remainingIds.length,
    );

    remainingIds.forEach((id, index) => {
      assignFrame(id, leftOuterW, distributed[index] + sectionPadV);
    });
  }

  for (const id of brIds) assignFrame(id, rightOuterW, bottomOuterH);

  return frames;
}

export interface ConstrainedLayoutState {
  dims: CardLayoutResult;
  frames: ZoneFrameResult;
}

export function computeConstrainedLayoutState(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): ConstrainedLayoutState {
  const {
    minCardWidth = 1,
    maxCardWidth = 200,
    pass2MaxCardWidth = DEFAULT_PASS_2_MAX_CARD_WIDTH,
  } = config;

  const zoneIds = Object.keys(config.zones);
  const dims = makeDefaultDims(zoneIds);
  const frames = computeConstrainedFrames(
    containerW,
    containerH,
    config,
    constraints,
  );

  const resolve = (id: string): ResolvedZone => {
    const spec = config.zones[id];
    return {
      id,
      count: spec.count,
      gap: spec.gap ?? 6,
      maxCardWidth: spec.maxCardWidth ?? maxCardWidth,
      maxRows: spec.maxRows ?? Infinity,
    };
  };

  for (const id of zoneIds) {
    const zone = resolve(id);
    const frame = frames[id];
    if (!frame || frame.innerWidth <= 0 || frame.innerHeight <= 0) continue;
    // Pass 2 cap: never shrink below pass 1's per-zone allocation, but apply a
    // sanity ceiling to prevent absurd card sizes on large screens.
    const effectiveMaxWidth = Math.max(pass2MaxCardWidth, zone.maxCardWidth);
    dims[id] = fitZone(
      zone,
      frame.innerWidth,
      frame.innerHeight,
      minCardWidth,
      effectiveMaxWidth,
    );
  }

  return { dims, frames };
}

export function computeConstrainedLayout(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): CardLayoutResult {
  return computeConstrainedLayoutState(
    containerW,
    containerH,
    config,
    constraints,
  ).dims;
}

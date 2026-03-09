import { bestFit, CARD_ASPECT_RATIO, type ZoneDims } from "./cardSizeUtils";
import {
  computeLayout,
  type CardLayoutConfig,
  type CardLayoutResult,
} from "./useCardLayout";

export interface ZoneConstraints {
  topFraction?: number;
  leftFraction?: number;
  bottomLeftSplit?: number;
}

const DEFAULT_DIMS: ZoneDims = {
  width: 100,
  height: 140,
  rows: 1,
  columns: 1,
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
): ZoneDims {
  if (w <= 0 || h <= 0) return DEFAULT_DIMS;
  const fit = bestFit(
    zone.count,
    w,
    h,
    zone.gap,
    zone.maxCardWidth,
    minCardWidth,
  );
  if (fit.rows > zone.maxRows) {
    const rows = zone.maxRows;
    const cols = Math.ceil(zone.count / rows);
    const hGaps = zone.gap * Math.max(0, cols - 1);
    const wCap = Math.min(zone.maxCardWidth, Math.floor((w - hGaps) / cols));
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

  const topIds = (config.layout.top ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const blIds = (config.layout.bottomLeft ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const brIds = (config.layout.bottomRight ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );

  let topPixels = 0;
  for (const id of topIds) {
    const d = unconstrained[id];
    const gap = config.zones[id]?.gap ?? 6;
    if (d && d.width > 0) topPixels += zoneGridH(d, gap) + sectionPadV;
  }
  const topFraction = availH > 0 ? topPixels / availH : 0.5;

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
    // Derive from the unconstrained grid heights, excluding padding
    // since computeConstrainedLayout applies padding separately
    const columnGap =
      topIds.length > 0 && (blIds.length > 0 || brIds.length > 0)
        ? sectionGap
        : 0;
    const bottomH = availH - topPixels - columnGap;
    const totalInnerH =
      bottomH - blIds.length * sectionPadV - blGaps;
    if (totalInnerH > 0 && totalInner > 0) {
      bottomLeftSplit = firstGridH / totalInner;
    }
  }

  return { topFraction, leftFraction, bottomLeftSplit };
}

export function computeConstrainedLayout(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
  constraints: ZoneConstraints,
): CardLayoutResult {
  const {
    fixedHeight = 0,
    padding = 0,
    sectionPadH = 0,
    sectionPadTop = 0,
    sectionPadBottom = 0,
    sectionGap = 0,
    minCardWidth = 1,
    maxCardWidth = 200,
  } = config;

  const zoneIds = Object.keys(config.zones);
  const result: CardLayoutResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_DIMS;

  const availW = containerW - padding;
  const availH = containerH - fixedHeight;
  if (availW <= 0 || availH <= 0) return result;

  const sectionPadV = sectionPadTop + sectionPadBottom;

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

  const topIds = (config.layout.top ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const blIds = (config.layout.bottomLeft ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const brIds = (config.layout.bottomRight ?? []).filter(
    (id) => (config.zones[id]?.count ?? 0) > 0,
  );
  const activeIds = [...topIds, ...blIds, ...brIds];
  if (activeIds.length === 0) return result;

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
  const topH = hasTop && hasBottom
    ? Math.round(usableH * topFraction)
    : hasTop
      ? availH
      : 0;
  const bottomH = hasTop && hasBottom
    ? usableH - topH
    : hasBottom
      ? availH
      : 0;

  for (const id of topIds) {
    const zone = resolve(id);
    const secW = availW - 2 * sectionPadH;
    const secH = topH - sectionPadV;
    result[id] = fitZone(zone, secW, secH, minCardWidth);
  }

  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;
  const leftW = brIds.length > 0
    ? Math.round((availW - lrGap) * leftFraction)
    : availW;
  const rightW = brIds.length > 0 ? availW - leftW - lrGap : 0;

  if (blIds.length === 1) {
    const zone = resolve(blIds[0]);
    const secW = leftW - 2 * sectionPadH;
    const secH = bottomH - sectionPadV;
    result[blIds[0]] = fitZone(zone, secW, secH, minCardWidth);
  } else if (blIds.length >= 2) {
    const blSectionGaps = Math.max(0, blIds.length - 1) * sectionGap;
    const totalInnerH = bottomH - blIds.length * sectionPadV - blSectionGaps;
    const firstH =
      Math.round(totalInnerH * bottomLeftSplit) + sectionPadV;
    const restH = bottomH - firstH - blSectionGaps;

    const first = resolve(blIds[0]);
    const secW = leftW - 2 * sectionPadH;
    result[blIds[0]] = fitZone(
      first,
      secW,
      firstH - sectionPadV,
      minCardWidth,
    );

    const remainingIds = blIds.slice(1);
    const perZoneH = Math.floor(restH / remainingIds.length);
    for (const id of remainingIds) {
      const zone = resolve(id);
      result[id] = fitZone(zone, secW, perZoneH - sectionPadV, minCardWidth);
    }
  }

  for (const id of brIds) {
    const zone = resolve(id);
    const secW = rightW - 2 * sectionPadH;
    const secH = bottomH - sectionPadV;
    result[id] = fitZone(zone, secW, secH, minCardWidth);
  }

  return result;
}

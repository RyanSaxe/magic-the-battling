import { bestFit, CARD_ASPECT_RATIO, type ZoneDims } from "./cardSizeUtils";
import type { CardLayoutConfig, CardLayoutResult } from "./useCardLayout";

export interface ZoneConstraints {
  topFraction?: number;
  leftFraction?: number;
  bottomLeftSplit?: number;
}

const DEFAULT_DIMS: ZoneDims = { width: 100, height: 140, rows: 1, columns: 1 };

interface ResolvedZone {
  id: string;
  count: number;
  gap: number;
  maxCardWidth: number;
  maxRows: number;
}

function fitZone(
  zone: ResolvedZone,
  w: number,
  h: number,
  minCardWidth: number,
): ZoneDims {
  if (w <= 0 || h <= 0) return DEFAULT_DIMS;
  const fit = bestFit(zone.count, w, h, zone.gap, zone.maxCardWidth, minCardWidth);
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

  const topIds = (config.layout.top ?? []).filter((id) => (config.zones[id]?.count ?? 0) > 0);
  const blIds = (config.layout.bottomLeft ?? []).filter((id) => (config.zones[id]?.count ?? 0) > 0);
  const brIds = (config.layout.bottomRight ?? []).filter((id) => (config.zones[id]?.count ?? 0) > 0);
  const activeIds = [...topIds, ...blIds, ...brIds];
  if (activeIds.length === 0) return result;

  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const columnGap = hasTop && hasBottom ? sectionGap : 0;

  const topFraction = constraints.topFraction ?? 0.5;
  const topH = hasTop && hasBottom
    ? Math.round(availH * topFraction) - columnGap / 2
    : hasTop ? availH : 0;
  const bottomH = hasTop && hasBottom
    ? availH - topH - columnGap
    : hasBottom ? availH : 0;

  for (const id of topIds) {
    const zone = resolve(id);
    const secW = availW - 2 * sectionPadH;
    const secH = topH - sectionPadV;
    result[id] = fitZone(zone, secW, secH, minCardWidth);
  }

  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;
  const leftFraction = constraints.leftFraction ?? 0.7;
  const leftW = brIds.length > 0
    ? Math.round((availW - lrGap) * leftFraction)
    : availW;
  const rightW = brIds.length > 0
    ? availW - leftW - lrGap
    : 0;

  if (blIds.length === 1) {
    const zone = resolve(blIds[0]);
    const secW = leftW - 2 * sectionPadH;
    const secH = bottomH - sectionPadV;
    result[blIds[0]] = fitZone(zone, secW, secH, minCardWidth);
  } else if (blIds.length >= 2) {
    const blSectionGaps = Math.max(0, blIds.length - 1) * sectionGap;
    const bottomLeftSplit = constraints.bottomLeftSplit ?? 0.5;
    const totalInnerH = bottomH - blIds.length * sectionPadV - blSectionGaps;
    const firstH = Math.round(totalInnerH * bottomLeftSplit) + sectionPadV;
    const restH = bottomH - firstH - blSectionGaps;

    const first = resolve(blIds[0]);
    const secW = leftW - 2 * sectionPadH;
    result[blIds[0]] = fitZone(first, secW, firstH - sectionPadV, minCardWidth);

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

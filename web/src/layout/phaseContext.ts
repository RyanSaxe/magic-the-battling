/**
 * Pass 1 layout context, candidate tracking, and bottom-right column budget
 * calculation shared by phaseLayout.ts, phaseSolvers.ts, and phaseScaleUp.ts.
 */
import { widthCapForHeight } from "./cardFit";
import {
  getActiveZoneIds,
  makeDefaultDims,
  resolveZone,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ResolvedZone,
} from "./types";

export interface LayoutContext {
  zoneIds: string[];
  allZones: Map<string, ResolvedZone>;
  topIds: string[];
  blIds: string[];
  brIds: string[];
  topZones: ResolvedZone[];
  blZones: ResolvedZone[];
  brZones: ResolvedZone[];
  primaryTop: ResolvedZone[];
  fillTop: ResolvedZone[];
  primaryBL: ResolvedZone[];
  fillBL: ResolvedZone[];
  allPrimary: ResolvedZone[];
  hasBR: boolean;
  availW: number;
  availH: number;
  sectionPadH: number;
  sectionPadV: number;
  sectionGap: number;
  minCardWidth: number;
  maxCardWidth: number;
  maxBottomRightFraction: number;
  minBottomRightOuterWidth: number;
  topOverhead: number;
  blOverhead: number;
  brOverhead: number;
  columnGap: number;
  lrGap: number;
  gridAvailH: number;
}

export interface ColumnVariantBudget {
  brCols: number;
  brCardW: number;
  blAvailW: number;
  topAvailW: number;
}

export interface CandidateTracker {
  bestScore: number;
  bestResult: CardLayoutResult;
  bestOverflow: number;
  bestOverflowResult: CardLayoutResult;
}

export function createTracker(zoneIds: string[]): CandidateTracker {
  const fallback = makeDefaultDims(zoneIds);
  return {
    bestScore: -1,
    bestResult: fallback,
    bestOverflow: Infinity,
    bestOverflowResult: fallback,
  };
}

export function recordCandidate(
  tracker: CandidateTracker,
  candidate: CardLayoutResult,
  score: number,
  overflow: number,
): void {
  if (overflow > 0) {
    if (overflow < tracker.bestOverflow) {
      tracker.bestOverflow = overflow;
      tracker.bestOverflowResult = candidate;
    }
    return;
  }
  if (score > tracker.bestScore) {
    tracker.bestScore = score;
    tracker.bestResult = candidate;
  }
}

export function sizeBottomRight(
  ctx: LayoutContext,
  brCols: number,
  brAvailableH: number,
): { brW: number; brRowCount: number } {
  const brZone = ctx.brZones[0];
  const brRowCount = Math.ceil(brZone.count / brCols);
  const brWFromH = widthCapForHeight(brAvailableH, brRowCount, brZone.gap);
  const brW = Math.min(ctx.maxCardWidth, brWFromH, brZone.maxCardWidth);
  return { brW, brRowCount };
}

function collectZones(
  ids: string[],
  allZones: Map<string, ResolvedZone>,
): ResolvedZone[] {
  const result: ResolvedZone[] = [];
  for (const id of ids) {
    const zone = allZones.get(id);
    if (zone) result.push(zone);
  }
  return result;
}

interface NormalizedOptions {
  fixedHeight: number;
  padding: number;
  sectionPadH: number;
  sectionPadV: number;
  sectionGap: number;
  minCardWidth: number;
  maxCardWidth: number;
  maxBottomRightFraction: number;
  minBottomRightOuterWidth: number;
}

function readSpacingOptions(config: CardLayoutConfig) {
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

function readNormalizedOptions(config: CardLayoutConfig): NormalizedOptions {
  const spacing = readSpacingOptions(config);
  return {
    ...spacing,
    minCardWidth: config.minCardWidth ?? 1,
    maxCardWidth: config.maxCardWidth ?? 200,
    maxBottomRightFraction: config.maxBottomRightFraction ?? 0.3,
    minBottomRightOuterWidth: config.minBottomRightOuterWidth ?? 0,
  };
}

function computeOverheads(
  topCount: number,
  blCount: number,
  brCount: number,
  sectionPadV: number,
  sectionGap: number,
) {
  const hasBottom = blCount > 0 || brCount > 0;
  return {
    topOverhead: topCount > 0 ? sectionPadV : 0,
    blOverhead: blCount * sectionPadV + Math.max(0, blCount - 1) * sectionGap,
    brOverhead: brCount * sectionPadV + Math.max(0, brCount - 1) * sectionGap,
    columnGap: topCount > 0 && hasBottom ? sectionGap : 0,
    lrGap: blCount > 0 && brCount > 0 ? sectionGap : 0,
  };
}

export function buildContext(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
): LayoutContext | null {
  const opts = readNormalizedOptions(config);
  const availW = containerW - opts.padding;
  const availH = containerH - opts.fixedHeight;
  if (availW <= 0 || availH <= 0) return null;

  const zoneIds = Object.keys(config.zones);
  const allZones = new Map<string, ResolvedZone>();
  for (const id of zoneIds) {
    allZones.set(id, resolveZone(id, config.zones[id], opts.maxCardWidth));
  }

  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  if (topIds.length + blIds.length + brIds.length === 0) return null;

  const topZones = collectZones(topIds, allZones);
  const blZones = collectZones(blIds, allZones);
  const brZones = collectZones(brIds, allZones);
  const primaryTop = topZones.filter((z) => z.priority === "primary");
  const fillTop = topZones.filter((z) => z.priority === "fill");
  const primaryBL = blZones.filter((z) => z.priority === "primary");
  const fillBL = blZones.filter((z) => z.priority === "fill");
  const overheads = computeOverheads(
    topIds.length,
    blIds.length,
    brIds.length,
    opts.sectionPadV,
    opts.sectionGap,
  );

  return {
    zoneIds,
    allZones,
    topIds,
    blIds,
    brIds,
    topZones,
    blZones,
    brZones,
    primaryTop,
    fillTop,
    primaryBL,
    fillBL,
    allPrimary: [...primaryTop, ...primaryBL],
    hasBR: brZones.length > 0,
    availW,
    availH,
    sectionPadH: opts.sectionPadH,
    sectionPadV: opts.sectionPadV,
    sectionGap: opts.sectionGap,
    minCardWidth: opts.minCardWidth,
    maxCardWidth: opts.maxCardWidth,
    maxBottomRightFraction: opts.maxBottomRightFraction,
    minBottomRightOuterWidth: opts.minBottomRightOuterWidth,
    ...overheads,
    gridAvailH:
      availH -
      overheads.topOverhead -
      overheads.blOverhead -
      overheads.columnGap,
  };
}

export function getBottomRightColVariants(ctx: LayoutContext): number[] {
  if (!ctx.hasBR) return [0];
  const maxHardCap = Math.min(2, Math.max(...ctx.brZones.map((z) => z.count)));
  const maxFromZones = Math.min(...ctx.brZones.map((z) => z.maxColumns));
  const maxCols = Math.min(maxHardCap, maxFromZones);
  const minCols = Math.min(
    maxCols,
    Math.max(...ctx.brZones.map((z) => z.minColumns)),
  );
  return Array.from({ length: maxCols - minCols + 1 }, (_, i) => minCols + i);
}

export function resolveColumnBudget(
  ctx: LayoutContext,
  brCols: number,
): ColumnVariantBudget | null {
  let brCardW = 0;
  let brCellW = 0;

  if (ctx.hasBR) {
    const budgetH =
      ctx.availH - ctx.columnGap - ctx.topOverhead - ctx.brOverhead;
    brCardW = sizeBottomRight(ctx, brCols, budgetH).brW;
    if (brCardW < ctx.minCardWidth) return null;

    const brGap = ctx.brZones[0].gap;
    brCellW = brCols * brCardW + (brCols - 1) * brGap + 2 * ctx.sectionPadH;

    const maxBRWidth = Math.floor(ctx.availW * ctx.maxBottomRightFraction);
    if (brCellW > maxBRWidth) {
      brCellW = maxBRWidth;
      const innerW = brCellW - 2 * ctx.sectionPadH - (brCols - 1) * brGap;
      brCardW = Math.floor(innerW / brCols);
      if (brCardW < ctx.minCardWidth) return null;
    }

    const minOuterW = Math.min(
      ctx.minBottomRightOuterWidth,
      Math.max(0, ctx.availW - ctx.lrGap),
    );
    brCellW = Math.max(brCellW, minOuterW);
  }

  const blAvailW = ctx.hasBR
    ? ctx.availW - brCellW - ctx.lrGap - 2 * ctx.sectionPadH
    : ctx.availW - 2 * ctx.sectionPadH;
  const topAvailW = ctx.availW - 2 * ctx.sectionPadH;

  if (ctx.blIds.length > 0 && blAvailW <= 0) return null;
  if (ctx.topIds.length > 0 && topAvailW <= 0) return null;

  return { brCols, brCardW, blAvailW, topAvailW };
}

/**
 * Unified Pass 1 layout engine for Draft, Build, Reward, DeckDisplay, and modal
 * surfaces. Dispatches declarative slot configs to the pure zone solvers and
 * post-selection slack scale-up.
 */
import { fitCards, makeZoneDims } from "./cardFit";
import {
  buildContext,
  createTracker,
  getBottomRightColVariants,
  resolveColumnBudget,
  type ColumnVariantBudget,
  type LayoutContext,
} from "./phaseContext";
import { scaleUpStackedZones } from "./phaseScaleUp";
import {
  evaluatePrimaryPair,
  evaluateSinglePrimary,
  evaluateTopFillWithBottomPrimaryPair,
} from "./phaseSolvers";
import {
  makeDefaultDims,
  type CardLayoutConfig,
  type CardLayoutResult,
} from "./types";

function solveSingleActiveZone(ctx: LayoutContext): CardLayoutResult {
  const activeId = ctx.topIds[0] ?? ctx.blIds[0] ?? ctx.brIds[0];
  const zone = ctx.allZones.get(activeId);
  const result = makeDefaultDims(ctx.zoneIds);
  if (!zone) return result;

  const secW = ctx.availW - 2 * ctx.sectionPadH;
  const secH = ctx.availH - ctx.sectionPadV;
  if (secW <= 0 || secH <= 0) return result;

  const fit = fitCards({
    count: zone.count,
    availableWidth: secW,
    availableHeight: secH,
    gap: zone.gap,
    maxCardWidth: zone.maxCardWidth,
    minCardWidth: ctx.minCardWidth,
    maxRows: Math.min(zone.count, zone.maxRows),
  });
  result[activeId] = {
    width: fit.width,
    height: fit.height,
    rows: fit.rows,
    columns: fit.columns,
  };
  return result;
}

function solveFillOnlyBottomLeft(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
): CardLayoutResult {
  const fillZone = ctx.fillBL[0];
  const fit = fitCards({
    count: fillZone.count,
    availableWidth: budget.blAvailW,
    availableHeight: ctx.gridAvailH,
    gap: fillZone.gap,
    maxCardWidth: fillZone.maxCardWidth,
    minCardWidth: ctx.minCardWidth,
    fixedRows: Math.min(fillZone.count, fillZone.maxRows),
  });
  const result = makeDefaultDims(ctx.zoneIds);
  result[fillZone.id] = {
    width: fit.width,
    height: fit.height,
    rows: fit.rows,
    columns: fit.columns,
  };
  if (ctx.hasBR) {
    const brZone = ctx.brZones[0];
    const brRows = Math.ceil(brZone.count / budget.brCols);
    result[brZone.id] = makeZoneDims(budget.brCardW, brRows, budget.brCols);
  }
  return result;
}

function hasTopFillWithTwoBottomPrimary(ctx: LayoutContext): boolean {
  return (
    ctx.fillTop.length === 1 &&
    ctx.fillBL.length === 0 &&
    ctx.primaryTop.length === 0 &&
    ctx.primaryBL.length === 2 &&
    !ctx.hasBR
  );
}

function evaluateVariantBudget(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
  tracker: ReturnType<typeof createTracker>,
  topFillPair: boolean,
): CardLayoutResult | null {
  if (ctx.allPrimary.length === 0 && ctx.fillBL.length > 0) {
    return solveFillOnlyBottomLeft(ctx, budget);
  }
  if (ctx.allPrimary.length === 1) {
    evaluateSinglePrimary(ctx, budget, tracker);
    return null;
  }
  if (ctx.allPrimary.length === 2) {
    evaluatePrimaryPair(ctx, budget, tracker);
  }
  if (topFillPair) {
    evaluateTopFillWithBottomPrimaryPair(ctx, budget, tracker);
  }
  return null;
}

export function computePhaseLayout(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
): CardLayoutResult {
  const ctx = buildContext(containerW, containerH, config);
  if (!ctx) return makeDefaultDims(Object.keys(config.zones));

  if (ctx.topIds.length + ctx.blIds.length + ctx.brIds.length === 1) {
    return solveSingleActiveZone(ctx);
  }

  const tracker = createTracker(ctx.zoneIds);
  const topFillPair = hasTopFillWithTwoBottomPrimary(ctx);

  for (const brCols of getBottomRightColVariants(ctx)) {
    const budget = resolveColumnBudget(ctx, brCols);
    if (!budget) continue;
    const immediate = evaluateVariantBudget(ctx, budget, tracker, topFillPair);
    if (immediate) return immediate;
  }

  const chosen =
    tracker.bestScore < 0 ? tracker.bestOverflowResult : tracker.bestResult;
  scaleUpStackedZones(chosen, ctx);
  return chosen;
}

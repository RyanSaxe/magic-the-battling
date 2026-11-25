/**
 * Pass 1 primary/fill zone-combination solvers for Draft, Build, Reward, and
 * DeckDisplay. Evaluates candidate row configurations into a CandidateTracker.
 */
import {
  cardHeight,
  makeZoneDims,
  verticalGaps,
  widthCapForHeight,
  widthCapForRows,
  zoneGridHeight,
} from "./cardFit";
import {
  recordCandidate,
  sizeBottomRight,
  type CandidateTracker,
  type ColumnVariantBudget,
  type LayoutContext,
} from "./phaseContext";
import {
  CARD_ASPECT_RATIO,
  DEFAULT_CARD_GAP,
  makeDefaultDims,
  type CardLayoutResult,
  type ResolvedZone,
  type ZoneDims,
} from "./types";

function fitFillZones(args: {
  zones: ResolvedZone[];
  fillRows: number[];
  remainingH: number;
  availW: number;
  primaryCapW: number;
  minCardWidth: number;
  sectionGap: number;
  padPerSectionV: number;
}): Record<string, ZoneDims> | null {
  const {
    zones,
    fillRows,
    remainingH,
    availW,
    primaryCapW,
    minCardWidth,
    sectionGap,
    padPerSectionV,
  } = args;
  const fillDims: Record<string, ZoneDims> = {};
  const fillMinW = Math.max(minCardWidth, Math.round(primaryCapW * 0.5));
  const fillSectionH =
    zones.length > 1
      ? Math.floor(
          (remainingH - Math.max(0, zones.length - 1) * sectionGap) /
            zones.length,
        )
      : remainingH;

  for (let i = 0; i < zones.length; i++) {
    const fz = zones[i];
    const rows = fillRows[i];
    const cols = Math.ceil(fz.count / rows);
    const wFromH = widthCapForHeight(
      fillSectionH - padPerSectionV,
      rows,
      fz.gap,
    );
    const wCap = Math.min(
      widthCapForRows({
        count: fz.count,
        availableWidth: availW,
        rows,
        gap: fz.gap,
        maxCardWidth: fz.maxCardWidth,
      }),
      primaryCapW,
    );
    const width = Math.min(wCap, wFromH);
    if (width < fillMinW) return null;

    fillDims[fz.id] = makeZoneDims(Math.max(fillMinW, width), rows, cols);
  }

  return fillDims;
}

function computeBottomRightPlacement(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
  topActualH: number,
): { dims: ZoneDims | null; overflow: number } {
  if (!ctx.hasBR) return { dims: null, overflow: 0 };
  const brActualAvailH =
    ctx.availH - topActualH - ctx.columnGap - ctx.brOverhead;
  const { brW, brRowCount } = sizeBottomRight(
    ctx,
    budget.brCols,
    brActualAvailH,
  );
  const actualW = Math.min(Math.max(ctx.minCardWidth, brW), budget.brCardW);
  const dims = makeZoneDims(actualW, brRowCount, budget.brCols);
  const brGridH = zoneGridHeight(dims, ctx.brZones[0].gap);
  return { dims, overflow: Math.max(0, brGridH - brActualAvailH) };
}

function buildResult(args: {
  ctx: LayoutContext;
  entries: Array<[string, ZoneDims]>;
  fillDims: Record<string, ZoneDims>;
  brDims: ZoneDims | null;
}): CardLayoutResult {
  const { ctx, entries, fillDims, brDims } = args;
  const result = makeDefaultDims(ctx.zoneIds);
  for (const [id, dims] of entries) result[id] = dims;
  for (const [id, dims] of Object.entries(fillDims)) result[id] = dims;
  if (ctx.hasBR && brDims) result[ctx.brZones[0].id] = brDims;
  return result;
}

function sumFillBlockHeight(args: {
  fillDims: Record<string, ZoneDims>;
  fillBL: ResolvedZone[];
  bottomPrimaryCount: number;
  sectionGap: number;
  sectionPadV: number;
}): number {
  const { fillDims, fillBL, bottomPrimaryCount, sectionGap, sectionPadV } =
    args;
  const fillGap = fillBL[0]?.gap ?? DEFAULT_CARD_GAP;
  const gridsH = Object.values(fillDims).reduce(
    (sum, dims) =>
      sum + dims.rows * dims.height + verticalGaps(dims.rows, fillGap),
    0,
  );
  const bottomGaps =
    Math.max(0, bottomPrimaryCount + fillBL.length - 1) * sectionGap;
  return gridsH + bottomGaps + fillBL.length * sectionPadV;
}

function rebalancePrimaryWidths(args: {
  aW: number;
  bW: number;
  aRows: number;
  bRows: number;
  aWCap: number;
  bWCap: number;
  aVG: number;
  bVG: number;
  idealW: number;
  gridAvailH: number;
  minCardWidth: number;
  computeFillMinH: (cappedW: number) => number;
}): { aW: number; bW: number } | null {
  const {
    aW,
    bW,
    aRows,
    bRows,
    aWCap,
    bWCap,
    aVG,
    bVG,
    idealW,
    gridAvailH,
    minCardWidth,
    computeFillMinH,
  } = args;
  if (aW >= idealW && bW >= idealW) return { aW, bW };

  const cappedA = aW <= bW;
  const cappedW = Math.min(aW, bW);
  const cappedRows = cappedA ? aRows : bRows;
  const cappedVG = cappedA ? aVG : bVG;
  const otherCap = cappedA ? bWCap : aWCap;
  const otherRows = cappedA ? bRows : aRows;
  const otherVG = cappedA ? bVG : aVG;

  const cappedH = cappedRows * cardHeight(cappedW) + cappedVG;
  const remainingH = gridAvailH - cappedH - computeFillMinH(cappedW);
  const otherW = Math.floor(
    Math.min(
      otherCap,
      (remainingH - otherVG) / (CARD_ASPECT_RATIO * otherRows),
    ),
  );
  if (otherW < minCardWidth) return null;

  return cappedA ? { aW, bW: otherW } : { aW: otherW, bW };
}

function validRowOptions(
  zone: ResolvedZone,
  availW: number,
  minCardWidth: number,
): Array<{ rows: number; wCap: number }> {
  const options: Array<{ rows: number; wCap: number }> = [];
  const maxR = Math.min(zone.count, zone.maxRows);
  for (let rows = 1; rows <= maxR; rows++) {
    if (Math.ceil(zone.count / Math.ceil(zone.count / rows)) !== rows) continue;
    const wCap = widthCapForRows({
      count: zone.count,
      availableWidth: availW,
      rows,
      gap: zone.gap,
      maxCardWidth: zone.maxCardWidth,
    });
    if (wCap >= minCardWidth) options.push({ rows, wCap });
  }
  return options;
}

export function evaluateSinglePrimary(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
  tracker: CandidateTracker,
): void {
  const pZone = ctx.allPrimary[0];
  const isTop = ctx.primaryTop.includes(pZone);
  const pAvailW = isTop ? budget.topAvailW : budget.blAvailW;
  const fillRows = ctx.fillBL.map((z) => Math.min(z.count, z.maxRows));
  const fillWeightedRows = fillRows.reduce((s, r) => s + r * 0.5, 0);
  const fillVGapsTotal = ctx.fillBL.reduce(
    (s, z, i) => s + verticalGaps(fillRows[i], z.gap),
    0,
  );

  for (const { rows: pRows, wCap: pWCap } of validRowOptions(
    pZone,
    pAvailW,
    ctx.minCardWidth,
  )) {
    const pVG = verticalGaps(pRows, pZone.gap);
    const idealW =
      (ctx.gridAvailH - (pVG + fillVGapsTotal)) /
      (CARD_ASPECT_RATIO * (pRows + fillWeightedRows));
    const pW = Math.floor(Math.min(pWCap, idealW));
    if (pW < ctx.minCardWidth) continue;

    const pDims = makeZoneDims(pW, pRows, Math.ceil(pZone.count / pRows));
    const pGridH = pRows * pDims.height + pVG;
    const fillDims = fitFillZones({
      zones: ctx.fillBL,
      fillRows,
      remainingH: ctx.gridAvailH - pGridH,
      availW: budget.blAvailW,
      primaryCapW: pW,
      minCardWidth: ctx.minCardWidth,
      sectionGap: ctx.sectionGap,
      padPerSectionV: 0,
    });
    if (!fillDims) continue;

    const fillTotalH = sumFillBlockHeight({
      fillDims,
      fillBL: ctx.fillBL,
      bottomPrimaryCount: isTop ? 0 : 1,
      sectionGap: ctx.sectionGap,
      sectionPadV: ctx.sectionPadV,
    });
    const totalH = ctx.sectionPadV + pGridH + ctx.columnGap + fillTotalH;
    const score =
      pW *
      Math.sqrt(Math.min(1, totalH / ctx.availH)) *
      Math.pow(0.9, pRows - 1);
    const topActualH = isTop ? pGridH + ctx.sectionPadV : ctx.topOverhead;
    const br = computeBottomRightPlacement(ctx, budget, topActualH);
    const overflow = Math.max(Math.max(0, totalH - ctx.availH), br.overflow);

    recordCandidate(
      tracker,
      buildResult({
        ctx,
        entries: [[pZone.id, pDims]],
        fillDims,
        brDims: br.dims,
      }),
      { score, overflow },
    );
  }
}

interface PrimaryPairRowArgs {
  ctx: LayoutContext;
  budget: ColumnVariantBudget;
  tracker: CandidateTracker;
  pA: ResolvedZone;
  pB: ResolvedZone;
  aRows: number;
  bRows: number;
  aWCap: number;
  bWCap: number;
  fillRows: number[];
  fillWeightedRows: number;
  fillVGapsTotal: number;
}

function evaluatePrimaryPairRow(args: PrimaryPairRowArgs): void {
  const {
    ctx,
    budget,
    tracker,
    pA,
    pB,
    aRows,
    bRows,
    aWCap,
    bWCap,
    fillRows,
    fillWeightedRows,
    fillVGapsTotal,
  } = args;
  const pAIsTop = ctx.primaryTop.includes(pA);
  const pBIsTop = ctx.primaryTop.includes(pB);
  const aVG = verticalGaps(aRows, pA.gap);
  const bVG = verticalGaps(bRows, pB.gap);
  const idealW =
    (ctx.gridAvailH - (aVG + bVG + fillVGapsTotal)) /
    (CARD_ASPECT_RATIO * (aRows + bRows + fillWeightedRows));

  const initialAW = Math.floor(Math.min(aWCap, idealW));
  const initialBW = Math.floor(Math.min(bWCap, idealW));
  if (initialAW < ctx.minCardWidth || initialBW < ctx.minCardWidth) return;

  const balanced = rebalancePrimaryWidths({
    aW: initialAW,
    bW: initialBW,
    aRows,
    bRows,
    aWCap,
    bWCap,
    aVG,
    bVG,
    idealW,
    gridAvailH: ctx.gridAvailH,
    minCardWidth: ctx.minCardWidth,
    computeFillMinH: (cappedW) => {
      const minW = Math.max(ctx.minCardWidth, Math.round(cappedW * 0.5));
      return (
        ctx.fillBL.reduce(
          (sum, z, i) =>
            sum +
            fillRows[i] * cardHeight(minW) +
            verticalGaps(fillRows[i], z.gap) +
            ctx.sectionPadV,
          0,
        ) +
        Math.max(0, ctx.fillBL.length - 1) * ctx.sectionGap
      );
    },
  });
  if (!balanced) return;

  const aDims = makeZoneDims(balanced.aW, aRows, Math.ceil(pA.count / aRows));
  const bDims = makeZoneDims(balanced.bW, bRows, Math.ceil(pB.count / bRows));
  const aGridH = aRows * aDims.height + aVG;
  const bGridH = bRows * bDims.height + bVG;
  const smallerPrimaryW = Math.min(balanced.aW, balanced.bW);

  const fillDims = fitFillZones({
    zones: ctx.fillBL,
    fillRows,
    remainingH: ctx.gridAvailH - (aGridH + bGridH),
    availW: budget.blAvailW,
    primaryCapW: smallerPrimaryW,
    minCardWidth: ctx.minCardWidth,
    sectionGap: ctx.sectionGap,
    padPerSectionV: ctx.sectionPadV,
  });
  if (!fillDims) return;

  const bottomPrimaryCount = (pAIsTop ? 0 : 1) + (pBIsTop ? 0 : 1);
  const fillTotalH = sumFillBlockHeight({
    fillDims,
    fillBL: ctx.fillBL,
    bottomPrimaryCount,
    sectionGap: ctx.sectionGap,
    sectionPadV: ctx.sectionPadV,
  });
  const totalH =
    aGridH + bGridH + 2 * ctx.sectionPadV + ctx.columnGap + fillTotalH;
  const score =
    smallerPrimaryW *
    Math.sqrt(Math.min(1, totalH / ctx.availH)) *
    Math.pow(0.9, aRows + bRows - 2);

  let topGridH = 0;
  if (pAIsTop) {
    topGridH = aGridH;
  } else if (pBIsTop) {
    topGridH = bGridH;
  }
  const topActualH =
    topGridH > 0 ? topGridH + ctx.sectionPadV : ctx.topOverhead;
  const br = computeBottomRightPlacement(ctx, budget, topActualH);
  const overflow = Math.max(Math.max(0, totalH - ctx.availH), br.overflow);

  recordCandidate(
    tracker,
    buildResult({
      ctx,
      entries: [
        [pA.id, aDims],
        [pB.id, bDims],
      ],
      fillDims,
      brDims: br.dims,
    }),
    { score, overflow },
  );
}

export function evaluatePrimaryPair(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
  tracker: CandidateTracker,
): void {
  const [pA, pB] = ctx.allPrimary;
  const pAAvailW = ctx.primaryTop.includes(pA)
    ? budget.topAvailW
    : budget.blAvailW;
  const pBAvailW = ctx.primaryTop.includes(pB)
    ? budget.topAvailW
    : budget.blAvailW;
  const fillRows = ctx.fillBL.map((z) => Math.min(z.count, z.maxRows));
  const fillWeightedRows = fillRows.reduce((s, r) => s + r * 0.5, 0);
  const fillVGapsTotal = ctx.fillBL.reduce(
    (s, z, i) => s + verticalGaps(fillRows[i], z.gap),
    0,
  );

  const aOptions = validRowOptions(pA, pAAvailW, ctx.minCardWidth);
  const bOptions = validRowOptions(pB, pBAvailW, ctx.minCardWidth);
  for (const a of aOptions) {
    for (const b of bOptions) {
      evaluatePrimaryPairRow({
        ctx,
        budget,
        tracker,
        pA,
        pB,
        aRows: a.rows,
        bRows: b.rows,
        aWCap: a.wCap,
        bWCap: b.wCap,
        fillRows,
        fillWeightedRows,
        fillVGapsTotal,
      });
    }
  }
}

interface TopFillPairRowArgs {
  ctx: LayoutContext;
  budget: ColumnVariantBudget;
  tracker: CandidateTracker;
  fillZone: ResolvedZone;
  pA: ResolvedZone;
  pB: ResolvedZone;
  fillRows: number;
  fillCols: number;
  fillVG: number;
  aRows: number;
  bRows: number;
  aWCap: number;
  bWCap: number;
}

function evaluateTopFillPairRow(args: TopFillPairRowArgs): void {
  const {
    ctx,
    budget,
    tracker,
    fillZone,
    pA,
    pB,
    fillRows,
    fillCols,
    fillVG,
    aRows,
    bRows,
    aWCap,
    bWCap,
  } = args;
  const aVG = verticalGaps(aRows, pA.gap);
  const bVG = verticalGaps(bRows, pB.gap);
  const idealW =
    (ctx.gridAvailH - (aVG + bVG + fillVG)) /
    (CARD_ASPECT_RATIO * (aRows + bRows + fillRows * 0.5));
  const initialAW = Math.floor(Math.min(aWCap, idealW));
  const initialBW = Math.floor(Math.min(bWCap, idealW));
  if (initialAW < ctx.minCardWidth || initialBW < ctx.minCardWidth) return;

  const balanced = rebalancePrimaryWidths({
    aW: initialAW,
    bW: initialBW,
    aRows,
    bRows,
    aWCap,
    bWCap,
    aVG,
    bVG,
    idealW,
    gridAvailH: ctx.gridAvailH,
    minCardWidth: ctx.minCardWidth,
    computeFillMinH: (cappedW) => {
      const minW = Math.max(ctx.minCardWidth, Math.round(cappedW * 0.5));
      return fillRows * cardHeight(minW) + fillVG;
    },
  });
  if (!balanced) return;

  const aDims = makeZoneDims(balanced.aW, aRows, Math.ceil(pA.count / aRows));
  const bDims = makeZoneDims(balanced.bW, bRows, Math.ceil(pB.count / bRows));
  const bottomPrimaryH =
    aRows * aDims.height + aVG + bRows * bDims.height + bVG;
  const smallerPrimaryW = Math.min(balanced.aW, balanced.bW);
  const fillWFromH = widthCapForHeight(
    ctx.gridAvailH - bottomPrimaryH,
    fillRows,
    fillZone.gap,
  );
  const fillWCap = Math.min(
    widthCapForRows({
      count: fillZone.count,
      availableWidth: budget.topAvailW,
      rows: fillRows,
      gap: fillZone.gap,
      maxCardWidth: fillZone.maxCardWidth,
    }),
    smallerPrimaryW,
  );
  const fillMinW = Math.max(
    ctx.minCardWidth,
    Math.round(smallerPrimaryW * 0.5),
  );
  const fillW = Math.min(fillWCap, fillWFromH);
  if (fillW < fillMinW) return;

  const fillDims = makeZoneDims(Math.max(fillMinW, fillW), fillRows, fillCols);
  const totalH =
    zoneGridHeight(fillDims, fillZone.gap) +
    ctx.topOverhead +
    ctx.columnGap +
    bottomPrimaryH +
    ctx.blOverhead;
  const overflow = Math.max(0, totalH - ctx.availH);
  const score =
    smallerPrimaryW *
    Math.sqrt(Math.min(1, totalH / ctx.availH)) *
    Math.pow(0.9, aRows + bRows - 2);

  recordCandidate(
    tracker,
    buildResult({
      ctx,
      entries: [
        [fillZone.id, fillDims],
        [pA.id, aDims],
        [pB.id, bDims],
      ],
      fillDims: {},
      brDims: null,
    }),
    { score, overflow },
  );
}

export function evaluateTopFillWithBottomPrimaryPair(
  ctx: LayoutContext,
  budget: ColumnVariantBudget,
  tracker: CandidateTracker,
): void {
  const fillZone = ctx.fillTop[0];
  const [pA, pB] = ctx.primaryBL;
  const fillRows = Math.min(fillZone.count, fillZone.maxRows);
  const fillVG = verticalGaps(fillRows, fillZone.gap);
  const fillCols = Math.ceil(fillZone.count / fillRows);

  const aOptions = validRowOptions(pA, budget.blAvailW, ctx.minCardWidth);
  const bOptions = validRowOptions(pB, budget.blAvailW, ctx.minCardWidth);
  for (const a of aOptions) {
    for (const b of bOptions) {
      evaluateTopFillPairRow({
        ctx,
        budget,
        tracker,
        fillZone,
        pA,
        pB,
        fillRows,
        fillCols,
        fillVG,
        aRows: a.rows,
        bRows: b.rows,
        aWCap: a.wCap,
        bWCap: b.wCap,
      });
    }
  }
}

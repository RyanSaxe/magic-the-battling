/**
 * Pass 1 post-selection vertical slack scale-up for stacked top and bottom-left
 * zones. Grows cards proportionally up to each zone's width ceiling.
 */
import { makeZoneDims, widthCapForRows, zoneGridHeight } from "./cardFit";
import type { LayoutContext } from "./phaseContext";
import {
  CARD_ASPECT_RATIO,
  DEFAULT_CARD_GAP,
  type CardLayoutResult,
  type ResolvedZone,
  type ZoneDims,
} from "./types";

interface ScalableZone {
  id: string;
  zone: ResolvedZone;
  dims: ZoneDims;
  ceiling: number;
  headroom: number;
  gridRows: number;
}

function buildScalableZones(
  stackedIds: string[],
  chosen: CardLayoutResult,
  ctx: LayoutContext,
): ScalableZone[] {
  const brDims = ctx.hasBR ? chosen[ctx.brIds[0]] : undefined;
  const brGap = ctx.brZones[0]?.gap ?? DEFAULT_CARD_GAP;
  const brOuterW = brDims
    ? brDims.columns * brDims.width +
      (brDims.columns - 1) * brGap +
      2 * ctx.sectionPadH
    : 0;
  const blAvailWFinal = ctx.hasBR
    ? ctx.availW - brOuterW - ctx.lrGap - 2 * ctx.sectionPadH
    : ctx.availW - 2 * ctx.sectionPadH;
  const topAvailWFinal = ctx.availW - 2 * ctx.sectionPadH;

  return stackedIds.flatMap((id) => {
    const zone = ctx.allZones.get(id);
    if (!zone) return [];
    const dims = chosen[id];
    const zAvailW = ctx.topIds.includes(id) ? topAvailWFinal : blAvailWFinal;
    const ceiling = widthCapForRows(
      zone.count,
      zAvailW,
      dims.rows,
      zone.gap,
      zone.maxCardWidth,
    );
    return [
      {
        id,
        zone,
        dims,
        ceiling,
        headroom: ceiling - dims.width,
        gridRows: dims.rows,
      },
    ];
  });
}

function runScaleUpIteration(
  growable: ScalableZone[],
  extraWPerRow: number,
  chosen: CardLayoutResult,
): { anyHitCeiling: boolean; heightRecovered: number } {
  let anyHitCeiling = false;
  let heightRecovered = 0;

  for (const sz of growable) {
    const newW = Math.min(sz.ceiling, Math.floor(sz.dims.width + extraWPerRow));
    if (newW <= sz.dims.width) continue;
    if (newW >= sz.ceiling) anyHitCeiling = true;

    const oldGridH = zoneGridHeight(sz.dims, sz.zone.gap);
    const nextDims = makeZoneDims(newW, sz.dims.rows, sz.dims.columns);
    heightRecovered += zoneGridHeight(nextDims, sz.zone.gap) - oldGridH;

    sz.dims = nextDims;
    sz.headroom = sz.ceiling - newW;
    chosen[sz.id] = nextDims;
  }

  return { anyHitCeiling, heightRecovered };
}

export function scaleUpStackedZones(
  chosen: CardLayoutResult,
  ctx: LayoutContext,
): void {
  const stackedIds = [...ctx.topIds, ...ctx.blIds].filter(
    (id) => (chosen[id]?.width ?? 0) > 0,
  );
  if (stackedIds.length === 0) return;

  let scalable = buildScalableZones(stackedIds, chosen, ctx);
  const usedH =
    stackedIds.reduce((sum, id) => {
      const zone = ctx.allZones.get(id);
      return zone ? sum + zoneGridHeight(chosen[id], zone.gap) : sum;
    }, 0) +
    ctx.topOverhead +
    ctx.blOverhead +
    ctx.columnGap;

  let slack = ctx.availH - usedH;

  while (slack > CARD_ASPECT_RATIO && scalable.some((s) => s.headroom > 0)) {
    const growable = scalable.filter((s) => s.headroom > 0);
    const totalGrowRows = growable.reduce((sum, z) => sum + z.gridRows, 0);
    const extraWPerRow = slack / (totalGrowRows * CARD_ASPECT_RATIO);
    const { anyHitCeiling, heightRecovered } = runScaleUpIteration(
      growable,
      extraWPerRow,
      chosen,
    );

    slack -= heightRecovered;
    if (!anyHitCeiling) break;
    scalable = scalable.filter((s) => s.headroom > 0);
  }
}

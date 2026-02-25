import { useState, useCallback, useRef, useLayoutEffect, useEffect } from "react";
import { CARD_ASPECT_RATIO, bestFit, type ZoneDims } from "./cardSizeUtils";

export interface ZoneSpec {
  count: number;
  gap?: number;
  maxCardWidth?: number;
  maxRows?: number;
  priority?: "primary" | "fill";
}

export interface CardLayoutConfig {
  zones: Record<string, ZoneSpec>;
  layout: {
    top?: string[];
    bottomLeft?: string[];
    bottomRight?: string[];
  };
  fixedHeight?: number;
  padding?: number;
  sectionPadH?: number;
  sectionPadTop?: number;
  sectionPadBottom?: number;
  sectionGap?: number;
  minCardWidth?: number;
  maxCardWidth?: number;
}

export type CardLayoutResult = Record<string, ZoneDims>;

export const ZONE_LAYOUT_PADDING = {
  sectionPadH: 12,
  sectionPadTop: 20,
  sectionPadBottom: 12,
  sectionGap: 1,
};

const DEFAULT_DIMS: ZoneDims = { width: 100, height: 140, rows: 1, columns: 1 };

interface ResolvedZone {
  id: string;
  count: number;
  gap: number;
  maxCardWidth: number;
  maxRows: number;
  priority: "primary" | "fill";
}

function resolveZone(
  id: string,
  spec: ZoneSpec,
  globalMax: number,
): ResolvedZone {
  return {
    id,
    count: spec.count,
    gap: spec.gap ?? 6,
    maxCardWidth: spec.maxCardWidth ?? globalMax,
    maxRows: spec.maxRows ?? Infinity,
    priority: spec.priority ?? "primary",
  };
}

function makeDefaults(zoneIds: string[]): CardLayoutResult {
  const result: CardLayoutResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_DIMS;
  return result;
}

function widthCap(zone: ResolvedZone, availW: number, rows: number): number {
  const cols = Math.ceil(zone.count / rows);
  const hGaps = zone.gap * Math.max(0, cols - 1);
  return Math.min(zone.maxCardWidth, Math.floor((availW - hGaps) / cols));
}

function vGaps(zone: ResolvedZone, rows: number): number {
  return zone.gap * Math.max(0, rows - 1);
}

export function computeLayout(
  containerW: number,
  containerH: number,
  config: CardLayoutConfig,
): CardLayoutResult {
  const {
    fixedHeight = 0,
    padding = 0,
    sectionPadH = 0,
    sectionPadTop = 0,
    sectionPadBottom = 0,
    sectionGap = 0,
    minCardWidth = 30,
    maxCardWidth = 200,
  } = config;

  const zoneIds = Object.keys(config.zones);
  const allZones = new Map<string, ResolvedZone>();
  for (const id of zoneIds) {
    allZones.set(id, resolveZone(id, config.zones[id], maxCardWidth));
  }

  const availW = containerW - padding;
  const availH = containerH - fixedHeight;

  if (availW <= 0 || availH <= 0) return makeDefaults(zoneIds);

  const topIds = (config.layout.top ?? []).filter(
    (id) => (allZones.get(id)?.count ?? 0) > 0,
  );
  const blIds = (config.layout.bottomLeft ?? []).filter(
    (id) => (allZones.get(id)?.count ?? 0) > 0,
  );
  const brIds = (config.layout.bottomRight ?? []).filter(
    (id) => (allZones.get(id)?.count ?? 0) > 0,
  );

  const activeIds = [...topIds, ...blIds, ...brIds];
  if (activeIds.length === 0) return makeDefaults(zoneIds);

  const sectionPadV = sectionPadTop + sectionPadBottom;

  if (activeIds.length === 1) {
    const zone = allZones.get(activeIds[0])!;
    const secW = availW - 2 * sectionPadH;
    const secH = availH - sectionPadV;
    if (secW <= 0 || secH <= 0) return makeDefaults(zoneIds);
    const maxR = Math.min(zone.count, zone.maxRows);
    const fit = bestFit(
      zone.count,
      secW,
      secH,
      zone.gap,
      zone.maxCardWidth,
      minCardWidth,
    );
    const clamped =
      fit.rows > maxR
        ? (() => {
            const cols = Math.ceil(zone.count / maxR);
            const hGaps = zone.gap * Math.max(0, cols - 1);
            const w = Math.min(
              zone.maxCardWidth,
              Math.floor((secW - hGaps) / cols),
            );
            const vG = zone.gap * Math.max(0, maxR - 1);
            const wFromH = Math.floor((secH - vG) / (maxR * CARD_ASPECT_RATIO));
            const finalW = Math.max(minCardWidth, Math.min(w, wFromH));
            return {
              width: finalW,
              height: Math.round(finalW * CARD_ASPECT_RATIO),
              rows: maxR,
              columns: cols,
            };
          })()
        : fit;
    const result = makeDefaults(zoneIds);
    result[activeIds[0]] = clamped;
    return result;
  }

  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const topSections = topIds.length > 0 ? 1 : 0;
  const blSections = blIds.length;
  const brSections = brIds.length;

  const topOverhead = topSections > 0 ? sectionPadV : 0;
  const blOverhead =
    blSections * sectionPadV + Math.max(0, blSections - 1) * sectionGap;
  const brOverhead =
    brSections * sectionPadV + Math.max(0, brSections - 1) * sectionGap;
  const columnGap = topSections > 0 && hasBottom ? sectionGap : 0;
  const lrGap = blIds.length > 0 && brIds.length > 0 ? sectionGap : 0;

  const topZones = topIds.map((id) => allZones.get(id)!);
  const blZones = blIds.map((id) => allZones.get(id)!);
  const brZones = brIds.map((id) => allZones.get(id)!);

  const primaryTop = topZones.filter((z) => z.priority === "primary");
  const primaryBL = blZones.filter((z) => z.priority === "primary");
  const fillBL = blZones.filter((z) => z.priority === "fill");

  const allPrimary = [...primaryTop, ...primaryBL];
  const hasBR = brZones.length > 0;

  let bestScore = -1;
  let bestResult = makeDefaults(zoneIds);
  let bestOverflow = Infinity;
  let bestOverflowResult = bestResult;

  const brColVariants = hasBR
    ? Array.from(
        { length: Math.min(2, Math.max(...brZones.map((z) => z.count))) },
        (_, i) => i + 1,
      )
    : [0];

  for (const brCols of brColVariants) {
    let brCardW = 0;
    let brCellW = 0;

    if (hasBR) {
      const brZone = brZones[0];
      const brRows = Math.ceil(brZone.count / brCols);
      const brVG = vGaps(brZone, brRows);
      const brAvailH = availH - columnGap - topOverhead - brOverhead;
      const brCardWFromH = Math.floor(
        (brAvailH - brVG) / (brRows * CARD_ASPECT_RATIO),
      );
      const brIdealW =
        allPrimary.length > 0 ? Math.round(maxCardWidth * 1.5) : maxCardWidth;
      brCardW = Math.min(brIdealW, brCardWFromH, brZone.maxCardWidth);
      if (brCardW < minCardWidth) continue;
      brCellW = brCols * brCardW + (brCols - 1) * brZone.gap + 2 * sectionPadH;
    }

    const blAvailW = hasBR
      ? availW - brCellW - lrGap - 2 * sectionPadH
      : availW - 2 * sectionPadH;
    const topAvailW = availW - 2 * sectionPadH;

    if (blIds.length > 0 && blAvailW <= 0) continue;
    if (topIds.length > 0 && topAvailW <= 0) continue;

    const gridAvailH = availH - topOverhead - blOverhead - columnGap;

    if (allPrimary.length === 0 && fillBL.length > 0) {
      const fillZone = fillBL[0];
      const fillRows = Math.min(fillZone.count, fillZone.maxRows);
      const fillCols = Math.ceil(fillZone.count / fillRows);
      const fillHGaps = fillZone.gap * Math.max(0, fillCols - 1);
      const fillWCap = Math.min(
        fillZone.maxCardWidth,
        Math.floor((blAvailW - fillHGaps) / fillCols),
      );
      const fillVG = vGaps(fillZone, fillRows);
      const fillWFromH = Math.floor(
        (gridAvailH - fillVG) / (fillRows * CARD_ASPECT_RATIO),
      );
      const fillW = Math.max(minCardWidth, Math.min(fillWCap, fillWFromH));
      const result = makeDefaults(zoneIds);
      result[fillZone.id] = {
        width: fillW,
        height: Math.round(fillW * CARD_ASPECT_RATIO),
        rows: fillRows,
        columns: fillCols,
      };
      if (hasBR) {
        const brZone = brZones[0];
        const brRows = Math.ceil(brZone.count / brCols);
        result[brZone.id] = {
          width: brCardW,
          height: Math.round(brCardW * CARD_ASPECT_RATIO),
          rows: brRows,
          columns: brCols,
        };
      }
      return result;
    }

    if (allPrimary.length === 1) {
      const pZone = allPrimary[0];
      const isTop = primaryTop.includes(pZone);
      const pAvailW = isTop ? topAvailW : blAvailW;

      for (
        let pRows = 1;
        pRows <= Math.min(pZone.count, pZone.maxRows);
        pRows++
      ) {
        const actualRows = Math.ceil(
          pZone.count / Math.ceil(pZone.count / pRows),
        );
        if (actualRows !== pRows) continue;

        const pWCap = widthCap(pZone, pAvailW, pRows);
        if (pWCap < minCardWidth) continue;

        const fillRows = fillBL.map((z) => Math.min(z.count, z.maxRows));
        const fillWeightedRows = fillRows.reduce((s, r) => s + r * 0.5, 0);
        const fillVGapsTotal = fillBL.reduce(
          (s, z, i) => s + vGaps(z, fillRows[i]),
          0,
        );
        const pVG = vGaps(pZone, pRows);
        const totalVG = pVG + fillVGapsTotal;

        const effectiveRows = pRows + fillWeightedRows;
        const idealW =
          (gridAvailH - totalVG) / (CARD_ASPECT_RATIO * effectiveRows);
        const pW = Math.floor(Math.min(pWCap, idealW));
        if (pW < minCardWidth) continue;

        const pCardH = Math.round(pW * CARD_ASPECT_RATIO);
        const pGridH = pRows * pCardH + pVG;

        const remainingH = gridAvailH - pGridH;
        const fillDims: Record<string, ZoneDims> = {};
        let fillOK = true;

        for (let fi = 0; fi < fillBL.length; fi++) {
          const fz = fillBL[fi];
          const fRows = fillRows[fi];
          const fCols = Math.ceil(fz.count / fRows);
          const fVG = vGaps(fz, fRows);
          const fillSectionH =
            fillBL.length > 1
              ? Math.floor(
                  (remainingH - Math.max(0, fillBL.length - 1) * sectionGap) /
                    fillBL.length,
                )
              : remainingH;
          const fWFromH = Math.floor(
            (fillSectionH - fVG) / (fRows * CARD_ASPECT_RATIO),
          );
          const fHGaps = fz.gap * Math.max(0, fCols - 1);
          const fWCap = Math.min(
            fz.maxCardWidth,
            Math.floor((blAvailW - fHGaps) / fCols),
            pW,
          );
          const fillMinW = Math.max(minCardWidth, Math.round(pW * 0.5));
          let fW = Math.min(fWCap, fWFromH);
          if (fW < fillMinW) {
            fillOK = false;
            break;
          }
          fW = Math.max(fillMinW, fW);
          fillDims[fz.id] = {
            width: fW,
            height: Math.round(fW * CARD_ASPECT_RATIO),
            rows: fRows,
            columns: fCols,
          };
        }
        if (!fillOK) continue;

        const fillTotalH =
          Object.values(fillDims).reduce(
            (s, d) =>
              s +
              d.rows * d.height +
              vGaps({ gap: fillBL[0]?.gap ?? 6 } as ResolvedZone, d.rows),
            0,
          ) +
          Math.max(0, fillBL.length - 1) * sectionGap +
          fillBL.length * sectionPadV;

        const totalH =
          (isTop ? sectionPadV : 0) +
          pGridH +
          (isTop ? 0 : sectionPadV) +
          columnGap +
          fillTotalH;
        const fill = Math.min(
          1,
          (pGridH +
            Object.values(fillDims).reduce(
              (s, d) => s + d.rows * d.height,
              0,
            )) /
            gridAvailH,
        );
        const score = pW * Math.sqrt(fill) * Math.pow(0.98, pRows - 1);

        if (totalH > availH) {
          const overflow = totalH - availH;
          if (overflow < bestOverflow) {
            bestOverflow = overflow;
            const r = makeDefaults(zoneIds);
            r[pZone.id] = {
              width: pW,
              height: pCardH,
              rows: pRows,
              columns: Math.ceil(pZone.count / pRows),
            };
            for (const [fid, fd] of Object.entries(fillDims)) r[fid] = fd;
            if (hasBR) {
              const brZone = brZones[0];
              r[brZone.id] = {
                width: brCardW,
                height: Math.round(brCardW * CARD_ASPECT_RATIO),
                rows: Math.ceil(brZone.count / brCols),
                columns: brCols,
              };
            }
            bestOverflowResult = r;
          }
          continue;
        }

        if (score > bestScore) {
          bestScore = score;
          const r = makeDefaults(zoneIds);
          r[pZone.id] = {
            width: pW,
            height: pCardH,
            rows: pRows,
            columns: Math.ceil(pZone.count / pRows),
          };
          for (const [fid, fd] of Object.entries(fillDims)) r[fid] = fd;
          if (hasBR) {
            const brZone = brZones[0];
            r[brZone.id] = {
              width: brCardW,
              height: Math.round(brCardW * CARD_ASPECT_RATIO),
              rows: Math.ceil(brZone.count / brCols),
              columns: brCols,
            };
          }
          bestResult = r;
        }
      }
      continue;
    }

    if (allPrimary.length === 2) {
      const pA = allPrimary[0];
      const pB = allPrimary[1];
      const pAIsTop = primaryTop.includes(pA);
      const pBIsTop = primaryTop.includes(pB);
      const pAAvailW = pAIsTop ? topAvailW : blAvailW;
      const pBAvailW = pBIsTop ? topAvailW : blAvailW;

      for (let aRows = 1; aRows <= Math.min(pA.count, pA.maxRows); aRows++) {
        const aActual = Math.ceil(pA.count / Math.ceil(pA.count / aRows));
        if (aActual !== aRows) continue;
        const aWCap = widthCap(pA, pAAvailW, aRows);
        if (aWCap < minCardWidth) continue;

        for (let bRows = 1; bRows <= Math.min(pB.count, pB.maxRows); bRows++) {
          const bActual = Math.ceil(pB.count / Math.ceil(pB.count / bRows));
          if (bActual !== bRows) continue;
          const bWCap = widthCap(pB, pBAvailW, bRows);
          if (bWCap < minCardWidth) continue;

          const aVG = vGaps(pA, aRows);
          const bVG = vGaps(pB, bRows);

          const fillRows = fillBL.map((z) => Math.min(z.count, z.maxRows));
          const fillWeightedRows = fillRows.reduce((s, r) => s + r * 0.5, 0);
          const fillVGapsTotal = fillBL.reduce(
            (s, z, i) => s + vGaps(z, fillRows[i]),
            0,
          );

          const totalVG = aVG + bVG + fillVGapsTotal;
          const effectiveRows = aRows + bRows + fillWeightedRows;
          const idealW =
            (gridAvailH - totalVG) / (CARD_ASPECT_RATIO * effectiveRows);

          let aW = Math.floor(Math.min(aWCap, idealW));
          let bW = Math.floor(Math.min(bWCap, idealW));

          if (aW < minCardWidth || bW < minCardWidth) continue;

          if (aW < idealW || bW < idealW) {
            const cappedW = Math.min(aW, bW);
            const cappedRows = aW <= bW ? aRows : bRows;
            const otherCap = aW <= bW ? bWCap : aWCap;
            const otherRows = aW <= bW ? bRows : aRows;
            const otherGap = aW <= bW ? pB.gap : pA.gap;
            const cappedVG = aW <= bW ? aVG : bVG;
            const cappedH =
              cappedRows * Math.round(cappedW * CARD_ASPECT_RATIO) + cappedVG;

            const fillMinH =
              fillBL.reduce((s, z, i) => {
                const fr = fillRows[i];
                const minW = Math.max(minCardWidth, Math.round(cappedW * 0.5));
                return (
                  s +
                  fr * Math.round(minW * CARD_ASPECT_RATIO) +
                  vGaps(z, fr) +
                  sectionPadV
                );
              }, 0) +
              Math.max(0, fillBL.length - 1) * sectionGap;

            const remainingH = gridAvailH - cappedH - fillMinH;
            const otherVG = otherGap * (otherRows - 1);
            const otherW = Math.floor(
              Math.min(
                otherCap,
                (remainingH - otherVG) / (CARD_ASPECT_RATIO * otherRows),
              ),
            );
            if (otherW < minCardWidth) continue;
            if (aW <= bW) {
              bW = otherW;
            } else {
              aW = otherW;
            }
          }

          const aCardH = Math.round(aW * CARD_ASPECT_RATIO);
          const bCardH = Math.round(bW * CARD_ASPECT_RATIO);
          const aGridH = aRows * aCardH + aVG;
          const bGridH = bRows * bCardH + bVG;
          const primaryH = aGridH + bGridH;

          const remainingH = gridAvailH - primaryH;
          const fillDims: Record<string, ZoneDims> = {};
          let fillOK = true;
          const smallerPrimaryW = Math.min(aW, bW);

          for (let fi = 0; fi < fillBL.length; fi++) {
            const fz = fillBL[fi];
            const fRows = fillRows[fi];
            const fCols = Math.ceil(fz.count / fRows);
            const fVG = vGaps(fz, fRows);
            const fillSectionH =
              fillBL.length > 1
                ? Math.floor(
                    (remainingH - Math.max(0, fillBL.length - 1) * sectionGap) /
                      fillBL.length,
                  )
                : remainingH;
            const fWFromH = Math.floor(
              (fillSectionH - fVG - sectionPadV) / (fRows * CARD_ASPECT_RATIO),
            );
            const fHGaps = fz.gap * Math.max(0, fCols - 1);
            const fWCap = Math.min(
              fz.maxCardWidth,
              Math.floor((blAvailW - fHGaps) / fCols),
              smallerPrimaryW,
            );
            const fillMinW = Math.max(
              minCardWidth,
              Math.round(smallerPrimaryW * 0.5),
            );
            let fW = Math.min(fWCap, fWFromH);
            if (fW < fillMinW) {
              fillOK = false;
              break;
            }
            fW = Math.max(fillMinW, fW);
            fillDims[fz.id] = {
              width: fW,
              height: Math.round(fW * CARD_ASPECT_RATIO),
              rows: fRows,
              columns: fCols,
            };
          }
          if (!fillOK) continue;

          const totalUsedH =
            primaryH +
            Object.values(fillDims).reduce(
              (s, d) => s + d.rows * d.height + sectionPadV,
              0,
            );
          const fill = Math.min(1, totalUsedH / gridAvailH);
          const score = Math.min(aW, bW) * Math.sqrt(fill) * Math.pow(0.98, aRows + bRows - 2);

          if (score > bestScore) {
            bestScore = score;
            const r = makeDefaults(zoneIds);
            r[pA.id] = {
              width: aW,
              height: aCardH,
              rows: aRows,
              columns: Math.ceil(pA.count / aRows),
            };
            r[pB.id] = {
              width: bW,
              height: bCardH,
              rows: bRows,
              columns: Math.ceil(pB.count / bRows),
            };
            for (const [fid, fd] of Object.entries(fillDims)) r[fid] = fd;
            if (hasBR) {
              const brZone = brZones[0];
              r[brZone.id] = {
                width: brCardW,
                height: Math.round(brCardW * CARD_ASPECT_RATIO),
                rows: Math.ceil(brZone.count / brCols),
                columns: brCols,
              };
            }
            bestResult = r;
          }
        }
      }
    }
  }

  return bestScore < 0 ? bestOverflowResult : bestResult;
}

function dimsEqual(a: CardLayoutResult, b: CardLayoutResult): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const ad = a[k],
      bd = b[k];
    if (!bd) return false;
    if (
      ad.width !== bd.width ||
      ad.height !== bd.height ||
      ad.rows !== bd.rows ||
      ad.columns !== bd.columns
    )
      return false;
  }
  return true;
}

export function useCardLayout(
  config: CardLayoutConfig,
): [React.RefCallback<HTMLElement>, CardLayoutResult] {
  const zoneIds = Object.keys(config.zones);

  const [dims, setDims] = useState<CardLayoutResult>(() =>
    makeDefaults(zoneIds),
  );

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const compute = useCallback(
    (w: number, h: number) => computeLayout(w, h, configRef.current),
    [],
  );

  const update = useCallback(
    (w: number, h: number) => {
      const next = compute(w, h);
      setDims((prev) => (dimsEqual(prev, next) ? prev : next));
    },
    [compute],
  );

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      elementRef.current = node;
      if (!node) return;

      const cs = getComputedStyle(node);
      const w =
        node.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        node.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      update(w, h);

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        update(width, height);
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [update],
  );

  useLayoutEffect(() => {
    if (elementRef.current) {
      const cs = getComputedStyle(elementRef.current);
      const w =
        elementRef.current.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        elementRef.current.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      update(w, h);
    }
  });

  return [refCallback, dims];
}

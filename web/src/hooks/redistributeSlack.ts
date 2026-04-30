import type {
  CardLayoutConfig,
  CardLayoutResult,
  ZoneSpec,
} from "./useCardLayout";
import {
  computeConstrainedLayoutState,
  type ZoneConstraints,
  type ZoneFrameResult,
} from "./computeConstrainedLayout";

const SLACK_TOLERANCE_PX = 1;
const FRACTION_TOLERANCE = 0.001;
const FRACTION_MIN = 0.05;
const FRACTION_MAX = 0.95;

export function resolveGrowPriority(spec: ZoneSpec): number {
  if (spec.growPriority !== undefined) return spec.growPriority;
  if (spec.priority === "fill") return 0;
  return 1;
}

interface ZoneSlackInfo {
  id: string;
  slack: number;
  growPriority: number;
}

function measureZoneSlacks(
  config: CardLayoutConfig,
  dims: CardLayoutResult,
  frames: ZoneFrameResult,
  ids: string[],
): ZoneSlackInfo[] {
  const result: ZoneSlackInfo[] = [];
  for (const id of ids) {
    const spec = config.zones[id];
    const d = dims[id];
    const f = frames[id];
    if (!spec || !d || !f || spec.count <= 0) continue;
    const gap = spec.gap ?? 6;
    const contentH = d.rows * d.height + Math.max(0, d.rows - 1) * gap;
    const slack = Math.max(0, f.innerHeight - contentH);
    result.push({
      id,
      slack,
      growPriority: resolveGrowPriority(spec),
    });
  }
  return result;
}

function activeIds(
  config: CardLayoutConfig,
  ids: string[] | undefined,
): string[] {
  return (ids ?? []).filter((id) => (config.zones[id]?.count ?? 0) > 0);
}

function clampFraction(value: number): number {
  return Math.max(FRACTION_MIN, Math.min(FRACTION_MAX, value));
}

function sumSlack(zones: ZoneSlackInfo[]): number {
  return zones.reduce((acc, z) => acc + z.slack, 0);
}

function hasGrowableRecipient(zones: ZoneSlackInfo[]): boolean {
  // A zone can absorb more height only if it filled its current frame (slack ≈ 0)
  // AND its growPriority > 0. If a zone already has slack, more height won't help.
  return zones.some(
    (z) => z.slack <= SLACK_TOLERANCE_PX && z.growPriority > 0,
  );
}

function adjustBottomLeftSplit(
  current: number,
  blZones: ZoneSlackInfo[],
  totalInnerH: number,
): number {
  if (totalInnerH <= 0 || blZones.length < 2) return current;

  // V1 supports the only shape used in production: exactly two BL zones, where
  // the first is splittable. Multi-zone BL (≥3) would need a more general
  // weighted scheme; revisit if a caller needs it.
  const [first, second] = blZones;
  const transferable = (donor: ZoneSlackInfo, recipient: ZoneSlackInfo) =>
    donor.slack > SLACK_TOLERANCE_PX &&
    recipient.growPriority > 0 &&
    recipient.slack <= SLACK_TOLERANCE_PX
      ? donor.slack
      : 0;

  const firstToSecond = transferable(first, second);
  const secondToFirst = transferable(second, first);
  if (firstToSecond === 0 && secondToFirst === 0) return current;

  const delta = (secondToFirst - firstToSecond) / totalInnerH;
  return clampFraction(current + delta);
}

function adjustTopFraction(
  current: number,
  topZones: ZoneSlackInfo[],
  blZones: ZoneSlackInfo[],
  brZones: ZoneSlackInfo[],
  usableH: number,
): number {
  if (usableH <= 0) return current;

  const topSlack = sumSlack(topZones);
  // bottomOuterH is shared between BL and BR. Shrinking it shrinks BOTH frames,
  // so the safe transferable amount is min(BL slack, BR slack) when both exist;
  // if only one exists, it can shrink freely.
  const bottomShrinkable =
    brZones.length > 0
      ? Math.min(sumSlack(blZones), sumSlack(brZones))
      : sumSlack(blZones);

  const bottomCanGrow = hasGrowableRecipient([...blZones, ...brZones]);
  const topCanGrow = hasGrowableRecipient(topZones);

  if (topSlack > SLACK_TOLERANCE_PX && bottomCanGrow) {
    const newTopOuter = Math.round(usableH * current) - topSlack;
    return clampFraction(newTopOuter / usableH);
  }
  if (bottomShrinkable > SLACK_TOLERANCE_PX && topCanGrow) {
    const newBottomOuter =
      usableH - Math.round(usableH * current) - bottomShrinkable;
    const newTopOuter = usableH - newBottomOuter;
    return clampFraction(newTopOuter / usableH);
  }
  return current;
}

function fractionsClose(
  a: Required<ZoneConstraints>,
  b: Required<ZoneConstraints>,
): boolean {
  return (
    Math.abs(a.topFraction - b.topFraction) < FRACTION_TOLERANCE &&
    Math.abs(a.leftFraction - b.leftFraction) < FRACTION_TOLERANCE &&
    Math.abs(a.bottomLeftSplit - b.bottomLeftSplit) < FRACTION_TOLERANCE
  );
}

function totalBottomLeftInnerHeight(
  config: CardLayoutConfig,
  containerH: number,
  topFraction: number,
  blIdsCount: number,
): number {
  const {
    fixedHeight = 0,
    sectionPadTop = 0,
    sectionPadBottom = 0,
    sectionGap = 0,
  } = config;
  const sectionPadV = sectionPadTop + sectionPadBottom;
  const availH = containerH - fixedHeight;
  // Mirror the column-gap rule from computeConstrainedFrames.
  const usableH = Math.max(0, availH - sectionGap);
  const bottomOuterH = Math.max(0, usableH - Math.round(usableH * topFraction));
  const blGaps = Math.max(0, blIdsCount - 1) * sectionGap;
  return Math.max(0, bottomOuterH - blIdsCount * sectionPadV - blGaps);
}

export interface RedistributeSlackResult {
  constraints: Required<ZoneConstraints>;
  iterations: number;
}

/**
 * Pass 3: redistribute leftover height from zones that can't use it (capped by
 * width / aspect ratio / pinned size) to zones that can. Adjusts the section
 * fractions, re-runs pass 2, iterates to convergence.
 *
 * Must NOT run while a user is actively dragging dividers — the caller is
 * responsible for skipping this when explicit user constraints exist.
 */
export function redistributeSlack(
  initial: Required<ZoneConstraints>,
  config: CardLayoutConfig,
  containerW: number,
  containerH: number,
  maxIterations = 4,
): RedistributeSlackResult {
  let current: Required<ZoneConstraints> = { ...initial };

  const topIds = activeIds(config, config.layout.top);
  const blIds = activeIds(config, config.layout.bottomLeft);
  const brIds = activeIds(config, config.layout.bottomRight);
  if (topIds.length === 0 && blIds.length === 0 && brIds.length === 0) {
    return { constraints: current, iterations: 0 };
  }

  const {
    fixedHeight = 0,
    sectionGap = 0,
  } = config;
  const availH = containerH - fixedHeight;
  const hasTop = topIds.length > 0;
  const hasBottom = blIds.length > 0 || brIds.length > 0;
  const columnGap = hasTop && hasBottom ? sectionGap : 0;
  const usableH = availH - columnGap;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const { dims, frames } = computeConstrainedLayoutState(
      containerW,
      containerH,
      config,
      current,
    );
    const topZones = measureZoneSlacks(config, dims, frames, topIds);
    const blZones = measureZoneSlacks(config, dims, frames, blIds);
    const brZones = measureZoneSlacks(config, dims, frames, brIds);

    const next: Required<ZoneConstraints> = { ...current };

    // Step 1: redistribute slack within bottomLeft (zone-level via split).
    if (blZones.length >= 2) {
      const totalInnerH = totalBottomLeftInnerHeight(
        config,
        containerH,
        current.topFraction,
        blZones.length,
      );
      next.bottomLeftSplit = adjustBottomLeftSplit(
        current.bottomLeftSplit,
        blZones,
        totalInnerH,
      );
    }

    // Step 2: cross-section transfer between top and bottom via topFraction.
    if (hasTop && hasBottom) {
      next.topFraction = adjustTopFraction(
        current.topFraction,
        topZones,
        blZones,
        brZones,
        usableH,
      );
    }

    if (fractionsClose(current, next)) {
      return { constraints: next, iterations: iteration };
    }
    current = next;
  }

  return { constraints: current, iterations: maxIterations };
}

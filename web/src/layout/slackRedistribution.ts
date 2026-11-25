/**
 * Pass 3 iterative slack redistribution across layout sections. Transfers unused
 * frame height from aspect-ratio-capped or pinned zones to growable neighbors.
 */
import { zoneGridHeight } from "./cardFit";
import { computeConstrainedLayoutState } from "./constrainedLayout";
import {
  DEFAULT_CARD_GAP,
  getActiveZoneIds,
  type CardLayoutConfig,
  type CardLayoutResult,
  type ZoneConstraints,
  type ZoneFrameResult,
  type ZoneSpec,
} from "./types";

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

function measureZoneSlacks(args: {
  config: CardLayoutConfig;
  dims: CardLayoutResult;
  frames: ZoneFrameResult;
  ids: string[];
}): ZoneSlackInfo[] {
  const { config, dims, frames, ids } = args;
  const result: ZoneSlackInfo[] = [];
  for (const id of ids) {
    const spec = config.zones[id];
    const d = dims[id];
    const f = frames[id];
    if (!spec || !d || !f || spec.count <= 0) continue;
    const gap = spec.gap ?? DEFAULT_CARD_GAP;
    const contentH = zoneGridHeight(d, gap);
    result.push({
      id,
      slack: Math.max(0, f.innerHeight - contentH),
      growPriority: resolveGrowPriority(spec),
    });
  }
  return result;
}

function hasGrowableRecipient(zones: ZoneSlackInfo[]): boolean {
  // A zone can absorb more height only if it filled its current frame (slack ≈ 0)
  // AND its growPriority > 0. If a zone already has slack, more height won't help.
  return zones.some((z) => z.slack <= SLACK_TOLERANCE_PX && z.growPriority > 0);
}

function transferableSlack(
  donor: ZoneSlackInfo,
  recipient: ZoneSlackInfo,
): number {
  const canTransfer =
    donor.slack > SLACK_TOLERANCE_PX &&
    recipient.growPriority > 0 &&
    recipient.slack <= SLACK_TOLERANCE_PX;
  return canTransfer ? donor.slack : 0;
}

function adjustBottomLeftSplit(
  current: number,
  blZones: ZoneSlackInfo[],
  totalInnerH: number,
): number {
  if (totalInnerH <= 0 || blZones.length < 2) return current;

  const [first, second] = blZones;
  const firstToSecond = transferableSlack(first, second);
  const secondToFirst = transferableSlack(second, first);
  if (firstToSecond === 0 && secondToFirst === 0) return current;

  const delta = (secondToFirst - firstToSecond) / totalInnerH;
  return Math.max(FRACTION_MIN, Math.min(FRACTION_MAX, current + delta));
}

function adjustTopFraction(args: {
  current: number;
  topZones: ZoneSlackInfo[];
  blZones: ZoneSlackInfo[];
  brZones: ZoneSlackInfo[];
  usableH: number;
}): number {
  const { current, topZones, blZones, brZones, usableH } = args;
  if (usableH <= 0) return current;

  const topSlack = topZones.reduce((acc, z) => acc + z.slack, 0);
  const blSlack = blZones.reduce((acc, z) => acc + z.slack, 0);
  const brSlack = brZones.reduce((acc, z) => acc + z.slack, 0);
  // bottomOuterH is shared between BL and BR. Shrinking it shrinks BOTH frames,
  // so the safe transferable amount is min(BL slack, BR slack) when both exist.
  const bottomShrinkable =
    brZones.length > 0 ? Math.min(blSlack, brSlack) : blSlack;

  const bottomCanGrow = hasGrowableRecipient([...blZones, ...brZones]);
  const topCanGrow = hasGrowableRecipient(topZones);

  if (topSlack > SLACK_TOLERANCE_PX && bottomCanGrow) {
    const newTopOuter = Math.round(usableH * current) - topSlack;
    return Math.max(
      FRACTION_MIN,
      Math.min(FRACTION_MAX, newTopOuter / usableH),
    );
  }
  if (bottomShrinkable > SLACK_TOLERANCE_PX && topCanGrow) {
    const newBottomOuter =
      usableH - Math.round(usableH * current) - bottomShrinkable;
    const newTopOuter = usableH - newBottomOuter;
    return Math.max(
      FRACTION_MIN,
      Math.min(FRACTION_MAX, newTopOuter / usableH),
    );
  }
  return current;
}

function totalBottomLeftInnerHeight(args: {
  config: CardLayoutConfig;
  containerH: number;
  topFraction: number;
  blIdsCount: number;
}): number {
  const { config, containerH, topFraction, blIdsCount } = args;
  const sectionPadV =
    (config.sectionPadTop ?? 0) + (config.sectionPadBottom ?? 0);
  const sectionGap = config.sectionGap ?? 0;
  const availH = containerH - (config.fixedHeight ?? 0);
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

function isConverged(
  current: Required<ZoneConstraints>,
  next: Required<ZoneConstraints>,
): boolean {
  const topDiff = Math.abs(current.topFraction - next.topFraction);
  const leftDiff = Math.abs(current.leftFraction - next.leftFraction);
  const splitDiff = Math.abs(current.bottomLeftSplit - next.bottomLeftSplit);
  return (
    topDiff < FRACTION_TOLERANCE &&
    leftDiff < FRACTION_TOLERANCE &&
    splitDiff < FRACTION_TOLERANCE
  );
}

function stepRedistribution(args: {
  current: Required<ZoneConstraints>;
  config: CardLayoutConfig;
  containerW: number;
  containerH: number;
  topIds: string[];
  blIds: string[];
  brIds: string[];
  usableH: number;
}): Required<ZoneConstraints> {
  const {
    current,
    config,
    containerW,
    containerH,
    topIds,
    blIds,
    brIds,
    usableH,
  } = args;
  const { dims, frames } = computeConstrainedLayoutState({
    containerW,
    containerH,
    config,
    constraints: current,
  });
  const topZones = measureZoneSlacks({ config, dims, frames, ids: topIds });
  const blZones = measureZoneSlacks({ config, dims, frames, ids: blIds });
  const brZones = measureZoneSlacks({ config, dims, frames, ids: brIds });
  const next: Required<ZoneConstraints> = { ...current };

  if (blZones.length >= 2) {
    const totalInnerH = totalBottomLeftInnerHeight({
      config,
      containerH,
      topFraction: current.topFraction,
      blIdsCount: blZones.length,
    });
    next.bottomLeftSplit = adjustBottomLeftSplit(
      current.bottomLeftSplit,
      blZones,
      totalInnerH,
    );
  }

  if (topIds.length > 0 && blIds.length + brIds.length > 0) {
    next.topFraction = adjustTopFraction({
      current: current.topFraction,
      topZones,
      blZones,
      brZones,
      usableH,
    });
  }

  return next;
}

/**
 * Pass 3: redistribute leftover height from zones that can't use it (capped by
 * width / aspect ratio / pinned size) to zones that can. Adjusts the section
 * fractions, re-runs pass 2, iterates to convergence.
 *
 * Must NOT run while a user is actively dragging dividers — the caller is
 * responsible for skipping this when explicit user constraints exist.
 */
export interface RedistributeSlackOptions {
  initial: Required<ZoneConstraints>;
  config: CardLayoutConfig;
  containerW: number;
  containerH: number;
  maxIterations?: number;
}

export function redistributeSlack({
  initial,
  config,
  containerW,
  containerH,
  maxIterations = 4,
}: RedistributeSlackOptions): RedistributeSlackResult {
  let current: Required<ZoneConstraints> = { ...initial };

  const { topIds, blIds, brIds } = getActiveZoneIds(config);
  if (topIds.length + blIds.length + brIds.length === 0) {
    return { constraints: current, iterations: 0 };
  }

  const availH = containerH - (config.fixedHeight ?? 0);
  const hasColumnGap = topIds.length > 0 && blIds.length + brIds.length > 0;
  const usableH = availH - (hasColumnGap ? (config.sectionGap ?? 0) : 0);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const next = stepRedistribution({
      current,
      config,
      containerW,
      containerH,
      topIds,
      blIds,
      brIds,
      usableH,
    });
    if (isConverged(current, next)) {
      return { constraints: next, iterations: iteration };
    }
    current = next;
  }

  return { constraints: current, iterations: maxIterations };
}

/**
 * Shared game-shell layout primitives: 4px board quantization, DOM content-box
 * measurement, the three-pass container pipeline, divider visibility/clamping,
 * placement measurement, and size-band constraint history persistence.
 */
import {
  clampSavedConstraints,
  computeConstrainedLayoutState,
  deriveConstraintsFromLayout,
} from "./constrainedLayout";
import { computePhaseLayout } from "./phaseLayout";
import { redistributeSlack } from "./slackRedistribution";
import {
  ZONE_LAYOUT_PADDING,
  getActiveZoneIds,
  type CardLayoutConfig,
  type ContainerLayout,
  type ContainerSize,
  type ZoneConstraints,
} from "./types";

const BOARD_GRID_STEP_PX = 4;
const MIN_DIVIDER_ZONE_PX = 80;

// A saved layout belongs to the board size it was made on. Boards are grouped
// into bands so a small window resize keeps the layout; the edges sit between
// the board sizes of common screens.
const BAND_WIDTH_EDGES = [800, 1400];
const BAND_HEIGHT_EDGES = [600, 900];

export function quantizeBoardSize(
  width: number,
  height: number,
): ContainerSize {
  const quantizedW =
    Math.floor(width / BOARD_GRID_STEP_PX) * BOARD_GRID_STEP_PX;
  const quantizedH =
    Math.floor(height / BOARD_GRID_STEP_PX) * BOARD_GRID_STEP_PX;
  return { width: quantizedW, height: quantizedH };
}

export function measureContentBox(node: HTMLElement): ContainerSize {
  const cs = getComputedStyle(node);
  return {
    width:
      node.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight),
    height:
      node.clientHeight -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom),
  };
}

export function layoutForContainer(
  width: number,
  height: number,
  config: CardLayoutConfig,
): ContainerLayout {
  const { width: w, height: h } = quantizeBoardSize(width, height);
  // Three-pass model:
  //   1. computePhaseLayout — uses maxCardWidth and similar guardrails to find a
  //      balanced allocation that no zone can cannibalize.
  //   2. computeConstrainedLayoutState — treats the derived frames as fixed
  //      and grows each zone's cards to fill its frame (subject to a 500px
  //      sanity ceiling so big screens don't get absurd card sizes).
  //   3. redistributeSlack — when a zone underfills its frame (capped by
  //      aspect ratio, not height), shrink its frame and grow a neighbor's
  //      via fraction adjustments. Iterates until convergence.
  // User-supplied constraints (divider drag) skip both pass 1 and pass 3 so
  // the user's explicit fractions are honored without bouncing.
  const automatic = computeConstrainedLayoutState(
    w,
    h,
    config,
    redistributeSlack(
      deriveConstraintsFromLayout(
        computePhaseLayout(w, h, config),
        config,
        h,
        w,
      ),
      config,
      w,
      h,
    ).constraints,
  );
  const state = config.constraints
    ? computeConstrainedLayoutState(
        w,
        h,
        config,
        clampSavedConstraints(
          w,
          h,
          config,
          config.constraints,
          automatic.frames,
        ),
      )
    : automatic;
  return { containerSize: { width: w, height: h }, ...state };
}

export interface ZoneMeasurement {
  outerWidth: number;
  outerHeight: number;
}

export interface MeasuredFromPlacement {
  topFraction: number;
  leftFraction: number;
  bottomLeftSplit: number;
  usableHeight: number;
  bottomInnerHeight: number;
  usableWidth: number;
}

const ZERO_MEASUREMENT: ZoneMeasurement = { outerWidth: 0, outerHeight: 0 };

function readMeasurement(
  zoneMeasurements: Record<string, ZoneMeasurement | null | undefined>,
  id: string | undefined,
): ZoneMeasurement {
  if (!id) return ZERO_MEASUREMENT;
  return zoneMeasurements[id] ?? ZERO_MEASUREMENT;
}

function computeMeasuredBottomLeftSplit(
  hasFill: boolean,
  blPrimary: ZoneMeasurement,
  blFill: ZoneMeasurement,
  sectionPadV: number,
): number {
  if (!hasFill) return 0.5;
  const primaryInner = Math.max(0, blPrimary.outerHeight - sectionPadV);
  const fillInner = Math.max(0, blFill.outerHeight - sectionPadV);
  const totalInner = primaryInner + fillInner;
  return totalInner > 0 ? primaryInner / totalInner : 0.5;
}

function computeMeasuredHorizontal(
  blPrimary: ZoneMeasurement,
  br: ZoneMeasurement,
  hasBR: boolean,
  sectionGap: number,
  containerWidth: number,
): { leftFraction: number; usableWidth: number } {
  const totalBottomWidth =
    blPrimary.outerWidth + (hasBR ? br.outerWidth + sectionGap : 0);
  const leftFraction =
    hasBR && totalBottomWidth > sectionGap
      ? blPrimary.outerWidth / (totalBottomWidth - sectionGap)
      : 0.7;
  return {
    leftFraction,
    usableWidth: totalBottomWidth > 0 ? totalBottomWidth : containerWidth,
  };
}

export function measureFromPlacement(args: {
  layout: CardLayoutConfig["layout"];
  zones: CardLayoutConfig["zones"];
  zoneMeasurements: Record<string, ZoneMeasurement | null | undefined>;
  containerWidth: number;
  sectionPadTop?: number;
  sectionPadBottom?: number;
  sectionGap?: number;
}): MeasuredFromPlacement | null {
  const sectionPadV =
    (args.sectionPadTop ?? ZONE_LAYOUT_PADDING.sectionPadTop) +
    (args.sectionPadBottom ?? ZONE_LAYOUT_PADDING.sectionPadBottom);
  const sectionGap = args.sectionGap ?? ZONE_LAYOUT_PADDING.sectionGap;

  const { topIds, blIds, brIds } = getActiveZoneIds({
    layout: args.layout,
    zones: args.zones,
  });
  const top = readMeasurement(args.zoneMeasurements, topIds[0]);
  const blPrimary = readMeasurement(args.zoneMeasurements, blIds[0]);
  const blFill = readMeasurement(args.zoneMeasurements, blIds[1]);
  const br = readMeasurement(args.zoneMeasurements, brIds[0]);

  const hasFill = Boolean(blIds[1]);
  const hasBR = Boolean(brIds[0]);
  const blOuter =
    blPrimary.outerHeight + (hasFill ? blFill.outerHeight + sectionGap : 0);
  const bottomOuter = Math.max(blOuter, br.outerHeight);
  if (bottomOuter <= 0) return null;

  const usableHeight = top.outerHeight + bottomOuter;
  const horizontal = computeMeasuredHorizontal(
    blPrimary,
    br,
    hasBR,
    sectionGap,
    args.containerWidth,
  );
  const blOverhead =
    (hasFill ? sectionGap : 0) + (hasFill ? 2 : 1) * sectionPadV;

  return {
    topFraction: usableHeight > 0 ? top.outerHeight / usableHeight : 0,
    leftFraction: horizontal.leftFraction,
    bottomLeftSplit: computeMeasuredBottomLeftSplit(
      hasFill,
      blPrimary,
      blFill,
      sectionPadV,
    ),
    usableHeight,
    bottomInnerHeight: Math.max(0, blOuter - blOverhead),
    usableWidth: horizontal.usableWidth,
  };
}

export interface VisibleDividers {
  top: boolean;
  bottomLeftSplit: boolean;
  left: boolean;
}

export function resolveVisibleDividers(
  layoutConfig: CardLayoutConfig,
  allowHorizontalResize: boolean,
): VisibleDividers {
  const { topIds, blIds, brIds } = getActiveZoneIds(layoutConfig);
  const hasTop = topIds.length > 0;
  const hasBL = blIds.length > 0;
  const hasBR = brIds.length > 0;
  return {
    top: hasTop && (hasBL || hasBR),
    bottomLeftSplit: blIds.length >= 2,
    left: allowHorizontalResize && hasBL && hasBR,
  };
}

export function clampDividerFraction(
  value: number,
  containerPx: number,
  start: number,
): number {
  // Keeps each zone at least MIN_DIVIDER_ZONE_PX, or where the divider started if closer.
  const min = Math.min(MIN_DIVIDER_ZONE_PX / containerPx, start);
  const max = Math.max(1 - MIN_DIVIDER_ZONE_PX / containerPx, start);
  return Math.max(min, Math.min(max, value));
}

export function omitConstraintKey(
  constraints: ZoneConstraints | null,
  key: keyof ZoneConstraints,
): ZoneConstraints | null {
  const next: ZoneConstraints = { ...constraints };
  delete next[key];
  return Object.keys(next).length === 0 ? null : next;
}

export function seedDragConstraints(
  constraints: ZoneConstraints | null,
  renderedConstraints: Required<ZoneConstraints>,
  visible: VisibleDividers,
): ZoneConstraints {
  const seed: ZoneConstraints = { ...constraints };
  if (visible.top) seed.topFraction = renderedConstraints.topFraction;
  if (visible.bottomLeftSplit) {
    seed.bottomLeftSplit = renderedConstraints.bottomLeftSplit;
  }
  if (visible.left) seed.leftFraction = renderedConstraints.leftFraction;
  return seed;
}

export interface BoardSize {
  width: number;
  height: number;
}

export function boardSizeBand({ width, height }: BoardSize): string {
  const wBand = BAND_WIDTH_EDGES.filter((edge) => width >= edge).length;
  const hBand = BAND_HEIGHT_EDGES.filter((edge) => height >= edge).length;
  return `w${wBand}h${hBand}`;
}

export type PersistedConstraintEntry =
  | {
      stage: number;
      round: number;
      mode: "constraints";
      constraints: ZoneConstraints;
    }
  | {
      stage: number;
      round: number;
      mode: "dynamic";
    };

export interface PersistedConstraintResolution {
  constraints: ZoneConstraints | null;
  source: "dynamic" | "exact" | "inherited";
  canReset: boolean;
  originStage: number | null;
  originRound: number | null;
}

function compareStageRound(
  a: Pick<PersistedConstraintEntry, "stage" | "round">,
  b: Pick<PersistedConstraintEntry, "stage" | "round">,
): number {
  if (a.stage !== b.stage) return a.stage - b.stage;
  return a.round - b.round;
}

export function sortConstraintEntries(
  entries: PersistedConstraintEntry[],
): PersistedConstraintEntry[] {
  const copy = [...entries];
  copy.sort(compareStageRound);
  return copy;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZoneConstraints(value: unknown): value is ZoneConstraints {
  if (!isPlainObject(value)) return false;
  for (const [key, val] of Object.entries(value)) {
    if (
      key !== "topFraction" &&
      key !== "leftFraction" &&
      key !== "bottomLeftSplit"
    ) {
      continue;
    }
    if (val !== undefined && typeof val !== "number") return false;
  }
  return true;
}

function isPersistedConstraintEntry(
  value: unknown,
): value is PersistedConstraintEntry {
  if (!isPlainObject(value)) return false;
  const stage = value.stage;
  const round = value.round;
  const mode = value.mode;
  if (typeof stage !== "number" || typeof round !== "number") return false;
  if (mode === "dynamic") return true;
  return mode === "constraints" && isZoneConstraints(value.constraints);
}

export function parsePersistedConstraintBands(
  raw: string,
): Record<string, PersistedConstraintEntry[]> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.version !== 3) return {};
    const rawBands = parsed.bands;
    if (!isPlainObject(rawBands)) return {};

    const bands: Record<string, PersistedConstraintEntry[]> = {};
    for (const [band, entries] of Object.entries(rawBands)) {
      if (Array.isArray(entries)) {
        bands[band] = entries.filter(isPersistedConstraintEntry);
      }
    }
    return bands;
  } catch {
    return {};
  }
}

function makeDynamicResolution(
  entry: PersistedConstraintEntry | null,
): PersistedConstraintResolution {
  return {
    constraints: null,
    source: "dynamic",
    canReset: false,
    originStage: entry ? entry.stage : null,
    originRound: entry ? entry.round : null,
  };
}

export function resolveConstraintHistory(
  entries: PersistedConstraintEntry[],
  stage: number,
  round: number,
): PersistedConstraintResolution {
  const current = { stage, round };
  let activeEntry: PersistedConstraintEntry | null = null;

  for (const entry of sortConstraintEntries(entries)) {
    if (compareStageRound(entry, current) > 0) break;
    activeEntry = entry;
  }

  if (!activeEntry || activeEntry.mode === "dynamic") {
    return makeDynamicResolution(activeEntry);
  }

  const isExact = activeEntry.stage === stage && activeEntry.round === round;
  return {
    constraints: activeEntry.constraints,
    source: isExact ? "exact" : "inherited",
    canReset: true,
    originStage: activeEntry.stage,
    originRound: activeEntry.round,
  };
}

export function upsertConstraintHistoryEntry(
  entries: PersistedConstraintEntry[],
  nextEntry: PersistedConstraintEntry,
): PersistedConstraintEntry[] {
  const filtered = entries.filter(
    (entry) =>
      entry.stage !== nextEntry.stage || entry.round !== nextEntry.round,
  );
  filtered.push(nextEntry);
  return sortConstraintEntries(filtered);
}

export function resetConstraintHistoryFrom(
  entries: PersistedConstraintEntry[],
  stage: number,
  round: number,
): PersistedConstraintEntry[] {
  const cursor = { stage, round };
  const filtered = entries.filter(
    (entry) => compareStageRound(entry, cursor) < 0,
  );
  filtered.push({ stage, round, mode: "dynamic" });
  return sortConstraintEntries(filtered);
}

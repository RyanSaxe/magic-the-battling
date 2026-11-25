/**
 * Shared layout types, geometry defaults, and shallow equality helpers owned by
 * the web layout engine. Pure definitions only; no DOM or React dependencies.
 */

export const CARD_ASPECT_RATIO = 7 / 5;
export const MIN_CARD_WIDTH = 40;
export const DEFAULT_CARD_GAP = 6;
export const DEFAULT_PASS_2_MAX_CARD_WIDTH = 500;

export interface ZoneDims {
  width: number;
  height: number;
  rows: number;
  columns: number;
}

export const DEFAULT_ZONE_DIMS: ZoneDims = {
  width: 100,
  height: 140,
  rows: 1,
  columns: 1,
};

export interface ZoneSpec {
  count: number;
  gap?: number;
  maxCardWidth?: number;
  maxRows?: number;
  minColumns?: number;
  maxColumns?: number;
  priority?: "primary" | "fill";
  // Pass 3 (slack redistribution) routing weight. Default 1; "fill" zones default to 0.
  // 0 means "do not absorb slack from neighbors" — pinned-size zones like the Build
  // battlefield rely on this so leftover sideboard height bubbles up to hand instead.
  growPriority?: number;
}

export interface ZoneConstraints {
  topFraction?: number;
  leftFraction?: number;
  bottomLeftSplit?: number;
}

export interface ZoneFrame {
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
}

export const DEFAULT_ZONE_FRAME: ZoneFrame = {
  innerWidth: 0,
  innerHeight: 0,
  outerWidth: 0,
  outerHeight: 0,
};

export type ZoneFrameResult = Record<string, ZoneFrame>;

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
  maxBottomRightFraction?: number;
  minBottomRightOuterWidth?: number;
  maxTopFraction?: number;
  pass2MaxCardWidth?: number;
  constraints?: ZoneConstraints | null;
}

export type CardLayoutResult = Record<string, ZoneDims>;

export const ZONE_LAYOUT_PADDING = {
  sectionPadH: 12,
  sectionPadTop: 20,
  sectionPadBottom: 12,
  sectionGap: 2,
};

export interface ContainerSize {
  width: number;
  height: number;
}

export interface ConstrainedLayoutState {
  dims: CardLayoutResult;
  frames: ZoneFrameResult;
  /** The fractions the frames were drawn with. */
  constraints: Required<ZoneConstraints>;
}

export interface ContainerLayout extends ConstrainedLayoutState {
  containerSize: ContainerSize;
}

export interface ResolvedZone {
  id: string;
  count: number;
  gap: number;
  maxCardWidth: number;
  maxRows: number;
  minColumns: number;
  maxColumns: number;
  priority: "primary" | "fill";
}

export interface ActiveZoneIds {
  topIds: string[];
  blIds: string[];
  brIds: string[];
}

export function resolveZone(
  id: string,
  spec: ZoneSpec,
  globalMax: number,
): ResolvedZone {
  return {
    id,
    count: spec.count,
    gap: spec.gap ?? DEFAULT_CARD_GAP,
    maxCardWidth: spec.maxCardWidth ?? globalMax,
    maxRows: spec.maxRows ?? Infinity,
    minColumns: spec.minColumns ?? 1,
    maxColumns: spec.maxColumns ?? Infinity,
    priority: spec.priority ?? "primary",
  };
}

export function getActiveZoneIds(config: CardLayoutConfig): ActiveZoneIds {
  const { zones, layout } = config;
  return {
    topIds: (layout.top ?? []).filter((id) => (zones[id]?.count ?? 0) > 0),
    blIds: (layout.bottomLeft ?? []).filter(
      (id) => (zones[id]?.count ?? 0) > 0,
    ),
    brIds: (layout.bottomRight ?? []).filter(
      (id) => (zones[id]?.count ?? 0) > 0,
    ),
  };
}

export function makeDefaultDims(zoneIds: string[]): CardLayoutResult {
  const result: CardLayoutResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_ZONE_DIMS;
  return result;
}

export function makeDefaultFrames(zoneIds: string[]): ZoneFrameResult {
  const result: ZoneFrameResult = {};
  for (const id of zoneIds) result[id] = DEFAULT_ZONE_FRAME;
  return result;
}

export function dimsEqual(a: CardLayoutResult, b: CardLayoutResult): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const ad = a[key];
    const bd = b[key];
    if (
      !bd ||
      ad.width !== bd.width ||
      ad.height !== bd.height ||
      ad.rows !== bd.rows ||
      ad.columns !== bd.columns
    ) {
      return false;
    }
  }
  return true;
}

export function framesEqual(a: ZoneFrameResult, b: ZoneFrameResult): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const af = a[key];
    const bf = b[key];
    if (
      !bf ||
      af.innerWidth !== bf.innerWidth ||
      af.innerHeight !== bf.innerHeight ||
      af.outerWidth !== bf.outerWidth ||
      af.outerHeight !== bf.outerHeight
    ) {
      return false;
    }
  }
  return true;
}

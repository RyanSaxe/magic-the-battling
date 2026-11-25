import { act, cleanup, renderHook } from "@testing-library/react";
import { MIN_CARD_WIDTH, type ZoneDims } from "../hooks/cardSizeUtils";
import {
  MIN_ZONE_CARD,
  clampSavedConstraints,
  type ZoneConstraints,
  type ZoneFrame,
} from "../hooks/computeConstrainedLayout";
import {
  BATTLEFIELD_INSET,
  computeBattleZones,
  useBattleCardSizes,
} from "../hooks/useBattleCardSizes";
import {
  layoutForContainer,
  useCardLayout,
  type ContainerLayout,
} from "../hooks/useCardLayout";
import { useLayoutDrag } from "../hooks/useLayoutDrag";
import { measureFromPlacement } from "../hooks/useResizableLayout";
import {
  useZoneDividers,
  type DividerCallbacks,
} from "../hooks/useZoneDividers";
import { getUpgradeGridDims } from "../utils/upgradeGrid";
import {
  battleBoard,
  battleConfig,
  isMobileViewport,
  type BattleCase,
  type Box,
  type Viewport,
  type ZoneCase,
} from "./cases";

export type CheckId =
  | "card-outside-zone"
  | "card-below-minimum"
  | "zones-off-board"
  | "divider-off-saved-layout"
  | "saved-layout-squeezes-zone"
  | "grab-moves-layout"
  | "measurement-changes-layout";

export interface Failure {
  check: CheckId;
  surface: string;
  viewport: string;
  label: string;
  detail: string;
}

const DEFAULT_GAP = 6;

function gridSize(dims: ZoneDims, gap: number): Box {
  return {
    width: dims.columns * dims.width + gap * Math.max(0, dims.columns - 1),
    height: dims.rows * dims.height + gap * Math.max(0, dims.rows - 1),
  };
}

interface ActiveZones {
  top: string[];
  bottomLeft: string[];
  bottomRight: string[];
}

function activeZones(zoneCase: ZoneCase): ActiveZones {
  const { layout, zones } = zoneCase.config;
  const active = (ids: string[] | undefined): string[] =>
    (ids ?? []).filter((id) => zones[id]?.count > 0);
  return {
    top: active(layout.top),
    bottomLeft: active(layout.bottomLeft),
    bottomRight: active(layout.bottomRight),
  };
}

/** The card size each zone renders, as the phase pages hand it to their grids. */
function renderedDims(
  zoneCase: ZoneCase,
  layout: ContainerLayout,
  zoneId: string,
): ZoneDims {
  const count = zoneCase.config.zones[zoneId].count;
  return zoneId === zoneCase.railZone
    ? getUpgradeGridDims(count, layout.frames[zoneId], layout.dims[zoneId])
    : layout.dims[zoneId];
}

// Testing Library keeps every rendered hook until cleanup, and the sweep renders tens of thousands.
function releaseRenderedHooks(): void {
  cleanup();
}

function frameText(frame: ZoneFrame): string {
  return `${frame.outerWidth}x${frame.outerHeight}`;
}

type RecordFailure = (check: CheckId, detail: string) => void;

function checkSingleZoneFit(args: {
  id: string;
  zoneCase: ZoneCase;
  layout: ContainerLayout;
  fail: RecordFailure;
}): void {
  const { id, zoneCase, layout, fail } = args;
  const { config } = zoneCase;
  const frame = layout.frames[id];
  const dims = renderedDims(zoneCase, layout, id);
  const count = config.zones[id].count;
  const grid = gridSize(dims, config.zones[id].gap ?? DEFAULT_GAP);
  if (frame.innerWidth <= 0 || frame.innerHeight <= 0) {
    fail(
      "zones-off-board",
      `${id} has no room inside its padding (${frameText(frame)})`,
    );
  }
  if (dims.rows * dims.columns < count) {
    fail(
      "card-outside-zone",
      `${id} grid holds ${dims.rows * dims.columns} of ${count} cards`,
    );
  } else if (grid.width > frame.innerWidth || grid.height > frame.innerHeight) {
    const over = [
      grid.width > frame.innerWidth
        ? `${grid.width - frame.innerWidth}px too wide`
        : null,
      grid.height > frame.innerHeight
        ? `${grid.height - frame.innerHeight}px too tall`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    fail(
      "card-outside-zone",
      `${id} ${dims.columns}x${dims.rows} grid of ${dims.width}px cards is ${over}`,
    );
  }
  if (dims.width < MIN_CARD_WIDTH) {
    fail("card-below-minimum", `${id} cards ${dims.width}px wide`);
  }
}

function computeUsedBoardHeight(
  layout: ContainerLayout,
  active: ActiveZones,
  gap: number,
): number {
  const { top, bottomLeft, bottomRight } = active;
  const blStack =
    bottomLeft.reduce((sum, id) => sum + layout.frames[id].outerHeight, 0) +
    gap * Math.max(0, bottomLeft.length - 1);
  const brHeight =
    bottomRight.length > 0 ? layout.frames[bottomRight[0]].outerHeight : 0;
  const hasTop = top.length > 0;
  const hasBottom = bottomLeft.length + bottomRight.length > 0;
  const topHeight = hasTop ? layout.frames[top[0]].outerHeight : 0;
  const middleGap = hasTop && hasBottom ? gap : 0;
  const bottomHeight = hasBottom ? Math.max(blStack, brHeight) : 0;
  return topHeight + middleGap + bottomHeight;
}

function checkBoardCoverage(args: {
  zoneCase: ZoneCase;
  layout: ContainerLayout;
  active: ActiveZones;
  fail: RecordFailure;
}): { boardW: number; boardH: number; gap: number } {
  const { zoneCase, layout, active, fail } = args;
  const { config } = zoneCase;
  const { top, bottomLeft, bottomRight } = active;
  const gap = config.sectionGap ?? 0;
  const boardW = layout.containerSize.width;
  // The zones fill the board apart from the height the config reserves for other content.
  const boardH = layout.containerSize.height - (config.fixedHeight ?? 0);
  const usedH = computeUsedBoardHeight(layout, active, gap);
  if (
    top.length + bottomLeft.length + bottomRight.length > 0 &&
    usedH !== boardH
  ) {
    fail("zones-off-board", `zones stack ${usedH}px on a ${boardH}px board`);
  }
  if (bottomLeft.length > 0 && bottomRight.length > 0) {
    const rowW =
      layout.frames[bottomLeft[0]].outerWidth +
      gap +
      layout.frames[bottomRight[0]].outerWidth;
    if (rowW !== boardW) {
      fail(
        "zones-off-board",
        `bottom zones span ${rowW}px of a ${boardW}px board`,
      );
    }
  }
  return { boardW, boardH, gap };
}

function checkSavedDividerPositions(args: {
  zoneCase: ZoneCase;
  layout: ContainerLayout;
  drawable: Required<ZoneConstraints>;
  active: ActiveZones;
  coverage: { boardW: number; gap: number };
  fail: RecordFailure;
}): void {
  const { zoneCase, layout, drawable, active, coverage, fail } = args;
  const { config } = zoneCase;
  const { top, bottomLeft, bottomRight } = active;
  const measured = measureFromPlacement({
    layout: config.layout,
    zones: config.zones,
    zoneMeasurements: layout.frames,
    containerWidth: coverage.boardW,
    sectionPadTop: config.sectionPadTop,
    sectionPadBottom: config.sectionPadBottom,
    sectionGap: config.sectionGap,
  });
  if (!measured) return;
  const visible = {
    topFraction: top.length > 0 && bottomLeft.length + bottomRight.length > 0,
    bottomLeftSplit: bottomLeft.length >= 2,
    leftFraction: bottomLeft.length > 0 && bottomRight.length > 0,
  };
  const space = {
    topFraction: measured.usableHeight,
    bottomLeftSplit: measured.bottomInnerHeight,
    leftFraction: measured.usableWidth - coverage.gap,
  };
  for (const key of [
    "topFraction",
    "bottomLeftSplit",
    "leftFraction",
  ] as const) {
    if (!visible[key]) continue;
    const want = drawable[key];
    const offPx = Math.abs(measured[key] - want) * space[key];
    if (offPx > 1) {
      fail(
        "divider-off-saved-layout",
        `${key} ${want.toFixed(3)} sits at ${measured[key].toFixed(3)} (${Math.round(offPx)}px off)`,
      );
    }
  }
}

function checkSavedZoneMinimums(args: {
  allActive: string[];
  layout: ContainerLayout;
  automatic: ContainerLayout;
  fail: RecordFailure;
}): void {
  const { allActive, layout, automatic, fail } = args;
  // A saved layout leaves each zone room for one row of cards, or the room the automatic layout gives it if less.
  for (const id of allActive) {
    const frame = layout.frames[id];
    const minWidth = Math.min(
      MIN_ZONE_CARD.width,
      automatic.frames[id].innerWidth,
    );
    const minHeight = Math.min(
      MIN_ZONE_CARD.height,
      automatic.frames[id].innerHeight,
    );
    if (frame.innerWidth < minWidth || frame.innerHeight < minHeight) {
      fail(
        "saved-layout-squeezes-zone",
        `${id} has ${frame.innerWidth}x${frame.innerHeight}px inside its padding`,
      );
    }
  }
}

function checkSavedLayoutFit(args: {
  zoneCase: ZoneCase;
  layout: ContainerLayout;
  saved: ZoneConstraints;
  board: Box;
  active: ActiveZones;
  coverage: { boardW: number; boardH: number; gap: number };
  fail: RecordFailure;
}): void {
  const { zoneCase, layout, saved, board, active, coverage, fail } = args;
  const { config } = zoneCase;
  // A divider sits where the layout was saved, unless that leaves a zone without room for one row of cards.
  const automatic = layoutForContainer(board.width, board.height, {
    ...config,
    constraints: null,
  });
  const drawable = clampSavedConstraints({
    containerW: coverage.boardW,
    containerH: coverage.boardH,
    config,
    savedFractions: saved,
    automaticFrames: automatic.frames,
  });
  checkSavedDividerPositions({
    zoneCase,
    layout,
    drawable,
    active,
    coverage,
    fail,
  });
  checkSavedZoneMinimums({
    allActive: [...active.top, ...active.bottomLeft, ...active.bottomRight],
    layout,
    automatic,
    fail,
  });
}

export interface CheckZoneLayoutOptions {
  viewport: Viewport;
  zoneCase: ZoneCase;
  saved: ZoneConstraints | null;
  board?: Box;
}

export function checkZoneLayout({
  viewport,
  zoneCase,
  saved,
  board = viewport.zoneBoard,
}: CheckZoneLayoutOptions): Failure[] {
  const failures: Failure[] = [];
  const label = saved
    ? `${zoneCase.label}, saved ${JSON.stringify(saved)}`
    : zoneCase.label;
  const fail: RecordFailure = (check, detail) => {
    failures.push({
      check,
      surface: zoneCase.phase,
      viewport: viewport.name,
      label,
      detail,
    });
  };
  const layout = layoutForContainer(board.width, board.height, {
    ...zoneCase.config,
    constraints: saved,
  });
  const active = activeZones(zoneCase);
  const allActive = [
    ...active.top,
    ...active.bottomLeft,
    ...active.bottomRight,
  ];

  for (const id of allActive) {
    checkSingleZoneFit({ id, zoneCase, layout, fail });
  }

  const coverage = checkBoardCoverage({ zoneCase, layout, active, fail });
  if (saved) {
    checkSavedLayoutFit({
      zoneCase,
      layout,
      saved,
      board,
      active,
      coverage,
      fail,
    });
  }

  if (zoneCase.hasDividers && !isMobileViewport(viewport)) {
    for (const failure of grabEachDivider({
      zoneCase,
      rendered: layout,
      saved,
      board,
    })) {
      fail("grab-moves-layout", failure);
    }
  }
  return failures;
}

const DIVIDERS = [
  "topDivider",
  "bottomLeftSplitDivider",
  "leftDivider",
] as const;

/** How far each visible divider sits from the board's top or left edge, in px. */
function dividerPositions(
  zoneCase: ZoneCase,
  layout: ContainerLayout,
): Partial<Record<(typeof DIVIDERS)[number], number>> {
  const { top, bottomLeft, bottomRight } = activeZones(zoneCase);
  const positions: Partial<Record<(typeof DIVIDERS)[number], number>> = {};
  if (top.length > 0 && bottomLeft.length + bottomRight.length > 0) {
    positions.topDivider = layout.frames[top[0]].outerHeight;
  }
  if (bottomLeft.length >= 2) {
    positions.bottomLeftSplitDivider = layout.frames[bottomLeft[0]].outerHeight;
  }
  if (bottomLeft.length > 0 && bottomRight.length > 0) {
    positions.leftDivider = layout.frames[bottomLeft[0]].outerWidth;
  }
  return positions;
}

/**
 * Presses and releases each divider, once without moving it and once after
 * moving it 1px and back, the way useResizableLayout wires useZoneDividers.
 */
function grabEachDivider(args: {
  zoneCase: ZoneCase;
  rendered: ContainerLayout;
  saved: ZoneConstraints | null;
  board: Box;
}): string[] {
  const { zoneCase, rendered, saved, board } = args;
  const { config } = zoneCase;
  const writes: ZoneConstraints[] = [];
  const save = (constraints: ZoneConstraints): void => {
    writes.push(constraints);
  };
  // Composed the way useResizableLayout composes them.
  const { result } = renderHook(() => {
    const layout = useLayoutDrag(saved, save);
    return useZoneDividers({
      containerHeight: rendered.containerSize.height,
      containerWidth: rendered.containerSize.width,
      layoutConfig: config,
      allowHorizontalResize: zoneCase.allowHorizontalResize,
      measureInitialConstraints: () =>
        measureFromPlacement({
          layout: config.layout,
          zones: config.zones,
          zoneMeasurements: rendered.frames,
          containerWidth: rendered.containerSize.width,
          sectionPadTop: config.sectionPadTop,
          sectionPadBottom: config.sectionPadBottom,
          sectionGap: config.sectionGap,
        }),
      renderedConstraints: rendered.constraints,
      constraints: layout.constraints,
      drag: layout.drag,
      onConstraintsChange: save,
      onConstraintsClear: () => {},
    });
  });
  const callbacks: DividerCallbacks = result.current;

  const moved: string[] = [];
  const grabs = DIVIDERS.flatMap((divider) => [
    { divider, deltas: [0] },
    { divider, deltas: [1, -1] },
  ]);
  for (const { divider, deltas } of grabs) {
    const handle = callbacks[divider];
    if (!handle) continue;
    const before = writes.length;
    act(() => {
      handle.onDragStart();
      for (const delta of deltas) handle.onDrag(delta);
      handle.onDragEnd();
    });
    if (writes.length === before) continue;
    const after = layoutForContainer(board.width, board.height, {
      ...config,
      constraints: writes[writes.length - 1],
    });
    const positionsBefore = dividerPositions(zoneCase, rendered);
    const positionsAfter = dividerPositions(zoneCase, after);
    const dividerMoves = DIVIDERS.flatMap((each) => {
      const beforePos = positionsBefore[each];
      const afterPos = positionsAfter[each];
      if (
        beforePos === undefined ||
        afterPos === undefined ||
        beforePos === afterPos
      ) {
        return [];
      }
      return [
        `${each === divider ? "it" : each} moved ${afterPos - beforePos}px`,
      ];
    });
    const cardChanges = Object.keys(config.zones)
      .filter(
        (id) =>
          config.zones[id].count > 0 &&
          rendered.dims[id].width !== after.dims[id].width,
      )
      .map(
        (id) =>
          `${id} cards ${rendered.dims[id].width}→${after.dims[id].width}px`,
      );
    if (dividerMoves.length + cardChanges.length > 0) {
      const grab =
        deltas.length > 1
          ? `moving ${divider} and back`
          : `grabbing ${divider}`;
      moved.push(`${grab}: ${[...dividerMoves, ...cardChanges].join(", ")}`);
    }
  }
  releaseRenderedHooks();
  return moved;
}

// Rows are fractional and card heights whole, so a card may round up past its row by under half a pixel.
const ROW_ROUNDING_PX = 0.5;

function battleRowFits(args: {
  count: number;
  card: { width: number; height: number };
  gap: number;
  width: number;
  rowHeight: number;
}): boolean {
  const { count, card, gap, width, rowHeight } = args;
  return (
    count * card.width + Math.max(0, count - 1) * gap <= width &&
    card.height <= rowHeight + ROW_ROUNDING_PX
  );
}

export interface CheckBattleLayoutOptions {
  viewport: Viewport;
  battleCase: BattleCase;
  isSuddenDeath: boolean;
  board?: Box;
}

/** Battle sizing as useBattleCardSizes computes it, checked against the room computeBattleZones itself budgets. */
export function checkBattleLayout({
  viewport,
  battleCase,
  isSuddenDeath,
  board = battleBoard(viewport, isSuddenDeath),
}: CheckBattleLayoutOptions): Failure[] {
  const failures: Failure[] = [];
  const surface = isSuddenDeath ? "battle-sudden-death" : "battle";
  const fail = (check: CheckId, detail: string): number =>
    failures.push({
      check,
      surface,
      viewport: viewport.name,
      label: battleCase.label,
      detail,
    });
  const config = battleConfig(viewport, battleCase);
  const zones = computeBattleZones(board.width, board.height, config);
  // The horizontal padding computeBattleZones subtracts for hands and battlefields.
  const handWidth = board.width - config.zoneColumnWidth - 48;
  const battlefieldWidth =
    board.width - config.zoneColumnWidth - BATTLEFIELD_INSET;

  const rows = [
    {
      name: "your hand",
      count: config.playerHandCount,
      card: zones.playerHand,
      gap: zones.playerHandGap,
      width: handWidth,
    },
    {
      name: "opponent hand",
      count: config.opponentHandCount,
      card: zones.opponentHand,
      gap: zones.opponentHandGap,
      width: handWidth,
    },
    {
      name: "your lands",
      count: config.playerLandCount,
      card: zones.playerLands,
      gap: config.battlefieldGap,
      width: battlefieldWidth,
    },
    {
      name: "your nonlands",
      count: config.playerNonlandCount,
      card: zones.playerNonlands,
      gap: config.battlefieldGap,
      width: battlefieldWidth,
    },
    {
      name: "opponent lands",
      count: config.opponentLandCount,
      card: zones.opponentLands,
      gap: config.battlefieldGap,
      width: battlefieldWidth,
    },
    {
      name: "opponent nonlands",
      count: config.opponentNonlandCount,
      card: zones.opponentNonlands,
      gap: config.battlefieldGap,
      width: battlefieldWidth,
    },
  ];
  for (const row of rows) {
    if (row.count === 0) continue;
    if (
      !battleRowFits({
        count: row.count,
        card: row.card,
        gap: row.gap,
        width: row.width,
        rowHeight: zones.rowHeight,
      })
    ) {
      fail(
        "card-outside-zone",
        `${row.name}: ${row.count} cards of ${row.card.width}x${row.card.height} in ${row.width}x${zones.rowHeight.toFixed(1)}`,
      );
    }
    if (row.card.width < MIN_CARD_WIDTH) {
      fail("card-below-minimum", `${row.name} cards ${row.card.width}px wide`);
    }
  }
  if (zones.rowHeight <= 0) {
    fail(
      "zones-off-board",
      `no room for card rows after ${config.fixedHeight}px of fixed height`,
    );
  }
  return failures;
}

type ResizeCallback = (entries: { contentRect: Box }[]) => void;

/**
 * Mounts a sizing hook on an element whose content box is `box`, then reports
 * the size it chose after each way it measures: the ref callback (clientWidth,
 * a whole number), the ResizeObserver (the exact box) and a later re-render.
 */
function sizesPerMeasurement<T>(
  box: Box,
  padding: number,
  useSizing: () => [React.RefCallback<HTMLElement>, T],
): T[] {
  let resize: ResizeCallback | null = null;
  const original = globalThis.ResizeObserver;
  Reflect.set(
    globalThis,
    "ResizeObserver",
    class {
      constructor(callback: ResizeCallback) {
        resize = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  const element = document.createElement("div");
  element.style.padding = `${padding}px`;
  Object.defineProperty(element, "clientWidth", {
    value: Math.round(box.width + 2 * padding),
  });
  Object.defineProperty(element, "clientHeight", {
    value: Math.round(box.height + 2 * padding),
  });
  document.body.appendChild(element);
  try {
    const { result, rerender } = renderHook(useSizing);
    act(() => {
      result.current[0](element);
    });
    const sizes = [result.current[1]];
    act(() => {
      resize?.([{ contentRect: box }]);
    });
    sizes.push(result.current[1]);
    rerender();
    sizes.push(result.current[1]);
    releaseRenderedHooks();
    return sizes;
  } finally {
    element.remove();
    Reflect.set(globalThis, "ResizeObserver", original);
  }
}

const MEASUREMENT_PATHS = ["mount", "ResizeObserver", "re-render"];

function describeChanges<T>(
  sizes: T[],
  describe: (size: T) => string,
): string | null {
  const described = sizes.map(describe);
  if (described.every((text) => text === described[0])) return null;
  return described
    .map((text, index) => `${MEASUREMENT_PATHS[index]}: ${text}`)
    .join(" | ");
}

/** The ZoneLayout and Reward boards measure an element with 2px of padding. */
export function checkZoneMeasurement(
  viewport: Viewport,
  zoneCase: ZoneCase,
  board: Box,
): Failure[] {
  const sizes = sizesPerMeasurement(board, 2, () => {
    const [ref, dims, , frames] = useCardLayout(zoneCase.config);
    return [ref, { dims, frames }];
  });
  const changed = describeChanges(sizes, ({ dims, frames }) =>
    Object.keys(zoneCase.config.zones)
      .filter((id) => zoneCase.config.zones[id].count > 0)
      .map((id) => `${id} ${dims[id].width}px in ${frameText(frames[id])}`)
      .join(", "),
  );
  return changed
    ? [
        {
          check: "measurement-changes-layout",
          surface: zoneCase.phase,
          viewport: viewport.name,
          label: `${zoneCase.label}, board ${board.width}x${board.height}`,
          detail: changed,
        },
      ]
    : [];
}

export function checkBattleMeasurement(
  viewport: Viewport,
  battleCase: BattleCase,
  board: Box,
): Failure[] {
  const config = battleConfig(viewport, battleCase);
  const sizes = sizesPerMeasurement(board, 0, () => useBattleCardSizes(config));
  const changed = describeChanges(
    sizes,
    (zones) =>
      `row ${zones.rowHeight.toFixed(2)}px, hand ${zones.playerHand.width}px, lands ${zones.playerLands.width}px`,
  );
  return changed
    ? [
        {
          check: "measurement-changes-layout",
          surface: "battle",
          viewport: viewport.name,
          label: `${battleCase.label}, board ${board.width}x${board.height}`,
          detail: changed,
        },
      ]
    : [];
}

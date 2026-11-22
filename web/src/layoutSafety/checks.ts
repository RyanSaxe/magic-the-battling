import { act, cleanup, renderHook } from "@testing-library/react";
import { MIN_CARD_WIDTH, type ZoneDims } from "../hooks/cardSizeUtils";
import {
  MIN_ZONE_CARD,
  clampSavedConstraints,
  type ZoneConstraints,
  type ZoneFrame,
} from "../hooks/computeConstrainedLayout";
import { computeBattleZones, useBattleCardSizes } from "../hooks/useBattleCardSizes";
import { layoutForContainer, useCardLayout, type ContainerLayout } from "../hooks/useCardLayout";
import { measureFromPlacement } from "../hooks/useResizableLayout";
import { useZoneDividers, type DividerCallbacks } from "../hooks/useZoneDividers";
import { getUpgradeGridDims } from "../utils/upgradeGrid";
import {
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

function gridSize(dims: ZoneDims, gap: number) {
  return {
    width: dims.columns * dims.width + gap * Math.max(0, dims.columns - 1),
    height: dims.rows * dims.height + gap * Math.max(0, dims.rows - 1),
  };
}

function activeZones(zoneCase: ZoneCase) {
  const { layout, zones } = zoneCase.config;
  const active = (ids: string[] | undefined) => (ids ?? []).filter((id) => zones[id]?.count > 0);
  return { top: active(layout.top), bottomLeft: active(layout.bottomLeft), bottomRight: active(layout.bottomRight) };
}

/** The card size each zone renders, as the phase pages hand it to their grids. */
function renderedDims(zoneCase: ZoneCase, layout: ContainerLayout, zoneId: string): ZoneDims {
  const count = zoneCase.config.zones[zoneId].count;
  return zoneId === zoneCase.railZone
    ? getUpgradeGridDims(count, layout.frames[zoneId], layout.dims[zoneId])
    : layout.dims[zoneId];
}

// Testing Library keeps every rendered hook until cleanup, and the sweep renders tens of thousands.
function releaseRenderedHooks() {
  cleanup();
}

function frameText(frame: ZoneFrame) {
  return `${frame.outerWidth}x${frame.outerHeight}`;
}

export function checkZoneLayout(
  viewport: Viewport,
  zoneCase: ZoneCase,
  saved: ZoneConstraints | null,
  board: Box = viewport.zoneBoard,
): Failure[] {
  const failures: Failure[] = [];
  const label = saved ? `${zoneCase.label}, saved ${JSON.stringify(saved)}` : zoneCase.label;
  const fail = (check: CheckId, detail: string) =>
    failures.push({ check, surface: zoneCase.phase, viewport: viewport.name, label, detail });
  const { config } = zoneCase;
  const layout = layoutForContainer(board.width, board.height, { ...config, constraints: saved });
  const { top, bottomLeft, bottomRight } = activeZones(zoneCase);
  const allActive = [...top, ...bottomLeft, ...bottomRight];

  for (const id of allActive) {
    const frame = layout.frames[id];
    const dims = renderedDims(zoneCase, layout, id);
    const count = config.zones[id].count;
    const grid = gridSize(dims, config.zones[id].gap ?? DEFAULT_GAP);
    if (frame.innerWidth <= 0 || frame.innerHeight <= 0) {
      fail("zones-off-board", `${id} has no room inside its padding (${frameText(frame)})`);
    }
    if (dims.rows * dims.columns < count) {
      fail("card-outside-zone", `${id} grid holds ${dims.rows * dims.columns} of ${count} cards`);
    } else if (grid.width > frame.innerWidth || grid.height > frame.innerHeight) {
      const over = [
        grid.width > frame.innerWidth ? `${grid.width - frame.innerWidth}px too wide` : null,
        grid.height > frame.innerHeight ? `${grid.height - frame.innerHeight}px too tall` : null,
      ].filter(Boolean).join(", ");
      fail("card-outside-zone", `${id} ${dims.columns}x${dims.rows} grid of ${dims.width}px cards is ${over}`);
    }
    if (dims.width < MIN_CARD_WIDTH) {
      fail("card-below-minimum", `${id} cards ${dims.width}px wide`);
    }
  }

  const gap = config.sectionGap ?? 0;
  const boardW = layout.containerSize.width;
  // The zones fill the board apart from the height the config reserves for other content.
  const boardH = layout.containerSize.height - (config.fixedHeight ?? 0);
  const stack = (ids: string[]) =>
    ids.reduce((sum, id) => sum + layout.frames[id].outerHeight, 0) + gap * Math.max(0, ids.length - 1);
  const bottomH = Math.max(stack(bottomLeft), bottomRight.length > 0 ? layout.frames[bottomRight[0]].outerHeight : 0);
  const usedH = (top.length > 0 ? layout.frames[top[0]].outerHeight : 0)
    + (top.length > 0 && bottomLeft.length + bottomRight.length > 0 ? gap : 0)
    + (bottomLeft.length + bottomRight.length > 0 ? bottomH : 0);
  if (allActive.length > 0 && usedH !== boardH) {
    fail("zones-off-board", `zones stack ${usedH}px on a ${boardH}px board`);
  }
  if (bottomLeft.length > 0 && bottomRight.length > 0) {
    const rowW = layout.frames[bottomLeft[0]].outerWidth + gap + layout.frames[bottomRight[0]].outerWidth;
    if (rowW !== boardW) fail("zones-off-board", `bottom zones span ${rowW}px of a ${boardW}px board`);
  }

  if (saved) {
    const measured = measureFromPlacement({
      layout: config.layout,
      zones: config.zones,
      zoneMeasurements: layout.frames,
      containerWidth: boardW,
      sectionPadTop: config.sectionPadTop,
      sectionPadBottom: config.sectionPadBottom,
      sectionGap: config.sectionGap,
    });
    const visible = {
      topFraction: top.length > 0 && bottomLeft.length + bottomRight.length > 0,
      bottomLeftSplit: bottomLeft.length >= 2,
      leftFraction: bottomLeft.length > 0 && bottomRight.length > 0,
    };
    const space = {
      topFraction: measured?.usableHeight ?? 0,
      bottomLeftSplit: measured?.bottomInnerHeight ?? 0,
      leftFraction: (measured?.usableWidth ?? 0) - gap,
    };
    // A divider sits where the layout was saved, unless that leaves a zone without room for one row of cards.
    const automatic = layoutForContainer(board.width, board.height, { ...config, constraints: null });
    const drawable = clampSavedConstraints(boardW, boardH, config, saved, automatic.frames);
    for (const key of ["topFraction", "bottomLeftSplit", "leftFraction"] as const) {
      const want = drawable[key];
      if (want === undefined || !visible[key] || !measured) continue;
      const offPx = Math.abs(measured[key] - want) * space[key];
      if (offPx > 1) {
        fail("divider-off-saved-layout", `${key} ${want.toFixed(3)} sits at ${measured[key].toFixed(3)} (${Math.round(offPx)}px off)`);
      }
    }
    // A saved layout leaves each zone room for one row of cards, or the room the automatic layout gives it if less.
    for (const id of allActive) {
      const frame = layout.frames[id];
      const minWidth = Math.min(MIN_ZONE_CARD.width, automatic.frames[id].innerWidth);
      const minHeight = Math.min(MIN_ZONE_CARD.height, automatic.frames[id].innerHeight);
      if (frame.innerWidth < minWidth || frame.innerHeight < minHeight) {
        fail("saved-layout-squeezes-zone", `${id} has ${frame.innerWidth}x${frame.innerHeight}px inside its padding`);
      }
    }
  }

  if (zoneCase.hasDividers && !isMobileViewport(viewport)) {
    for (const failure of grabEachDivider(zoneCase, layout, saved, board)) fail("grab-moves-layout", failure);
  }
  return failures;
}

const DIVIDERS = ["topDivider", "bottomLeftSplitDivider", "leftDivider"] as const;

/** How far each visible divider sits from the board's top or left edge, in px. */
function dividerPositions(zoneCase: ZoneCase, layout: ContainerLayout): Partial<Record<(typeof DIVIDERS)[number], number>> {
  const { top, bottomLeft, bottomRight } = activeZones(zoneCase);
  const positions: Partial<Record<(typeof DIVIDERS)[number], number>> = {};
  if (top.length > 0 && bottomLeft.length + bottomRight.length > 0) positions.topDivider = layout.frames[top[0]].outerHeight;
  if (bottomLeft.length >= 2) positions.bottomLeftSplitDivider = layout.frames[bottomLeft[0]].outerHeight;
  if (bottomLeft.length > 0 && bottomRight.length > 0) positions.leftDivider = layout.frames[bottomLeft[0]].outerWidth;
  return positions;
}

/**
 * Presses and releases each divider, once without moving it and once after
 * moving it 1px and back, the way useResizableLayout wires useZoneDividers.
 */
function grabEachDivider(
  zoneCase: ZoneCase,
  rendered: ContainerLayout,
  saved: ZoneConstraints | null,
  board: Box,
): string[] {
  const { config } = zoneCase;
  const writes: ZoneConstraints[] = [];
  const { result } = renderHook(() =>
    useZoneDividers({
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
      constraints: saved,
      onConstraintsChange: (constraints) => {
        writes.push(constraints);
      },
      onConstraintsClear: () => {},
    }),
  );
  const callbacks: DividerCallbacks = result.current;
  releaseRenderedHooks();

  const moved: string[] = [];
  const grabs = DIVIDERS.flatMap((divider) => [
    { divider, deltas: [0] },
    { divider, deltas: [1, -1] },
  ]);
  for (const { divider, deltas } of grabs) {
    const handle = callbacks[divider];
    if (!handle) continue;
    const before = writes.length;
    handle.onDragStart();
    for (const delta of deltas) handle.onDrag(delta);
    handle.onDragEnd();
    if (writes.length === before) continue;
    const after = layoutForContainer(board.width, board.height, { ...config, constraints: writes[writes.length - 1] });
    const positionsBefore = dividerPositions(zoneCase, rendered);
    const positionsAfter = dividerPositions(zoneCase, after);
    const dividerMoves = DIVIDERS
      .filter((each) => positionsBefore[each] !== positionsAfter[each])
      .map((each) => `${each === divider ? "it" : each} moved ${positionsAfter[each]! - positionsBefore[each]!}px`);
    const cardChanges = Object.keys(config.zones)
      .filter((id) => config.zones[id].count > 0 && rendered.dims[id].width !== after.dims[id].width)
      .map((id) => `${id} cards ${rendered.dims[id].width}→${after.dims[id].width}px`);
    if (dividerMoves.length + cardChanges.length > 0) {
      const grab = deltas.length > 1 ? `moving ${divider} and back` : `grabbing ${divider}`;
      moved.push(`${grab}: ${[...dividerMoves, ...cardChanges].join(", ")}`);
    }
  }
  return moved;
}

// Rows are fractional and card heights whole, so a card may round up past its row by under half a pixel.
const ROW_ROUNDING_PX = 0.5;

function battleRowFits(count: number, card: { width: number; height: number }, gap: number, width: number, rowHeight: number) {
  return count * card.width + Math.max(0, count - 1) * gap <= width && card.height <= rowHeight + ROW_ROUNDING_PX;
}

/** Battle sizing as useBattleCardSizes computes it, checked against the room computeBattleZones itself budgets. */
export function checkBattleLayout(
  viewport: Viewport,
  battleCase: BattleCase,
  isSuddenDeath: boolean,
  board: Box = viewport.battleBoard,
): Failure[] {
  const failures: Failure[] = [];
  const surface = isSuddenDeath ? "battle-sudden-death" : "battle";
  const fail = (check: CheckId, detail: string) =>
    failures.push({ check, surface, viewport: viewport.name, label: battleCase.label, detail });
  const config = battleConfig(viewport, battleCase, isSuddenDeath);
  const zones = computeBattleZones(board.width, board.height, config);
  // The horizontal padding computeBattleZones subtracts for hands and battlefields.
  const handWidth = board.width - config.zoneColumnWidth - 48;
  const battlefieldWidth = board.width - config.zoneColumnWidth - 16;

  const rows = [
    { name: "your hand", count: config.playerHandCount, card: zones.playerHand, gap: zones.playerHandGap, width: handWidth },
    { name: "opponent hand", count: config.opponentHandCount, card: zones.opponentHand, gap: zones.opponentHandGap, width: handWidth },
    { name: "your lands", count: config.playerLandCount, card: zones.playerLands, gap: config.battlefieldGap, width: battlefieldWidth },
    { name: "your nonlands", count: config.playerNonlandCount, card: zones.playerNonlands, gap: config.battlefieldGap, width: battlefieldWidth },
    { name: "opponent lands", count: config.opponentLandCount, card: zones.opponentLands, gap: config.battlefieldGap, width: battlefieldWidth },
    { name: "opponent nonlands", count: config.opponentNonlandCount, card: zones.opponentNonlands, gap: config.battlefieldGap, width: battlefieldWidth },
  ];
  for (const row of rows) {
    if (row.count === 0) continue;
    if (!battleRowFits(row.count, row.card, row.gap, row.width, zones.rowHeight)) {
      fail("card-outside-zone", `${row.name}: ${row.count} cards of ${row.card.width}x${row.card.height} in ${row.width}x${zones.rowHeight.toFixed(1)}`);
    }
    if (row.card.width < MIN_CARD_WIDTH) {
      fail("card-below-minimum", `${row.name} cards ${row.card.width}px wide`);
    }
  }
  if (zones.rowHeight <= 0) {
    fail("zones-off-board", `no room for card rows after ${config.fixedHeight}px of fixed height`);
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
  let resize: ResizeCallback = () => {};
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeCallback) {
      resize = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const element = document.createElement("div");
  element.style.padding = `${padding}px`;
  Object.defineProperty(element, "clientWidth", { value: Math.round(box.width + 2 * padding) });
  Object.defineProperty(element, "clientHeight", { value: Math.round(box.height + 2 * padding) });
  document.body.appendChild(element);
  try {
    const { result, rerender } = renderHook(useSizing);
    act(() => result.current[0](element));
    const sizes = [result.current[1]];
    act(() => resize([{ contentRect: box }]));
    sizes.push(result.current[1]);
    rerender();
    sizes.push(result.current[1]);
    releaseRenderedHooks();
    return sizes;
  } finally {
    element.remove();
    globalThis.ResizeObserver = original;
  }
}

const MEASUREMENT_PATHS = ["mount", "ResizeObserver", "re-render"];

function describeChanges<T>(sizes: T[], describe: (size: T) => string): string | null {
  const described = sizes.map(describe);
  if (described.every((text) => text === described[0])) return null;
  return described.map((text, index) => `${MEASUREMENT_PATHS[index]}: ${text}`).join(" | ");
}

/** The ZoneLayout and Reward boards measure an element with 2px of padding. */
export function checkZoneMeasurement(viewport: Viewport, zoneCase: ZoneCase, board: Box): Failure[] {
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
    ? [{ check: "measurement-changes-layout", surface: zoneCase.phase, viewport: viewport.name, label: `${zoneCase.label}, board ${board.width}x${board.height}`, detail: changed }]
    : [];
}

export function checkBattleMeasurement(viewport: Viewport, battleCase: BattleCase, board: Box): Failure[] {
  const config = battleConfig(viewport, battleCase, false);
  const sizes = sizesPerMeasurement(board, 0, () => useBattleCardSizes(config));
  const changed = describeChanges(sizes, (zones) =>
    `row ${zones.rowHeight.toFixed(2)}px, hand ${zones.playerHand.width}px, lands ${zones.playerLands.width}px`,
  );
  return changed
    ? [{ check: "measurement-changes-layout", surface: "battle", viewport: viewport.name, label: `${battleCase.label}, board ${board.width}x${board.height}`, detail: changed }]
    : [];
}

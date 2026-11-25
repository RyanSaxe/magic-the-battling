import type { Page } from "@playwright/test";
import { MIN_CARD_WIDTH } from "../src/hooks/cardSizeUtils";
import { expect, requireBaseUrl, serveGame, test } from "./helpers";
import { GAME_ID, type ScreenState } from "./gameStates";

type Check =
  | "card-outside-zone"
  | "card-below-minimum"
  | "cards-differ-in-zone"
  | "zones-off-board";
type Failures = Partial<Record<Check, string[]>>;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LabeledBox {
  label: string;
  box: Box;
}

interface RawElementIdentity {
  id: string;
  tag: string;
  classes: string[];
}

interface MeasuredCard {
  zone: RawElementIdentity;
  rect: Box;
  width: number;
  rowKey: number | null;
  row: RawElementIdentity | null;
}

interface CardCutoff {
  zone: RawElementIdentity;
  ancestor: RawElementIdentity;
  over: number;
}

interface BoardPieces {
  board: Box;
  pieces: Box[];
}

const DRAFT: ScreenState = {
  phase: "draft",
  counts: { pack: 5, sideboard: 10, upgrades: 2 },
};
const ZONE_SELECTOR =
  ".zone-hand, .zone-battlefield, .zone-sideboard, .zone-upgrades, .zone-pack";

function px(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatIdentity(identity: RawElementIdentity): string {
  return identity.id
    ? `#${identity.id}`
    : `${identity.tag}.${identity.classes.join(".")}`;
}

function measureBoardPieces(zoneSelector: string): BoardPieces {
  const boardElement = document.querySelector("main .zone-divider-bg");
  if (!boardElement) {
    throw new Error("Expected main .zone-divider-bg to be attached");
  }
  const contentElement =
    boardElement.querySelector(':scope > [class*="flex-col"]') ?? boardElement;
  const style = getComputedStyle(contentElement);
  const outer = contentElement.getBoundingClientRect();
  const board: Box = {
    x: outer.x + parseFloat(style.paddingLeft),
    y: outer.y + parseFloat(style.paddingTop),
    width:
      outer.width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
    height:
      outer.height -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom),
  };

  const pieces: Box[] = [];
  for (const element of Array.from(
    contentElement.querySelectorAll(`${zoneSelector}, .zone-divider-line`),
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      pieces.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  return { board, pieces };
}

function measureVisibleChrome(): LabeledBox[] {
  // The overlay sidebar stays in the page, moved off screen, while it is closed.
  const chrome: LabeledBox[] = [];
  const candidates = [
    document.querySelector("header"),
    document.querySelector('aside[data-guide-target="sidebar-panel"]'),
    document.querySelector("footer"),
  ];
  for (const element of candidates) {
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    const onScreen =
      rect.width > 0 &&
      rect.right > 0 &&
      rect.x < innerWidth &&
      rect.bottom > 0 &&
      rect.y < innerHeight;
    if (!onScreen) continue;
    const label = element.id
      ? `#${element.id}`
      : `${element.tagName.toLowerCase()}.${Array.from(element.classList).slice(0, 3).join(".")}`;
    chrome.push({
      label,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }
  return chrome;
}

function measureCardCutoffs(zoneSelector: string): CardCutoff[] {
  const boardElement = document.querySelector("main .zone-divider-bg");
  if (!boardElement) return [];
  const cutoffs: CardCutoff[] = [];

  for (const card of Array.from(boardElement.querySelectorAll(".card"))) {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0) continue;
    for (
      let ancestor = card.parentElement;
      ancestor && ancestor !== boardElement.parentElement;
      ancestor = ancestor.parentElement
    ) {
      const ancestorStyle = getComputedStyle(ancestor);
      const clips =
        ancestor === boardElement ||
        `${ancestorStyle.overflowX} ${ancestorStyle.overflowY}` !==
          "visible visible";
      if (!clips) continue;
      const box = ancestor.getBoundingClientRect();
      const over = Math.max(
        box.x - rect.x,
        box.y - rect.y,
        rect.right - box.right,
        rect.bottom - box.bottom,
      );
      if (over > 0.5) {
        const zoneEl = card.closest(zoneSelector) ?? card;
        cutoffs.push({
          zone: {
            id: zoneEl.id,
            tag: zoneEl.tagName.toLowerCase(),
            classes: Array.from(zoneEl.classList).slice(0, 3),
          },
          ancestor: {
            id: ancestor.id,
            tag: ancestor.tagName.toLowerCase(),
            classes: Array.from(ancestor.classList).slice(0, 3),
          },
          over,
        });
        break;
      }
    }
  }
  return cutoffs;
}

function measureCardBoxes(zoneSelector: string): MeasuredCard[] {
  const boardElement = document.querySelector("main .zone-divider-bg");
  if (!boardElement) return [];
  const contentElement =
    boardElement.querySelector(':scope > [class*="flex-col"]') ?? boardElement;
  const rows = new Map<Element, number>();
  const cards: MeasuredCard[] = [];

  for (const card of Array.from(contentElement.querySelectorAll(".card"))) {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0) continue;
    const zoneEl = card.closest(zoneSelector) ?? card;
    const rowEl = card.closest(`${zoneSelector}, .flex-nowrap`);
    let rowKey: number | null = null;
    let row: RawElementIdentity | null = null;
    if (rowEl) {
      rowKey = rows.get(rowEl) ?? rows.size;
      rows.set(rowEl, rowKey);
      row = {
        id: rowEl.id,
        tag: rowEl.tagName.toLowerCase(),
        classes: Array.from(rowEl.classList).slice(0, 3),
      };
    }
    const width =
      card instanceof HTMLElement ? card.offsetWidth : Math.round(rect.width);
    cards.push({
      zone: {
        id: zoneEl.id,
        tag: zoneEl.tagName.toLowerCase(),
        classes: Array.from(zoneEl.classList).slice(0, 3),
      },
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      width,
      rowKey,
      row,
    });
  }

  return cards;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function checkRowUniformWidths(
  groups: Map<number, { label: string; widths: number[] }>,
  fail: (check: Check, detail: string) => void,
): void {
  for (const { label, widths } of groups.values()) {
    const distinct = new Set(widths);
    if (distinct.size > 1) {
      fail(
        "cards-differ-in-zone",
        `${label} has cards ${[...distinct].join(", ")}px wide`,
      );
    }
  }
}

function checkMeasuredCards(
  cards: MeasuredCard[],
  chrome: LabeledBox[],
  fail: (check: Check, detail: string) => void,
): void {
  const groups = new Map<number, { label: string; widths: number[] }>();
  for (const card of cards) {
    for (const bar of chrome) {
      if (boxesOverlap(card.rect, bar.box)) {
        fail("card-outside-zone", `card under ${bar.label}`);
      }
    }
    if (card.width < MIN_CARD_WIDTH) {
      fail(
        "card-below-minimum",
        `${formatIdentity(card.zone)} card ${card.width}px wide`,
      );
    }
    if (card.rowKey !== null && card.row !== null) {
      const group = groups.get(card.rowKey) ?? {
        label: formatIdentity(card.row),
        widths: [],
      };
      group.widths.push(card.width);
      groups.set(card.rowKey, group);
    }
  }
  checkRowUniformWidths(groups, fail);
}

interface ScanAxis {
  name: "x" | "y";
  at: (box: Box) => [number, number];
  span: (box: Box) => [number, number];
  start: number;
  length: number;
  cross: [number, number];
}

function checkAxisTiling(
  axis: ScanAxis,
  pieces: Box[],
  fail: (check: Check, detail: string) => void,
): void {
  const endEdge = axis.name === "y" ? "bottom" : "right";
  const end = axis.start + axis.length;
  for (const fraction of [0.1, 0.5, 0.9]) {
    const line = axis.cross[0] + axis.cross[1] * fraction;
    const spans = pieces
      .filter((box) => axis.at(box)[0] <= line && line <= axis.at(box)[1])
      .map(axis.span)
      .toSorted((a, b) => a[0] - b[0]);
    let cursor = axis.start;
    for (const [from, to] of spans) {
      const gap = from - cursor;
      if (gap > (cursor === axis.start ? 0.5 : 2.5)) {
        fail(
          "zones-off-board",
          `${px(gap)}px of board uncovered at ${axis.name}=${px(cursor - axis.start)}`,
        );
      }
      cursor = Math.max(cursor, to);
    }
    if (end - cursor > 0.5) {
      fail(
        "zones-off-board",
        `${px(end - cursor)}px of board uncovered at the ${endEdge}`,
      );
    }
    if (cursor - end > 0.5) {
      fail(
        "zones-off-board",
        `zones run ${px(cursor - end)}px past the board ${endEdge}`,
      );
    }
  }
}

async function measureBoard(page: Page): Promise<Failures> {
  const { board, pieces } = await page.evaluate(
    measureBoardPieces,
    ZONE_SELECTOR,
  );
  const chrome = await page.evaluate(measureVisibleChrome);
  const cutoffs = await page.evaluate(measureCardCutoffs, ZONE_SELECTOR);
  const cards = await page.evaluate(measureCardBoxes, ZONE_SELECTOR);
  const failures: Failures = {};
  const fail = (check: Check, detail: string): void => {
    (failures[check] ??= []).push(detail);
  };

  for (const cutoff of cutoffs) {
    fail(
      "card-outside-zone",
      `${formatIdentity(cutoff.zone)} card cut off by ${formatIdentity(cutoff.ancestor)} (${px(cutoff.over)}px)`,
    );
  }
  checkMeasuredCards(cards, chrome, fail);

  // Scan three columns and three rows of the board: zones, dividers and the 2px seams between zones must tile it.
  const axes: ScanAxis[] = [
    {
      name: "y",
      at: (box: Box): [number, number] => [box.x, box.x + box.width],
      span: (box: Box): [number, number] => [box.y, box.y + box.height],
      start: board.y,
      length: board.height,
      cross: [board.x, board.width],
    },
    {
      name: "x",
      at: (box: Box): [number, number] => [box.y, box.y + box.height],
      span: (box: Box): [number, number] => [box.x, box.x + box.width],
      start: board.x,
      length: board.width,
      cross: [board.y, board.height],
    },
  ];
  for (const axis of axes) {
    checkAxisTiling(axis, pieces, fail);
  }

  return failures;
}

async function layoutSnapshot(page: Page): Promise<string> {
  return page.evaluate(
    (zoneSelector) =>
      JSON.stringify(
        Array.from(
          document.querySelectorAll(`main .zone-divider-bg, ${zoneSelector}`),
        )
          .map((element) => element.getBoundingClientRect())
          .map((rect) => [rect.x, rect.y, rect.width, rect.height]),
      ),
    ZONE_SELECTOR,
  );
}

async function waitForStableFrames(
  page: Page,
  state: { previous: string; stableFor: number; samples: number },
): Promise<void> {
  if (state.stableFor >= 3) return;
  if (state.samples === 50) {
    throw new Error("the board kept moving for 50 frames");
  }
  await page.waitForTimeout(100);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve)),
      ),
  );
  const current = await layoutSnapshot(page);
  await waitForStableFrames(page, {
    previous: current,
    stableFor: current === state.previous ? state.stableFor + 1 : 0,
    samples: state.samples + 1,
  });
}

/**
 * Waits until the board and its zones stop moving, as the header and sidebar settle after the first paint. The app
 * lays out again only when a frame delivers ResizeObserver, and WebKit on Linux can go seconds between frames, so
 * boxes that haven't moved count only once a frame has run.
 */
async function waitForStableLayout(page: Page): Promise<void> {
  const previous = await layoutSnapshot(page);
  await waitForStableFrames(page, { previous, stableFor: 0, samples: 0 });
}

test.describe("a stylesheet that arrives after the game renders", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // Unstyled, the board's height follows its content, so a layout that measures on every render keeps growing it.
  test("leaves the board laid out once it applies", async ({
    page,
    baseURL,
  }) => {
    await serveGame({
      page,
      baseURL: requireBaseUrl(baseURL),
      screen: DRAFT,
    });
    let stylesheet = "";
    await page.route(/\/assets\/.*\.css$/, async (route) => {
      stylesheet = await (await route.fetch()).text();
      await route.fulfill({ body: "", contentType: "text/css" });
    });
    await page.goto(`/game/${GAME_ID}/play`, { waitUntil: "domcontentloaded" });
    const crashed = page.getByRole("heading", { name: "Something went wrong" });
    await expect(page.locator("main .card").first().or(crashed)).toBeAttached();
    await page.waitForTimeout(500);
    // Shadows move no box, and painting them takes Linux WebKit seconds for each frame that waitForStableLayout waits on.
    await page.addStyleTag({
      content: `${stylesheet}\n*, ::before, ::after { box-shadow: none !important; }`,
    });

    await expect(crashed).toHaveCount(0);
    await waitForStableLayout(page);
    expect(await measureBoard(page)).toEqual({});
  });
});

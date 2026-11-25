import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, requireBaseUrl, serveGame, test } from "./helpers";
import { GAME_ID, gameBootstrap, type ScreenState } from "./gameStates";

const GAME_PHASES: Record<string, ScreenState> = {
  draft: { phase: "draft", counts: { pack: 5, sideboard: 10, upgrades: 2 } },
  build: { phase: "build", counts: { hand: 3, handSize: 3, sideboard: 6 } },
  fight: {
    phase: "battle",
    counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 },
  },
  reward: { phase: "reward", counts: { sideboard: 8 } },
};

const LINE_SCREENS = [
  {
    name: "1280×800 laptop",
    viewport: { width: 1280, height: 800 },
    isMobile: false,
  },
  { name: "iPhone 15", viewport: { width: 390, height: 844 }, isMobile: true },
];
const PHASE_STEPS = [
  { phase: "draft", mainAction: "Go to Build" },
  { phase: "build", mainAction: "Submit Hand" },
  { phase: "fight", mainAction: "Submit Result" },
  { phase: "reward", mainAction: "Continue" },
];
const LINE_TOLERANCE = 0.5;

type LineName =
  | "top bar"
  | "bottom bar"
  | "felt"
  | "board's gold edge"
  | "docked sidebar";

const LINE_NAMES: readonly LineName[] = [
  "top bar",
  "bottom bar",
  "felt",
  "board's gold edge",
  "docked sidebar",
];

interface EdgeBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type FrameLines = Record<LineName, EdgeBox | null>;

/**
 * The frame's lines in the current phase: the bars, the felt, the board's gold edge and the docked sidebar.
 * The gold dividers inside the board aren't here, since each phase lays out its own zones.
 */
function measureLines(page: Page): Promise<FrameLines> {
  return page.evaluate((): FrameLines => {
    const board = document.querySelector("main");
    const entries: Array<[LineName, Element | null]> = [
      ["top bar", document.querySelector("header")],
      ["bottom bar", document.querySelector("footer")],
      ["felt", document.querySelector(".game-surface")],
      ["board's gold edge", board?.querySelector(".zone-divider-bg") ?? null],
      ["docked sidebar", document.querySelector(".frame-sidebar")],
    ];
    const result: FrameLines = {
      "top bar": null,
      "bottom bar": null,
      felt: null,
      "board's gold edge": null,
      "docked sidebar": null,
    };
    for (const [key, element] of entries) {
      if (!element) continue;
      const { left, top, right, bottom } = element.getBoundingClientRect();
      result[key] = { left, top, right, bottom };
    }
    return result;
  });
}

async function waitForPageAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const settled = document
      .getAnimations()
      .map((animation) => animation.finished.catch(() => undefined));
    await Promise.all(settled);
  });
}

function assertLinesMatchDraft(
  phase: string,
  lines: FrameLines,
  draftLines: FrameLines,
): void {
  for (const line of LINE_NAMES) {
    const edges = lines[line];
    const draftEdges = draftLines[line];
    expect
      .soft(edges === null, `${line} in ${phase} shows as it does in draft`)
      .toBe(draftEdges === null);
    if (!edges || !draftEdges) continue;
    for (const side of ["left", "top", "right", "bottom"] as const) {
      expect
        .soft(
          Math.abs(edges[side] - draftEdges[side]),
          `${line} ${side} edge in ${phase}, against draft`,
        )
        .toBeLessThanOrEqual(LINE_TOLERANCE);
      // A line on a half pixel renders softer than the same line on a whole one.
      expect
        .soft(
          Math.abs(edges[side] - Math.round(edges[side])),
          `${line} ${side} edge in ${phase} sits on a whole pixel`,
        )
        .toBeLessThan(0.01);
    }
  }
}

async function checkPhaseSteps(args: {
  page: Page;
  getServer: () => WebSocketRoute | undefined;
  index: number;
  draftLines: FrameLines | undefined;
}): Promise<void> {
  const { page, getServer, index, draftLines } = args;
  if (index >= PHASE_STEPS.length) return;
  const { phase, mainAction } = PHASE_STEPS[index];
  // One game moves from phase to phase, as a player sees it, rather than each phase loading fresh.
  if (phase !== "draft") {
    const server = getServer();
    if (!server) throw new Error("Expected game websocket to be connected");
    server.send(
      JSON.stringify({
        type: "game_state",
        payload: gameBootstrap(GAME_PHASES[phase]).state,
      }),
    );
  }
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: mainAction })
    .waitFor();
  await waitForPageAnimations(page);
  const lines = await measureLines(page);
  const baseline = draftLines ?? lines;
  assertLinesMatchDraft(phase, lines, baseline);
  await checkPhaseSteps({
    page,
    getServer,
    index: index + 1,
    draftLines: baseline,
  });
}

for (const { name, viewport, isMobile } of LINE_SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile });

    test("the frame's lines stay put from Draft through Round Wrap-Up", async ({
      page,
      baseURL,
    }) => {
      let server: WebSocketRoute | undefined;
      await serveGame({
        page,
        baseURL: requireBaseUrl(baseURL),
        screen: GAME_PHASES.draft,
        onSocket: (ws) => {
          server = ws;
        },
      });
      await page.goto(`/game/${GAME_ID}/play`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.load("16px Cinzel"));

      await checkPhaseSteps({
        page,
        getServer: () => server,
        index: 0,
        draftLines: undefined,
      });
    });
  });
}

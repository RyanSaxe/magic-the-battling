import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, serveGame, test } from "./helpers";
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

/**
 * The frame's lines in the current phase: the bars, the felt, the board's gold edge and the docked sidebar.
 * The gold dividers inside the board aren't here, since each phase lays out its own zones.
 */
function measureLines(page: Page) {
  return page.evaluate(() => {
    const edges = (element: Element | null) => {
      if (!element) return null;
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const board = document.querySelector("main");
    return {
      "top bar": edges(document.querySelector("header")),
      "bottom bar": edges(document.querySelector("footer")),
      felt: edges(document.querySelector(".game-surface")),
      "board's gold edge": edges(
        board?.querySelector(".zone-divider-bg") ?? null,
      ),
      "docked sidebar": edges(document.querySelector(".frame-sidebar")),
    };
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
      await serveGame(page, baseURL!, GAME_PHASES.draft, {
        onSocket: (ws) => {
          server = ws;
        },
      });
      await page.goto(`/game/${GAME_ID}/play`, {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(() => document.fonts.load("16px Cinzel"));

      let draftLines: Awaited<ReturnType<typeof measureLines>> | undefined;
      for (const { phase, mainAction } of PHASE_STEPS) {
        // One game moves from phase to phase, as a player sees it, rather than each phase loading fresh.
        if (phase !== "draft")
          server!.send(
            JSON.stringify({
              type: "game_state",
              payload: gameBootstrap(GAME_PHASES[phase]).state,
            }),
          );
        await page
          .getByRole("contentinfo")
          .getByRole("button", { name: mainAction })
          .waitFor();
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
        const lines = await measureLines(page);
        draftLines ??= lines;

        for (const [line, edges] of Object.entries(lines)) {
          const draftEdges = draftLines[line as keyof typeof lines];
          expect
            .soft(
              edges === null,
              `${line} in ${phase} shows as it does in draft`,
            )
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
    });
  });
}

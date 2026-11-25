import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expect,
  test as base,
  type Locator,
  type Page,
  type Response,
  type Route,
  type WebSocketRoute,
} from "@playwright/test";
import { gameBootstrap, type ScreenState } from "./gameStates";

type MockResponse = { status?: number; json: unknown };

/** Set LAYOUT_CARD_ART=real to load real card images from Scryfall, for screenshots; runs stay offline otherwise. */
const SHOW_REAL_CARD_ART = process.env.LAYOUT_CARD_ART === "real";

const isLoopback = (ipAddress: string): boolean =>
  ipAddress.startsWith("127.") || ipAddress === "::1" || ipAddress === "[::1]";

/** Google Fonts' hosts, which the helpers answer from copies in fixtures/fonts. */
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
/** Scryfall's card art hosts, which the helpers answer with a placeholder unless LAYOUT_CARD_ART=real. */
const CARD_ART_HOSTS = new Set(["cards.scryfall.io", "backs.scryfall.io"]);

const isLocalUrl = (url: string): boolean => {
  const { hostname } = new URL(url);
  // The helpers answer the font and card art hosts themselves, so those responses never leave this machine.
  return (
    hostname === "localhost" ||
    isLoopback(hostname) ||
    FONT_HOSTS.has(hostname) ||
    CARD_ART_HOSTS.has(hostname)
  );
};

/** The response's URL when it came from a server other than this machine, or null. */
async function outsideUrl(
  response: Pick<Response, "serverAddr" | "url">,
): Promise<string | null> {
  const address = await response.serverAddr().catch(() => undefined);
  // A response still arriving as the test ends can't report its address, so judge it by where it was sent.
  if (address === undefined) {
    return isLocalUrl(response.url()) ? null : response.url();
  }
  return address && !isLoopback(address.ipAddress) ? response.url() : null;
}

/** Fails a test when any response came from a server other than this machine, so the tests never depend on the network. */
export const test = base.extend<{ stayOffline: void }>({
  stayOffline: [
    async ({ page }, use): Promise<void> => {
      const outsideResponses: Promise<string | null>[] = [];
      page.on("response", (response) => {
        outsideResponses.push(outsideUrl(response));
      });
      await use();
      // Real card art is fetched on purpose, for screenshots taken on a developer's machine.
      if (SHOW_REAL_CARD_ART) return;
      const reachedNetwork = (await Promise.all(outsideResponses)).filter(
        (url) => url !== null,
      );
      expect(
        reachedNetwork,
        "responses from servers outside this machine",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

const SERVER_STATUS: MockResponse = {
  json: {
    mode: "normal",
    message: "",
    updated_at: "2026-01-01T00:00:00Z",
    new_games_blocked: false,
    scheduled_for_utc: null,
    estimated_recovery_minutes: null,
  },
};

const RESPONSES: Record<string, MockResponse> = {
  "/api/auth/me": { status: 401, json: { detail: "Not authenticated" } },
  "/api/server/status": SERVER_STATUS,
  "/api/games/cubes/warm": { json: { status: "ok" } },
};

const FONT_FIXTURES = fileURLToPath(
  new URL("./fixtures/fonts/", import.meta.url),
);

// The header's Cinzel title sets how much room its buttons have, so the tests serve the
// Google Fonts stylesheet and font files the app loads from copies in fixtures/fonts.
function serveGoogleFont(route: Route, url: URL): Promise<void> {
  const headers = { "Access-Control-Allow-Origin": "*" };
  if (url.hostname === "fonts.googleapis.com") {
    return route.fulfill({
      path: `${FONT_FIXTURES}cinzel.css`,
      contentType: "text/css",
      headers,
    });
  }
  return route.fulfill({
    path: `${FONT_FIXTURES}${basename(url.pathname)}`,
    contentType: "font/woff2",
    headers,
  });
}

export async function serveWithoutBackend(
  page: Page,
  baseURL: string,
): Promise<void> {
  const appOrigin = new URL(baseURL).origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (FONT_HOSTS.has(url.hostname)) return serveGoogleFont(route, url);
    if (url.origin !== appOrigin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const response = RESPONSES[url.pathname];
    if (!response) {
      return route.fulfill({ status: 404, json: { detail: "Not mocked" } });
    }
    return route.fulfill(response);
  });
}

const SESSION = { sessionId: "session-1", playerId: "player-1" };

// A plain card-shaped frame, so an offline run doesn't look like a broken image or a logo.
const CARD_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680">
  <rect x="6" y="6" width="476" height="668" rx="28" fill="#3b3a36" stroke="#8a7a52" stroke-width="12"/>
  <rect x="40" y="70" width="408" height="300" rx="6" fill="#55534d"/>
</svg>`;

export interface ServeGameArgs {
  page: Page;
  baseURL: string;
  screen: ScreenState;
  /** Receives the game socket, to send more state. */
  onSocket?: (ws: WebSocketRoute) => void;
}

export function requireBaseUrl(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required");
  }
  return baseURL;
}

/** Opens a game whose server sends `screen` as its state. */
export async function serveGame({
  page,
  baseURL,
  screen,
  onSocket,
}: ServeGameArgs): Promise<void> {
  await serveWithoutBackend(page, baseURL);
  await page.route(
    (url) => CARD_ART_HOSTS.has(url.hostname),
    (route) =>
      SHOW_REAL_CARD_ART
        ? route.continue()
        : route.fulfill({
            body: CARD_PLACEHOLDER_SVG,
            contentType: "image/svg+xml",
          }),
  );
  await page.addInitScript((session) => {
    sessionStorage.setItem("mtb_session", session.sessionId);
    sessionStorage.setItem("mtb_player", session.playerId);
    // Guided Mode is on for new players and opens panels over the board, so play as a returning player.
    localStorage.setItem("pitfight_guided_mode_preference", "0");
  }, SESSION);
  await page.routeWebSocket(/\/ws\//, (ws) => {
    ws.send(
      JSON.stringify({
        type: "game_bootstrap",
        payload: gameBootstrap(screen),
      }),
    );
    onSocket?.(ws);
  });
}

// Playwright offers no swipe or wheel input in mobile WebKit, and scrollIntoView would also
// scroll overflow:hidden boxes that no finger can move. Scrolling only the boxes a swipe can
// scroll keeps a clipped, unscrollable panel failing the way it fails on a phone.
export async function swipeIntoView(element: Locator): Promise<void> {
  await element.evaluate((target) => {
    for (let node = target.parentElement; node; node = node.parentElement) {
      if (!["auto", "scroll"].includes(getComputedStyle(node).overflowY)) {
        continue;
      }
      const offset =
        target.getBoundingClientRect().top - node.getBoundingClientRect().top;
      node.scrollTop +=
        offset -
        (node.clientHeight - target.getBoundingClientRect().height) / 2;
    }
  });
}

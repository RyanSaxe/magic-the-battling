import { devices } from "@playwright/test";
import {
  expect,
  requireBaseUrl,
  serveWithoutBackend,
  swipeIntoView,
  test,
} from "./helpers";

test.use(devices["iPhone SE"]);

test.beforeEach(async ({ page, baseURL }) => {
  await serveWithoutBackend(page, requireBaseUrl(baseURL));
  await page.goto("/play");
});

test("Start Game can be scrolled fully into view", async ({ page }) => {
  const startGame = page.getByRole("button", { name: "Start Game" });
  await swipeIntoView(startGame);

  await expect(startGame).toBeInViewport({ ratio: 1 });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { installMemoryLocalStorage } from "./test/memoryStorage";

vi.hoisted(() => {
  // inputMode reads matchMedia as it's imported, and jsdom has none.
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener(): void {},
    removeListener(): void {},
    addEventListener(): void {},
    removeEventListener(): void {},
    dispatchEvent(): boolean {
      return false;
    },
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubAppApis(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request): Promise<Response> => {
      const url = requestUrl(input);
      if (url.includes("/api/auth/me")) {
        return Promise.resolve(jsonResponse({ detail: "Unauthorized" }, 401));
      }
      if (url.includes("/api/server/status")) {
        return Promise.resolve(
          jsonResponse({ mode: "normal", updated_at: "2026-01-01T00:00:00Z" }),
        );
      }
      if (url.includes("/api/showcase")) {
        return Promise.resolve(jsonResponse({ cards: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    }),
  );
}

beforeEach(() => {
  installMemoryLocalStorage();
  stubAppApis();
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.unstubAllGlobals();
});

it("loads a lazy route through the Suspense boundary", async () => {
  window.history.pushState({}, "", "/login");
  render(<App />);

  expect(
    await screen.findByRole("button", { name: "Log In" }, { timeout: 5000 }),
  ).toBeTruthy();
});

it("renders the NotFound page for unknown paths", () => {
  window.history.pushState({}, "", "/does-not-exist");
  render(<App />);

  expect(screen.getByText("Page not found")).toBeTruthy();
});

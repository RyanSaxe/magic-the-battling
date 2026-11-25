// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../../e2e/gameStates";
import { hydrateGameState } from "../../utils/catalogHydration";
import { GameTopBar } from "../game/GameChrome";
import { AppHeader } from "./AppHeader";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
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

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("navigates to Home when the top-left Pitfight logo in AppHeader is clicked", () => {
  render(
    <MemoryRouter initialEntries={["/play"]}>
      <Routes>
        <Route path="/" element={<p>Home Screen</p>} />
        <Route path="/play" element={<AppHeader />} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("link", { name: "Pitfight Home" }));
  expect(screen.getByText("Home Screen")).toBeTruthy();
});

it("renders a plain Home link in AppHeader when mounted outside a router", () => {
  render(<AppHeader />);

  const link = screen.getByRole("link", { name: "Pitfight Home" });
  expect(link.getAttribute("href")).toBe("/");
});

it("navigates to Home when the top-left Pitfight mark in GameTopBar is clicked", () => {
  const { catalog, state } = gameBootstrap({ phase: "draft", counts: {} });
  const gameState = hydrateGameState(state, catalog);

  render(
    <MemoryRouter initialEntries={["/game/game-1/play"]}>
      <Routes>
        <Route path="/" element={<p>Home Screen</p>} />
        <Route
          path="/game/:gameId/play"
          element={
            <GameTopBar
              gameState={gameState}
              timelinePhase="draft"
              isOut={false}
              isSpectator={false}
              isEndPhase={false}
              displayBattleResolution={false}
              selfPlacement={0}
              outPlace=""
              guideMinimized={false}
              usesOverlaySidebar={false}
              onToggleSidebar={() => {}}
              onOpenRulesPanel={() => {}}
              onCloseActions={() => {}}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("link", { name: "Pitfight Home" }));
  expect(screen.getByText("Home Screen")).toBeTruthy();
});

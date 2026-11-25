// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../../e2e/gameStates";
import { hydrateGameState } from "../../utils/catalogHydration";
import { BattleSidebarContent } from "./BattleSidebarContent";

// Cards read matchMedia when they're imported, and jsdom has none.
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
  vi.restoreAllMocks();
});

it("selects the whole life total as its field opens, so typing replaces it", () => {
  // jsdom keeps no selection in a number field, so this records what's selected.
  const selected: string[] = [];
  vi.spyOn(HTMLInputElement.prototype, "select").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    selected.push(this.value);
  });
  const bootstrap = gameBootstrap({ phase: "battle", counts: {} });
  const currentBattle = hydrateGameState(
    bootstrap.state,
    bootstrap.catalog,
  ).current_battle;
  if (!currentBattle) {
    throw new Error("Expected current_battle in battle bootstrap");
  }
  render(
    <BattleSidebarContent
      currentBattle={currentBattle}
      selfUpgrades={[]}
      yourLife={17}
      opponentLife={20}
      onYourLifeChange={() => {}}
      onOpponentLifeChange={() => {}}
      playerName="Alice"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "17" }));
  expect(selected).toEqual(["17"]);
});

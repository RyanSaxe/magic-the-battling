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

it("disables Pass, Treasure, Untap, and life controls when readOnly is true", () => {
  const bootstrap = gameBootstrap({ phase: "battle", counts: {} });
  const currentBattle = hydrateGameState(
    bootstrap.state,
    bootstrap.catalog,
  ).current_battle;
  if (!currentBattle) {
    throw new Error("Expected current_battle in battle bootstrap");
  }
  const onYourLifeChange = vi.fn();
  const onOpponentLifeChange = vi.fn();
  const onCreateTreasure = vi.fn();
  const onUntapAll = vi.fn();
  const onPassTurn = vi.fn();
  const onCreateOpponentTreasure = vi.fn();
  const onUntapOpponentAll = vi.fn();
  const onPassOpponentTurn = vi.fn();

  render(
    <BattleSidebarContent
      currentBattle={{
        ...currentBattle,
        current_turn_name: "Alice",
        can_manipulate_opponent: true,
      }}
      selfUpgrades={[]}
      yourLife={17}
      opponentLife={20}
      onYourLifeChange={onYourLifeChange}
      onOpponentLifeChange={onOpponentLifeChange}
      playerName="Alice"
      onCreateTreasure={onCreateTreasure}
      onUntapAll={onUntapAll}
      onPassTurn={onPassTurn}
      canManipulateOpponent
      onCreateOpponentTreasure={onCreateOpponentTreasure}
      onUntapOpponentAll={onUntapOpponentAll}
      onPassOpponentTurn={onPassOpponentTurn}
      readOnly
    />,
  );

  for (const label of ["Treasure", "Untap", "Pass", "-", "+", "17", "20"]) {
    const buttons = screen.getAllByRole<HTMLButtonElement>("button", {
      name: label,
    });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
  }

  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(onYourLifeChange).not.toHaveBeenCalled();
  expect(onOpponentLifeChange).not.toHaveBeenCalled();
  expect(onCreateTreasure).not.toHaveBeenCalled();
  expect(onUntapAll).not.toHaveBeenCalled();
  expect(onPassTurn).not.toHaveBeenCalled();
  expect(onCreateOpponentTreasure).not.toHaveBeenCalled();
  expect(onUntapOpponentAll).not.toHaveBeenCalled();
  expect(onPassOpponentTurn).not.toHaveBeenCalled();
});

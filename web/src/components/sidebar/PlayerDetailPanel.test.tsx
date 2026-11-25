// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../../e2e/gameStates";
import { hydrateGameState } from "../../utils/catalogHydration";
import { PlayerDetailPanel } from "./PlayerDetailPanel";

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

afterEach(cleanup);

function scoutBob(phase: "build" | "battle", odds: number): void {
  const bootstrap = gameBootstrap({ phase, counts: {} });
  const players = hydrateGameState(bootstrap.state, bootstrap.catalog).players;
  const bob = { ...players[1], pairing_probability: odds };
  render(
    <PlayerDetailPanel
      player={bob}
      players={[players[0], bob]}
      currentPlayer={players[0]}
      useUpgrades={false}
      activeTab="overview"
      onTabChange={() => {}}
    />,
  );
}

it("shows a player's odds outside a Fight, and says they aren't known yet during one", () => {
  scoutBob("build", 0.4);
  expect(screen.getByText("40%")).toBeTruthy();
  cleanup();

  // The server has no odds during a Fight, and sends 0 for everyone.
  scoutBob("battle", 0);
  expect(screen.getByText("Not known yet")).toBeTruthy();
  expect(screen.queryByText("0%")).toBeNull();
});

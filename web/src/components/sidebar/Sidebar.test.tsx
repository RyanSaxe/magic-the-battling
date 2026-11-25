// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../../e2e/gameStates";
import { hydrateGameState } from "../../utils/catalogHydration";
import { Sidebar, type Scouting } from "./Sidebar";

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
});

function showPlayers(
  phase: "build" | "battle",
  scouting: Scouting | null = null,
): void {
  const bootstrap = gameBootstrap({ phase, counts: {} });
  const [alice, bob] = hydrateGameState(
    bootstrap.state,
    bootstrap.catalog,
  ).players;
  // The server sends 0 for everyone's odds during a Fight.
  const opponent = {
    ...bob,
    pairing_probability: phase === "battle" ? 0 : 0.4,
  };
  cleanup();
  render(
    <Sidebar
      players={[alice, opponent]}
      currentPlayer={alice}
      renderFight={
        phase === "battle"
          ? (viewSwitch): ReactNode => <>{viewSwitch}</>
          : undefined
      }
      fightView="players"
      onFightViewChange={() => {}}
      scoutInline
      scouting={scouting}
      onScout={() => {}}
      onStopScouting={() => {}}
    />,
  );
}

it("hides opponents' poison, treasure, Seen in Fight and odds during a Fight, and not in Build", () => {
  showPlayers("build");
  expect(screen.getAllByTitle("Poison")).toHaveLength(2);
  expect(screen.getAllByTitle("Treasures")).toHaveLength(2);
  expect(screen.getByText("40%")).toBeTruthy();
  showPlayers("build", { player: "Bob", tab: "seen" });
  expect(screen.getAllByText("Seen in Fight").length).toBeGreaterThan(0);

  showPlayers("battle");
  expect(screen.getAllByTitle("Poison")).toHaveLength(1);
  expect(screen.getAllByTitle("Treasures")).toHaveLength(1);
  expect(screen.queryByText("0%")).toBeNull();
  expect(screen.getByText("Bob")).toBeTruthy();
  expect(screen.getAllByTitle(/place$/)).toHaveLength(2);

  showPlayers("battle", { player: "Bob", tab: "seen" });
  expect(screen.queryByText("Seen in Fight")).toBeNull();
  expect(screen.queryByText("Poison")).toBeNull();
  expect(screen.queryByText("Treasure")).toBeNull();

  showPlayers("battle", { player: "Alice", tab: "overview" });
  expect(screen.getByText("Poison")).toBeTruthy();
});

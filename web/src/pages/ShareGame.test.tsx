// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ShareGameResponse, SharePlayerSnapshot } from "../types";
import { ShareGame } from "./ShareGame";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

function snapshot(
  round: number,
  suddenDeathBuild: number | null = null,
): SharePlayerSnapshot {
  return {
    stage: 3,
    round,
    hand: [],
    sideboard: [],
    command_zone: [],
    applied_upgrades: [],
    basic_lands: [],
    treasures: 0,
    poison: 0,
    vanguard: null,
    visibility: "full",
    sudden_death_build: suddenDeathBuild,
  };
}

let activeSnapshots: SharePlayerSnapshot[] = [];

function sharedGame(): ShareGameResponse {
  return {
    game_id: "game-1",
    owner_name: "Alice",
    created_at: "2026-01-02T00:00:00Z",
    use_upgrades: true,
    cube_id: "auto",
    in_progress: false,
    players: [
      {
        name: "Alice",
        final_placement: 1,
        final_poison: 0,
        final_treasures: null,
        is_puppet: false,
        snapshots: activeSnapshots,
      },
    ],
  };
}

vi.mock("../api/client", () => ({ getShareGame: async () => sharedGame() }));
vi.mock("../contexts", () => ({ useToast: () => ({ addToast: () => {} }) }));
vi.mock("../contexts/authState", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

beforeEach(() => {
  // The page measures itself, and jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // The round list scrolls to the chosen round, and jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShare() {
  render(
    <MemoryRouter initialEntries={["/game/game-1/share/Alice"]}>
      <Routes>
        <Route path="/game/:gameId/share/:playerName" element={<ShareGame />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("Prev and Next step through every round and Sudden Death build in order", async () => {
  activeSnapshots = [snapshot(2), snapshot(3), snapshot(3, 1), snapshot(3, 2)];
  renderShare();
  const rounds = [
    "Stage 3 - Round 2",
    "Stage 3 - Round 3",
    "Stage 3 - Round 3 · Sudden Death",
    "Stage 3 - Round 3 · Sudden Death 2",
  ];
  const shows = (round: string) =>
    screen.findByText(round, { selector: "button" });

  await shows(rounds[3]);
  for (const round of [rounds[2], rounds[1], rounds[0]]) {
    fireEvent.click(screen.getByText("Prev", { selector: "button" }));
    await shows(round);
  }
  for (const round of [rounds[1], rounds[2], rounds[3]]) {
    fireEvent.click(screen.getByText("Next", { selector: "button" }));
    await shows(round);
  }
});

it("closes the round list on the click of a tap on the board or on its own button", async () => {
  activeSnapshots = [snapshot(1), snapshot(2)];
  renderShare();
  const roundButton = await screen.findByText("Stage 3 - Round 2", {
    selector: "button",
  });
  const earlierRound = () =>
    screen.queryByText("Stage 3 - Round 1", { selector: "button" });

  fireEvent.click(roundButton);
  fireEvent.mouseDown(roundButton);
  fireEvent.click(roundButton);
  expect(earlierRound()).toBeNull();

  fireEvent.click(roundButton);
  const tapTarget = document.querySelector(".board-backdrop");
  expect(tapTarget).not.toBeNull();
  fireEvent.mouseDown(tapTarget!);
  expect(earlierRound()).not.toBeNull();

  fireEvent.click(tapTarget!);
  expect(earlierRound()).toBeNull();
});

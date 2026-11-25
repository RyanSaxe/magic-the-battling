// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ShareGameResponse, SharePlayerSnapshot } from "../types";
import { ShareGame } from "./ShareGame";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  });
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

vi.mock("../api/client", () => ({
  getShareGame: async (): Promise<ShareGameResponse> => sharedGame(),
}));
vi.mock("../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));
vi.mock("../contexts/authState", () => ({
  useAuth: (): { user: null; loading: boolean } => ({
    user: null,
    loading: false,
  }),
}));

beforeEach(() => {
  // The page measures itself, and jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  // The round list scrolls to the chosen round, and jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = (): void => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShare(): void {
  render(
    <MemoryRouter initialEntries={["/game/game-1/share/Alice"]}>
      <Routes>
        <Route path="/game/:gameId/share/:playerName" element={<ShareGame />} />
      </Routes>
    </MemoryRouter>,
  );
}

function findRoundButton(round: string): Promise<HTMLElement> {
  return screen.findByText(round, { selector: "button" });
}

function queryEarlierRound(): HTMLElement | null {
  return screen.queryByText("Stage 3 - Round 1", { selector: "button" });
}

async function stepRound(
  direction: "Prev" | "Next",
  expectedRound: string,
): Promise<void> {
  fireEvent.click(screen.getByText(direction, { selector: "button" }));
  await findRoundButton(expectedRound);
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

  await findRoundButton(rounds[3]);
  await stepRound("Prev", rounds[2]);
  await stepRound("Prev", rounds[1]);
  await stepRound("Prev", rounds[0]);
  await stepRound("Next", rounds[1]);
  await stepRound("Next", rounds[2]);
  await stepRound("Next", rounds[3]);
});

it("closes the round list on the click of a tap on the board or on its own button", async () => {
  activeSnapshots = [snapshot(1), snapshot(2)];
  renderShare();
  const roundButton = await screen.findByText("Stage 3 - Round 2", {
    selector: "button",
  });

  fireEvent.click(roundButton);
  fireEvent.mouseDown(roundButton);
  fireEvent.click(roundButton);
  expect(queryEarlierRound()).toBeNull();

  fireEvent.click(roundButton);
  const tapTarget = document.querySelector(".board-backdrop");
  if (!tapTarget) throw new Error("expected .board-backdrop");
  fireEvent.mouseDown(tapTarget);
  expect(queryEarlierRound()).not.toBeNull();

  fireEvent.click(tapTarget);
  expect(queryEarlierRound()).toBeNull();
});

// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { createBattler, getBattlers } from "../api/client";
import type { UserBattler } from "../types";
import { Dashboard } from "./Dashboard";

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

vi.mock("../api/client", () => ({
  createBattler: vi.fn(),
  getBattlers: vi.fn(),
  getFollowing: async (): Promise<{
    following: never[];
    has_more: boolean;
  }> => ({ following: [], has_more: false }),
  getMyGames: async (): Promise<{
    games: never[];
    total_games: number;
    total_wins: number;
  }> => ({ games: [], total_games: 0, total_wins: 0 }),
}));
vi.mock("../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));
vi.mock("../contexts/authState", () => ({
  useAuth: (): { user: { username: string }; loading: boolean } => ({
    user: { username: "tester" },
    loading: false,
  }),
}));
vi.mock("../hooks/useResumableGames", () => ({
  useResumableGames: (): never[] => [],
}));

afterEach(cleanup);

const preset = (id: number): UserBattler => ({
  id,
  cube_id: `cube-${id}`,
  display_name: `Preset ${id}`,
  use_upgrades: false,
  use_vanguards: false,
  play_mode: "limited",
  puppet_count: 3,
  target_player_count: 4,
  auto_approve_spectators: false,
  guided_mode_default: false,
  position: id,
  created_at: "2026-11-21T00:00:00",
  game_count: 0,
  human_player_count: 0,
  my_game_count: 0,
  my_win_count: 0,
  my_average_placement: null,
  my_last_played: null,
});

function noop(): void {}

interface DeferredGate {
  release: () => Promise<void>;
  released: Promise<void>;
}

function held(): DeferredGate {
  let release: () => void = noop;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: (): Promise<void> =>
      act(async () => {
        release();
      }),
    released,
  };
}

function submitNewPreset(cubeId: string): void {
  fireEvent.click(screen.getByText("+ Add Cube / Deck"));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getAllByRole("textbox")[0], {
    target: { value: cubeId },
  });
  fireEvent.submit(dialog);
  fireEvent.click(screen.getByLabelText("Close Add Cube / Deck"));
}

function visiblePresetTitles(): string[] {
  return [...document.querySelectorAll("h3")]
    .map((title) => title.textContent)
    .filter((title) => title?.startsWith("Preset "));
}

it("keeps every preset when an Add sent during the first load returns while Load more runs", async () => {
  const firstLoad = held();
  const save = held();
  const morePage = held();
  let saved = Array.from({ length: 21 }, (_, index) => preset(index + 1));
  vi.mocked(getBattlers).mockImplementation(async (offset = 0) => {
    const page = {
      battlers: saved.slice(offset, offset + 20),
      has_more: offset + 20 < saved.length,
    };
    await (offset ? morePage : firstLoad).released;
    return page;
  });
  vi.mocked(createBattler).mockImplementation(async () => {
    await save.released;
    saved = [preset(22), ...saved];
    return preset(22);
  });
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

  submitNewPreset("cube-22");
  await firstLoad.release();
  fireEvent.click(screen.getByText("Load more"));
  await save.release();
  await morePage.release();

  expect(visiblePresetTitles()).toEqual(
    saved.map((shown) => shown.display_name),
  );
});

it.each([
  ["save", "page"],
  ["page", "save"],
] as const)(
  "keeps every preset when the %s lands before the %s",
  async (first, second) => {
    const answers = { save: held(), page: held() };
    let saved = Array.from({ length: 21 }, (_, index) => preset(index + 1));
    vi.mocked(getBattlers).mockImplementation(async (offset = 0) => {
      const page = {
        battlers: saved.slice(offset, offset + 20),
        has_more: offset + 20 < saved.length,
      };
      if (offset) await answers.page.released;
      return page;
    });
    vi.mocked(createBattler).mockImplementation(async () => {
      saved = [preset(22), ...saved];
      await answers.save.released;
      return preset(22);
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await screen.findByText("Preset 20");

    submitNewPreset("cube-22");
    fireEvent.click(screen.getByText("Load more"));
    await answers[first].release();
    await answers[second].release();

    expect(visiblePresetTitles()).toEqual(
      saved.map((shown) => shown.display_name),
    );
  },
);

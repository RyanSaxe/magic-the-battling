// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardDiscover } from "./DashboardDiscover";
import { DashboardGames } from "./DashboardGames";

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

vi.mock("../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));
// One user for every render, since the pages search again when the user changes.
vi.mock("../contexts/authState", () => {
  const user = { username: "tester" };
  return {
    useAuth: (): { user: { username: string }; loading: boolean } => ({
      user,
      loading: false,
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SEARCH_DELAY_MS = 300;
const EMPTY_PAGE = {
  results: [],
  following: [],
  games: [],
  has_more: false,
  total: 0,
  total_games: 0,
  total_wins: 0,
};

function advanceSearchTimer(ms: number): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface SearchPageCase {
  name: string;
  Page: ComponentType;
  label: string;
  path: string;
}

it.each<SearchPageCase>([
  {
    name: "Discover",
    Page: DashboardDiscover,
    label: "Search cubes",
    path: "/api/discover",
  },
  {
    name: "Games",
    Page: DashboardGames,
    label: "Search games",
    path: "/api/battlers/my-games",
  },
])(
  "$name sends what was typed once typing stops",
  async ({ Page, label, path }) => {
    vi.useFakeTimers();
    const searches: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input, "http://localhost");
      if (url.pathname === path) searches.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify(EMPTY_PAGE));
    });
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    await advanceSearchTimer(0);

    const box = screen.getByLabelText(label);
    fireEvent.change(box, { target: { value: "pau" } });
    await advanceSearchTimer(SEARCH_DELAY_MS - 1);
    fireEvent.change(box, { target: { value: "pauper " } });
    await advanceSearchTimer(SEARCH_DELAY_MS - 1);
    expect(searches).toEqual([""]);
    await advanceSearchTimer(1);
    expect(searches).toEqual(["", "pauper"]);
  },
);

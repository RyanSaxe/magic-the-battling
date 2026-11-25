// @vitest-environment jsdom
import type { ComponentProps, ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../../e2e/gameStates";
import { installMemoryLocalStorage } from "../../test/memoryStorage";
import type { GameState } from "../../types";
import { hydrateGameState } from "../../utils/catalogHydration";
import { BuildPhase } from "./Build";

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

function buildActions(): ComponentProps<typeof BuildPhase>["actions"] {
  return {
    buildMove: vi.fn(),
    buildSwap: vi.fn(),
    buildSetBasics: vi.fn(),
    buildReady: vi.fn(),
    buildUnready: vi.fn(),
    buildApplyUpgrade: vi.fn(),
    buildSetCompanion: vi.fn(),
    buildRemoveCompanion: vi.fn(),
  };
}

function zoneLayoutStyles(root: HTMLElement): (string | null)[] {
  return Array.from(
    root.querySelectorAll(
      '.zone-hand, .zone-battlefield, .zone-sideboard, [style*="grid-template-columns"]',
    ),
    (element) => element.getAttribute("style"),
  );
}

beforeEach(() => {
  installMemoryLocalStorage();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows a pill reached with the keyboard, and not one that kept focus from a click", () => {
  const { state, catalog } = gameBootstrap({
    phase: "build",
    counts: { hand: 1, handSize: 1, upgrades: 1 },
  });
  render(
    <BuildPhase
      gameState={hydrateGameState(state, catalog)}
      actions={buildActions()}
      selectedBasics={["Forest", "Island", "Plains"]}
      onBasicsChange={vi.fn()}
      onQuickUpgrade={vi.fn()}
    />,
  );
  const pill = screen.getByRole("button", { name: /^Upgrade / });
  // jsdom can't tell how focus arrived, so say whether the browser would show a ring.
  const matches = pill.matches.bind(pill);
  let ring = false;
  Object.defineProperty(pill, "matches", {
    configurable: true,
    value: (selector: string): boolean =>
      selector === ":focus-visible" ? ring : matches(selector),
  });
  const hidden = (): boolean => pill.classList.contains("opacity-0");

  fireEvent.focusIn(pill);
  expect(hidden()).toBe(true);
  fireEvent.focusOut(pill);

  ring = true;
  fireEvent.focusIn(pill);
  expect(hidden()).toBe(false);

  fireEvent.focusOut(pill);
  expect(hidden()).toBe(true);
});

it("keeps the sizes Build opened at while the hand fills and after coming back", () => {
  // jsdom has no layout, so every element measures as a 390x844 phone's board.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(378);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(756);
  vi.stubGlobal("getComputedStyle", () => ({
    paddingLeft: "0",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
  }));

  const { state, catalog } = gameBootstrap({
    phase: "build",
    counts: { hand: 0, handSize: 3, sideboard: 7 },
  });
  const opened = hydrateGameState(state, catalog);
  const pool = opened.self_player.sideboard;
  const handFull: GameState = {
    ...opened,
    self_player: {
      ...opened.self_player,
      hand: pool.slice(0, 3),
      hand_slots: pool.slice(0, 3).map((card) => card.id),
      sideboard: pool.slice(3),
    },
  };
  const actions = buildActions();
  const board = (gameState: GameState): ReactElement => (
    <BuildPhase
      gameState={gameState}
      actions={actions}
      selectedBasics={[]}
      onBasicsChange={vi.fn()}
    />
  );

  const building = render(board(opened));
  const atOpen = zoneLayoutStyles(building.container);
  expect(atOpen.join()).toContain("grid-template-columns");

  building.rerender(board(handFull));
  expect(zoneLayoutStyles(building.container)).toEqual(atOpen);

  building.unmount();
  expect(zoneLayoutStyles(render(board(handFull)).container)).toEqual(atOpen);
});

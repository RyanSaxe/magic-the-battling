// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_ID, gameBootstrap } from "../../e2e/gameStates";
import { cancelSpectateRequest, getGameStatus } from "../api/client";
import { BASIC_LANDS } from "../constants/assets";
import { FakeWebSocket } from "../test/fakeWebSocket";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import type { CompactGameState, CompactPlayerView } from "../types";
import {
  readTabSpectate,
  saveTabSession,
  saveTabSpectate,
} from "../utils/tabSession";
import { Game } from "./Game";

// The game shell reads matchMedia when it is imported, and jsdom has none.
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

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  getServerStatus: vi.fn(async () => null),
  getGameStatus: vi.fn(async () => ({
    game_id: "game-1",
    phase: "build",
    is_started: true,
    auto_approve_spectators: false,
    players: [
      { name: "Alice", is_connected: true, is_puppet: false, phase: "build" },
      { name: "Bob", is_connected: false, is_puppet: false, phase: "build" },
    ],
  })),
  getSpectateRequestStatus: vi.fn(async () => ({ status: "pending" })),
  cancelSpectateRequest: vi.fn(async () => ({ status: "cancelled" })),
}));
const cancelRequest = vi.mocked(cancelSpectateRequest);
const fetchGameStatus = vi.mocked(getGameStatus);

vi.mock("../contexts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../contexts")>()),
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));

interface MockAuthState {
  user: { username: string } | null;
  loading: boolean;
}

const auth = vi.hoisted((): MockAuthState => ({
  user: null,
  loading: false,
}));
vi.mock("../contexts/authState", () => ({
  useAuth: (): MockAuthState => ({
    user: auth.loading ? null : auth.user,
    loading: auth.loading,
  }),
}));

function find(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

function makeDomRect(box: {
  x?: number;
  y?: number;
  width: number;
  height: number;
}): DOMRect {
  const x = box.x ?? 0;
  const y = box.y ?? 0;
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + box.width,
    bottom: y + box.height,
    width: box.width,
    height: box.height,
    toJSON: (): Record<string, number> => ({
      x,
      y,
      width: box.width,
      height: box.height,
    }),
  };
}

function HomePage(): ReactElement {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void navigate("/game/game-1/play");
      }}
    >
      Open the game link
    </button>
  );
}

function renderGame(gameId = "game-1"): void {
  render(
    <MemoryRouter initialEntries={[`/game/${gameId}/play`]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:gameId/play" element={<Game />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function openGame(
  bootstrap: ReturnType<typeof gameBootstrap>,
): Promise<void> {
  renderGame(GAME_ID);
  await vi.waitFor(() => FakeWebSocket.latest());
  await act(async () => {
    FakeWebSocket.latest().serverOpen();
    FakeWebSocket.latest().serverMessage({
      type: "game_bootstrap",
      payload: bootstrap,
    });
  });
}

function player(
  name: string,
  overrides: Partial<CompactPlayerView> = {},
): CompactPlayerView {
  return {
    name,
    treasures: 0,
    poison: 0,
    phase: "build",
    round: 1,
    stage: 3,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 0,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: ["Forest", "Island", "Plains"],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  };
}

function buildState(bob: Partial<CompactPlayerView> = {}): CompactGameState {
  const alice = {
    ...player("Alice"),
    hand: [],
    hand_slots: [],
    sideboard: [],
    command_zone: [],
    current_pack: null,
    last_battle_result: null,
  };
  return {
    game_id: "game-1",
    phase: "build",
    starting_life: 20,
    players: [alice, player("Bob", bob)],
    self_player: alice,
    available_upgrades: [],
    current_battle: null,
    battle_resolution: null,
    use_upgrades: true,
    voice_chat_enabled: false,
    cube_id: "auto",
    play_mode: "limited",
    catalog_delta: {},
  };
}

beforeEach(() => {
  installMemoryLocalStorage().setItem("pitfight_guided_mode_preference", "0");
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  // The board measures itself, and jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  FakeWebSocket.instances = [];
  // jsdom has no animations, so a closing panel has none to wait for.
  Element.prototype.getAnimations = (): Animation[] => [];
  cancelRequest.mockClear();
  auth.user = null;
  auth.loading = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  auth.user = null;
  auth.loading = false;
});

function draftWith(treasures: number): ReturnType<typeof gameBootstrap> {
  const bootstrap = gameBootstrap({
    phase: "draft",
    counts: { pack: 2, sideboard: 2 },
  });
  bootstrap.state.self_player.treasures = treasures;
  return bootstrap;
}

function draftsEnded(): number {
  return FakeWebSocket.latest().sent.filter((message) =>
    message.includes('"draft_done"'),
  ).length;
}

function pressEnter(
  target: HTMLElement = document.body,
  repeat = false,
): boolean {
  return fireEvent.keyDown(target, { key: "Enter", repeat });
}

function isBasicLandName(alt: string): boolean {
  return BASIC_LANDS.some(({ name }) => name === alt);
}

function shownLands(): string[] {
  return Array.from(
    find(
      '[data-guide-target="build-battlefield"]',
    ).querySelectorAll<HTMLImageElement>("img"),
  )
    .filter((image) => isBasicLandName(image.alt))
    .map((image) => image.alt);
}

function clickPlayerExile(): void {
  const container = find(
    '.battle-side-dropzone[data-zone="exile"][data-zone-owner="player"] > div',
  );
  fireEvent.click(container.querySelector("button") ?? container);
}

function battleMovesCount(): number {
  return FakeWebSocket.latest().sent.filter((message) =>
    message.includes('"battle_move"'),
  ).length;
}

function pressEscape(): boolean {
  return fireEvent.keyDown(document.body, { key: "Escape" });
}

function openActions(): boolean {
  return fireEvent.click(screen.getByRole("button", { name: "Actions" }));
}

function minimizeGuide(): boolean {
  return fireEvent.click(
    screen.getByRole("button", { name: "Minimize guide" }),
  );
}

function followControlsLink(): void {
  fireEvent.click(find('[data-guide-target="timeline-phase-draft"]'));
  fireEvent.click(screen.getByRole("button", { name: "Controls" }));
}

function guideOnScreen(): boolean {
  return screen.queryByRole("button", { name: "Minimize guide" }) !== null;
}

function minimizedOnScreen(): boolean {
  return screen.queryByRole("button", { name: "Open guide" }) !== null;
}

function pressGuideKey(): boolean {
  return fireEvent.keyDown(document.body, { key: "?" });
}

async function dragMoveTo(at: number): Promise<void> {
  await act(async () => {
    fireEvent.mouseMove(document, { clientX: at, clientY: at, buttons: 1 });
  });
}

async function receiveDraft(treasures: number): Promise<void> {
  await act(async () => {
    FakeWebSocket.latest().serverMessage({
      type: "game_bootstrap",
      payload: draftWith(treasures),
    });
  });
}

describe("Game: advancing with Enter", () => {
  beforeEach(() => {
    saveTabSession(GAME_ID, { sessionId: "session-1", playerId: "player-1" });
    vi.stubGlobal("innerWidth", 1280);
  });

  it("never ends Draft from Enter under an open panel, and gives Enter back when it closes", async () => {
    await openGame(draftWith(1));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));

    pressEnter();
    expect(draftsEnded()).toBe(0);

    const goToBuild = screen.getByRole("button", { name: "Go to Build" });
    goToBuild.focus();
    // False when the page took the key, so the browser won't press the outlined button.
    expect(pressEnter(goToBuild)).toBe(false);

    fireEvent.keyDown(goToBuild, { key: "Escape" });
    expect(pressEnter(goToBuild)).toBe(true);
    goToBuild.blur();
    pressEnter();
    expect(draftsEnded()).toBe(1);
  });

  it("doesn't end Draft from the Enter after the last Roll, or from holding it", async () => {
    await openGame(draftWith(1));
    await receiveDraft(0);

    pressEnter();
    pressEnter(document.body, true);
    expect(draftsEnded()).toBe(0);

    pressEnter();
    expect(draftsEnded()).toBe(1);
  });
});

describe("Game: submitting Build hand", () => {
  it("keeps Submit Hand disabled when another player updates before the server confirms it", async () => {
    saveTabSession("game-1", { sessionId: "session-1", playerId: "player-1" });
    renderGame("game-1");
    await settle();
    const socket = FakeWebSocket.latest();
    act(() => socket.serverOpen());
    act(() =>
      socket.serverMessage({
        type: "game_bootstrap",
        payload: { catalog: {}, state: buildState() },
      }),
    );

    fireEvent.click(
      await screen.findByText("Submit Hand", { selector: "button" }),
    );
    fireEvent.click(screen.getByText("Play", { selector: "button" }));
    act(() =>
      socket.serverMessage({
        type: "game_state",
        payload: buildState({ build_ready: true, poison: 8 }),
      }),
    );

    expect(
      screen.getByText<HTMLButtonElement>("Submitting...", {
        selector: "button",
      }).disabled,
    ).toBe(true);
    expect(
      socket.sent.filter((message) => message.includes('"build_ready"')),
    ).toHaveLength(1);
  });
});

describe("Game: leaving a game you watch", () => {
  beforeEach(() => {
    auth.user = { username: "Bob" };
  });

  it("takes a player who watched back to their seat after they go Home", async () => {
    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
    renderGame();
    await settle();
    act(() => FakeWebSocket.latest().serverOpen());
    expect(
      screen.getByText("Waiting for Alice's game to start..."),
    ).toBeTruthy();

    await act(async () => screen.getByRole("button", { name: "Home" }).click());
    await act(async () =>
      screen.getByRole("button", { name: "Open the game link" }).click(),
    );
    await settle();

    expect(
      await screen.findByRole("button", { name: "Reconnect" }),
    ).toBeTruthy();
    expect(readTabSpectate("game-1")).toBeNull();
  });

  it("withdraws a waiting request when the spectator leaves through Home", async () => {
    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: null,
    });
    renderGame();
    expect(await screen.findByText("Waiting for Alice")).toBeTruthy();

    await act(async () => screen.getByRole("button", { name: "Home" }).click());

    expect(cancelRequest).toHaveBeenCalledWith("game-1", "request-1");
    expect(
      screen.getByRole("button", { name: "Open the game link" }),
    ).toBeTruthy();
  });
});

describe("Game: watching a player build", () => {
  beforeEach(() => {
    auth.user = { username: "Bob" };
  });

  it("shows the player's lands as they change, whatever the spectator picks", async () => {
    const { catalog, state } = gameBootstrap({ phase: "build", counts: {} });
    const withLands = (chosen_basics: string[]): CompactGameState => ({
      ...state,
      self_player: { ...state.self_player, chosen_basics },
    });

    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
    renderGame();
    await settle();
    act(() => FakeWebSocket.latest().serverOpen());
    await act(async () => {
      FakeWebSocket.latest().serverMessage({
        type: "game_bootstrap",
        payload: { catalog, state: withLands(["Forest", "Island", "Plains"]) },
      });
    });

    fireEvent.click(screen.getByAltText("Forest"));
    fireEvent.click(screen.getByRole("button", { name: /Swamp/ }));
    expect(shownLands()).toEqual(["Forest", "Island", "Plains"]);

    await act(async () => {
      FakeWebSocket.latest().serverMessage({
        type: "game_state",
        payload: withLands(["Mountain", "Island", "Plains"]),
      });
    });
    expect(shownLands()).toEqual(["Mountain", "Island", "Plains"]);
  });

  it("opens Apply Upgrade only to look", async () => {
    // The window shows its cards once it has a height, and jsdom has none.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      makeDomRect({ width: 300, height: 20 }),
    );
    const { catalog, state } = gameBootstrap({
      phase: "build",
      counts: { hand: 1, upgrades: 1 },
    });
    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
    renderGame();
    await settle();
    act(() => FakeWebSocket.latest().serverOpen());
    await act(async () => {
      FakeWebSocket.latest().serverMessage({
        type: "game_bootstrap",
        payload: { catalog, state },
      });
    });

    fireEvent.click(find('button[aria-label^="Upgrade "]'));
    const modal = screen.getByText("Permanently").closest(".modal-chrome");
    if (!modal) throw new Error("expected .modal-chrome");
    const cards = modal.querySelectorAll<HTMLElement>(".card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.classList.contains("selected")).toBe(false);
      fireEvent.click(card);
      expect(card.classList.contains("selected")).toBe(false);
      const zoom = find("[data-card-preview-modal]");
      fireEvent.click(zoom);
    }
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});

describe("Game: watching a player's Round Wrap-Up", () => {
  beforeEach(() => {
    auth.user = { username: "Bob" };
  });

  it("enlarges an upgrade the spectator taps, and never selects it", async () => {
    const { catalog, state } = gameBootstrap({
      phase: "reward",
      counts: { upgrades: 2 },
    });
    const stageEnd = {
      ...state,
      available_upgrades: state.self_player.upgrades,
      self_player: {
        ...state.self_player,
        upgrades: [],
        is_stage_increasing: true,
      },
    };
    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
    renderGame();
    await settle();
    act(() => FakeWebSocket.latest().serverOpen());
    await act(async () => {
      FakeWebSocket.latest().serverMessage({
        type: "game_bootstrap",
        payload: { catalog, state: stageEnd },
      });
    });

    const upgrade = find('[data-guide-target="reward-upgrades"] .card');
    fireEvent.click(upgrade);
    expect(upgrade.classList.contains("selected")).toBe(false);
    expect(document.querySelector("[data-card-preview-modal]")).not.toBeNull();
  });
});

describe("Game: opening a game link", () => {
  it("waits for the login check before it decides whether the visitor has a seat", async () => {
    auth.loading = true;
    renderGame();
    await settle();

    expect(screen.queryByText("Watch a game")).toBeNull();
    expect(screen.getByText("Loading game...")).toBeTruthy();
  });

  it("shows player-facing state names in Watch a game", async () => {
    auth.user = { username: "Bob" };
    fetchGameStatus.mockResolvedValueOnce({
      game_id: "game-1",
      phase: "mixed",
      is_started: true,
      auto_approve_spectators: false,
      players: [
        { name: "Ada", is_connected: true, is_puppet: false, phase: "lobby" },
        {
          name: "Bea",
          is_connected: true,
          is_puppet: false,
          phase: "awaiting_elimination",
        },
        {
          name: "Cal",
          is_connected: false,
          is_puppet: false,
          phase: "eliminated",
        },
        { name: "Dee", is_connected: true, is_puppet: false, phase: "winner" },
        {
          name: "Eli",
          is_connected: false,
          is_puppet: false,
          phase: "game_over",
        },
        { name: "Fay", is_connected: true, is_puppet: false, phase: "battle" },
      ],
    });
    renderGame();
    await settle();

    for (const label of [
      "(Lobby)",
      "(Waiting)",
      "(Out)",
      "(Winner)",
      "(Game Over)",
      "(Fight)",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe("Game: what is open over the board", () => {
  beforeEach(() => {
    saveTabSession(GAME_ID, { sessionId: "session-1", playerId: "player-1" });
    vi.stubGlobal("innerWidth", 390);
  });

  it("forgets a card selected in a panel once the panel is gone, and still moves it from the panel or Actions", async () => {
    const bootstrap = gameBootstrap({
      phase: "battle",
      counts: { hand: 2, lands: 1 },
    });
    const battle = bootstrap.state.current_battle;
    if (!battle) throw new Error("expected current_battle");
    const zones = battle.your_zones;
    zones.sideboard = [{ ...zones.hand[0], id: "sideboard-card" }];
    await openGame(bootstrap);

    const selectInSideboard = (): void => {
      fireEvent.keyDown(document.body, { key: "s" });
      fireEvent.click(find('[data-guide-card-id="sideboard-card"]'));
    };
    const tapFelt = (): boolean =>
      fireEvent.click(
        find('[data-zone="battlefield"][data-zone-owner="player"]'),
      );

    const ways: Record<string, () => void> = {
      "×": (): void => {
        fireEvent.click(
          screen.getByRole("button", { name: "Close Your Sideboard" }),
        );
      },
      Escape: (): void => {
        pressEscape();
      },
      "its key": (): void => {
        fireEvent.keyDown(document.body, { key: "s" });
      },
      "the Guide": (): void => {
        fireEvent.click(find('[data-guide-target="guide-button"]'));
        pressEscape();
      },
      "Submit Result": (): void => {
        fireEvent.click(screen.getByRole("button", { name: "Submit Result" }));
        pressEscape();
      },
      "another pile's key": (): void => {
        fireEvent.keyDown(document.body, { key: "e" });
        pressEscape();
      },
      "Actions, dismissed": (): void => {
        openActions();
        pressEscape();
      },
      "☰": (): void => {
        fireEvent.click(find('[data-guide-target="sidebar-toggle"]'));
      },
    };
    const movedAfter: string[] = [];
    for (const [how, leavePanel] of Object.entries(ways)) {
      selectInSideboard();
      leavePanel();
      const before = battleMovesCount();
      tapFelt();
      if (battleMovesCount() > before) movedAfter.push(how);
    }
    expect(movedAfter).toEqual([]);

    selectInSideboard();
    tapFelt();
    expect(battleMovesCount()).toBe(1);

    // The card is out of sight in Actions, and still the one Move To moves.
    fireEvent.click(find('[data-guide-card-id="sideboard-card"]'));
    openActions();
    fireEvent.click(screen.getByRole("button", { name: /^Move To/ }));
    fireEvent.click(find(".menu-submenu button"));
    expect(battleMovesCount()).toBe(2);
  });

  it("forgets a selected card once it is dragged to another zone", async () => {
    // jsdom lays nothing out, so the graveyard gets a place of its own to be dropped on.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const at = this.matches(
          '[data-zone="graveyard"][data-zone-owner="player"]',
        )
          ? 200
          : 0;
        return makeDomRect({ x: at, y: at, width: 50, height: 50 });
      },
    );
    await openGame(gameBootstrap({ phase: "battle", counts: { lands: 1 } }));
    const land = find('[data-guide-card-id="your-land-0"]');
    fireEvent.click(land);

    fireEvent.mouseDown(land, { clientX: 10, clientY: 10, button: 0 });
    await dragMoveTo(30);
    await dragMoveTo(220);
    await dragMoveTo(225);
    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 225, clientY: 225 });
      // A drag swallows clicks for 50ms after it ends.
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    clickPlayerExile();

    const moves = FakeWebSocket.latest().sent.filter((message) =>
      message.includes('"battle_move"'),
    );
    expect(moves.map((message) => JSON.parse(message).payload.to_zone)).toEqual(
      ["graveyard"],
    );
  });

  it("leaves a minimized Guide and its place alone while Players and Scouting open and close", async () => {
    vi.stubGlobal("innerWidth", 768);
    await openGame(
      gameBootstrap({ phase: "build", counts: { hand: 2, sideboard: 2 } }),
    );
    fireEvent.click(find('[data-guide-target="guide-button"]'));
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));

    fireEvent.click(find('[data-guide-target="sidebar-toggle"]'));
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    expect(screen.getByRole("button", { name: "Open guide" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector(".side-panel--open")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open guide" }));
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("closes a card menu on Escape and leaves the minimized Guide", async () => {
    vi.stubGlobal("innerWidth", 768);
    await openGame(gameBootstrap({ phase: "battle", counts: { lands: 1 } }));
    fireEvent.click(find('[data-guide-target="guide-button"]'));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));
    fireEvent.contextMenu(find('[data-guide-card-id="your-land-0"]'));

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open guide" })).toBeTruthy();
  });

  it("leaves a minimized Guide and its place alone while Actions or a pile opens and closes", async () => {
    vi.stubGlobal("innerWidth", 768);
    await openGame(gameBootstrap({ phase: "battle", counts: { lands: 1 } }));
    fireEvent.click(find('[data-guide-target="guide-button"]'));
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("button", { name: "Open guide" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Pass Turn" })).toBeNull();

    clickPlayerExile();
    expect(screen.getByRole("button", { name: "Open guide" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector(".side-panel--open")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open guide" }));
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("opens a minimized Guide from its button and links, and after it was closed minimized", async () => {
    vi.stubGlobal("innerWidth", 1280);
    await openGame(
      gameBootstrap({ phase: "draft", counts: { pack: 2, sideboard: 2 } }),
    );
    const guideButton = find('[data-guide-target="guide-button"]');
    fireEvent.click(guideButton);
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));

    minimizeGuide();
    fireEvent.click(guideButton);
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");

    minimizeGuide();
    fireEvent.click(find('[data-guide-target="timeline-phase-draft"]'));
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    expect(
      screen
        .getByRole("radio", { name: "Controls" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    minimizeGuide();
    fireEvent.click(screen.getByRole("button", { name: "Close guide" }));
    await vi.waitFor(() =>
      expect(document.querySelector(".floating-window")).toBeNull(),
    );
    fireEvent.click(guideButton);
    expect(screen.getByRole("button", { name: "Minimize guide" })).toBeTruthy();
  });

  it("goes back to a link's page when the same link is taken again", async () => {
    vi.stubGlobal("innerWidth", 1280);
    await openGame(
      gameBootstrap({ phase: "draft", counts: { pack: 2, sideboard: 2 } }),
    );
    followControlsLink();
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));

    followControlsLink();
    expect(
      screen
        .getByRole("radio", { name: "Controls" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("brings an open Guide back where it was after Players and Scouting, which hide it", async () => {
    await openGame(
      gameBootstrap({ phase: "build", counts: { hand: 2, sideboard: 2 } }),
    );
    fireEvent.click(find('[data-guide-target="guide-button"]'));
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));

    fireEvent.click(find('[data-guide-target="sidebar-toggle"]'));
    expect(guideOnScreen()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));
    expect(guideOnScreen()).toBe(false);
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(guideOnScreen()).toBe(true);
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("brings a minimized Guide back after backing out of Submit Result, and not after submitting", async () => {
    vi.stubGlobal("innerWidth", 768);
    await openGame(gameBootstrap({ phase: "battle", counts: { lands: 1 } }));
    fireEvent.click(find('[data-guide-target="guide-button"]'));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));

    fireEvent.click(screen.getByRole("button", { name: "Submit Result" }));
    expect(minimizedOnScreen()).toBe(false);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(minimizedOnScreen()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Submit Result" }));
    fireEvent.click(screen.getByRole("button", { name: "I Lost" }));
    expect(minimizedOnScreen()).toBe(false);
  });

  it("restores a minimized Guide with ?, at the place it was left", async () => {
    await openGame(
      gameBootstrap({ phase: "build", counts: { hand: 2, sideboard: 2 } }),
    );
    pressGuideKey();
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));

    pressGuideKey();
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Minimize guide" }),
    ).not.toBeNull();

    pressGuideKey();
    expect(document.querySelector(".floating-window")).toBeNull();
  });

  it("leaves a phone only the Guide button when minimized, which opens it where it was", async () => {
    await openGame(
      gameBootstrap({ phase: "build", counts: { hand: 2, sideboard: 2 } }),
    );
    const guideButton = find('[data-guide-target="guide-button"]');
    fireEvent.click(guideButton);
    fireEvent.click(screen.getByRole("radio", { name: "FAQ" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize guide" }));
    expect(screen.queryByRole("button", { name: "Open guide" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close guide" })).toBeNull();

    fireEvent.click(guideButton);
    expect(
      screen.getByRole("radio", { name: "FAQ" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("disables Fight sidebar and mobile life controls while spectating and emits no WS actions", async () => {
    auth.user = { username: "Bob" };
    const { catalog, state } = gameBootstrap({ phase: "battle", counts: {} });
    const activeBattle = state.current_battle
      ? { ...state.current_battle, current_turn_name: state.self_player.name }
      : null;

    const assertDisabledForViewport = async (
      width: number,
      labels: string[],
    ): Promise<void> => {
      vi.stubGlobal("innerWidth", width);
      saveTabSpectate("game-1", {
        target: "Alice",
        requestId: "request-1",
        sessionId: "spectator-session",
      });
      renderGame();
      await settle();
      act(() => FakeWebSocket.latest().serverOpen());
      await act(async () => {
        FakeWebSocket.latest().serverMessage({
          type: "game_bootstrap",
          payload: {
            catalog,
            state: { ...state, current_battle: activeBattle },
          },
        });
      });

      const sentBefore = FakeWebSocket.latest().sent.length;
      for (const label of labels) {
        const buttons = screen.getAllByRole<HTMLButtonElement>("button", {
          name: label,
        });
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
          expect(button.disabled).toBe(true);
          fireEvent.click(button);
        }
      }
      expect(FakeWebSocket.latest().sent.length).toBe(sentBefore);
      cleanup();
    };

    await assertDisabledForViewport(1280, [
      "Treasure",
      "Untap",
      "Pass",
      "-",
      "+",
    ]);
    await assertDisabledForViewport(600, ["-", "+"]);
  });
});

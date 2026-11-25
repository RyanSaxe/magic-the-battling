// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "../test/fakeWebSocket";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import type { LobbyState } from "../types";
import { readTabSession, saveTabSession } from "../utils/tabSession";
import { Lobby } from "./Lobby";

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

const toasts: string[] = [];
const closeSeat = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../api/client", () => ({
  rejoinGame: vi.fn(),
  closeSeat,
  getServerStatus: vi.fn(async () => null),
  getCubeSummary: vi.fn(async () => ({
    cube_name: "Crucible",
    cube_image_uri: null,
  })),
}));
vi.mock("../contexts", () => ({
  useToast: (): { addToast: (message: string) => number } => ({
    addToast: (message: string): number => toasts.push(message),
  }),
}));
vi.mock("../contexts/authState", () => ({
  useAuth: (): { user: null; loading: boolean } => ({
    user: null,
    loading: false,
  }),
}));

function lobby(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    game_id: "game-1",
    join_code: "ABC123",
    cube_id: "auto",
    players: [
      {
        player_id: "host",
        name: "Anya",
        is_ready: true,
        is_host: true,
        is_connected: true,
        battler_id: null,
        battler_status: null,
        battler_error: null,
      },
      {
        player_id: "guest",
        name: "Boris",
        is_ready: true,
        is_host: false,
        is_connected: true,
        battler_id: null,
        battler_status: null,
        battler_error: null,
      },
    ],
    can_start: true,
    is_started: false,
    start_status: "open",
    start_error: null,
    target_player_count: 2,
    puppet_count: 0,
    cube_loading_status: "ready",
    cube_loading_error: null,
    available_puppet_count: 0,
    use_upgrades: true,
    guided_mode_default: false,
    voice_chat_enabled: false,
    auto_approve_spectators: false,
    previous_host_id: null,
    play_mode: "limited",
    ...overrides,
  };
}

async function openLobbyAs(playerId: string): Promise<FakeWebSocket> {
  saveTabSession("game-1", { sessionId: `session-${playerId}`, playerId });
  render(
    <MemoryRouter initialEntries={["/game/game-1/lobby"]}>
      <Routes>
        <Route path="/game/:gameId/lobby" element={<Lobby />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const socket = FakeWebSocket.latest();
  act(() => socket.serverOpen());
  return socket;
}

function send(socket: FakeWebSocket, message: unknown): void {
  act(() => socket.serverMessage(message));
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function pressBodyKey(key: string): boolean {
  return fireEvent.keyDown(document.body, { key });
}

function sentActions(socket: FakeWebSocket): string[] {
  return socket.sent.map((data) => JSON.parse(data).action);
}

describe("Lobby: starting the game", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    toasts.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("gives the host the Start button back when the server refuses the start", async () => {
    const socket = await openLobbyAs("host");
    send(socket, { type: "lobby_state", payload: lobby() });

    act(() => button("Start Game").click());
    expect(sentActions(socket)).toContain("start_game");
    send(socket, {
      type: "error",
      payload: {
        code: "USER_MESSAGE",
        detail: "Not all players are ready",
        message: "Not all players are ready",
      },
    });

    expect(toasts).toEqual(["Not all players are ready"]);
    expect(button("Start Game").disabled).toBe(false);
  });

  it("shows guests that the game is starting, and keeps them from changing the lobby meanwhile", async () => {
    const socket = await openLobbyAs("guest");
    send(socket, {
      type: "lobby_state",
      payload: lobby({ start_status: "starting", can_start: false }),
    });

    expect(
      screen.getByRole("heading", { name: "Setting the table" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^(Ready|Unready)$/ }),
    ).toBeNull();
    act(
      () =>
        void document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "r", bubbles: true }),
        ),
    );
    expect(sentActions(socket)).not.toContain("set_ready");
  });

  it("tells everyone why a start failed and lets the host start again", async () => {
    const socket = await openLobbyAs("host");
    send(socket, { type: "lobby_state", payload: lobby() });

    act(() => {
      socket.serverMessage({
        type: "lobby_state",
        payload: lobby({ start_status: "starting", can_start: false }),
      });
      socket.serverMessage({
        type: "lobby_state",
        payload: lobby({
          start_status: "failed",
          start_error: "Server is at game capacity. Please try again shortly.",
        }),
      });
    });

    expect(toasts).toEqual([
      "Server is at game capacity. Please try again shortly.",
    ]);
    expect(button("Start Game").disabled).toBe(false);
  });
});

describe("Lobby: a refused deck", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("doesn't head the lobby as if it had loaded", async () => {
    const socket = await openLobbyAs("host");
    const [host, guest] = lobby().players;
    const refused = {
      ...host,
      is_ready: false,
      battler_id: "banned-deck",
      battler_status: "error" as const,
      battler_error: "A card is banned.",
    };
    send(socket, {
      type: "lobby_state",
      payload: lobby({
        play_mode: "constructed",
        can_start: false,
        players: [refused, guest],
      }),
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByRole("heading", { name: "No deck yet" })).toBeTruthy();
  });
});

describe("Lobby: hotkeys beside the Guide", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("work while the Guide is minimized, and wait while it is open", async () => {
    const socket = await openLobbyAs("guest");
    send(socket, { type: "lobby_state", payload: lobby() });
    const readyToggles = (): number =>
      sentActions(socket).filter((action) => action === "set_ready").length;

    pressBodyKey("?");
    pressBodyKey("r");
    expect(readyToggles()).toBe(0);

    fireEvent.click(button("Minimize guide"));
    pressBodyKey("r");
    expect(readyToggles()).toBe(1);

    fireEvent.click(button("Open guide"));
    pressBodyKey("r");
    expect(readyToggles()).toBe(1);

    fireEvent.click(button("Minimize guide"));
    pressBodyKey("?");
    expect(
      screen.queryByRole("button", { name: "Minimize guide" }),
    ).not.toBeNull();

    pressBodyKey("?");
    expect(screen.queryByRole("button", { name: "Minimize guide" })).toBeNull();
  });
});

describe("Lobby: inviting", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("copies the link to join this lobby", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const socket = await openLobbyAs("host");
    send(socket, { type: "lobby_state", payload: lobby() });

    await act(async () => fireEvent.click(button("Copy")));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/game/game-1/lobby`,
    );
    expect(button("Copied!")).toBeTruthy();
  });
});

describe("Lobby: the host, a seat and a deck", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    toasts.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tells the new host who is away, and the old host after a reload", async () => {
    const [anya, boris] = lobby().players;
    const players = [
      { ...anya, is_host: false, is_connected: false },
      { ...boris, is_host: true },
    ];
    const newHost = await openLobbyAs("guest");
    send(newHost, { type: "lobby_state", payload: lobby() });
    send(newHost, {
      type: "lobby_state",
      payload: lobby({ previous_host_id: "host", players }),
    });
    expect(screen.getByText("You're the host now. Anya is away.")).toBeTruthy();
    expect(toasts).toEqual([]);

    cleanup();
    const oldHost = await openLobbyAs("host");
    send(oldHost, {
      type: "lobby_state",
      payload: lobby({ previous_host_id: "host", players }),
    });
    expect(
      screen.getByText("You were away, so Boris is the host now."),
    ).toBeTruthy();
  });

  it("asks before removing a player, with the shortcuts off meanwhile", async () => {
    const socket = await openLobbyAs("host");
    send(socket, { type: "lobby_state", payload: lobby() });

    fireEvent.click(button("Remove Boris"));
    fireEvent.keyDown(document.body, { key: "r" });
    expect(sentActions(socket)).not.toContain("kick_player");
    expect(sentActions(socket)).not.toContain("set_ready");

    fireEvent.click(button("Remove"));
    expect(sentActions(socket)).toContain("kick_player");
  });

  it("keeps the deck and Ready until another deck is submitted", async () => {
    const [anya, boris] = lobby().players;
    const socket = await openLobbyAs("host");
    const players = [
      { ...anya, battler_id: "first-deck", battler_status: "ready" as const },
      boris,
    ];
    send(socket, {
      type: "lobby_state",
      payload: lobby({ play_mode: "constructed", players }),
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(button("Change"));
    const field = screen.getByDisplayValue("first-deck");
    expect(button("Submit").disabled).toBe(true);
    expect(button("Unready")).toBeTruthy();
    expect(sentActions(socket)).not.toContain("clear_battler");

    fireEvent.change(field, { target: { value: "second-deck" } });
    fireEvent.click(button("Submit"));
    expect(sentActions(socket)).toContain("submit_battler");
  });

  it("lets the host leave the lobby through the close dialog and returns Home", async () => {
    closeSeat.mockClear();
    const socket = await openLobbyAs("host");
    send(socket, { type: "lobby_state", payload: lobby() });

    fireEvent.click(screen.getByRole("button", { name: /Leave/ }));
    const dialog = screen.getByRole("dialog", { name: "Leave this lobby?" });
    fireEvent.keyDown(document.body, { key: "r" });
    expect(sentActions(socket)).not.toContain("set_ready");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Leave Lobby" }),
    );
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(closeSeat).toHaveBeenCalledWith("game-1", "Anya", "");
    expect(readTabSession("game-1")).toBeNull();
  });
});

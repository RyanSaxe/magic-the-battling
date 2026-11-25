// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameBootstrap } from "../../e2e/gameStates";
import { closeSeat, createGame } from "../api/client";
import { UPGRADES_HELP } from "../constants/rules";
import { FakeWebSocket } from "../test/fakeWebSocket";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import { getRememberedSeat } from "../utils/deviceIdentity";
import { Play } from "./Play";

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
let gamesCreated = 0;

vi.mock("../api/client", () => ({
  createGame: vi.fn(async () => {
    gamesCreated += 1;
    return {
      game_id: `game-${gamesCreated}`,
      join_code: "ABC123",
      session_id: `session-${gamesCreated}`,
      player_id: `player-${gamesCreated}`,
      seat_token: `token-${gamesCreated}`,
    };
  }),
  warmCubeCache: vi.fn(),
  closeSeat: vi.fn(async () => {}),
  getResumableGames: vi.fn(async () => []),
  getCubeSummary: vi.fn(async () => ({
    cube_name: "Pitfight",
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
vi.mock("../utils/prefetchName", () => ({
  getLegendaryName: async (): Promise<string> => "Tester",
  prefetchLegendaryName: (): void => {},
}));

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function renderPlay(): Promise<void> {
  render(
    <MemoryRouter>
      <Play />
    </MemoryRouter>,
  );
  await settle();
}

async function startGoldfishUntilTheStartIsSent(): Promise<{
  socket: FakeWebSocket;
  lobby: Record<string, unknown>;
}> {
  await renderPlay();
  await act(async () =>
    screen.getByRole("button", { name: "Start Game" }).click(),
  );
  await settle();
  const socket = FakeWebSocket.latest();
  const lobby = {
    game_id: "game-1",
    join_code: "ABC123",
    cube_id: "auto",
    players: [
      {
        player_id: "player-1",
        name: "Tester",
        is_ready: false,
        is_host: true,
        is_connected: true,
      },
    ],
    can_start: false,
    is_started: false,
    start_status: "open",
    start_error: null,
    target_player_count: 8,
    puppet_count: 7,
    cube_loading_status: "ready",
    cube_loading_error: null,
    available_puppet_count: 7,
    play_mode: "limited",
  };
  act(() => {
    socket.serverOpen();
    socket.serverMessage({ type: "lobby_state", payload: lobby });
  });
  await settle();
  act(() =>
    socket.serverMessage({
      type: "lobby_state",
      payload: { ...lobby, can_start: true },
    }),
  );
  await settle();
  expect(socket.sent.map((data) => JSON.parse(data).action)).toContain(
    "start_game",
  );
  return { socket, lobby };
}

beforeEach(() => {
  installMemoryLocalStorage();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.instances = [];
  toasts.length = 0;
  gamesCreated = 0;
  vi.mocked(closeSeat).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Play: cancelling or leaving a pending start", () => {
  it.each([
    ["a Goldfish game", null, "Start Game"],
    ["a lobby", "Play with Friends", "Create Lobby"],
  ])(
    "drops %s that the server answers after Cancel",
    async (_, mode, start) => {
      let answer!: (game: Awaited<ReturnType<typeof createGame>>) => void;
      vi.mocked(createGame).mockReturnValueOnce(
        new Promise((resolve) => (answer = resolve)),
      );
      await renderPlay();
      if (mode) fireEvent.click(screen.getByText(mode));
      fireEvent.click(screen.getByRole("button", { name: start }));

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await act(async () =>
        answer({
          game_id: "late",
          join_code: "ABC123",
          session_id: "s",
          player_id: "p",
          seat_token: "t",
        }),
      );
      await settle();

      expect(getRememberedSeat("late")).toBeNull();
      expect(FakeWebSocket.instances).toHaveLength(0);
    },
  );

  const { catalog, state } = gameBootstrap({ phase: "build", counts: {} });

  it.each([
    {
      name: "Goldfish",
      mode: null,
      start: "Start Game",
      completed: {
        type: "game_bootstrap",
        payload: { catalog, state: { ...state, game_id: "game" } },
      },
    },
    {
      name: "Play with Friends",
      mode: "Play with Friends",
      start: "Create Lobby",
      completed: {
        type: "lobby_state",
        payload: { game_id: "game", players: [], cube_loading_status: "ready" },
      },
    },
  ])(
    "$name gives up a start left by Home, and keeps one that completes",
    async ({ mode, start, completed }) => {
      const startFromPlay = async (): Promise<void> => {
        vi.mocked(createGame).mockResolvedValueOnce({
          game_id: "game",
          join_code: "ABC123",
          session_id: "s",
          player_id: "p",
          seat_token: "t",
        });
        render(
          <MemoryRouter initialEntries={["/play"]}>
            <Routes>
              <Route path="/play" element={<Play />} />
              <Route path="*" element={<p>Left Play</p>} />
            </Routes>
          </MemoryRouter>,
        );
        await settle();
        if (mode) fireEvent.click(screen.getByText(mode));
        await act(async () =>
          screen.getByRole("button", { name: start }).click(),
        );
        await settle();
        act(() => FakeWebSocket.latest().serverOpen());
      };

      await startFromPlay();
      act(() => FakeWebSocket.latest().serverMessage(completed));
      await settle();
      expect(screen.getByText("Left Play")).toBeTruthy();
      expect(closeSeat).not.toHaveBeenCalled();
      cleanup();

      await startFromPlay();
      fireEvent.click(screen.getByRole("button", { name: "Home" }));
      await settle();

      expect(screen.getByText("Left Play")).toBeTruthy();
      expect(closeSeat).toHaveBeenCalledWith("game", expect.any(String), "t");
      expect(getRememberedSeat("game")).toBeNull();
    },
  );
});

describe("Play: setup info tooltips", () => {
  it("takes the whole tap that closes the Guided Mode note, so it never presses Start Game", async () => {
    await renderPlay();
    const info = screen.getByRole("button", { name: "What guided mode does" });
    fireEvent.click(info);

    const tapTarget = document.querySelector(".board-backdrop");
    if (!tapTarget) throw new Error("expected .board-backdrop");
    fireEvent.pointerDown(tapTarget);
    expect(info.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(tapTarget);
    expect(info.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the Upgrades tip in Play settings without toggling the switch", async () => {
    await renderPlay();
    fireEvent.click(screen.getByRole("button", { name: "Change settings" }));

    const toggle = screen.getByRole<HTMLInputElement>("switch", {
      name: "Upgrades",
    });
    expect(toggle.checked).toBe(true);

    const info = screen.getByRole("button", { name: "What upgrades are" });
    fireEvent.click(info);

    expect(toggle.checked).toBe(true);
    expect(screen.getByRole("tooltip").textContent).toBe(UPGRADES_HELP);

    fireEvent.click(screen.getByText("Upgrades"));
    expect(toggle.checked).toBe(false);
  });
});

describe("Play: starting a Goldfish game", () => {
  it("starts Goldfish once on Enter in the name field", async () => {
    await renderPlay();
    const name = screen.getByPlaceholderText("Enter your name");

    await act(async () => {
      fireEvent.keyDown(name, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.keyDown(name, { key: "Enter" });
    });

    expect(gamesCreated).toBe(1);
    expect(createGame).toHaveBeenLastCalledWith(
      "Tester",
      expect.objectContaining({ puppetCount: 3 }),
    );
  });

  it("lets the player start again after a failed start", async () => {
    await renderPlay();

    await act(async () =>
      screen.getByRole("button", { name: "Start Game" }).click(),
    );
    await settle();
    const firstSocket = FakeWebSocket.latest();
    act(() => {
      firstSocket.serverOpen();
      firstSocket.serverMessage({
        type: "connection_error",
        payload: { code: "WS_CAPACITY", message: "busy" },
      });
      firstSocket.serverClose(1013);
    });
    await settle();
    expect(toasts).toHaveLength(1);

    await act(async () =>
      screen.getByRole("button", { name: "Start Game" }).click(),
    );
    await settle();
    const secondSocket = FakeWebSocket.latest();

    expect(secondSocket).not.toBe(firstSocket);
    expect(secondSocket.url).toContain("/ws/game-2");
    expect(secondSocket.readyState).not.toBe(FakeWebSocket.CLOSED);
    expect(toasts).toHaveLength(1);
  });

  it("comes back to Start Game with the reason when the game fails to start", async () => {
    const { socket, lobby } = await startGoldfishUntilTheStartIsSent();

    act(() => {
      socket.serverMessage({
        type: "lobby_state",
        payload: { ...lobby, start_status: "starting" },
      });
      socket.serverMessage({
        type: "lobby_state",
        payload: {
          ...lobby,
          can_start: true,
          start_status: "failed",
          start_error: "Server is at game capacity.",
        },
      });
    });
    await settle();

    expect(toasts).toEqual(["Server is at game capacity."]);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeTruthy();
    expect(getRememberedSeat("game-1")).toBeNull();
  });

  it("comes back to Start Game with the reason when the server refuses the start", async () => {
    const { socket } = await startGoldfishUntilTheStartIsSent();

    act(() => {
      socket.serverMessage({
        type: "error",
        payload: {
          code: "SERVER_UPDATING",
          detail: "Server is updating.",
          message: "Server is updating.",
        },
      });
    });
    await settle();

    expect(toasts).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeTruthy();
    expect(getRememberedSeat("game-1")).toBeNull();
  });

  it("fills in the name a guest last played under", async () => {
    await renderPlay();
    fireEvent.change(screen.getByPlaceholderText("Enter your name"), {
      target: { value: "Kellogg" },
    });
    await act(async () =>
      screen.getByRole("button", { name: "Start Game" }).click(),
    );
    cleanup();

    await renderPlay();

    expect(
      screen.getByPlaceholderText<HTMLInputElement>("Enter your name").value,
    ).toBe("Kellogg");
  });

  it("does not offer a failed start for resuming", async () => {
    await renderPlay();

    await act(async () =>
      screen.getByRole("button", { name: "Start Game" }).click(),
    );
    await settle();
    expect(getRememberedSeat("game-1")).not.toBeNull();
    const socket = FakeWebSocket.latest();
    act(() => {
      socket.serverOpen();
      socket.serverMessage({
        type: "connection_error",
        payload: { code: "WS_CAPACITY", message: "busy" },
      });
      socket.serverClose(1013);
    });
    await settle();

    expect(getRememberedSeat("game-1")).toBeNull();
  });

  it("starts with the fewer opponents picked when puppet data is short", async () => {
    await renderPlay();
    const serveLobby = async (
      gameId: string,
      puppetCount: number,
    ): Promise<FakeWebSocket> => {
      const socket = FakeWebSocket.latest();
      act(() => {
        socket.serverOpen();
        socket.serverMessage({
          type: "lobby_state",
          payload: {
            game_id: gameId,
            players: [],
            can_start: false,
            start_status: "open",
            start_error: null,
            cube_loading_status: "ready",
            cube_loading_error: null,
            puppet_count: puppetCount,
            available_puppet_count: 1,
          },
        });
      });
      await settle();
      return socket;
    };

    await act(async () =>
      screen.getByRole("button", { name: "Start Game" }).click(),
    );
    await settle();
    await serveLobby("game-1", 3);
    await act(async () => screen.getByRole("button", { name: "1" }).click());
    await act(async () =>
      screen.getByRole("button", { name: "Start" }).click(),
    );
    await settle();
    const socket = await serveLobby("game-2", 1);

    expect(screen.queryByText("Not enough puppet data")).toBeNull();
    expect(socket.sent.map((data) => JSON.parse(data).action)).toContain(
      "set_ready",
    );
  });

  it("gives up the seat of a failed start, and keeps one that moved", async () => {
    await renderPlay();
    const start = async (): Promise<FakeWebSocket> => {
      await act(async () =>
        screen.getByRole("button", { name: "Start Game" }).click(),
      );
      await settle();
      const socket = FakeWebSocket.latest();
      act(() => socket.serverOpen());
      return socket;
    };

    const failed = await start();
    act(() =>
      failed.serverMessage({
        type: "lobby_state",
        payload: {
          game_id: "game-1",
          players: [],
          cube_loading_status: "error",
          cube_loading_error: "A card is banned.",
        },
      }),
    );
    await settle();
    expect(closeSeat).toHaveBeenCalledWith("game-1", "Tester", "token-1");
    expect(getRememberedSeat("game-1")).toBeNull();

    const moved = await start();
    act(() => moved.serverClose(4006));
    await settle();
    expect(closeSeat).toHaveBeenCalledOnce();
    expect(getRememberedSeat("game-2")?.seatToken).toBe("token-2");
  });
});

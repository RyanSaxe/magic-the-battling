// @vitest-environment jsdom
import { act, renderHook, type RenderHookResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "../test/fakeWebSocket";
import { connectAfterCurrentTask, useWebSocket } from "./useWebSocket";

function renderSocket(
  gameId: string,
  sessionId: string,
): RenderHookResult<
  ReturnType<typeof useWebSocket>,
  { game: string; session: string }
> {
  return renderHook(
    ({ game, session }) =>
      useWebSocket({ gameId: game, sessionId: session, spectatorConfig: null }),
    {
      initialProps: { game: gameId, session: sessionId },
    },
  );
}

async function openSocket(): Promise<FakeWebSocket> {
  await act(async () => {
    vi.advanceTimersByTime(0);
  });
  const socket = FakeWebSocket.latest();
  act(() => socket.serverOpen());
  return socket;
}

describe("connectAfterCurrentTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects once the current task ends", () => {
    const connect = vi.fn();
    connectAfterCurrentTask(connect);

    expect(connect).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(connect).toHaveBeenCalledOnce();
  });

  it("opens only the remounted connection when StrictMode cleans up the first mount", () => {
    const firstMount = vi.fn();
    const secondMount = vi.fn();

    const cleanupFirstMount = connectAfterCurrentTask(firstMount);
    cleanupFirstMount();
    connectAfterCurrentTask(secondMount);
    vi.runAllTimers();

    expect(firstMount).not.toHaveBeenCalled();
    expect(secondMount).toHaveBeenCalledOnce();
  });
});

describe("useWebSocket connection status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts a new game clean, without the previous game error or lobby", async () => {
    const hook = renderSocket("game-A", "session-A");
    const socket = await openSocket();
    act(() => {
      socket.serverMessage({
        type: "lobby_state",
        payload: { game_id: "game-A", players: [] },
      });
      socket.serverMessage({
        type: "connection_error",
        payload: { code: "GAME_NOT_FOUND", message: "Game not found" },
      });
      socket.serverClose(4004, "Game not found");
    });
    expect(hook.result.current.connectionError?.code).toBe("GAME_NOT_FOUND");

    hook.rerender({ game: "game-B", session: "session-B" });

    expect(hook.result.current.status.kind).toBe("connecting");
    expect(hook.result.current.connectionError).toBeNull();
    expect(hook.result.current.lobbyState).toBeNull();
  });

  it.each([1000, 1001, 1006, 1011])(
    "reconnects after close code %i",
    async (closeCode) => {
      const hook = renderSocket("game-A", "session-A");
      const socket = await openSocket();

      act(() => socket.serverClose(closeCode));
      expect(hook.result.current.status.kind).toBe("reconnecting");
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });

      expect(FakeWebSocket.instances).toHaveLength(2);
    },
  );

  it.each([
    [1013, "WS_CAPACITY"],
    [4001, "INVALID_SESSION"],
    [4004, "GAME_NOT_FOUND"],
    [4005, "KICKED"],
    [4006, "SEAT_MOVED"],
    [4007, "SPECTATE_TARGET_NOT_FOUND"],
  ])("stops for good on close code %i", async (closeCode, errorCode) => {
    const hook = renderSocket("game-A", "session-A");
    const socket = await openSocket();

    act(() => socket.serverClose(closeCode));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(hook.result.current.status).toMatchObject({
      kind: "ended",
      error: { code: errorCode },
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("ends when the host removes the player, before the socket closes", async () => {
    const hook = renderSocket("game-A", "session-A");
    const socket = await openSocket();

    act(() => socket.serverMessage({ type: "kicked", payload: {} }));

    expect(hook.result.current.status).toMatchObject({
      kind: "ended",
      error: { code: "KICKED" },
    });
  });

  it("shows the requests to watch exactly as the server last listed them", async () => {
    const hook = renderSocket("game-A", "session-A");
    const socket = await openSocket();
    const carol = { request_id: "request-1", spectator_name: "Carol" };
    const dan = { request_id: "request-2", spectator_name: "Dan" };

    act(() =>
      socket.serverMessage({
        type: "spectate_requests",
        payload: { requests: [carol, dan] },
      }),
    );
    expect(hook.result.current.spectateRequests).toEqual([carol, dan]);

    act(() =>
      socket.serverMessage({
        type: "spectate_requests",
        payload: { requests: [carol] },
      }),
    );
    expect(hook.result.current.spectateRequests).toEqual([carol]);
  });

  it("starts each connection with no requests to watch", async () => {
    const hook = renderSocket("game-A", "session-A");
    const socket = await openSocket();
    act(() => {
      socket.serverMessage({
        type: "spectate_requests",
        payload: {
          requests: [{ request_id: "request-1", spectator_name: "Carol" }],
        },
      });
      socket.serverClose(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    act(() => FakeWebSocket.latest().serverOpen());

    expect(hook.result.current.spectateRequests).toEqual([]);
  });
});

// @vitest-environment jsdom
import { act, renderHook, type RenderHookResult } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSpectateRequest,
  createSpectateRequest,
  getSpectateRequestStatus,
} from "../api/client";
import type { SpectateRequestStatus } from "../types";
import { createAppError } from "../utils/appError";
import { readTabSpectate, saveTabSpectate } from "../utils/tabSession";
import { useSpectateRequest } from "./useSpectateRequest";

vi.mock("../api/client", () => ({
  createSpectateRequest: vi.fn(),
  getSpectateRequestStatus: vi.fn(),
  cancelSpectateRequest: vi.fn(),
}));
const create = vi.mocked(createSpectateRequest);
const getStatus = vi.mocked(getSpectateRequestStatus);
const cancelRequest = vi.mocked(cancelSpectateRequest);

function answers(...statuses: SpectateRequestStatus[]): void {
  for (const status of statuses) getStatus.mockResolvedValueOnce(status);
  getStatus.mockResolvedValue(statuses[statuses.length - 1]);
}

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function requestToWatch(
  target = "Alice",
): Promise<RenderHookResult<ReturnType<typeof useSpectateRequest>, unknown>> {
  const hook = renderHook(() => useSpectateRequest("game-1"));
  await act(async () => {
    await hook.result.current.request(target, "Carol");
  });
  return hook;
}

describe("useSpectateRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    create.mockReset();
    getStatus.mockReset();
    cancelRequest.mockReset();
    create.mockResolvedValue({ request_id: "request-1" });
    cancelRequest.mockResolvedValue({ status: "cancelled" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for an answer, then watches once the player allows it", async () => {
    answers(
      { status: "pending" },
      { status: "approved", session_id: "spectator-session" },
    );

    const hook = await requestToWatch();
    expect(hook.result.current.state).toEqual({
      kind: "waiting",
      target: "Alice",
      requestId: "request-1",
    });

    await settle(1000);

    expect(hook.result.current.state).toEqual({
      kind: "watching",
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
    expect(create).toHaveBeenCalledWith("game-1", "Alice", "Carol");
  });

  it.each(["denied", "expired"] as const)(
    "shows a %s request until the spectator goes back",
    async (status) => {
      answers({ status });

      const hook = await requestToWatch();
      await settle();
      expect(hook.result.current.state).toEqual({
        kind: status,
        target: "Alice",
      });

      act(() => hook.result.current.dismiss());
      expect(hook.result.current.state).toEqual({ kind: "choosing" });
    },
  );

  it("withdraws a cancelled request and stops asking about it", async () => {
    answers({ status: "pending" });

    const hook = await requestToWatch();
    await settle();
    const pollsBeforeCancel = getStatus.mock.calls.length;

    act(() => hook.result.current.cancel());
    await settle(5000);

    expect(hook.result.current.state).toEqual({ kind: "choosing" });
    expect(cancelRequest).toHaveBeenCalledWith("game-1", "request-1");
    expect(getStatus.mock.calls.length).toBe(pollsBeforeCancel);
    expect(readTabSpectate("game-1")).toBeNull();
  });

  it("keeps one request and one poll loop when asked again while waiting", async () => {
    answers({ status: "pending" });

    const hook = await requestToWatch();
    await act(async () => {
      await hook.result.current.request("Bob", "Carol");
    });
    getStatus.mockClear();
    await settle(3000);

    expect(create).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(3);
  });

  it("goes back to waiting after a reload, on the same request", async () => {
    saveTabSpectate("game-1", {
      target: "Alice",
      requestId: "request-1",
      sessionId: null,
    });
    answers({ status: "pending" });

    const hook = renderHook(() => useSpectateRequest("game-1"));
    await settle();

    expect(hook.result.current.state).toEqual({
      kind: "waiting",
      target: "Alice",
      requestId: "request-1",
    });
    expect(getStatus).toHaveBeenCalledWith("game-1", "request-1");
    expect(create).not.toHaveBeenCalled();
  });

  it("goes back to watching after a reload", async () => {
    answers({ status: "approved", session_id: "spectator-session" });
    await requestToWatch();
    await settle();

    // A reload starts a new page from the tab's storage without unmounting the old one.
    const reloaded = renderHook(() => useSpectateRequest("game-1"));

    expect(reloaded.result.current.state).toEqual({
      kind: "watching",
      target: "Alice",
      requestId: "request-1",
      sessionId: "spectator-session",
    });
  });

  it("ends the watch when the spectator leaves the page within the app", async () => {
    answers({ status: "approved", session_id: "spectator-session" });
    const watching = await requestToWatch();
    await settle();

    watching.unmount();
    const returned = renderHook(() => useSpectateRequest("game-1"));

    expect(returned.result.current.state).toEqual({ kind: "choosing" });
    expect(readTabSpectate("game-1")).toBeNull();
  });

  it("ends watching for good when the server closes the connection", async () => {
    answers({ status: "approved", session_id: "spectator-session" });
    const hook = await requestToWatch();
    await settle();
    const gameEnded = createAppError({
      code: "GAME_NOT_FOUND",
      context: "default",
      fallbackMessage: "Game ended",
    });

    act(() => hook.result.current.connectionEnded(gameEnded));

    expect(hook.result.current.state).toEqual({
      kind: "ended",
      target: "Alice",
      error: gameEnded,
    });
    expect(readTabSpectate("game-1")).toBeNull();
  });

  it("reports a request the server no longer has and lets the spectator choose again", async () => {
    getStatus.mockRejectedValue(
      createAppError({
        code: "SPECTATE_REQUEST_NOT_FOUND",
        context: "spectate-status",
        fallbackMessage: "gone",
      }),
    );

    const hook = await requestToWatch();
    await settle();

    expect(hook.result.current.state).toMatchObject({
      kind: "choosing",
      error: { code: "SPECTATE_REQUEST_NOT_FOUND" },
    });
    expect(readTabSpectate("game-1")).toBeNull();
  });
});

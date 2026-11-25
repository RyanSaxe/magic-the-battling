// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rejoinGame } from "../api/client";
import { createAppError, type AppError } from "../utils/appError";
import {
  getRememberedSeat,
  rememberPlayerForGame,
} from "../utils/deviceIdentity";
import { readTabSession, saveTabSession } from "../utils/tabSession";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import { useGameSeat } from "./useGameSeat";

vi.mock("../api/client", () => ({ rejoinGame: vi.fn() }));
const rejoin = vi.mocked(rejoinGame);

function refused(code: Parameters<typeof createAppError>[0]["code"]): AppError {
  return createAppError({
    code,
    context: "rejoin-game",
    fallbackMessage: "refused",
  });
}

function grant(n: number): {
  game_id: string;
  session_id: string;
  player_id: string;
  seat_token: string;
} {
  return {
    game_id: "game-1",
    session_id: `session-${n}`,
    player_id: "player-1",
    seat_token: `token-${n}`,
  };
}

describe("useGameSeat", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    rejoin.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the session this tab already holds for the game", () => {
    saveTabSession("game-1", { sessionId: "session-0", playerId: "player-1" });

    const { result } = renderHook(() => useGameSeat("game-1"));

    expect(result.current.seat).toEqual({
      kind: "held",
      session: { sessionId: "session-0", playerId: "player-1" },
    });
    expect(rejoin).not.toHaveBeenCalled();
  });

  it("takes the seat back with the remembered token in a new tab", async () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    rejoin.mockResolvedValue(grant(1));

    const { result } = renderHook(() => useGameSeat("game-1"));

    await waitFor(() => expect(result.current.seat.kind).toBe("held"));
    expect(rejoin).toHaveBeenCalledWith("game-1", "Alice", "token-0");
    expect(readTabSession("game-1")?.sessionId).toBe("session-1");
    expect(getRememberedSeat("game-1")?.seatToken).toBe("token-1");
  });

  it("takes an account's seat back without a token", async () => {
    rememberPlayerForGame("game-1", "Alice");
    rejoin.mockResolvedValue(grant(1));

    const { result } = renderHook(() => useGameSeat("game-1"));

    await waitFor(() => expect(result.current.seat.kind).toBe("held"));
    expect(rejoin).toHaveBeenCalledWith("game-1", "Alice", null);
  });

  it("leaves the seat alone in a tab opened only to watch", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });

    const { result } = renderHook(() =>
      useGameSeat("game-1", { claimAutomatically: false }),
    );

    expect(result.current.seat.kind).toBe("none");
    expect(rejoin).not.toHaveBeenCalled();
  });

  it("has no seat to claim without a token or a tab session", () => {
    const { result } = renderHook(() => useGameSeat("game-1"));

    expect(result.current.seat.kind).toBe("none");
  });

  it("reports a released seat as lost", async () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    rejoin.mockRejectedValue(refused("PLAYER_NOT_IN_GAME"));

    const { result } = renderHook(() => useGameSeat("game-1"));

    await waitFor(() =>
      expect(result.current.seat).toMatchObject({
        kind: "lost",
        error: { code: "PLAYER_NOT_IN_GAME" },
      }),
    );
  });

  it("claims once when the server rejects the session, and stops if it rejects the new one too", async () => {
    saveTabSession("game-1", { sessionId: "session-0", playerId: "player-1" });
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    rejoin.mockResolvedValue(grant(1));
    const { result } = renderHook(() => useGameSeat("game-1"));

    act(() =>
      result.current.connectionEnded("session-0", refused("INVALID_SESSION")),
    );
    await waitFor(() =>
      expect(result.current.seat).toMatchObject({
        session: { sessionId: "session-1" },
      }),
    );
    act(() =>
      result.current.connectionEnded("session-1", refused("INVALID_SESSION")),
    );

    expect(result.current.seat).toMatchObject({
      kind: "lost",
      error: { code: "INVALID_SESSION" },
    });
    expect(rejoin).toHaveBeenCalledTimes(1);
  });

  it("claims again when a session that had connected is refused later, as after another restart", async () => {
    saveTabSession("game-1", { sessionId: "session-0", playerId: "player-1" });
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    rejoin.mockResolvedValueOnce(grant(1)).mockResolvedValueOnce(grant(2));
    const { result } = renderHook(() => useGameSeat("game-1"));

    act(() =>
      result.current.connectionEnded("session-0", refused("INVALID_SESSION")),
    );
    await waitFor(() =>
      expect(result.current.seat).toMatchObject({
        session: { sessionId: "session-1" },
      }),
    );
    act(() => result.current.connectionOpened("session-1"));
    act(() =>
      result.current.connectionEnded("session-1", refused("INVALID_SESSION")),
    );

    await waitFor(() =>
      expect(result.current.seat).toMatchObject({
        session: { sessionId: "session-2" },
      }),
    );
  });

  it("says why a reconnect the player asked for was refused", async () => {
    rejoin.mockRejectedValue(refused("SEAT_CLAIM_REQUIRED"));
    const { result } = renderHook(() => useGameSeat("game-1"));

    act(() => void result.current.claim("sam"));

    await waitFor(() =>
      expect(result.current.seat).toEqual({
        kind: "none",
        refused: expect.objectContaining({ code: "SEAT_CLAIM_REQUIRED" }),
      }),
    );
  });

  it("forgets a seat the host removed", () => {
    saveTabSession("game-1", { sessionId: "session-0", playerId: "player-1" });
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    const { result } = renderHook(() => useGameSeat("game-1"));

    act(() => result.current.connectionEnded("session-0", refused("KICKED")));

    expect(result.current.seat).toMatchObject({
      kind: "lost",
      error: { code: "KICKED" },
    });
    expect(getRememberedSeat("game-1")).toBeNull();
    expect(readTabSession("game-1")).toBeNull();
  });

  it("waits for the player before taking the seat back from another tab", async () => {
    saveTabSession("game-1", { sessionId: "session-0", playerId: "player-1" });
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-0" });
    rejoin.mockResolvedValue(grant(1));
    const { result } = renderHook(() => useGameSeat("game-1"));

    act(() =>
      result.current.connectionEnded("session-0", refused("SEAT_MOVED")),
    );
    expect(result.current.seat).toMatchObject({
      kind: "lost",
      error: { code: "SEAT_MOVED" },
    });
    expect(rejoin).not.toHaveBeenCalled();

    act(() => result.current.takeBack());
    await waitFor(() =>
      expect(result.current.seat).toMatchObject({
        session: { sessionId: "session-1" },
      }),
    );
  });

  it("offers a tab session from before sessions were kept per game to the first game it opens", () => {
    sessionStorage.setItem("mtb_session", "legacy-session");
    sessionStorage.setItem("mtb_player", "legacy-player");

    const { result } = renderHook(() => useGameSeat("game-1"));

    expect(result.current.seat).toEqual({
      kind: "held",
      session: { sessionId: "legacy-session", playerId: "legacy-player" },
    });
    expect(sessionStorage.getItem("mtb_session")).toBeNull();
  });
});

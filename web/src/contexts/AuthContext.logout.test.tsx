// @vitest-environment jsdom
import {
  act,
  cleanup,
  renderHook,
  waitFor,
  type RenderHookResult,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumableGame } from "../types";
import {
  authLogout,
  closeSeat,
  getResumableGames,
  rejoinGame,
} from "../api/client";
import { useGameSeat } from "../hooks/useGameSeat";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import {
  forgetSeatForGame,
  getRememberedSeat,
  rememberPlayerForGame,
} from "../utils/deviceIdentity";
import {
  readTabSession,
  saveTabSession,
  watchForForgottenSeats,
} from "../utils/tabSession";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./authState";

const KESS = { user_id: "user-1", username: "kess" };
const server = vi.hoisted(() => ({ signedIn: true }));
vi.mock("../api/client", () => ({
  authGetMe: vi.fn(async () => (server.signedIn ? KESS : null)),
  authLogin: vi.fn(async () => {
    server.signedIn = true;
    return KESS;
  }),
  authLogout: vi.fn(),
  closeSeat: vi.fn(),
  getResumableGames: vi.fn(),
  rejoinGame: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
  <AuthProvider>{children}</AuthProvider>
);

const ACCOUNT_RESUMABLE_GAME: ResumableGame = {
  game_id: "account-game",
  player_name: "kess",
  kind: "game",
  last_active_at: null,
  cube_id: "cube-1",
  cube_name: null,
  cube_image_uri: null,
  play_mode: "limited",
  use_upgrades: true,
  player_count: 2,
  stage: 1,
  round: 1,
  poison: 0,
};

function tellOtherTabs(change: () => void): void {
  const key = "mtb_game_player_map";
  const oldValue = localStorage.getItem(key);
  change();
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      oldValue,
      newValue: localStorage.getItem(key),
    }),
  );
}

async function signedInBrowser(): Promise<
  RenderHookResult<ReturnType<typeof useAuth>, unknown>
> {
  rememberPlayerForGame("account-game", "kess", { seatToken: "account-token" });
  rememberPlayerForGame("guest-game", "Norin", { seatToken: "guest-token" });
  for (const game of ["account-game", "guest-game"]) {
    saveTabSession(game, { sessionId: `${game}-session`, playerId: game });
  }
  const auth = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(auth.result.current.user).toEqual(KESS));
  return auth;
}

describe("Log Out", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
    vi.resetAllMocks();
    server.signedIn = true;
    vi.mocked(authLogout).mockImplementation(async () => {
      server.signedIn = false;
    });
    // With no tokens sent, only a login's own seats answer.
    vi.mocked(getResumableGames).mockImplementation(async () =>
      server.signedIn ? [ACCOUNT_RESUMABLE_GAME] : [],
    );
    vi.mocked(rejoinGame).mockImplementation(async (gameId, _name, token) => {
      if (!server.signedIn && !token) throw new Error("not yours");
      return {
        game_id: gameId,
        session_id: "session-2",
        player_id: "player-2",
        seat_token: "token-2",
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets go of the account's seats in every tab without ending them, and logging back in resumes them", async () => {
    const auth = await signedInBrowser();
    const openTab = renderHook(() => useGameSeat("account-game"));
    expect(openTab.result.current.seat.kind).toBe("held");

    const before = localStorage.getItem("mtb_game_player_map");
    await act(() => auth.result.current.logout());
    const newValue = localStorage.getItem("mtb_game_player_map");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mtb_game_player_map",
          oldValue: before,
          newValue,
        }),
      );
    });

    expect(auth.result.current.user).toBeNull();
    expect(getRememberedSeat("account-game")).toBeNull();
    expect(openTab.result.current.seat.kind).toBe("none");
    expect(getRememberedSeat("guest-game")?.seatToken).toBe("guest-token");
    expect(readTabSession("guest-game")?.sessionId).toBe("guest-game-session");
    expect(closeSeat).not.toHaveBeenCalled();

    saveTabSession("account-game", {
      sessionId: "restored-tab-session",
      playerId: "account-game",
    });
    expect(
      renderHook(() => useGameSeat("account-game")).result.current.seat.kind,
    ).toBe("none");

    await act(() => auth.result.current.login("kess", "password"));
    const [seat] = await getResumableGames([]);
    rememberPlayerForGame(seat.game_id, seat.player_name);
    const resumed = renderHook(() => useGameSeat(seat.game_id));
    await waitFor(() => expect(resumed.result.current.seat.kind).toBe("held"));
    expect(rejoinGame).toHaveBeenLastCalledWith("account-game", "kess", null);
  });

  it("a guest taking a seat in that game later brings back no session of the account", async () => {
    const auth = await signedInBrowser();

    await act(() => auth.result.current.logout());
    rememberPlayerForGame("account-game", "Norin", {
      seatToken: "new-guest-token",
    });

    expect(readTabSession("account-game")).toBeNull();
  });

  it("a tab on another page drops the session before anything remembers that game again", () => {
    rememberPlayerForGame("account-game", "kess", {
      seatToken: "account-token",
    });
    saveTabSession("account-game", {
      sessionId: "account-game-session",
      playerId: "account-game",
    });
    const stopWatching = watchForForgottenSeats();

    tellOtherTabs(() => forgetSeatForGame("account-game"));
    rememberPlayerForGame("account-game", "Norin", {
      seatToken: "new-guest-token",
    });

    expect(readTabSession("account-game")).toBeNull();
    stopWatching();
  });

  it("a name remembered without its token brings back no session", () => {
    rememberPlayerForGame("account-game", "kess");
    saveTabSession("account-game", {
      sessionId: "restored-tab-session",
      playerId: "account-game",
    });

    expect(readTabSession("account-game")).toBeNull();
  });

  it.each([
    [
      "finding the seats",
      (): void => {
        vi.mocked(getResumableGames).mockRejectedValue(
          new Error("Failed to fetch"),
        );
      },
    ],
    [
      "logging out",
      (): void => {
        vi.mocked(authLogout).mockRejectedValue(new Error("Failed to fetch"));
      },
    ],
  ])("stays signed in with every seat when %s fails", async (_step, fail) => {
    const auth = await signedInBrowser();
    fail();

    await act(() => expect(auth.result.current.logout()).rejects.toThrow());

    expect(auth.result.current.user).toEqual(KESS);
    expect(getRememberedSeat("account-game")?.seatToken).toBe("account-token");
  });
});

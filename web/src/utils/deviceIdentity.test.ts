import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultNewPlayerPreference,
  getGlobalGuidedModePreference,
  getNewPlayerPreferenceForGame,
  findRememberedSeatByJoinCode,
  forgetSeatForGame,
  getRememberedSeat,
  listReclaimableSeats,
  markPlayedBefore,
  rememberPlayerForGame,
  resolveNewPlayerPreferenceForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "./deviceIdentity";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("new player preference", () => {
  beforeEach(() => {
    const localStorage = createStorageMock();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to new-player=true before any played games", () => {
    expect(getDefaultNewPlayerPreference()).toBe(true);
  });

  it("defaults to the explicit global guided-mode preference", () => {
    setGlobalGuidedModePreference(false);
    expect(getGlobalGuidedModePreference()).toBe(false);
    expect(getDefaultNewPlayerPreference()).toBe(false);
  });

  it("stores and retrieves game-specific new-player override", () => {
    setNewPlayerPreferenceForGame("game-1", false);
    expect(getNewPlayerPreferenceForGame("game-1")).toBe(false);
    expect(resolveNewPlayerPreferenceForGame("game-1")).toBe(false);
  });

  it("stores scoped preferences per player in the same game", () => {
    setNewPlayerPreferenceForGame("game-1", true, "player-a");
    setNewPlayerPreferenceForGame("game-1", false, "player-b");

    expect(getNewPlayerPreferenceForGame("game-1", "player-a")).toBe(true);
    expect(getNewPlayerPreferenceForGame("game-1", "player-b")).toBe(false);
    expect(getNewPlayerPreferenceForGame("game-1", "player-c")).toBeNull();
  });

  it("falls back to the global preference when no game-specific value is stored", () => {
    setGlobalGuidedModePreference(false);
    expect(getNewPlayerPreferenceForGame("missing")).toBeNull();
    expect(resolveNewPlayerPreferenceForGame("missing")).toBe(false);
  });

  it("ignores played-before when no explicit guided-mode preference is stored", () => {
    markPlayedBefore();
    expect(getNewPlayerPreferenceForGame("missing")).toBeNull();
    expect(resolveNewPlayerPreferenceForGame("missing")).toBe(true);
  });
});

describe("remembered seats", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createStorageMock() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the seat token and join code when the game is remembered again without them", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-1", joinCode: "ABC123" });
    rememberPlayerForGame("game-1", "Alice");

    expect(getRememberedSeat("game-1")).toMatchObject({ name: "Alice", seatToken: "token-1", joinCode: "ABC123" });
  });

  it("replaces the seat token when a reclaim issues a new one", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-1" });
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-2" });

    expect(getRememberedSeat("game-1")?.seatToken).toBe("token-2");
  });

  it("drops the token when the browser takes a different seat in the game", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-1" });
    rememberPlayerForGame("game-1", "Bob");

    expect(getRememberedSeat("game-1")).toMatchObject({ name: "Bob", seatToken: null });
  });

  it("finds a seat by its join code, whatever the case and spaces", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-1", joinCode: "ABC123" });

    expect(findRememberedSeatByJoinCode(" abc123 ")?.gameId).toBe("game-1");
    expect(findRememberedSeatByJoinCode("ZZZZZZ")).toBeNull();
  });

  it("lists only reclaimable seats, most recent first", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(3);
    rememberPlayerForGame("old", "Alice", { seatToken: "t-old" });
    rememberPlayerForGame("no-token", "Alice");
    rememberPlayerForGame("new", "Alice", { seatToken: "t-new" });

    expect(listReclaimableSeats(10).map((seat) => seat.gameId)).toEqual(["new", "old"]);
    expect(listReclaimableSeats(1).map((seat) => seat.gameId)).toEqual(["new"]);
  });

  it("forgets a seat", () => {
    rememberPlayerForGame("game-1", "Alice", { seatToken: "token-1" });
    forgetSeatForGame("game-1");

    expect(getRememberedSeat("game-1")).toBeNull();
  });
});

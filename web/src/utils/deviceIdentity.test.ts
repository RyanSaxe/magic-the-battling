import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  markPlayedBefore,
  pickAutoReconnectPlayer,
  resolveNewPlayerPreferenceForGame,
  setNewPlayerPreferenceForGame,
  type ReconnectStatusPlayer,
} from "./deviceIdentity";

const PLAYERS: ReconnectStatusPlayer[] = [
  { name: "Alice", is_connected: false, is_puppet: false },
  { name: "Bob", is_connected: true, is_puppet: false },
  { name: "Puppet 1", is_connected: false, is_puppet: true },
];

describe("pickAutoReconnectPlayer", () => {
  it("returns null when there is no remembered player", () => {
    expect(pickAutoReconnectPlayer(null, PLAYERS)).toBeNull();
  });

  it("returns remembered player when disconnected", () => {
    expect(pickAutoReconnectPlayer("Alice", PLAYERS)).toBe("Alice");
  });

  it("returns null when remembered player is currently connected", () => {
    expect(pickAutoReconnectPlayer("Bob", PLAYERS)).toBeNull();
  });

  it("returns null when remembered player is missing", () => {
    expect(pickAutoReconnectPlayer("Charlie", PLAYERS)).toBeNull();
  });

  it("never auto-reconnects puppet seats", () => {
    expect(pickAutoReconnectPlayer("Puppet 1", PLAYERS)).toBeNull();
  });
});

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

  it("defaults to new-player=false after any played game", () => {
    markPlayedBefore();
    expect(getDefaultNewPlayerPreference()).toBe(false);
  });

  it("stores and retrieves game-specific new-player override", () => {
    setNewPlayerPreferenceForGame("game-1", false);
    expect(getNewPlayerPreferenceForGame("game-1")).toBe(false);
    expect(resolveNewPlayerPreferenceForGame("game-1")).toBe(false);
  });

  it("falls back to default when no game-specific value is stored", () => {
    markPlayedBefore();
    expect(getNewPlayerPreferenceForGame("missing")).toBeNull();
    expect(resolveNewPlayerPreferenceForGame("missing")).toBe(false);
  });
});

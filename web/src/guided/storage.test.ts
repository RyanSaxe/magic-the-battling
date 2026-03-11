import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGuideProgressForGame,
  markGuideSeenForGame,
  skipAllGuidesForGame,
} from "./storage";

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

describe("guided storage", () => {
  beforeEach(() => {
    const localStorage = createStorageMock();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores guide progress under the stable player name scope", () => {
    markGuideSeenForGame(
      { gameId: "game-1", playerName: "Alice", legacyPlayerId: "player-a" },
      "welcome",
    );

    const progress = getGuideProgressForGame({
      gameId: "game-1",
      playerName: "Alice",
      legacyPlayerId: "player-b",
    });

    expect(progress.seenGuides.has("welcome")).toBe(true);
    expect(progress.skippedAll).toBe(false);
  });

  it("falls back to legacy player-id scoped progress", () => {
    window.localStorage.setItem(
      "mtb_guided_progress",
      JSON.stringify({
        "game-1::player-a": ["welcome", "build"],
      }),
    );

    const progress = getGuideProgressForGame({
      gameId: "game-1",
      playerName: "Alice",
      legacyPlayerId: "player-a",
    });

    expect(progress.seenGuides.has("welcome")).toBe(true);
    expect(progress.seenGuides.has("build")).toBe(true);
  });

  it("supports skipping all remaining guides", () => {
    skipAllGuidesForGame({ gameId: "game-1", playerName: "Alice" });

    const progress = getGuideProgressForGame({
      gameId: "game-1",
      playerName: "Alice",
    });

    expect(progress.skippedAll).toBe(true);
  });
});

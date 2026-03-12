import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveGuideForGame,
  getGuideProgressForGame,
  markGuideSeenForGame,
  setActiveGuideForGame,
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

  it("persists the active guide step across refresh", () => {
    setActiveGuideForGame(
      { gameId: "game-1", playerName: "Alice" },
      "welcome",
      3,
    );

    const progress = getGuideProgressForGame({
      gameId: "game-1",
      playerName: "Alice",
    });

    expect(progress.activeGuide).toEqual({
      guideId: "welcome",
      stepIndex: 3,
    });

    clearActiveGuideForGame({ gameId: "game-1", playerName: "Alice" });
    expect(
      getGuideProgressForGame({
        gameId: "game-1",
        playerName: "Alice",
      }).activeGuide,
    ).toBeNull();
  });

  it("clears active progress when a guide is completed", () => {
    setActiveGuideForGame(
      { gameId: "game-1", playerName: "Alice" },
      "build",
      1,
    );
    markGuideSeenForGame(
      { gameId: "game-1", playerName: "Alice" },
      "build",
    );

    expect(
      getGuideProgressForGame({
        gameId: "game-1",
        playerName: "Alice",
      }).activeGuide,
    ).toBeNull();
  });
});

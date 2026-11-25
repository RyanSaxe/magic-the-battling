// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authGetMe } from "../api/client";
import { getGuideProgressForGame } from "../guided/storage";
import { useSavedLayout } from "../hooks/useSavedLayout";
import { installMemoryLocalStorage } from "../test/memoryStorage";
import {
  getGlobalGuidedModePreference,
  getNewPlayerPreferenceForGame,
  getOrCreateDeviceId,
  getRememberedGuestName,
  getRememberedSeat,
  getRememberedSpectatorName,
  hasPlayedBefore,
  rememberGuestName,
} from "./deviceIdentity";
import { readMigratedItem, type StorageLike } from "./storage";
import {
  dropForgottenSessions,
  readTabSession,
  readTabSpectate,
  saveTabSession,
} from "./tabSession";

function createFakeStorage(
  initial: Record<string, string> = {},
  options: { throwOnSet?: boolean } = {},
): StorageLike & { snapshot(): Record<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    get length(): number {
      return store.size;
    },
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      if (options.throwOnSet) throw new Error("quota exceeded");
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    snapshot: (): Record<string, string> => Object.fromEntries(store.entries()),
  };
}

describe("readMigratedItem", () => {
  it("migrates a legacy key to the canonical key on first read and removes the legacy key", () => {
    const storage = createFakeStorage({ mtb_guest_name: "Alice" });

    expect(
      readMigratedItem(storage, "pitfight_guest_name", "mtb_guest_name"),
    ).toBe("Alice");
    expect(storage.snapshot()).toEqual({ pitfight_guest_name: "Alice" });
  });

  it("prefers the canonical key when both canonical and legacy keys exist", () => {
    const storage = createFakeStorage({
      pitfight_guest_name: "NewName",
      mtb_guest_name: "OldName",
    });

    expect(
      readMigratedItem(storage, "pitfight_guest_name", "mtb_guest_name"),
    ).toBe("NewName");
    expect(storage.getItem("pitfight_guest_name")).toBe("NewName");
  });

  it("migrates the first matching key from an ordered legacy list and removes all legacy keys", () => {
    const storage = createFakeStorage({
      "mtb_rules_panel_window:v2": "v2-state",
      "mtb_rules_panel_window:v1": "v1-state",
    });

    expect(
      readMigratedItem(storage, "pitfight_rules_panel_window:v2", [
        "mtb_rules_panel_window:v2",
        "mtb_rules_panel_window:v1",
      ]),
    ).toBe("v2-state");
    expect(storage.snapshot()).toEqual({
      "pitfight_rules_panel_window:v2": "v2-state",
    });
  });

  it("keeps the legacy value intact if writing the canonical key fails", () => {
    const storage = createFakeStorage(
      { mtb_guest_name: "Alice" },
      { throwOnSet: true },
    );

    expect(
      readMigratedItem(storage, "pitfight_guest_name", "mtb_guest_name"),
    ).toBe("Alice");
    expect(storage.snapshot()).toEqual({ mtb_guest_name: "Alice" });
  });
});

describe("mtb_* to pitfight_* storage migration", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates deviceIdentity localStorage keys on read and writes to pitfight_*", () => {
    localStorage.setItem("mtb_device_id", "dev-legacy");
    localStorage.setItem("mtb_guest_name", "Chandra");
    localStorage.setItem(
      "mtb_game_player_map",
      JSON.stringify({
        "game-1": { name: "Chandra", seen_at: 42, seat_token: "tok-1" },
      }),
    );
    localStorage.setItem(
      "mtb_game_new_player_pref_map",
      JSON.stringify({ "game-1": { is_new_player: false, seen_at: 42 } }),
    );
    localStorage.setItem("mtb_guided_mode_preference", "0");
    localStorage.setItem("mtb_played_before", "1");
    localStorage.setItem("mtb_spectator_name", "Watcher");

    expect(getOrCreateDeviceId()).toBe("dev-legacy");
    expect(getRememberedGuestName()).toBe("Chandra");
    expect(getRememberedSeat("game-1")?.seatToken).toBe("tok-1");
    expect(getNewPlayerPreferenceForGame("game-1")).toBe(false);
    expect(getGlobalGuidedModePreference()).toBe(false);
    expect(hasPlayedBefore()).toBe(true);
    expect(getRememberedSpectatorName()).toBe("Watcher");

    expect(localStorage.getItem("pitfight_device_id")).toBe("dev-legacy");
    expect(localStorage.getItem("pitfight_guest_name")).toBe("Chandra");
    expect(localStorage.getItem("pitfight_game_player_map")).not.toBeNull();
    expect(
      localStorage.getItem("pitfight_game_new_player_pref_map"),
    ).not.toBeNull();
    expect(localStorage.getItem("pitfight_guided_mode_preference")).toBe("0");
    expect(localStorage.getItem("pitfight_played_before")).toBe("1");
    expect(localStorage.getItem("pitfight_spectator_name")).toBe("Watcher");

    expect(localStorage.getItem("mtb_device_id")).toBeNull();
    expect(localStorage.getItem("mtb_guest_name")).toBeNull();
    expect(localStorage.getItem("mtb_game_player_map")).toBeNull();
    expect(localStorage.getItem("mtb_game_new_player_pref_map")).toBeNull();
    expect(localStorage.getItem("mtb_guided_mode_preference")).toBeNull();
    expect(localStorage.getItem("mtb_played_before")).toBeNull();
    expect(localStorage.getItem("mtb_spectator_name")).toBeNull();

    rememberGuestName("Liliana");
    expect(localStorage.getItem("pitfight_guest_name")).toBe("Liliana");
    expect(localStorage.getItem("mtb_guest_name")).toBeNull();
  });

  it("migrates tabSession and tabSpectate keys and clears legacy forgotten sessions", () => {
    sessionStorage.setItem(
      "mtb_session:game-1",
      JSON.stringify({ sessionId: "s1", playerId: "p1" }),
    );
    sessionStorage.setItem(
      "mtb_spectate:game-1",
      JSON.stringify({ target: "Alice", requestId: "r1", sessionId: "spec-1" }),
    );

    expect(readTabSession("game-1")).toEqual({
      sessionId: "s1",
      playerId: "p1",
    });
    expect(sessionStorage.getItem("pitfight_session:game-1")).not.toBeNull();
    expect(sessionStorage.getItem("mtb_session:game-1")).toBeNull();

    expect(readTabSpectate("game-1")).toEqual({
      target: "Alice",
      requestId: "r1",
      sessionId: "spec-1",
    });
    expect(sessionStorage.getItem("pitfight_spectate:game-1")).not.toBeNull();
    expect(sessionStorage.getItem("mtb_spectate:game-1")).toBeNull();

    saveTabSession("game-2", { sessionId: "s2", playerId: "p2" });
    expect(sessionStorage.getItem("pitfight_session:game-2")).not.toBeNull();
    expect(sessionStorage.getItem("mtb_session:game-2")).toBeNull();

    localStorage.setItem("pitfight_game_player_map", JSON.stringify({}));
    sessionStorage.setItem(
      "mtb_session:forgotten",
      JSON.stringify({ sessionId: "sf", playerId: "pf" }),
    );
    dropForgottenSessions();
    expect(sessionStorage.getItem("mtb_session:forgotten")).toBeNull();
    expect(sessionStorage.getItem("pitfight_session:forgotten")).toBeNull();
  });

  it("migrates guided progress, saved layouts, and auth signed-in note", async () => {
    localStorage.setItem(
      "mtb_guided_progress",
      JSON.stringify({ "game-1::Alice": { seen: ["welcome"] } }),
    );
    const progress = getGuideProgressForGame({
      gameId: "game-1",
      playerName: "Alice",
    });
    expect(progress.seenGuides.has("welcome")).toBe(true);
    expect(localStorage.getItem("pitfight_guided_progress")).not.toBeNull();
    expect(localStorage.getItem("mtb_guided_progress")).toBeNull();

    localStorage.setItem(
      "mtb_zone_constraints:v2:phase:build",
      JSON.stringify({
        version: 3,
        bands: {
          w1h1: [
            {
              stage: 4,
              round: 2,
              mode: "constraints",
              constraints: { topFraction: 0.35 },
            },
          ],
        },
      }),
    );
    const { result } = renderHook(() =>
      useSavedLayout(
        { scopeKey: "phase:build", stage: 4, round: 2 },
        { width: 980, height: 712 },
      ),
    );
    expect(result.current.constraints).toEqual({ topFraction: 0.35 });
    expect(
      localStorage.getItem("pitfight_zone_constraints:v2:phase:build"),
    ).not.toBeNull();
    expect(
      localStorage.getItem("mtb_zone_constraints:v2:phase:build"),
    ).toBeNull();

    localStorage.setItem("mtb_signed_in", "0");
    expect(await authGetMe()).toBeNull();
    expect(localStorage.getItem("pitfight_signed_in")).toBe("0");
    expect(localStorage.getItem("mtb_signed_in")).toBeNull();
  });
});

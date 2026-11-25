import { describe, expect, it } from "vitest";
import { reduceGameSurface, type GameSurface } from "./gameSurfaces";

const graveyard: GameSurface = {
  kind: "zone",
  zone: "graveyard",
  owner: "player",
};
const opponentGraveyard: GameSurface = {
  kind: "zone",
  zone: "graveyard",
  owner: "opponent",
};

describe("reduceGameSurface", () => {
  it("replaces the open surface with the one opened", () => {
    expect(
      reduceGameSurface(graveyard, {
        type: "open",
        surface: { kind: "actions" },
      }),
    ).toEqual({ kind: "actions" });
  });

  it("toggles a panel closed only when that same panel is open", () => {
    expect(
      reduceGameSurface(graveyard, { type: "toggle", surface: graveyard }),
    ).toBeNull();
    expect(
      reduceGameSurface(graveyard, {
        type: "toggle",
        surface: opponentGraveyard,
      }),
    ).toEqual(opponentGraveyard);
  });

  it("leaves a newer surface open when an older one asks to close", () => {
    expect(
      reduceGameSurface({ kind: "players" }, { type: "close", kind: "zone" }),
    ).toEqual({ kind: "players" });
  });

  it("keeps the surface a guide points at, and the drawer, when it closes the overlays", () => {
    const choices: GameSurface = { kind: "submitResult" };
    expect(
      reduceGameSurface(choices, {
        type: "closeOverlays",
        except: "submitResult",
      }),
    ).toEqual(choices);
    expect(
      reduceGameSurface(graveyard, {
        type: "closeOverlays",
        except: "submitResult",
      }),
    ).toBeNull();
    expect(
      reduceGameSurface({ kind: "players" }, { type: "closeOverlays" }),
    ).toEqual({ kind: "players" });
  });

  it("closes a Fight's panels and menus when the Fight ends, and keeps the rest", () => {
    for (const surface of [
      graveyard,
      { kind: "actions" },
      { kind: "submitResult" },
    ] as GameSurface[]) {
      expect(
        reduceGameSurface(surface, { type: "phaseChanged", phase: "reward" }),
      ).toBeNull();
    }
    expect(
      reduceGameSurface(
        { kind: "players" },
        { type: "phaseChanged", phase: "reward" },
      ),
    ).toEqual({ kind: "players" });
    expect(
      reduceGameSurface(
        { kind: "submitHand" },
        { type: "phaseChanged", phase: "battle" },
      ),
    ).toBeNull();
  });

  it("returns to the drawer when a scouting panel opened from it closes", () => {
    const fromDrawer = reduceGameSurface(
      { kind: "players" },
      { type: "scout", player: "Bob", tab: "seen" },
    );
    expect(fromDrawer).toEqual({
      kind: "scouting",
      player: "Bob",
      tab: "seen",
      fromDrawer: true,
    });
    expect(
      reduceGameSurface(fromDrawer, { type: "close", kind: "scouting" }),
    ).toEqual({ kind: "players" });
    expect(
      reduceGameSurface(fromDrawer, { type: "close", kind: "players" }),
    ).toBeNull();
  });

  it("closes a scouting panel opened beside the docked list outright", () => {
    const docked = reduceGameSurface(null, {
      type: "scout",
      player: "Bob",
      tab: "overview",
    });
    expect(
      reduceGameSurface(docked, { type: "close", kind: "scouting" }),
    ).toBeNull();
    expect(
      reduceGameSurface(docked, { type: "phaseChanged", phase: "build" }),
    ).toBeNull();
  });
});

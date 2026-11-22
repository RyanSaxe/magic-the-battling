import { describe, expect, it } from "vitest";
import { reduceGameSurface, type GameSurface } from "./gameSurfaces";

const graveyard: GameSurface = { kind: "zone", zone: "graveyard", owner: "player" };
const opponentGraveyard: GameSurface = { kind: "zone", zone: "graveyard", owner: "opponent" };

describe("reduceGameSurface", () => {
  it("replaces the open surface with the one opened", () => {
    expect(reduceGameSurface(graveyard, { type: "open", surface: { kind: "actions" } })).toEqual({ kind: "actions" });
  });

  it("toggles a panel closed only when that same panel is open", () => {
    expect(reduceGameSurface(graveyard, { type: "toggle", surface: graveyard })).toBeNull();
    expect(reduceGameSurface(graveyard, { type: "toggle", surface: opponentGraveyard })).toEqual(opponentGraveyard);
  });

  it("leaves a newer surface open when an older one asks to close", () => {
    expect(reduceGameSurface({ kind: "players" }, { type: "close", kind: "zone" })).toEqual({ kind: "players" });
  });

  it("keeps the surface a guide points at, and the drawer, when it closes the overlays", () => {
    const choices: GameSurface = { kind: "submitResult" };
    expect(reduceGameSurface(choices, { type: "closeOverlays", except: "submitResult" })).toEqual(choices);
    expect(reduceGameSurface(graveyard, { type: "closeOverlays", except: "submitResult" })).toBeNull();
    expect(reduceGameSurface({ kind: "players" }, { type: "closeOverlays" })).toEqual({ kind: "players" });
  });

  it("closes a Fight's panels and menus when the Fight ends, and keeps the rest", () => {
    for (const surface of [graveyard, { kind: "actions" }, { kind: "submitResult" }] as GameSurface[]) {
      expect(reduceGameSurface(surface, { type: "phaseChanged", phase: "reward" })).toBeNull();
    }
    expect(reduceGameSurface({ kind: "players" }, { type: "phaseChanged", phase: "reward" })).toEqual({ kind: "players" });
    expect(reduceGameSurface({ kind: "submitHand" }, { type: "phaseChanged", phase: "battle" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  canInteractWithBattleCard,
  canInteractWithBattleZone,
  canUseBattleFaceDownAction,
  canUseBattleFlipAction,
} from "./battleInteraction";

describe("battle interaction policy", () => {
  it("keeps opponent public zones interactive in PvP", () => {
    expect(
      canInteractWithBattleZone({
        owner: "opponent",
        zone: "graveyard",
        canManipulateOpponent: false,
      }),
    ).toBe(true);
    expect(
      canInteractWithBattleZone({
        owner: "opponent",
        zone: "library",
        canManipulateOpponent: false,
      }),
    ).toBe(true);
  });

  it("keeps opponent hand private in PvP", () => {
    expect(
      canInteractWithBattleZone({
        owner: "opponent",
        zone: "hand",
        canManipulateOpponent: false,
      }),
    ).toBe(false);
  });

  it("blocks hidden opponent cards while allowing visible public cards", () => {
    expect(
      canInteractWithBattleCard({
        owner: "opponent",
        zone: "battlefield",
        canManipulateOpponent: false,
        isFaceDown: false,
      }),
    ).toBe(true);
    expect(
      canInteractWithBattleCard({
        owner: "opponent",
        zone: "battlefield",
        canManipulateOpponent: false,
        isFaceDown: true,
      }),
    ).toBe(false);
    expect(
      canInteractWithBattleCard({
        owner: "opponent",
        zone: "library",
        canManipulateOpponent: false,
        isFaceDown: true,
      }),
    ).toBe(false);
  });

  it("keeps hide actions private while allowing visible-card flips in PvP", () => {
    expect(canUseBattleFaceDownAction("opponent", false)).toBe(false);
    expect(canUseBattleFlipAction("opponent", false, false)).toBe(true);
    expect(canUseBattleFlipAction("opponent", true, false)).toBe(false);
  });

  it("preserves full sandbox behavior against static opponents", () => {
    expect(
      canInteractWithBattleZone({
        owner: "opponent",
        zone: "hand",
        canManipulateOpponent: true,
      }),
    ).toBe(true);
    expect(
      canInteractWithBattleCard({
        owner: "opponent",
        zone: "library",
        canManipulateOpponent: true,
        isFaceDown: true,
      }),
    ).toBe(true);
    expect(canUseBattleFaceDownAction("opponent", true)).toBe(true);
  });
});

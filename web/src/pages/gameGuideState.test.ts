import { describe, expect, it } from "vitest";
import { shouldBlockGuidesForBattleResolution } from "./gameGuideState";

describe("shouldBlockGuidesForBattleResolution", () => {
  it("blocks guides while a new resolution is queued but not yet shown", () => {
    expect(shouldBlockGuidesForBattleResolution({
      activeBattleResolutionId: null,
      battleResolutionId: "alice:3:2:bob:abc123",
      hasCachedBattle: true,
      selfPhase: "reward",
      shownResolutionIds: new Set(),
    })).toBe(true);
  });

  it("blocks guides while the active resolution overlay is running", () => {
    expect(shouldBlockGuidesForBattleResolution({
      activeBattleResolutionId: "alice:3:2:bob:abc123",
      battleResolutionId: "alice:3:2:bob:abc123",
      hasCachedBattle: true,
      selfPhase: "reward",
      shownResolutionIds: new Set(["alice:3:2:bob:abc123"]),
    })).toBe(true);
  });

  it("stops blocking once the resolution has already been shown and completed", () => {
    expect(shouldBlockGuidesForBattleResolution({
      activeBattleResolutionId: null,
      battleResolutionId: "alice:3:2:bob:abc123",
      hasCachedBattle: false,
      selfPhase: "reward",
      shownResolutionIds: new Set(["alice:3:2:bob:abc123"]),
    })).toBe(false);
  });

  it("never blocks during the battle phase itself", () => {
    expect(shouldBlockGuidesForBattleResolution({
      activeBattleResolutionId: null,
      battleResolutionId: "alice:3:2:bob:abc123",
      hasCachedBattle: true,
      selfPhase: "battle",
      shownResolutionIds: new Set(),
    })).toBe(false);
  });
});

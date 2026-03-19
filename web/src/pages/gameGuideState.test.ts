import { describe, expect, it } from "vitest";
import {
  isSubmitPopoverGuideStepActive,
  matchesGuideCompletionTrigger,
  shouldBlockGuidesForBattleResolution,
  shouldDisableGameplayHotkeys,
} from "./gameGuideState";

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

describe("matchesGuideCompletionTrigger", () => {
  it("matches when the active guide and step match the clicked UI trigger", () => {
    expect(matchesGuideCompletionTrigger({
      activeGuideRequest: {
        guideId: "battle_result_submit",
        nonce: 42,
        stepIndex: 0,
      },
      activeStepId: "result-submit",
      trigger: {
        guideId: "battle_result_submit",
        stepId: "result-submit",
      },
    })).toBe(true);
  });

  it("does not match when the guide id differs", () => {
    expect(matchesGuideCompletionTrigger({
      activeGuideRequest: {
        guideId: "reward",
        nonce: 42,
        stepIndex: 1,
      },
      activeStepId: "continue",
      trigger: {
        guideId: "battle_result_submit",
        stepId: "result-submit",
      },
    })).toBe(false);
  });

  it("does not match when the active step differs", () => {
    expect(matchesGuideCompletionTrigger({
      activeGuideRequest: {
        guideId: "reward",
        nonce: 42,
        stepIndex: 1,
      },
      activeStepId: "intro",
      trigger: {
        guideId: "reward",
        stepId: "continue",
      },
    })).toBe(false);
  });
});

describe("isSubmitPopoverGuideStepActive", () => {
  it("matches the build play/draw guide step", () => {
    expect(isSubmitPopoverGuideStepActive({
      guideId: "build_play_draw",
      stepId: "play-draw",
    }, "build")).toBe(true);
  });

  it("matches the battle submit-result guide step", () => {
    expect(isSubmitPopoverGuideStepActive({
      guideId: "battle_result_submit",
      stepId: "result-submit",
    }, "battle")).toBe(true);
  });

  it("does not match unrelated guide steps", () => {
    expect(isSubmitPopoverGuideStepActive({
      guideId: "reward",
      stepId: "continue",
    }, "build")).toBe(false);
  });
});

describe("shouldDisableGameplayHotkeys", () => {
  it("disables hotkeys when a gameplay modal is already open", () => {
    expect(shouldDisableGameplayHotkeys({
      modalOpen: true,
      visibleGuideStep: null,
    })).toBe(true);
  });

  it("disables hotkeys while a guide is visible", () => {
    expect(shouldDisableGameplayHotkeys({
      modalOpen: false,
      visibleGuideStep: {
        guideId: "battle_result_submit",
        stepId: "result-submit",
      },
    })).toBe(true);
  });

  it("leaves hotkeys enabled when neither a modal nor guide is visible", () => {
    expect(shouldDisableGameplayHotkeys({
      modalOpen: false,
      visibleGuideStep: null,
    })).toBe(false);
  });
});

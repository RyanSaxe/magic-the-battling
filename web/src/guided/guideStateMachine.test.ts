import { describe, expect, it } from "vitest";
import type { Card, SelfPlayerView } from "../types";
import {
  createGuideSchedulerState,
  getOverlayExceptionForGuide,
  getWalkthroughAnimPhase,
  getWalkthroughDisplay,
  getWalkthroughTimerMs,
  isGuideShowable,
  isWalkthroughBlockingTaps,
  isWalkthroughStepInteractive,
  reduceGuideScheduler,
  reduceWalkthrough,
  type GuideScheduleInput,
  type WalkthroughState,
} from "./guideStateMachine";
import type { GuidedGuideId, GuidedWalkthroughContext } from "./types";

const baseCard: Card = {
  id: "card-1",
  name: "Grizzly Bears",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Creature",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: ["G"],
  cmc: 2,
};

const unappliedUpgrade: Card = {
  id: "upg-1",
  name: "Power Boost",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Enchantment",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 0,
};

function makeSelfPlayer(
  overrides: Partial<SelfPlayerView> = {},
): SelfPlayerView {
  return {
    name: "Alice",
    treasures: 1,
    poison: 0,
    phase: "draft",
    round: 1,
    stage: 3,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 3,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: ["Forest", "Island", "Plains"],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    hand: [],
    hand_slots: [],
    sideboard: [baseCard],
    current_pack: [baseCard],
    last_battle_result: null,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<GuidedWalkthroughContext> = {},
): GuidedWalkthroughContext {
  return {
    currentPhase: "draft",
    selfPlayer: makeSelfPlayer(),
    currentBattle: null,
    isMobile: false,
    sidebarOpen: false,
    revealedPlayerName: null,
    useUpgrades: true,
    hasRewardUpgradeChoice: false,
    showBuildSubmitPopover: false,
    showBattleSubmitPopover: false,
    hasBattleRevealUpgrade: false,
    availableRewardUpgrades: [],
    draftGuideOpponentName: "Bob",
    draftGuideOpponentRevealedCount: 0,
    isStageEnd: false,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<GuideScheduleInput> = {},
): GuideScheduleInput {
  return {
    gameId: "game-1",
    selfPhase: "draft",
    guideContext: makeContext(),
    isSpectator: false,
    hasOverlayOpen: false,
    ...overrides,
  };
}

describe("reduceGuideScheduler", () => {
  it("restores only showable guides on reload and ignores stale guides from other phases or closed popovers", () => {
    // Stale build_play_draw guide when submit popover is NOT open on reload -> must NOT restore.
    const stalePopover = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome", "build"]),
        skippedAll: false,
        activeGuide: { guideId: "build_play_draw", stepIndex: 0 },
      },
      input: makeInput({
        selfPhase: "build",
        guideContext: makeContext({
          currentPhase: "build",
          showBuildSubmitPopover: false,
        }),
      }),
    });
    expect(stalePopover.activeGuide).toBeNull();

    // Stale draft guide when player reloaded into reward phase -> must NOT restore draft; schedules reward instead.
    const wrongPhase = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome"]),
        skippedAll: false,
        activeGuide: { guideId: "draft", stepIndex: 1 },
      },
      input: makeInput({
        selfPhase: "reward",
        guideContext: makeContext({ currentPhase: "reward" }),
      }),
    });
    expect(wrongPhase.activeGuide?.guideId).toBe("reward");

    // Showable draft guide on reload -> restores at clamped stepIndex.
    const validRestore = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome"]),
        skippedAll: false,
        activeGuide: { guideId: "draft", stepIndex: 99 },
      },
      input: makeInput({
        selfPhase: "draft",
        guideContext: makeContext({ currentPhase: "draft" }),
      }),
    });
    expect(validRestore.activeGuide?.guideId).toBe("draft");
    expect(validRestore.activeGuide?.stepIndex).toBeGreaterThanOrEqual(0);
    expect(validRestore.activeGuide?.stepIndex).toBeLessThan(99);

    // Never restores any guide while an overlay is already open or for spectators.
    const blockedByOverlay = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome"]),
        skippedAll: false,
        activeGuide: { guideId: "draft", stepIndex: 0 },
      },
      input: makeInput({ hasOverlayOpen: true }),
    });
    expect(blockedByOverlay.activeGuide).toBeNull();
  });

  it("schedules welcome, phase guides, popover guides, stage-end, and always-on conditional hints in priority order", () => {
    const hydrated = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: { seenGuides: new Set(), skippedAll: false, activeGuide: null },
      input: makeInput({ selfPhase: "draft" }),
    });
    expect(hydrated.activeGuide?.guideId).toBe("welcome");

    // Finishing welcome advances to the current phase guide ("draft").
    const afterWelcome = reduceGuideScheduler(
      reduceGuideScheduler(hydrated, {
        type: "finish_guide",
        guideId: "welcome",
      }),
      { type: "sync_context", input: makeInput({ selfPhase: "draft" }) },
    );
    expect(afterWelcome.activeGuide?.guideId).toBe("draft");

    // Always-on conditional hint (battle unrevealed upgrade) still fires even when guided mode is off or skippedAll is true.
    const alwaysOn = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: false,
      progress: { seenGuides: new Set(), skippedAll: true, activeGuide: null },
      input: makeInput({
        selfPhase: "battle",
        guideContext: makeContext({
          currentPhase: "battle",
          hasBattleRevealUpgrade: true,
        }),
      }),
    });
    expect(alwaysOn.activeGuide?.guideId).toBe(
      "hint_battle_unrevealed_upgrade",
    );

    // Non-always-on conditional hint (build unapplied upgrade) does NOT fire when guided mode is off.
    const guidedOnlyHint = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: false,
      progress: { seenGuides: new Set(), skippedAll: false, activeGuide: null },
      input: makeInput({
        selfPhase: "build",
        guideContext: makeContext({
          currentPhase: "build",
          selfPlayer: makeSelfPlayer({
            phase: "build",
            upgrades: [unappliedUpgrade],
          }),
        }),
      }),
    });
    expect(guidedOnlyHint.activeGuide).toBeNull();

    // Popover overlay exceptions match submitHand / submitResult.
    expect(getOverlayExceptionForGuide("build_play_draw")).toBe("submitHand");
    expect(getOverlayExceptionForGuide("battle_result_submit")).toBe(
      "submitResult",
    );
    expect(getOverlayExceptionForGuide("draft")).toBeUndefined();
  });

  it("pauses scheduling while hasOverlayOpen is true and resumes once overlays close", () => {
    const blocked = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: { seenGuides: new Set(), skippedAll: false, activeGuide: null },
      input: makeInput({ hasOverlayOpen: true }),
    });
    expect(blocked.activeGuide).toBeNull();

    const resumed = reduceGuideScheduler(blocked, {
      type: "sync_context",
      input: makeInput({ hasOverlayOpen: false }),
    });
    expect(resumed.activeGuide?.guideId).toBe("welcome");
  });

  it("handles step progression, back navigation, skipAll, phase mismatch, and completion triggers", () => {
    const start = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: { seenGuides: new Set(), skippedAll: false, activeGuide: null },
      input: makeInput(),
    });
    expect(start.activeGuide?.stepIndex).toBe(0);

    const step1 = reduceGuideScheduler(start, {
      type: "advance_step",
      totalSteps: 2,
    });
    expect(step1.activeGuide?.stepIndex).toBe(1);

    const backTo0 = reduceGuideScheduler(step1, { type: "back_step" });
    expect(backTo0.activeGuide?.stepIndex).toBe(0);

    const finished = reduceGuideScheduler(step1, {
      type: "advance_step",
      totalSteps: 2,
    });
    expect(finished.activeGuide).toBeNull();
    expect(finished.seenGuides.has("welcome")).toBe(true);

    // Completion trigger finishes the matching active guide immediately.
    const popoverState = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome", "build"]),
        skippedAll: false,
        activeGuide: null,
      },
      input: makeInput({
        selfPhase: "build",
        guideContext: makeContext({
          currentPhase: "build",
          showBuildSubmitPopover: true,
        }),
      }),
    });
    expect(popoverState.activeGuide?.guideId).toBe("build_play_draw");

    const completedByClick = reduceGuideScheduler(popoverState, {
      type: "completion_trigger",
      trigger: {
        guideId: "build_play_draw",
        stepId: "play-draw",
        nonce: 1,
      },
      context: makeContext({
        currentPhase: "build",
        showBuildSubmitPopover: true,
      }),
    });
    expect(completedByClick.activeGuide).toBeNull();
    expect(completedByClick.dismissedImmediately).toBe(true);
    expect(completedByClick.seenGuides.has("build_play_draw")).toBe(true);

    // Skip all clears active guide and queue.
    const skipped = reduceGuideScheduler(start, { type: "skip_all" });
    expect(skipped.skippedAll).toBe(true);
    expect(skipped.activeGuide).toBeNull();
    expect(skipped.queue).toEqual([]);

    // Phase mismatch finishes a phase-bound active guide.
    const draftActive = reduceGuideScheduler(createGuideSchedulerState(), {
      type: "hydrate",
      scopeKey: "game-1::p1::Alice",
      isGuidedMode: true,
      progress: {
        seenGuides: new Set<GuidedGuideId>(["welcome"]),
        skippedAll: false,
        activeGuide: null,
      },
      input: makeInput({ selfPhase: "draft" }),
    });
    expect(draftActive.activeGuide?.guideId).toBe("draft");
    const movedToBuild = reduceGuideScheduler(draftActive, {
      type: "sync_context",
      input: makeInput({
        selfPhase: "build",
        guideContext: makeContext({ currentPhase: "build" }),
      }),
    });
    expect(movedToBuild.seenGuides.has("draft")).toBe(true);
    expect(movedToBuild.activeGuide?.guideId).toBe("build");
  });

  it("checks isGuideShowable accurately for conditional and non-conditional guides", () => {
    const prefs = {
      isGuidedMode: true,
      seenGuides: new Set<GuidedGuideId>(),
      skippedAll: false,
    };
    expect(
      isGuideShowable(
        "reward_stage_end",
        makeInput({
          selfPhase: "reward",
          guideContext: makeContext({
            currentPhase: "reward",
            isStageEnd: true,
          }),
        }),
        prefs,
      ),
    ).toBe(true);
    expect(
      isGuideShowable(
        "reward_stage_end",
        makeInput({
          selfPhase: "reward",
          guideContext: makeContext({
            currentPhase: "reward",
            isStageEnd: false,
          }),
        }),
        prefs,
      ),
    ).toBe(false);
    expect(
      isGuideShowable("welcome", makeInput({ isSpectator: true }), prefs),
    ).toBe(false);
  });
});

interface FakeDisplay {
  stepKey: string;
  x: number;
}

const stepKeyOf = (display: FakeDisplay) => display.stepKey;
const morphMsOf = (from: FakeDisplay, to: FakeDisplay) =>
  Math.abs(to.x - from.x) < 20 ? 0 : 300;

describe("reduceWalkthrough", () => {
  it("transitions through awaiting_layout -> entering -> idle -> exit_tooltip -> morph_spot -> enter_tooltip -> idle -> exiting -> hidden", () => {
    let state: WalkthroughState<FakeDisplay> = { kind: "hidden" };

    state = reduceWalkthrough(state, {
      type: "request_changed",
      requestNonce: 1,
      requestActive: true,
      reducedMotion: false,
    });
    expect(state).toEqual({ kind: "awaiting_layout", requestNonce: 1 });
    expect(isWalkthroughBlockingTaps(state, true)).toBe(true);

    state = reduceWalkthrough(state, {
      type: "layout_measured",
      display: { stepKey: "1:a", x: 10 },
      stepKey: "1:a",
      displayStepKey: stepKeyOf,
      reducedMotion: false,
    });
    expect(state.kind).toBe("entering");
    expect(getWalkthroughTimerMs(state, false)).toBe(480);

    state = reduceWalkthrough(state, {
      type: "timer_elapsed",
      computeMorphMs: morphMsOf,
    });
    expect(state.kind).toBe("idle");
    expect(isWalkthroughStepInteractive(state, true, "1:a", stepKeyOf)).toBe(
      true,
    );

    // Advancing to a new step triggers exit_tooltip -> morph_spot -> enter_tooltip -> idle.
    state = reduceWalkthrough(state, {
      type: "layout_measured",
      display: { stepKey: "1:b", x: 200 },
      stepKey: "1:b",
      displayStepKey: stepKeyOf,
      reducedMotion: false,
    });
    expect(state.kind).toBe("exit_tooltip");
    expect(getWalkthroughAnimPhase(state)).toBe("exit-tooltip");
    expect(getWalkthroughTimerMs(state, false)).toBe(180);

    state = reduceWalkthrough(state, {
      type: "timer_elapsed",
      computeMorphMs: morphMsOf,
    });
    expect(state.kind).toBe("morph_spot");
    expect(getWalkthroughDisplay(state)).toEqual({ stepKey: "1:b", x: 200 });
    expect(getWalkthroughTimerMs(state, false)).toBe(300);

    state = reduceWalkthrough(state, {
      type: "timer_elapsed",
      computeMorphMs: morphMsOf,
    });
    expect(state.kind).toBe("enter_tooltip");
    expect(getWalkthroughTimerMs(state, false)).toBe(220);

    state = reduceWalkthrough(state, {
      type: "timer_elapsed",
      computeMorphMs: morphMsOf,
    });
    expect(state.kind).toBe("idle");
    expect(isWalkthroughStepInteractive(state, true, "1:b", stepKeyOf)).toBe(
      true,
    );

    // Closing the request starts fade-out (`exiting`) which is IMMEDIATELY non-blocking for taps.
    state = reduceWalkthrough(state, {
      type: "request_changed",
      requestNonce: null,
      requestActive: false,
      reducedMotion: false,
    });
    expect(state.kind).toBe("exiting");
    expect(isWalkthroughBlockingTaps(state, false)).toBe(false);
    expect(isWalkthroughBlockingTaps(state, true)).toBe(false);
    expect(getWalkthroughTimerMs(state, false)).toBe(400);

    // Timer completion hides the walkthrough.
    state = reduceWalkthrough(state, {
      type: "timer_elapsed",
      computeMorphMs: morphMsOf,
    });
    expect(state).toEqual({ kind: "hidden" });
  });

  it("restarts entry when a new guide request arrives during exiting", () => {
    const exiting: WalkthroughState<FakeDisplay> = {
      kind: "exiting",
      requestNonce: 1,
      display: { stepKey: "1:a", x: 10 },
    };
    const restarted = reduceWalkthrough(exiting, {
      type: "request_changed",
      requestNonce: 2,
      requestActive: true,
      reducedMotion: false,
    });
    expect(restarted).toEqual({ kind: "awaiting_layout", requestNonce: 2 });
  });

  it("skips animations and closes immediately under reduced motion", () => {
    let state: WalkthroughState<FakeDisplay> = { kind: "hidden" };
    state = reduceWalkthrough(state, {
      type: "request_changed",
      requestNonce: 1,
      requestActive: true,
      reducedMotion: true,
    });
    state = reduceWalkthrough(state, {
      type: "layout_measured",
      display: { stepKey: "1:a", x: 10 },
      stepKey: "1:a",
      displayStepKey: stepKeyOf,
      reducedMotion: true,
    });
    expect(state.kind).toBe("idle");
    expect(getWalkthroughTimerMs(state, true)).toBeNull();

    state = reduceWalkthrough(state, {
      type: "request_changed",
      requestNonce: null,
      requestActive: false,
      reducedMotion: true,
    });
    expect(state).toEqual({ kind: "hidden" });
  });

  it("hides immediately on dismiss_immediately", () => {
    const idle: WalkthroughState<FakeDisplay> = {
      kind: "idle",
      requestNonce: 1,
      display: { stepKey: "1:a", x: 10 },
    };
    expect(reduceWalkthrough(idle, { type: "dismiss_immediately" })).toEqual({
      kind: "hidden",
    });
  });
});

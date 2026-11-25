/**
 * Pure state machines for Guided Mode:
 * 1. Guide scheduler (`reduceGuideScheduler`): owns hydration (restoring only
 *    showable guides), conditional guide queuing, priority selection, step
 *    progression, completion triggers, and phase-mismatch teardown.
 * 2. Walkthrough lifecycle (`reduceWalkthrough`): owns animation phases,
 *    display/pending layout snapshots, reduced-motion shortcuts, and
 *    non-blocking fade-out state for `GuidedWalkthrough`.
 */
import {
  buildGuideDefinition,
  getEligibleConditionalGuides,
  isAlwaysOnConditionalGuide,
  isConditionalGuideEligible,
  isConditionalGuideId,
} from "./content";
import type {
  ConditionalGuideId,
  GuideProgressState,
  GuideRequest,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "./types";
import { planRequestTransition, type AnimPhase } from "./walkthroughPhase";

export type GuideOverlayException = "submitHand" | "submitResult";

export interface GuideScheduleInput {
  gameId: string | undefined;
  selfPhase: string | undefined;
  guideContext: GuidedWalkthroughContext;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
}

export interface GuideCompletionTrigger {
  guideId: GuidedGuideId;
  stepId: string;
  nonce: number;
}

export interface GuideSchedulerState {
  scopeKey: string | null;
  isGuidedMode: boolean;
  seenGuides: ReadonlySet<GuidedGuideId>;
  skippedAll: boolean;
  activeGuide: GuideRequest | null;
  /** True when the last active guide ended via a UI completion trigger and should vanish without lingering. */
  dismissedImmediately: boolean;
  lastCompletionNonce: number | null;
  queue: readonly ConditionalGuideId[];
  nextNonce: number;
}

export type GuideSchedulerEvent =
  | {
      type: "hydrate";
      scopeKey: string | null;
      isGuidedMode: boolean;
      progress: GuideProgressState;
      input: GuideScheduleInput;
    }
  | { type: "sync_context"; input: GuideScheduleInput }
  | {
      type: "completion_trigger";
      trigger: GuideCompletionTrigger;
      context: GuidedWalkthroughContext;
    }
  | { type: "finish_guide"; guideId: GuidedGuideId }
  | { type: "skip_all" }
  | { type: "update_step"; guideId: GuidedGuideId; stepIndex: number }
  | { type: "advance_step"; totalSteps: number }
  | { type: "back_step" };

export function getOverlayExceptionForGuide(
  guideId: GuidedGuideId,
): GuideOverlayException | undefined {
  if (guideId === "build_play_draw") return "submitHand";
  if (guideId === "battle_result_submit") return "submitResult";
  return undefined;
}

export function createGuideSchedulerState(
  isGuidedMode = false,
): GuideSchedulerState {
  const seenGuides = new Set<GuidedGuideId>();
  return {
    scopeKey: null,
    isGuidedMode,
    seenGuides,
    skippedAll: false,
    activeGuide: null,
    dismissedImmediately: false,
    lastCompletionNonce: null,
    queue: [],
    nextNonce: 1,
  };
}

export function isGuideShowable(
  guideId: GuidedGuideId,
  input: GuideScheduleInput,
  prefs: Pick<
    GuideSchedulerState,
    "isGuidedMode" | "seenGuides" | "skippedAll"
  >,
): boolean {
  if (!input.gameId || !input.selfPhase || input.isSpectator) return false;
  if (prefs.seenGuides.has(guideId)) return false;

  if (isConditionalGuideId(guideId)) {
    const allowedByPreference =
      (prefs.isGuidedMode || isAlwaysOnConditionalGuide(guideId)) &&
      (!prefs.skippedAll || isAlwaysOnConditionalGuide(guideId));
    if (!allowedByPreference) return false;
    return isConditionalGuideEligible(guideId, input.guideContext);
  }

  if (!prefs.isGuidedMode || prefs.skippedAll) return false;

  switch (guideId) {
    case "welcome":
      return true;
    case "build_play_draw":
      return (
        input.selfPhase === "build" && input.guideContext.showBuildSubmitPopover
      );
    case "battle_result_submit":
      return (
        input.selfPhase === "battle" &&
        input.guideContext.showBattleSubmitPopover
      );
    case "reward_stage_end":
      return input.selfPhase === "reward" && input.guideContext.isStageEnd;
    case "draft":
    case "build":
    case "battle":
    case "reward":
      return input.selfPhase === guideId;
  }
}

function addSeen(
  seen: ReadonlySet<GuidedGuideId>,
  guideId: GuidedGuideId,
): ReadonlySet<GuidedGuideId> {
  if (seen.has(guideId)) return seen;
  const next = new Set(seen);
  next.add(guideId);
  return next;
}

function sameQueue(
  a: readonly ConditionalGuideId[],
  b: readonly ConditionalGuideId[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function selectNextGuideId(
  state: GuideSchedulerState,
  input: GuideScheduleInput,
  eligibleQueue: readonly ConditionalGuideId[],
): {
  guideId: GuidedGuideId;
  remainingQueue: readonly ConditionalGuideId[];
} | null {
  if (eligibleQueue.length > 0) {
    return {
      guideId: eligibleQueue[0],
      remainingQueue: eligibleQueue.slice(1),
    };
  }

  if (!state.isGuidedMode || state.skippedAll) return null;

  if (!state.seenGuides.has("welcome")) {
    return { guideId: "welcome", remainingQueue: eligibleQueue };
  }

  if (
    input.selfPhase === "build" &&
    input.guideContext.showBuildSubmitPopover &&
    !state.seenGuides.has("build_play_draw")
  ) {
    return { guideId: "build_play_draw", remainingQueue: eligibleQueue };
  }

  if (
    input.selfPhase === "battle" &&
    input.guideContext.showBattleSubmitPopover &&
    !state.seenGuides.has("battle_result_submit")
  ) {
    return { guideId: "battle_result_submit", remainingQueue: eligibleQueue };
  }

  const phase = input.selfPhase;
  if (
    (phase === "draft" ||
      phase === "build" ||
      phase === "battle" ||
      phase === "reward") &&
    !state.seenGuides.has(phase)
  ) {
    return { guideId: phase, remainingQueue: eligibleQueue };
  }

  if (
    input.selfPhase === "reward" &&
    input.guideContext.isStageEnd &&
    !state.seenGuides.has("reward_stage_end")
  ) {
    return { guideId: "reward_stage_end", remainingQueue: eligibleQueue };
  }

  return null;
}

function syncSchedulerWithContext(
  state: GuideSchedulerState,
  input: GuideScheduleInput,
): GuideSchedulerState {
  if (!input.gameId || input.isSpectator) {
    if (state.activeGuide === null && state.queue.length === 0) return state;
    return { ...state, activeGuide: null, queue: [] };
  }

  let activeGuide = state.activeGuide;
  let seenGuides = state.seenGuides;
  let dismissedImmediately = state.dismissedImmediately;

  // Finish any active guide whose phase no longer matches the current phase.
  if (activeGuide) {
    const def = buildGuideDefinition(activeGuide.guideId, input.guideContext);
    if (
      def.phase &&
      input.guideContext.currentPhase &&
      input.guideContext.currentPhase !== def.phase
    ) {
      seenGuides = addSeen(seenGuides, activeGuide.guideId);
      activeGuide = null;
      dismissedImmediately = false;
    }
  }

  const eligibleConditional = getEligibleConditionalGuides(input.guideContext);
  const activeGuideId = activeGuide?.guideId ?? null;
  const enqueued = [...state.queue];
  for (const guideId of eligibleConditional) {
    const allowed =
      (state.isGuidedMode || isAlwaysOnConditionalGuide(guideId)) &&
      (!state.skippedAll || isAlwaysOnConditionalGuide(guideId));
    if (
      allowed &&
      !seenGuides.has(guideId) &&
      activeGuideId !== guideId &&
      !enqueued.includes(guideId)
    ) {
      enqueued.push(guideId);
    }
  }

  if (activeGuide !== null || input.hasOverlayOpen || !input.selfPhase) {
    const queueChanged = !sameQueue(state.queue, enqueued);
    if (
      activeGuide === state.activeGuide &&
      seenGuides === state.seenGuides &&
      !queueChanged
    ) {
      return state;
    }
    return {
      ...state,
      activeGuide,
      seenGuides,
      dismissedImmediately,
      queue: queueChanged ? enqueued : state.queue,
    };
  }

  const eligibleQueue = enqueued.filter(
    (guideId) =>
      (state.isGuidedMode || isAlwaysOnConditionalGuide(guideId)) &&
      (!state.skippedAll || isAlwaysOnConditionalGuide(guideId)) &&
      !seenGuides.has(guideId) &&
      isConditionalGuideEligible(guideId, input.guideContext),
  );

  const picked = selectNextGuideId(
    { ...state, seenGuides },
    input,
    eligibleQueue,
  );
  if (picked) {
    return {
      ...state,
      seenGuides,
      activeGuide: {
        guideId: picked.guideId,
        nonce: state.nextNonce,
        stepIndex: 0,
      },
      dismissedImmediately: false,
      queue: picked.remainingQueue,
      nextNonce: state.nextNonce + 1,
    };
  }

  const queueChanged = !sameQueue(state.queue, eligibleQueue);
  if (
    activeGuide === state.activeGuide &&
    seenGuides === state.seenGuides &&
    !queueChanged
  ) {
    return state;
  }

  return {
    ...state,
    activeGuide,
    seenGuides,
    dismissedImmediately,
    queue: queueChanged ? eligibleQueue : state.queue,
  };
}

export function reduceGuideScheduler(
  state: GuideSchedulerState,
  event: GuideSchedulerEvent,
): GuideSchedulerState {
  switch (event.type) {
    case "hydrate": {
      const seenGuides = new Set(event.progress.seenGuides);
      const prefs = {
        isGuidedMode: event.isGuidedMode,
        seenGuides,
        skippedAll: event.progress.skippedAll,
      };
      let restoredGuide: GuideRequest | null = null;
      let nextNonce = state.nextNonce;
      const stored = event.progress.activeGuide;
      if (
        stored &&
        !event.input.hasOverlayOpen &&
        isGuideShowable(stored.guideId, event.input, prefs)
      ) {
        const def = buildGuideDefinition(
          stored.guideId,
          event.input.guideContext,
        );
        if (def.steps.length > 0) {
          const clampedStep = Math.max(
            0,
            Math.min(stored.stepIndex, def.steps.length - 1),
          );
          restoredGuide = {
            guideId: stored.guideId,
            nonce: nextNonce,
            stepIndex: clampedStep,
          };
          nextNonce += 1;
        }
      }

      const hydrated: GuideSchedulerState = {
        scopeKey: event.scopeKey,
        isGuidedMode: event.isGuidedMode,
        seenGuides,
        skippedAll: event.progress.skippedAll,
        activeGuide: restoredGuide,
        dismissedImmediately: false,
        lastCompletionNonce: state.lastCompletionNonce,
        queue: [],
        nextNonce,
      };
      return syncSchedulerWithContext(hydrated, event.input);
    }

    case "sync_context":
      return syncSchedulerWithContext(state, event.input);

    case "completion_trigger": {
      if (state.lastCompletionNonce === event.trigger.nonce) return state;
      const nextBase = {
        ...state,
        lastCompletionNonce: event.trigger.nonce,
      };
      const active = state.activeGuide;
      if (!active || active.guideId !== event.trigger.guideId) {
        return nextBase;
      }
      const def = buildGuideDefinition(active.guideId, event.context);
      const activeStep = def.steps[active.stepIndex ?? 0];
      if (activeStep?.id !== event.trigger.stepId) {
        return nextBase;
      }
      return {
        ...nextBase,
        seenGuides: addSeen(state.seenGuides, active.guideId),
        activeGuide: null,
        dismissedImmediately: true,
        queue: state.queue.filter((id) => id !== active.guideId),
      };
    }

    case "finish_guide": {
      const nextSeen = addSeen(state.seenGuides, event.guideId);
      const nextActive =
        state.activeGuide?.guideId === event.guideId ? null : state.activeGuide;
      const nextQueue = state.queue.filter((id) => id !== event.guideId);
      if (
        nextSeen === state.seenGuides &&
        nextActive === state.activeGuide &&
        nextQueue.length === state.queue.length
      ) {
        return state;
      }
      return {
        ...state,
        seenGuides: nextSeen,
        activeGuide: nextActive,
        dismissedImmediately: false,
        queue: nextQueue,
      };
    }

    case "skip_all":
      if (
        state.skippedAll &&
        state.activeGuide === null &&
        state.queue.length === 0
      ) {
        return state;
      }
      return {
        ...state,
        skippedAll: true,
        activeGuide: null,
        dismissedImmediately: false,
        queue: [],
      };

    case "update_step": {
      if (
        !state.activeGuide ||
        state.activeGuide.guideId !== event.guideId ||
        state.activeGuide.stepIndex === event.stepIndex
      ) {
        return state;
      }
      return {
        ...state,
        activeGuide: {
          ...state.activeGuide,
          stepIndex: event.stepIndex,
        },
      };
    }

    case "advance_step": {
      if (!state.activeGuide) return state;
      const nextIndex = (state.activeGuide.stepIndex ?? 0) + 1;
      if (nextIndex >= event.totalSteps) {
        return {
          ...state,
          seenGuides: addSeen(state.seenGuides, state.activeGuide.guideId),
          activeGuide: null,
          dismissedImmediately: false,
          queue: state.queue.filter((id) => id !== state.activeGuide?.guideId),
        };
      }
      return {
        ...state,
        activeGuide: {
          ...state.activeGuide,
          stepIndex: nextIndex,
        },
      };
    }

    case "back_step": {
      if (!state.activeGuide) return state;
      const current = state.activeGuide.stepIndex ?? 0;
      const nextIndex = Math.max(0, current - 1);
      if (nextIndex === current) return state;
      return {
        ...state,
        activeGuide: {
          ...state.activeGuide,
          stepIndex: nextIndex,
        },
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Walkthrough animation & display state machine                              */
/* -------------------------------------------------------------------------- */

export type WalkthroughState<TDisplay> =
  | { kind: "hidden" }
  | { kind: "awaiting_layout"; requestNonce: number }
  | {
      kind: "entering";
      requestNonce: number;
      display: TDisplay;
      pending: TDisplay | null;
    }
  | { kind: "idle"; requestNonce: number; display: TDisplay }
  | {
      kind: "exit_tooltip";
      requestNonce: number;
      display: TDisplay;
      pending: TDisplay;
    }
  | {
      kind: "morph_spot";
      requestNonce: number;
      display: TDisplay;
      pending: TDisplay | null;
      morphMs: number;
    }
  | {
      kind: "enter_tooltip";
      requestNonce: number;
      display: TDisplay;
      pending: TDisplay | null;
    }
  | { kind: "exiting"; requestNonce: number; display: TDisplay };

export type WalkthroughEvent<TDisplay> =
  | {
      type: "request_changed";
      requestNonce: number | null;
      requestActive: boolean;
      reducedMotion: boolean;
    }
  | {
      type: "layout_measured";
      display: TDisplay;
      stepKey: string;
      displayStepKey: (display: TDisplay) => string;
      reducedMotion: boolean;
    }
  | {
      type: "timer_elapsed";
      computeMorphMs: (from: TDisplay, to: TDisplay) => number;
    }
  | { type: "dismiss_immediately" };

export function getWalkthroughAnimPhase<TDisplay>(
  state: WalkthroughState<TDisplay>,
): AnimPhase {
  switch (state.kind) {
    case "hidden":
    case "awaiting_layout":
    case "entering":
      return "entering";
    case "idle":
      return "idle";
    case "exit_tooltip":
      return "exit-tooltip";
    case "morph_spot":
      return "morph-spot";
    case "enter_tooltip":
      return "enter-tooltip";
    case "exiting":
      return "exiting";
  }
}

export function getWalkthroughDisplay<TDisplay>(
  state: WalkthroughState<TDisplay>,
): TDisplay | null {
  if (state.kind === "hidden" || state.kind === "awaiting_layout") return null;
  return state.display;
}

export function getWalkthroughPending<TDisplay>(
  state: WalkthroughState<TDisplay>,
): TDisplay | null {
  switch (state.kind) {
    case "entering":
    case "exit_tooltip":
    case "morph_spot":
    case "enter_tooltip":
      return state.pending;
    default:
      return null;
  }
}

export function getWalkthroughTimerMs<TDisplay>(
  state: WalkthroughState<TDisplay>,
  reducedMotion: boolean,
): number | null {
  if (reducedMotion) return null;
  switch (state.kind) {
    case "entering":
      return 480;
    case "exit_tooltip":
      return 180;
    case "morph_spot":
      return state.morphMs === 0 ? 80 : state.morphMs;
    case "enter_tooltip":
      return 220;
    case "exiting":
      return 400;
    case "hidden":
    case "awaiting_layout":
    case "idle":
      return null;
  }
}

export function isWalkthroughBlockingTaps<TDisplay>(
  state: WalkthroughState<TDisplay>,
  requestActive: boolean,
): boolean {
  if (!requestActive) return false;
  return state.kind !== "hidden" && state.kind !== "exiting";
}

export function isWalkthroughStepInteractive<TDisplay>(
  state: WalkthroughState<TDisplay>,
  requestActive: boolean,
  stepKey: string,
  displayStepKey: (display: TDisplay) => string,
): boolean {
  return (
    requestActive &&
    state.kind === "idle" &&
    displayStepKey(state.display) === stepKey
  );
}

export function reduceWalkthrough<TDisplay>(
  state: WalkthroughState<TDisplay>,
  event: WalkthroughEvent<TDisplay>,
): WalkthroughState<TDisplay> {
  switch (event.type) {
    case "dismiss_immediately":
      return state.kind === "hidden" ? state : { kind: "hidden" };

    case "request_changed": {
      if (event.requestActive && event.requestNonce !== null) {
        if (state.kind === "hidden") {
          return { kind: "awaiting_layout", requestNonce: event.requestNonce };
        }
        const transition = planRequestTransition({
          animPhase: getWalkthroughAnimPhase(state),
          requestActive: true,
          hasDisplayState: state.kind !== "awaiting_layout",
          reducedMotion: event.reducedMotion,
        });
        if (transition === "restart") {
          return { kind: "awaiting_layout", requestNonce: event.requestNonce };
        }
        return state.requestNonce === event.requestNonce
          ? state
          : { ...state, requestNonce: event.requestNonce };
      }

      if (state.kind === "hidden" || state.kind === "awaiting_layout") {
        return state.kind === "hidden" ? state : { kind: "hidden" };
      }

      const transition = planRequestTransition({
        animPhase: getWalkthroughAnimPhase(state),
        requestActive: false,
        hasDisplayState: true,
        reducedMotion: event.reducedMotion,
      });

      if (transition === "exit") {
        return {
          kind: "exiting",
          requestNonce: state.requestNonce,
          display: state.display,
        };
      }
      if (transition === "idle") {
        // Reduced motion closes without animating.
        return { kind: "hidden" };
      }
      return state;
    }

    case "layout_measured": {
      if (state.kind === "hidden" || state.kind === "exiting") return state;

      if (state.kind === "awaiting_layout") {
        return event.reducedMotion
          ? {
              kind: "idle",
              requestNonce: state.requestNonce,
              display: event.display,
            }
          : {
              kind: "entering",
              requestNonce: state.requestNonce,
              display: event.display,
              pending: null,
            };
      }

      if (state.kind === "entering" || state.kind === "idle") {
        if (event.displayStepKey(state.display) === event.stepKey) {
          return { ...state, display: event.display };
        }
        if (event.reducedMotion) {
          return {
            kind: "idle",
            requestNonce: state.requestNonce,
            display: event.display,
          };
        }
        return {
          kind: "exit_tooltip",
          requestNonce: state.requestNonce,
          display: state.display,
          pending: event.display,
        };
      }

      if (state.kind === "exit_tooltip") {
        return { ...state, pending: event.display };
      }

      // morph_spot or enter_tooltip: update current display if same step, otherwise queue next.
      if (event.displayStepKey(state.display) === event.stepKey) {
        return { ...state, display: event.display };
      }
      return { ...state, pending: event.display };
    }

    case "timer_elapsed": {
      switch (state.kind) {
        case "entering":
          if (state.pending) {
            return {
              kind: "exit_tooltip",
              requestNonce: state.requestNonce,
              display: state.display,
              pending: state.pending,
            };
          }
          return {
            kind: "idle",
            requestNonce: state.requestNonce,
            display: state.display,
          };

        case "exit_tooltip":
          return {
            kind: "morph_spot",
            requestNonce: state.requestNonce,
            display: state.pending,
            pending: null,
            morphMs: event.computeMorphMs(state.display, state.pending),
          };

        case "morph_spot":
          if (state.pending) {
            return {
              kind: "morph_spot",
              requestNonce: state.requestNonce,
              display: state.pending,
              pending: null,
              morphMs: event.computeMorphMs(state.display, state.pending),
            };
          }
          return {
            kind: "enter_tooltip",
            requestNonce: state.requestNonce,
            display: state.display,
            pending: null,
          };

        case "enter_tooltip":
          if (state.pending) {
            return {
              kind: "exit_tooltip",
              requestNonce: state.requestNonce,
              display: state.display,
              pending: state.pending,
            };
          }
          return {
            kind: "idle",
            requestNonce: state.requestNonce,
            display: state.display,
          };

        case "exiting":
          return { kind: "hidden" };

        case "hidden":
        case "awaiting_layout":
        case "idle":
          return state;
      }
    }
  }
}

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

type GuidePreferences = Pick<
  GuideSchedulerState,
  "isGuidedMode" | "seenGuides" | "skippedAll"
>;

function isConditionalAllowedByPrefs(
  guideId: ConditionalGuideId,
  prefs: Pick<GuideSchedulerState, "isGuidedMode" | "skippedAll">,
): boolean {
  if (isAlwaysOnConditionalGuide(guideId)) return true;
  return prefs.isGuidedMode && !prefs.skippedAll;
}

const NON_CONDITIONAL_SHOWABLE: Record<
  Exclude<GuidedGuideId, ConditionalGuideId>,
  (input: GuideScheduleInput) => boolean
> = {
  welcome: () => true,
  build_play_draw: (input) =>
    input.selfPhase === "build" && input.guideContext.showBuildSubmitPopover,
  battle_result_submit: (input) =>
    input.selfPhase === "battle" && input.guideContext.showBattleSubmitPopover,
  reward_stage_end: (input) =>
    input.selfPhase === "reward" && input.guideContext.isStageEnd,
  draft: (input) => input.selfPhase === "draft",
  build: (input) => input.selfPhase === "build",
  battle: (input) => input.selfPhase === "battle",
  reward: (input) => input.selfPhase === "reward",
};

export function isGuideShowable(
  guideId: GuidedGuideId,
  input: GuideScheduleInput,
  prefs: GuidePreferences,
): boolean {
  if (!input.gameId || !input.selfPhase || input.isSpectator) return false;
  if (prefs.seenGuides.has(guideId)) return false;

  if (isConditionalGuideId(guideId)) {
    return (
      isConditionalAllowedByPrefs(guideId, prefs) &&
      isConditionalGuideEligible(guideId, input.guideContext)
    );
  }

  if (!prefs.isGuidedMode || prefs.skippedAll) return false;
  return NON_CONDITIONAL_SHOWABLE[guideId](input);
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

function pickGuidedModeGuide(
  seenGuides: ReadonlySet<GuidedGuideId>,
  input: GuideScheduleInput,
): GuidedGuideId | null {
  const candidates: Array<{ id: GuidedGuideId; ready: boolean }> = [
    { id: "welcome", ready: true },
    {
      id: "build_play_draw",
      ready:
        input.selfPhase === "build" &&
        input.guideContext.showBuildSubmitPopover,
    },
    {
      id: "battle_result_submit",
      ready:
        input.selfPhase === "battle" &&
        input.guideContext.showBattleSubmitPopover,
    },
    { id: "draft", ready: input.selfPhase === "draft" },
    { id: "build", ready: input.selfPhase === "build" },
    { id: "battle", ready: input.selfPhase === "battle" },
    { id: "reward", ready: input.selfPhase === "reward" },
    {
      id: "reward_stage_end",
      ready: input.selfPhase === "reward" && input.guideContext.isStageEnd,
    },
  ];
  return candidates.find((c) => c.ready && !seenGuides.has(c.id))?.id ?? null;
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

  const guideId = pickGuidedModeGuide(state.seenGuides, input);
  return guideId ? { guideId, remainingQueue: eligibleQueue } : null;
}

function resolveActiveGuideForPhase(
  state: GuideSchedulerState,
  guideContext: GuidedWalkthroughContext,
): Pick<
  GuideSchedulerState,
  "activeGuide" | "seenGuides" | "dismissedImmediately"
> {
  const { activeGuide, seenGuides, dismissedImmediately } = state;
  if (!activeGuide) {
    return { activeGuide, seenGuides, dismissedImmediately };
  }
  const def = buildGuideDefinition(activeGuide.guideId, guideContext);
  if (
    def.phase &&
    guideContext.currentPhase &&
    guideContext.currentPhase !== def.phase
  ) {
    return {
      activeGuide: null,
      seenGuides: addSeen(seenGuides, activeGuide.guideId),
      dismissedImmediately: false,
    };
  }
  return { activeGuide, seenGuides, dismissedImmediately };
}

function enqueueEligibleConditionals(
  state: GuideSchedulerState,
  resolved: Pick<GuideSchedulerState, "activeGuide" | "seenGuides">,
  guideContext: GuidedWalkthroughContext,
): ConditionalGuideId[] {
  const eligibleConditional = getEligibleConditionalGuides(guideContext);
  const activeGuideId = resolved.activeGuide?.guideId ?? null;
  const enqueued = [...state.queue];
  for (const guideId of eligibleConditional) {
    const canEnqueue =
      isConditionalAllowedByPrefs(guideId, state) &&
      !resolved.seenGuides.has(guideId) &&
      activeGuideId !== guideId &&
      !enqueued.includes(guideId);
    if (canEnqueue) {
      enqueued.push(guideId);
    }
  }
  return enqueued;
}

function applySyncUpdate(
  state: GuideSchedulerState,
  resolved: Pick<
    GuideSchedulerState,
    "activeGuide" | "seenGuides" | "dismissedImmediately"
  >,
  nextQueue: readonly ConditionalGuideId[],
): GuideSchedulerState {
  const queueChanged = !sameQueue(state.queue, nextQueue);
  if (
    resolved.activeGuide === state.activeGuide &&
    resolved.seenGuides === state.seenGuides &&
    !queueChanged
  ) {
    return state;
  }
  return {
    ...state,
    ...resolved,
    queue: queueChanged ? nextQueue : state.queue,
  };
}

function syncSchedulerWithContext(
  state: GuideSchedulerState,
  input: GuideScheduleInput,
): GuideSchedulerState {
  if (!input.gameId || input.isSpectator) {
    if (state.activeGuide === null && state.queue.length === 0) return state;
    return { ...state, activeGuide: null, queue: [] };
  }

  const resolved = resolveActiveGuideForPhase(state, input.guideContext);
  const enqueued = enqueueEligibleConditionals(
    state,
    resolved,
    input.guideContext,
  );

  if (
    resolved.activeGuide !== null ||
    input.hasOverlayOpen ||
    !input.selfPhase
  ) {
    return applySyncUpdate(state, resolved, enqueued);
  }

  const eligibleQueue = enqueued.filter(
    (guideId) =>
      isConditionalAllowedByPrefs(guideId, state) &&
      !resolved.seenGuides.has(guideId) &&
      isConditionalGuideEligible(guideId, input.guideContext),
  );

  const picked = selectNextGuideId(
    { ...state, seenGuides: resolved.seenGuides },
    input,
    eligibleQueue,
  );
  if (picked) {
    return {
      ...state,
      seenGuides: resolved.seenGuides,
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

  return applySyncUpdate(state, resolved, eligibleQueue);
}

function handleHydrate(
  state: GuideSchedulerState,
  event: Extract<GuideSchedulerEvent, { type: "hydrate" }>,
): GuideSchedulerState {
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
    const def = buildGuideDefinition(stored.guideId, event.input.guideContext);
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

function handleCompletionTrigger(
  state: GuideSchedulerState,
  event: Extract<GuideSchedulerEvent, { type: "completion_trigger" }>,
): GuideSchedulerState {
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

function handleFinishGuide(
  state: GuideSchedulerState,
  guideId: GuidedGuideId,
): GuideSchedulerState {
  const nextSeen = addSeen(state.seenGuides, guideId);
  const nextActive =
    state.activeGuide?.guideId === guideId ? null : state.activeGuide;
  const nextQueue = state.queue.filter((id) => id !== guideId);
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

function handleSkipAll(state: GuideSchedulerState): GuideSchedulerState {
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
}

function handleUpdateStep(
  state: GuideSchedulerState,
  event: Extract<GuideSchedulerEvent, { type: "update_step" }>,
): GuideSchedulerState {
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

function handleAdvanceStep(
  state: GuideSchedulerState,
  totalSteps: number,
): GuideSchedulerState {
  if (!state.activeGuide) return state;
  const nextIndex = (state.activeGuide.stepIndex ?? 0) + 1;
  if (nextIndex >= totalSteps) {
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

function handleBackStep(state: GuideSchedulerState): GuideSchedulerState {
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

export function reduceGuideScheduler(
  state: GuideSchedulerState,
  event: GuideSchedulerEvent,
): GuideSchedulerState {
  if (event.type === "hydrate") return handleHydrate(state, event);
  if (event.type === "sync_context") {
    return syncSchedulerWithContext(state, event.input);
  }
  if (event.type === "completion_trigger") {
    return handleCompletionTrigger(state, event);
  }
  if (event.type === "finish_guide") {
    return handleFinishGuide(state, event.guideId);
  }
  if (event.type === "skip_all") return handleSkipAll(state);
  if (event.type === "update_step") return handleUpdateStep(state, event);
  if (event.type === "advance_step") {
    return handleAdvanceStep(state, event.totalSteps);
  }
  return handleBackStep(state);
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

const ANIM_PHASE_BY_KIND: Record<WalkthroughState<unknown>["kind"], AnimPhase> =
  {
    hidden: "entering",
    awaiting_layout: "entering",
    entering: "entering",
    idle: "idle",
    exit_tooltip: "exit-tooltip",
    morph_spot: "morph-spot",
    enter_tooltip: "enter-tooltip",
    exiting: "exiting",
  };

export function getWalkthroughAnimPhase<TDisplay>(
  state: WalkthroughState<TDisplay>,
): AnimPhase {
  return ANIM_PHASE_BY_KIND[state.kind];
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
  if (
    state.kind === "entering" ||
    state.kind === "exit_tooltip" ||
    state.kind === "morph_spot" ||
    state.kind === "enter_tooltip"
  ) {
    return state.pending;
  }
  return null;
}

const FIXED_WALKTHROUGH_TIMER_MS: Record<
  Exclude<WalkthroughState<unknown>["kind"], "morph_spot">,
  number | null
> = {
  entering: 480,
  exit_tooltip: 180,
  enter_tooltip: 220,
  exiting: 400,
  hidden: null,
  awaiting_layout: null,
  idle: null,
};

export function getWalkthroughTimerMs<TDisplay>(
  state: WalkthroughState<TDisplay>,
  reducedMotion: boolean,
): number | null {
  if (reducedMotion) return null;
  if (state.kind === "morph_spot") {
    return state.morphMs === 0 ? 80 : state.morphMs;
  }
  return FIXED_WALKTHROUGH_TIMER_MS[state.kind];
}

export function isWalkthroughBlockingTaps<TDisplay>(
  state: WalkthroughState<TDisplay>,
  requestActive: boolean,
): boolean {
  if (!requestActive) return false;
  return state.kind !== "hidden" && state.kind !== "exiting";
}

export function isWalkthroughStepInteractive<TDisplay>({
  state,
  requestActive,
  stepKey,
  displayStepKey,
}: {
  state: WalkthroughState<TDisplay>;
  requestActive: boolean;
  stepKey: string;
  displayStepKey: (display: TDisplay) => string;
}): boolean {
  return (
    requestActive &&
    state.kind === "idle" &&
    displayStepKey(state.display) === stepKey
  );
}

function handleActiveRequestChanged<TDisplay>(
  state: WalkthroughState<TDisplay>,
  requestNonce: number,
  reducedMotion: boolean,
): WalkthroughState<TDisplay> {
  if (state.kind === "hidden") {
    return { kind: "awaiting_layout", requestNonce };
  }
  const transition = planRequestTransition({
    animPhase: getWalkthroughAnimPhase(state),
    requestActive: true,
    hasDisplayState: state.kind !== "awaiting_layout",
    reducedMotion,
  });
  if (transition === "restart") {
    return { kind: "awaiting_layout", requestNonce };
  }
  return state.requestNonce === requestNonce
    ? state
    : { ...state, requestNonce };
}

function handleInactiveRequestChanged<TDisplay>(
  state: WalkthroughState<TDisplay>,
  reducedMotion: boolean,
): WalkthroughState<TDisplay> {
  if (state.kind === "hidden") return state;
  if (state.kind === "awaiting_layout") return { kind: "hidden" };

  const transition = planRequestTransition({
    animPhase: getWalkthroughAnimPhase(state),
    requestActive: false,
    hasDisplayState: true,
    reducedMotion,
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

function handleWalkthroughRequestChanged<TDisplay>(
  state: WalkthroughState<TDisplay>,
  event: Extract<WalkthroughEvent<TDisplay>, { type: "request_changed" }>,
): WalkthroughState<TDisplay> {
  if (event.requestActive && event.requestNonce !== null) {
    return handleActiveRequestChanged(
      state,
      event.requestNonce,
      event.reducedMotion,
    );
  }
  return handleInactiveRequestChanged(state, event.reducedMotion);
}

function handleWalkthroughLayoutMeasured<TDisplay>(
  state: WalkthroughState<TDisplay>,
  event: Extract<WalkthroughEvent<TDisplay>, { type: "layout_measured" }>,
): WalkthroughState<TDisplay> {
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

  if (state.kind === "exit_tooltip") {
    return { ...state, pending: event.display };
  }

  if (event.displayStepKey(state.display) === event.stepKey) {
    return { ...state, display: event.display };
  }

  if (state.kind === "entering" || state.kind === "idle") {
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

  // morph_spot or enter_tooltip: queue next step.
  return { ...state, pending: event.display };
}

function handleWalkthroughTimerElapsed<TDisplay>(
  state: WalkthroughState<TDisplay>,
  event: Extract<WalkthroughEvent<TDisplay>, { type: "timer_elapsed" }>,
): WalkthroughState<TDisplay> {
  if (state.kind === "entering" || state.kind === "enter_tooltip") {
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
  }

  if (state.kind === "exit_tooltip") {
    return {
      kind: "morph_spot",
      requestNonce: state.requestNonce,
      display: state.pending,
      pending: null,
      morphMs: event.computeMorphMs(state.display, state.pending),
    };
  }

  if (state.kind === "morph_spot") {
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
  }

  if (state.kind === "exiting") {
    return { kind: "hidden" };
  }

  return state;
}

export function reduceWalkthrough<TDisplay>(
  state: WalkthroughState<TDisplay>,
  event: WalkthroughEvent<TDisplay>,
): WalkthroughState<TDisplay> {
  if (event.type === "dismiss_immediately") {
    return state.kind === "hidden" ? state : { kind: "hidden" };
  }
  if (event.type === "request_changed") {
    return handleWalkthroughRequestChanged(state, event);
  }
  if (event.type === "layout_measured") {
    return handleWalkthroughLayoutMeasured(state, event);
  }
  return handleWalkthroughTimerElapsed(state, event);
}

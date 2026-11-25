/**
 * Single owner for the end-of-fight lifecycle:
 * `idle -> submitting -> revealing -> showing_result -> transitioning -> idle`.
 *
 * Keeps the board on one phase at a time while end-of-fight overlays play, keeps
 * result submission disabled until the server answers, and guarantees failed or
 * cancelled reveals can never leave hotkeys stuck disabled.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import type {
  BattleResolution,
  BattleView,
  Card as CardType,
  RevealAnimation,
} from "../types";

export type BattleEndStage =
  | { kind: "idle" }
  | {
      kind: "submitting";
      result: string;
      /** True while RevealBeforeSubmitModal asks whether to reveal hidden upgrades first. */
      confirmingReveal: boolean;
    }
  | {
      kind: "revealing";
      /** Result queued for submission once reveal completes; null for a mid-battle reveal. */
      pendingSubmitResult: string | null;
      expectedUpgradeIds: readonly string[];
      activeAnimation: RevealAnimation | null;
    }
  | {
      kind: "showing_result";
      resolutionId: string;
      resolution: BattleResolution;
      battle: BattleView;
    }
  | {
      kind: "transitioning";
      resolutionId: string;
    };

export interface BattleEndFlowState {
  stage: BattleEndStage;
  changingResult: boolean;
  cachedBattle: BattleView | null;
  shownRevealAnimationIds: ReadonlySet<string>;
  shownResolutionIds: ReadonlySet<string>;
  lastObservedPhase: string | undefined;
  lastObservedSubmission: string | undefined;
  lastObservedConnected: boolean;
}

export interface BattleEndServerSnapshot {
  phase: string | undefined;
  currentBattle: BattleView | null;
  battleResolution: BattleResolution | null;
  selfPlayerName: string | undefined;
  selfUpgrades: readonly CardType[];
  connected: boolean;
}

export type BattleEndEvent =
  | {
      type: "submit_chosen";
      result: string;
      hasUnrevealedUpgrades: boolean;
    }
  | {
      type: "confirm_reveal_and_submit";
      upgradeIds: readonly string[];
    }
  | { type: "skip_reveal_and_submit" }
  | { type: "cancel_reveal_choice" }
  | { type: "cancel_reveal" }
  | {
      type: "reveal_animation_completed";
      pendingAnimations: readonly RevealAnimation[];
    }
  | { type: "resolution_completed" }
  | { type: "transition_settled" }
  | { type: "server_state"; snapshot: BattleEndServerSnapshot }
  | { type: "server_error" }
  | { type: "disconnected" }
  | { type: "start_changing_result" }
  | { type: "cancel_changing_result" };

export type BattleEndEffect =
  | { type: "submit_result"; result: string }
  | { type: "reveal_upgrades"; upgradeIds: readonly string[] }
  | { type: "close_overlays" };

export interface BattleEndTransition {
  state: BattleEndFlowState;
  effects: readonly BattleEndEffect[];
}

export interface BattleEndFlowView {
  stage: BattleEndStage;
  changingResult: boolean;
  confirmingReveal: boolean;
  submitPending: boolean;
  blocksHotkeys: boolean;
  blocksGuides: boolean;
  holdsBattleScreen: boolean;
  activeRevealAnimation: RevealAnimation | null;
  activeResolution: { battle: BattleView; resolution: BattleResolution } | null;
}

const IDLE_STAGE: BattleEndStage = { kind: "idle" };

export function createBattleEndFlowState(
  initial?: Partial<
    Pick<
      BattleEndFlowState,
      "lastObservedPhase" | "lastObservedSubmission" | "lastObservedConnected"
    >
  >,
): BattleEndFlowState {
  const shownRevealAnimationIds = new Set<string>();
  const shownResolutionIds = new Set<string>();
  return {
    stage: IDLE_STAGE,
    changingResult: false,
    cachedBattle: null,
    shownRevealAnimationIds,
    shownResolutionIds,
    lastObservedPhase: initial?.lastObservedPhase,
    lastObservedSubmission: initial?.lastObservedSubmission,
    lastObservedConnected: initial?.lastObservedConnected ?? false,
  };
}

function addToSet(
  set: ReadonlySet<string>,
  value: string,
): ReadonlySet<string> {
  if (set.has(value)) return set;
  const next = new Set(set);
  next.add(value);
  return next;
}

function findNextUnseenAnimation(
  animations: readonly RevealAnimation[],
  shownIds: ReadonlySet<string>,
): RevealAnimation | null {
  for (const animation of animations) {
    if (!shownIds.has(animation.animation_id)) return animation;
  }
  return null;
}

function allUpgradesAlreadyRevealed(
  upgradeIds: readonly string[],
  selfUpgrades: readonly CardType[],
): boolean {
  if (upgradeIds.length === 0) return true;
  return upgradeIds.every((id) => {
    const upgrade = selfUpgrades.find((candidate) => candidate.id === id);
    return !upgrade || upgrade.is_revealed !== false;
  });
}

interface ObservedMeta {
  phase: string | undefined;
  mySubmission: string | undefined;
  sameObservation: boolean;
}

function observeSnapshot(
  state: BattleEndFlowState,
  snapshot: BattleEndServerSnapshot,
): ObservedMeta {
  const mySubmission =
    snapshot.selfPlayerName && snapshot.currentBattle
      ? snapshot.currentBattle.result_submissions[snapshot.selfPlayerName]
      : undefined;
  const sameObservation =
    state.lastObservedPhase === snapshot.phase &&
    state.lastObservedSubmission === mySubmission &&
    state.lastObservedConnected === snapshot.connected;
  return { phase: snapshot.phase, mySubmission, sameObservation };
}

function handleDisconnectedSnapshot(
  state: BattleEndFlowState,
  observed: ObservedMeta,
): BattleEndTransition {
  const resets =
    state.stage.kind === "submitting" || state.stage.kind === "revealing";
  const nextStage: BattleEndStage = resets ? IDLE_STAGE : state.stage;
  if (nextStage === state.stage && observed.sameObservation) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      stage: nextStage,
      lastObservedPhase: observed.phase,
      lastObservedSubmission: observed.mySubmission,
      lastObservedConnected: false,
    },
    effects: [],
  };
}

function shouldShowResolution(
  state: BattleEndFlowState,
  resolutionId: string | null,
  nextCachedBattle: BattleView | null,
): boolean {
  if (!resolutionId || !nextCachedBattle) return false;
  if (state.shownResolutionIds.has(resolutionId)) return false;
  return (
    state.stage.kind !== "showing_result" ||
    state.stage.resolutionId !== resolutionId
  );
}

function resolveNonBattleStage(
  stage: BattleEndStage,
  resolutionId: string | null,
): BattleEndStage {
  if (stage.kind === "transitioning" && resolutionId === stage.resolutionId) {
    return stage;
  }
  if (stage.kind === "idle") return stage;
  return IDLE_STAGE;
}

function handleShowingResultSnapshot(
  state: BattleEndFlowState,
  observed: ObservedMeta,
): BattleEndTransition {
  if (observed.sameObservation && !state.changingResult) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      changingResult: false,
      lastObservedPhase: observed.phase,
      lastObservedSubmission: observed.mySubmission,
      lastObservedConnected: true,
    },
    effects: [],
  };
}

function startShowingResult(
  state: BattleEndFlowState,
  options: {
    resolutionId: string;
    resolution: BattleResolution;
    battle: BattleView;
    observed: ObservedMeta;
  },
): BattleEndTransition {
  const { resolutionId, resolution, battle, observed } = options;
  return {
    state: {
      ...state,
      stage: {
        kind: "showing_result",
        resolutionId,
        resolution,
        battle,
      },
      changingResult: false,
      cachedBattle: battle,
      shownResolutionIds: addToSet(state.shownResolutionIds, resolutionId),
      lastObservedPhase: observed.phase,
      lastObservedSubmission: observed.mySubmission,
      lastObservedConnected: true,
    },
    effects: [{ type: "close_overlays" }],
  };
}

function findShowableResolution(
  state: BattleEndFlowState,
  snapshot: BattleEndServerSnapshot,
): {
  resolutionId: string;
  resolution: BattleResolution;
  battle: BattleView;
} | null {
  const resolution = snapshot.battleResolution;
  const resolutionId = resolution?.resolution_id ?? null;
  const battle = state.cachedBattle;
  if (!resolution || !resolutionId || !battle) return null;
  if (!shouldShowResolution(state, resolutionId, battle)) return null;
  return { resolutionId, resolution, battle };
}

function handleNonBattleSnapshot(
  state: BattleEndFlowState,
  snapshot: BattleEndServerSnapshot,
  observed: ObservedMeta,
): BattleEndTransition {
  const showable = findShowableResolution(state, snapshot);
  if (showable) {
    return startShowingResult(state, { ...showable, observed });
  }

  if (state.stage.kind === "showing_result") {
    return handleShowingResultSnapshot(state, observed);
  }

  const resolutionId = snapshot.battleResolution?.resolution_id ?? null;
  const nextStage = resolveNonBattleStage(state.stage, resolutionId);
  if (
    nextStage === state.stage &&
    !state.changingResult &&
    observed.sameObservation
  ) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      stage: nextStage,
      changingResult: false,
      lastObservedPhase: observed.phase,
      lastObservedSubmission: observed.mySubmission,
      lastObservedConnected: true,
    },
    effects: [],
  };
}

function settleActiveBattleStage(
  stage: BattleEndStage,
  mySubmission: string | undefined,
  lastObservedSubmission: string | undefined,
): BattleEndStage {
  if (stage.kind === "showing_result" || stage.kind === "transitioning") {
    return IDLE_STAGE;
  }
  if (stage.kind === "submitting" && !stage.confirmingReveal) {
    const answered =
      mySubmission === stage.result ||
      (mySubmission !== undefined && mySubmission !== lastObservedSubmission);
    if (answered) return IDLE_STAGE;
  }
  return stage;
}

function applyNextRevealAnimation(
  stage: BattleEndStage,
  shownReveals: ReadonlySet<string>,
  nextAnimation: RevealAnimation,
): {
  stage: BattleEndStage;
  shownReveals: ReadonlySet<string>;
  effects: BattleEndEffect[];
} {
  if (stage.kind === "revealing" && stage.activeAnimation === null) {
    return {
      stage: { ...stage, activeAnimation: nextAnimation },
      shownReveals: addToSet(shownReveals, nextAnimation.animation_id),
      effects: [],
    };
  }
  if (stage.kind === "idle") {
    return {
      stage: {
        kind: "revealing",
        pendingSubmitResult: null,
        expectedUpgradeIds: [],
        activeAnimation: nextAnimation,
      },
      shownReveals: addToSet(shownReveals, nextAnimation.animation_id),
      effects: [],
    };
  }
  return { stage, shownReveals, effects: [] };
}

function advanceBattleReveals(
  stage: BattleEndStage,
  shownReveals: ReadonlySet<string>,
  snapshot: BattleEndServerSnapshot,
): {
  stage: BattleEndStage;
  shownReveals: ReadonlySet<string>;
  effects: BattleEndEffect[];
} {
  const pendingAnimations =
    snapshot.currentBattle?.pending_reveal_animations ?? [];
  const nextAnimation = findNextUnseenAnimation(
    pendingAnimations,
    shownReveals,
  );
  if (nextAnimation) {
    return applyNextRevealAnimation(stage, shownReveals, nextAnimation);
  }

  if (
    stage.kind === "revealing" &&
    stage.activeAnimation === null &&
    stage.pendingSubmitResult !== null &&
    allUpgradesAlreadyRevealed(stage.expectedUpgradeIds, snapshot.selfUpgrades)
  ) {
    const result = stage.pendingSubmitResult;
    return {
      stage: { kind: "submitting", result, confirmingReveal: false },
      shownReveals,
      effects: [{ type: "submit_result", result }],
    };
  }

  return { stage, shownReveals, effects: [] };
}

function handleServerState(
  state: BattleEndFlowState,
  snapshot: BattleEndServerSnapshot,
): BattleEndTransition {
  const observed = observeSnapshot(state, snapshot);
  if (!snapshot.connected) {
    return handleDisconnectedSnapshot(state, observed);
  }
  if (snapshot.phase !== "battle") {
    return handleNonBattleSnapshot(state, snapshot, observed);
  }

  const nextCachedBattle = snapshot.currentBattle ?? state.cachedBattle;
  const settledStage = settleActiveBattleStage(
    state.stage,
    observed.mySubmission,
    state.lastObservedSubmission,
  );
  const revealed = advanceBattleReveals(
    settledStage,
    state.shownRevealAnimationIds,
    snapshot,
  );

  if (
    revealed.stage === state.stage &&
    nextCachedBattle === state.cachedBattle &&
    revealed.shownReveals === state.shownRevealAnimationIds &&
    observed.sameObservation &&
    revealed.effects.length === 0
  ) {
    return { state, effects: [] };
  }

  return {
    state: {
      ...state,
      stage: revealed.stage,
      cachedBattle: nextCachedBattle,
      shownRevealAnimationIds: revealed.shownReveals,
      lastObservedPhase: observed.phase,
      lastObservedSubmission: observed.mySubmission,
      lastObservedConnected: true,
    },
    effects: revealed.effects,
  };
}

function handleSubmitChosen(
  state: BattleEndFlowState,
  event: Extract<BattleEndEvent, { type: "submit_chosen" }>,
): BattleEndTransition {
  if (state.stage.kind !== "idle") return { state, effects: [] };
  if (event.hasUnrevealedUpgrades) {
    return {
      state: {
        ...state,
        stage: {
          kind: "submitting",
          result: event.result,
          confirmingReveal: true,
        },
        changingResult: false,
      },
      effects: [],
    };
  }
  return {
    state: {
      ...state,
      stage: {
        kind: "submitting",
        result: event.result,
        confirmingReveal: false,
      },
      changingResult: false,
    },
    effects: [
      { type: "close_overlays" },
      { type: "submit_result", result: event.result },
    ],
  };
}

function handleConfirmRevealAndSubmit(
  state: BattleEndFlowState,
  upgradeIds: readonly string[],
): BattleEndTransition {
  if (state.stage.kind !== "submitting" || !state.stage.confirmingReveal) {
    return { state, effects: [] };
  }
  if (upgradeIds.length === 0) {
    return {
      state: {
        ...state,
        stage: {
          kind: "submitting",
          result: state.stage.result,
          confirmingReveal: false,
        },
      },
      effects: [
        { type: "submit_result", result: state.stage.result },
        { type: "close_overlays" },
      ],
    };
  }
  return {
    state: {
      ...state,
      stage: {
        kind: "revealing",
        pendingSubmitResult: state.stage.result,
        expectedUpgradeIds: [...upgradeIds],
        activeAnimation: null,
      },
    },
    effects: [
      { type: "reveal_upgrades", upgradeIds },
      { type: "close_overlays" },
    ],
  };
}

function handleRevealAnimationCompleted(
  state: BattleEndFlowState,
  pendingAnimations: readonly RevealAnimation[],
): BattleEndTransition {
  if (state.stage.kind !== "revealing") return { state, effects: [] };
  const nextAnimation = findNextUnseenAnimation(
    pendingAnimations,
    state.shownRevealAnimationIds,
  );
  if (nextAnimation) {
    return {
      state: {
        ...state,
        stage: { ...state.stage, activeAnimation: nextAnimation },
        shownRevealAnimationIds: addToSet(
          state.shownRevealAnimationIds,
          nextAnimation.animation_id,
        ),
      },
      effects: [],
    };
  }
  if (state.stage.pendingSubmitResult !== null) {
    const result = state.stage.pendingSubmitResult;
    return {
      state: {
        ...state,
        stage: { kind: "submitting", result, confirmingReveal: false },
      },
      effects: [{ type: "submit_result", result }],
    };
  }
  return { state: { ...state, stage: IDLE_STAGE }, effects: [] };
}

function handleSkipRevealAndSubmit(
  state: BattleEndFlowState,
): BattleEndTransition {
  if (state.stage.kind !== "submitting" || !state.stage.confirmingReveal) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      stage: {
        kind: "submitting",
        result: state.stage.result,
        confirmingReveal: false,
      },
    },
    effects: [
      { type: "submit_result", result: state.stage.result },
      { type: "close_overlays" },
    ],
  };
}

function handleSubmissionFlowEvent(
  state: BattleEndFlowState,
  event: Extract<
    BattleEndEvent,
    {
      type:
        | "submit_chosen"
        | "confirm_reveal_and_submit"
        | "skip_reveal_and_submit"
        | "cancel_reveal_choice"
        | "cancel_reveal"
        | "reveal_animation_completed";
    }
  >,
): BattleEndTransition {
  switch (event.type) {
    case "submit_chosen":
      return handleSubmitChosen(state, event);
    case "confirm_reveal_and_submit":
      return handleConfirmRevealAndSubmit(state, event.upgradeIds);
    case "skip_reveal_and_submit":
      return handleSkipRevealAndSubmit(state);
    case "cancel_reveal_choice":
      return state.stage.kind === "submitting" && state.stage.confirmingReveal
        ? { state: { ...state, stage: IDLE_STAGE }, effects: [] }
        : { state, effects: [] };
    case "cancel_reveal":
      return state.stage.kind === "revealing"
        ? { state: { ...state, stage: IDLE_STAGE }, effects: [] }
        : { state, effects: [] };
    case "reveal_animation_completed":
      return handleRevealAnimationCompleted(state, event.pendingAnimations);
    default:
      return { state, effects: [] };
  }
}

function handleResolutionCompleted(
  state: BattleEndFlowState,
): BattleEndTransition {
  if (state.stage.kind !== "showing_result") return { state, effects: [] };
  return {
    state: {
      ...state,
      stage: {
        kind: "transitioning",
        resolutionId: state.stage.resolutionId,
      },
      cachedBattle: null,
    },
    effects: [],
  };
}

function handleChangingResultEvent(
  state: BattleEndFlowState,
  event: Extract<
    BattleEndEvent,
    { type: "start_changing_result" | "cancel_changing_result" }
  >,
): BattleEndTransition {
  if (event.type === "start_changing_result") {
    return state.stage.kind === "idle" && !state.changingResult
      ? { state: { ...state, changingResult: true }, effects: [] }
      : { state, effects: [] };
  }
  return state.changingResult
    ? { state: { ...state, changingResult: false }, effects: [] }
    : { state, effects: [] };
}

function handleResolutionFlowEvent(
  state: BattleEndFlowState,
  event: Extract<
    BattleEndEvent,
    {
      type:
        | "resolution_completed"
        | "transition_settled"
        | "server_error"
        | "disconnected"
        | "start_changing_result"
        | "cancel_changing_result";
    }
  >,
): BattleEndTransition {
  if (
    event.type === "start_changing_result" ||
    event.type === "cancel_changing_result"
  ) {
    return handleChangingResultEvent(state, event);
  }
  if (event.type === "resolution_completed") {
    return handleResolutionCompleted(state);
  }
  if (event.type === "transition_settled") {
    return state.stage.kind === "transitioning"
      ? { state: { ...state, stage: IDLE_STAGE }, effects: [] }
      : { state, effects: [] };
  }
  if (event.type === "server_error") {
    const resets =
      state.stage.kind === "submitting" || state.stage.kind === "revealing";
    return resets
      ? { state: { ...state, stage: IDLE_STAGE }, effects: [] }
      : { state, effects: [] };
  }
  return handleDisconnectedSnapshot(state, {
    phase: state.lastObservedPhase,
    mySubmission: state.lastObservedSubmission,
    sameObservation: !state.lastObservedConnected,
  });
}

function isSubmissionFlowEvent(event: BattleEndEvent): event is Extract<
  BattleEndEvent,
  {
    type:
      | "submit_chosen"
      | "confirm_reveal_and_submit"
      | "skip_reveal_and_submit"
      | "cancel_reveal_choice"
      | "cancel_reveal"
      | "reveal_animation_completed";
  }
> {
  return (
    event.type === "submit_chosen" ||
    event.type === "confirm_reveal_and_submit" ||
    event.type === "skip_reveal_and_submit" ||
    event.type === "cancel_reveal_choice" ||
    event.type === "cancel_reveal" ||
    event.type === "reveal_animation_completed"
  );
}

export function transitionBattleEndFlow(
  state: BattleEndFlowState,
  event: BattleEndEvent,
): BattleEndTransition {
  if (event.type === "server_state") {
    return handleServerState(state, event.snapshot);
  }
  if (isSubmissionFlowEvent(event)) {
    return handleSubmissionFlowEvent(state, event);
  }
  return handleResolutionFlowEvent(state, event);
}

const HOTKEY_BLOCKING_STAGES = new Set<BattleEndStage["kind"]>([
  "submitting",
  "revealing",
  "showing_result",
]);

export function selectBattleEndView(
  state: BattleEndFlowState,
): BattleEndFlowView {
  const { stage } = state;
  const confirmingReveal =
    stage.kind === "submitting" && stage.confirmingReveal;
  const isRevealingForSubmit =
    stage.kind === "revealing" && stage.pendingSubmitResult !== null;
  const submitPending =
    (stage.kind === "submitting" && !stage.confirmingReveal) ||
    isRevealingForSubmit ||
    stage.kind === "showing_result";

  return {
    stage,
    changingResult: state.changingResult,
    confirmingReveal,
    submitPending,
    blocksHotkeys: HOTKEY_BLOCKING_STAGES.has(stage.kind),
    blocksGuides:
      confirmingReveal ||
      stage.kind === "revealing" ||
      stage.kind === "showing_result",
    holdsBattleScreen: stage.kind === "showing_result",
    activeRevealAnimation:
      stage.kind === "revealing" ? stage.activeAnimation : null,
    activeResolution:
      stage.kind === "showing_result"
        ? { battle: stage.battle, resolution: stage.resolution }
        : null,
  };
}

interface BattleEndEffectHandlers {
  onSubmitResult: (result: string) => void;
  onRevealUpgrade: (upgradeId: string) => void;
  onCloseOverlays: () => void;
}

function runBattleEndEffect(
  effect: BattleEndEffect,
  handlers: BattleEndEffectHandlers,
): void {
  switch (effect.type) {
    case "submit_result":
      handlers.onSubmitResult(effect.result);
      break;
    case "reveal_upgrades":
      for (const id of effect.upgradeIds) {
        handlers.onRevealUpgrade(id);
      }
      break;
    case "close_overlays":
      handlers.onCloseOverlays();
      break;
  }
}

interface UseBattleEndFlowOptions extends BattleEndEffectHandlers {
  snapshot: BattleEndServerSnapshot;
  serverErrorNonce?: number;
}

export interface UseBattleEndFlowResult extends BattleEndFlowView {
  state: BattleEndFlowState;
  battleViewForDisplay: BattleView | null;
  submitResult: (result: string, hasUnrevealedUpgrades: boolean) => void;
  confirmRevealAndSubmit: (upgradeIds: readonly string[]) => void;
  skipRevealAndSubmit: () => void;
  cancelRevealChoice: () => void;
  cancelReveal: () => void;
  completeRevealAnimation: () => void;
  completeResolution: () => void;
  notifyServerError: () => void;
  startChangingResult: () => void;
  cancelChangingResult: () => void;
}

export function useBattleEndFlow({
  snapshot,
  serverErrorNonce = 0,
  onSubmitResult,
  onRevealUpgrade,
  onCloseOverlays,
}: UseBattleEndFlowOptions): UseBattleEndFlowResult {
  const [state, setState] = useState<BattleEndFlowState>(() =>
    createBattleEndFlowState({
      lastObservedPhase: snapshot.phase,
      lastObservedConnected: snapshot.connected,
    }),
  );
  const [lastHandledErrorNonce, setLastHandledErrorNonce] =
    useState(serverErrorNonce);
  const [pendingEffects, setPendingEffects] = useState<
    readonly BattleEndEffect[]
  >([]);

  const flushPendingEffects = useEffectEvent(
    (effects: readonly BattleEndEffect[]) => {
      const handlers = { onSubmitResult, onRevealUpgrade, onCloseOverlays };
      for (const effect of effects) {
        runBattleEndEffect(effect, handlers);
      }
    },
  );

  // Synchronize incoming server errors and snapshots during render so the screen never flashes two phases.
  let nextState = state;
  let nextEffects: readonly BattleEndEffect[] = [];
  if (lastHandledErrorNonce !== serverErrorNonce) {
    setLastHandledErrorNonce(serverErrorNonce);
    nextState = transitionBattleEndFlow(nextState, {
      type: "server_error",
    }).state;
  }
  const synced = transitionBattleEndFlow(nextState, {
    type: "server_state",
    snapshot,
  });
  nextState = synced.state;
  nextEffects = synced.effects;
  if (nextState !== state) {
    setState(nextState);
    if (nextEffects.length > 0) {
      setPendingEffects((current) => [...current, ...nextEffects]);
    }
  }

  useEffect(() => {
    if (pendingEffects.length === 0) return undefined;
    flushPendingEffects(pendingEffects);
    const frameId = requestAnimationFrame(() => {
      setPendingEffects([]);
    });
    return (): void => cancelAnimationFrame(frameId);
  }, [pendingEffects]);

  useEffect(() => {
    if (state.stage.kind !== "transitioning") return undefined;
    const frameId = requestAnimationFrame(() => {
      setState(
        (current) =>
          transitionBattleEndFlow(current, { type: "transition_settled" })
            .state,
      );
    });
    return (): void => cancelAnimationFrame(frameId);
  }, [state.stage.kind]);

  const dispatchEvent = useCallback(
    (event: BattleEndEvent) => {
      const result = transitionBattleEndFlow(state, event);
      if (result.state !== state) {
        setState(result.state);
      }
      const handlers = { onSubmitResult, onRevealUpgrade, onCloseOverlays };
      for (const effect of result.effects) {
        runBattleEndEffect(effect, handlers);
      }
    },
    [onCloseOverlays, onRevealUpgrade, onSubmitResult, state],
  );

  const submitResult = useCallback(
    (result: string, hasUnrevealedUpgrades: boolean) =>
      dispatchEvent({
        type: "submit_chosen",
        result,
        hasUnrevealedUpgrades,
      }),
    [dispatchEvent],
  );
  const confirmRevealAndSubmit = useCallback(
    (upgradeIds: readonly string[]) =>
      dispatchEvent({ type: "confirm_reveal_and_submit", upgradeIds }),
    [dispatchEvent],
  );
  const skipRevealAndSubmit = useCallback(
    () => dispatchEvent({ type: "skip_reveal_and_submit" }),
    [dispatchEvent],
  );
  const cancelRevealChoice = useCallback(
    () => dispatchEvent({ type: "cancel_reveal_choice" }),
    [dispatchEvent],
  );
  const cancelReveal = useCallback(
    () => dispatchEvent({ type: "cancel_reveal" }),
    [dispatchEvent],
  );
  const completeRevealAnimation = useCallback(
    () =>
      dispatchEvent({
        type: "reveal_animation_completed",
        pendingAnimations:
          snapshot.currentBattle?.pending_reveal_animations ?? [],
      }),
    [dispatchEvent, snapshot.currentBattle?.pending_reveal_animations],
  );
  const completeResolution = useCallback(
    () => dispatchEvent({ type: "resolution_completed" }),
    [dispatchEvent],
  );
  const notifyServerError = useCallback(() => {
    setState(
      (current) =>
        transitionBattleEndFlow(current, { type: "server_error" }).state,
    );
  }, []);
  const startChangingResult = useCallback(
    () => dispatchEvent({ type: "start_changing_result" }),
    [dispatchEvent],
  );
  const cancelChangingResult = useCallback(
    () => dispatchEvent({ type: "cancel_changing_result" }),
    [dispatchEvent],
  );

  const view = useMemo(() => selectBattleEndView(state), [state]);

  return {
    state,
    ...view,
    battleViewForDisplay:
      snapshot.currentBattle ?? view.activeResolution?.battle ?? null,
    submitResult,
    confirmRevealAndSubmit,
    skipRevealAndSubmit,
    cancelRevealChoice,
    cancelReveal,
    completeRevealAnimation,
    completeResolution,
    notifyServerError,
    startChangingResult,
    cancelChangingResult,
  };
}

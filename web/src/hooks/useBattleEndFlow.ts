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

function handleServerState(
  state: BattleEndFlowState,
  snapshot: BattleEndServerSnapshot,
): BattleEndTransition {
  const mySubmission =
    snapshot.selfPlayerName && snapshot.currentBattle
      ? snapshot.currentBattle.result_submissions[snapshot.selfPlayerName]
      : undefined;
  const sameObservation =
    state.lastObservedPhase === snapshot.phase &&
    state.lastObservedSubmission === mySubmission &&
    state.lastObservedConnected === snapshot.connected;

  if (!snapshot.connected) {
    const nextStage: BattleEndStage =
      state.stage.kind === "submitting" || state.stage.kind === "revealing"
        ? IDLE_STAGE
        : state.stage;
    if (nextStage === state.stage && sameObservation) {
      return { state, effects: [] };
    }
    return {
      state: {
        ...state,
        stage: nextStage,
        lastObservedPhase: snapshot.phase,
        lastObservedSubmission: mySubmission,
        lastObservedConnected: false,
      },
      effects: [],
    };
  }

  const nextCachedBattle =
    snapshot.phase === "battle" && snapshot.currentBattle
      ? snapshot.currentBattle
      : state.cachedBattle;

  if (snapshot.phase !== "battle") {
    const resolution = snapshot.battleResolution;
    const resolutionId = resolution?.resolution_id ?? null;

    if (
      resolution &&
      resolutionId &&
      nextCachedBattle &&
      !state.shownResolutionIds.has(resolutionId) &&
      (state.stage.kind !== "showing_result" ||
        state.stage.resolutionId !== resolutionId)
    ) {
      return {
        state: {
          ...state,
          stage: {
            kind: "showing_result",
            resolutionId,
            resolution,
            battle: nextCachedBattle,
          },
          changingResult: false,
          cachedBattle: nextCachedBattle,
          shownResolutionIds: addToSet(state.shownResolutionIds, resolutionId),
          lastObservedPhase: snapshot.phase,
          lastObservedSubmission: mySubmission,
          lastObservedConnected: true,
        },
        effects: [{ type: "close_overlays" }],
      };
    }

    if (state.stage.kind === "showing_result") {
      if (sameObservation && !state.changingResult) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          changingResult: false,
          lastObservedPhase: snapshot.phase,
          lastObservedSubmission: mySubmission,
          lastObservedConnected: true,
        },
        effects: [],
      };
    }

    const nextStage: BattleEndStage =
      state.stage.kind === "transitioning" &&
      resolutionId === state.stage.resolutionId
        ? state.stage
        : state.stage.kind === "idle"
          ? state.stage
          : IDLE_STAGE;

    if (
      nextStage === state.stage &&
      !state.changingResult &&
      nextCachedBattle === state.cachedBattle &&
      sameObservation
    ) {
      return { state, effects: [] };
    }

    return {
      state: {
        ...state,
        stage: nextStage,
        changingResult: false,
        cachedBattle: nextCachedBattle,
        lastObservedPhase: snapshot.phase,
        lastObservedSubmission: mySubmission,
        lastObservedConnected: true,
      },
      effects: [],
    };
  }

  let nextStage = state.stage;
  let nextShownReveals = state.shownRevealAnimationIds;
  const effects: BattleEndEffect[] = [];

  if (
    nextStage.kind === "showing_result" ||
    nextStage.kind === "transitioning"
  ) {
    nextStage = IDLE_STAGE;
  }

  if (nextStage.kind === "submitting" && !nextStage.confirmingReveal) {
    const submissionAnswered =
      mySubmission === nextStage.result ||
      (mySubmission !== undefined &&
        mySubmission !== state.lastObservedSubmission);
    if (submissionAnswered) {
      nextStage = IDLE_STAGE;
    }
  }

  const pendingAnimations =
    snapshot.currentBattle?.pending_reveal_animations ?? [];
  const nextAnimation = findNextUnseenAnimation(
    pendingAnimations,
    nextShownReveals,
  );

  if (nextAnimation) {
    if (nextStage.kind === "revealing" && nextStage.activeAnimation === null) {
      nextShownReveals = addToSet(nextShownReveals, nextAnimation.animation_id);
      nextStage = {
        ...nextStage,
        activeAnimation: nextAnimation,
      };
    } else if (nextStage.kind === "idle") {
      nextShownReveals = addToSet(nextShownReveals, nextAnimation.animation_id);
      nextStage = {
        kind: "revealing",
        pendingSubmitResult: null,
        expectedUpgradeIds: [],
        activeAnimation: nextAnimation,
      };
    }
  } else if (
    nextStage.kind === "revealing" &&
    nextStage.activeAnimation === null &&
    nextStage.pendingSubmitResult !== null &&
    allUpgradesAlreadyRevealed(
      nextStage.expectedUpgradeIds,
      snapshot.selfUpgrades,
    )
  ) {
    const result = nextStage.pendingSubmitResult;
    nextStage = {
      kind: "submitting",
      result,
      confirmingReveal: false,
    };
    effects.push({ type: "submit_result", result });
  }

  if (
    nextStage === state.stage &&
    nextCachedBattle === state.cachedBattle &&
    nextShownReveals === state.shownRevealAnimationIds &&
    sameObservation &&
    effects.length === 0
  ) {
    return { state, effects: [] };
  }

  return {
    state: {
      ...state,
      stage: nextStage,
      cachedBattle: nextCachedBattle,
      shownRevealAnimationIds: nextShownReveals,
      lastObservedPhase: snapshot.phase,
      lastObservedSubmission: mySubmission,
      lastObservedConnected: true,
    },
    effects,
  };
}

export function transitionBattleEndFlow(
  state: BattleEndFlowState,
  event: BattleEndEvent,
): BattleEndTransition {
  switch (event.type) {
    case "submit_chosen": {
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

    case "confirm_reveal_and_submit": {
      if (state.stage.kind !== "submitting" || !state.stage.confirmingReveal) {
        return { state, effects: [] };
      }
      if (event.upgradeIds.length === 0) {
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
            expectedUpgradeIds: [...event.upgradeIds],
            activeAnimation: null,
          },
        },
        effects: [
          { type: "reveal_upgrades", upgradeIds: event.upgradeIds },
          { type: "close_overlays" },
        ],
      };
    }

    case "skip_reveal_and_submit": {
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

    case "cancel_reveal_choice": {
      if (state.stage.kind !== "submitting" || !state.stage.confirmingReveal) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, stage: { kind: "idle" } },
        effects: [],
      };
    }

    case "cancel_reveal": {
      if (state.stage.kind !== "revealing") return { state, effects: [] };
      return {
        state: { ...state, stage: { kind: "idle" } },
        effects: [],
      };
    }

    case "reveal_animation_completed": {
      if (state.stage.kind !== "revealing") return { state, effects: [] };
      const nextAnimation = findNextUnseenAnimation(
        event.pendingAnimations,
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
      return {
        state: { ...state, stage: { kind: "idle" } },
        effects: [],
      };
    }

    case "resolution_completed": {
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

    case "transition_settled": {
      if (state.stage.kind !== "transitioning") return { state, effects: [] };
      return {
        state: { ...state, stage: { kind: "idle" } },
        effects: [],
      };
    }

    case "server_error": {
      if (
        state.stage.kind === "submitting" ||
        state.stage.kind === "revealing"
      ) {
        return {
          state: { ...state, stage: { kind: "idle" } },
          effects: [],
        };
      }
      return { state, effects: [] };
    }

    case "disconnected": {
      if (
        state.stage.kind === "submitting" ||
        state.stage.kind === "revealing"
      ) {
        return {
          state: {
            ...state,
            stage: { kind: "idle" },
            lastObservedConnected: false,
          },
          effects: [],
        };
      }
      if (!state.lastObservedConnected) return { state, effects: [] };
      return {
        state: { ...state, lastObservedConnected: false },
        effects: [],
      };
    }

    case "start_changing_result": {
      if (state.stage.kind !== "idle" || state.changingResult) {
        return { state, effects: [] };
      }
      return { state: { ...state, changingResult: true }, effects: [] };
    }

    case "cancel_changing_result": {
      if (!state.changingResult) return { state, effects: [] };
      return { state: { ...state, changingResult: false }, effects: [] };
    }

    case "server_state":
      return handleServerState(state, event.snapshot);
  }
}

export function selectBattleEndView(
  state: BattleEndFlowState,
): BattleEndFlowView {
  const { stage } = state;
  const confirmingReveal =
    stage.kind === "submitting" && stage.confirmingReveal;
  const submitPending =
    (stage.kind === "submitting" && !stage.confirmingReveal) ||
    (stage.kind === "revealing" && stage.pendingSubmitResult !== null) ||
    stage.kind === "showing_result";

  return {
    stage,
    changingResult: state.changingResult,
    confirmingReveal,
    submitPending,
    blocksHotkeys:
      stage.kind === "submitting" ||
      stage.kind === "revealing" ||
      stage.kind === "showing_result",
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

export function useBattleEndFlow({
  snapshot,
  serverErrorNonce = 0,
  onSubmitResult,
  onRevealUpgrade,
  onCloseOverlays,
}: UseBattleEndFlowOptions) {
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
    if (pendingEffects.length === 0) return;
    flushPendingEffects(pendingEffects);
    const frameId = requestAnimationFrame(() => {
      setPendingEffects([]);
    });
    return () => cancelAnimationFrame(frameId);
  }, [pendingEffects]);

  useEffect(() => {
    if (state.stage.kind !== "transitioning") return;
    const frameId = requestAnimationFrame(() => {
      setState(
        (current) =>
          transitionBattleEndFlow(current, { type: "transition_settled" })
            .state,
      );
    });
    return () => cancelAnimationFrame(frameId);
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

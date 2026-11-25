/**
 * React hook owner for the Guided Mode scheduler.
 *
 * Bridges the pure `reduceGuideScheduler` state machine with localStorage progress
 * persistence and gameplay overlay dismissal through explicit reducer transitions.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import {
  createGuideSchedulerState,
  getOverlayExceptionForGuide,
  reduceGuideScheduler,
  type GuideCompletionTrigger,
  type GuideOverlayException,
  type GuideScheduleInput,
  type GuideSchedulerState,
} from "../guided/guideStateMachine";
import {
  clearActiveGuideForGame,
  getGuideProgressForGame,
  markGuideSeenForGame,
  setActiveGuideForGame,
  skipAllGuidesForGame,
} from "../guided/storage";
import type {
  GuidedGuideId,
  GuideStorageIdentity,
  GuidedWalkthroughContext,
} from "../guided/types";
import { resolveNewPlayerPreferenceForGame } from "../utils/deviceIdentity";

interface UseGuideSchedulerOptions {
  gameId: string | undefined;
  playerId: string | undefined | null;
  playerName: string | undefined | null;
  selfPhase: string | undefined;
  guideContext: GuidedWalkthroughContext;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
  closeGameplayOverlays: (except?: GuideOverlayException) => void;
  completionTrigger?: GuideCompletionTrigger | null;
}

interface UseGuideSchedulerResult {
  isGuidedMode: boolean;
  guideRequest: GuideSchedulerState["activeGuide"];
  dismissedImmediately: boolean;
  finishGuide: (guideId: GuidedGuideId) => void;
  skipTutorial: () => void;
  updateGuideStep: (guideId: GuidedGuideId, stepIndex: number) => void;
  advanceGuideStep: (totalSteps: number) => void;
  backGuideStep: () => void;
}

function hydrateGuideScheduler(
  state: GuideSchedulerState,
  options: {
    gameId: string | undefined;
    playerId: string | undefined | null;
    storageScopeKey: string | null;
    storageIdentity: GuideStorageIdentity | null;
    scheduleInput: GuideScheduleInput;
  },
): GuideSchedulerState {
  if (state.scopeKey === options.storageScopeKey) return state;
  const resolvedMode = options.gameId
    ? resolveNewPlayerPreferenceForGame(options.gameId, options.playerId)
    : false;
  const progress = options.storageIdentity
    ? getGuideProgressForGame(options.storageIdentity)
    : {
        seenGuides: new Set<GuidedGuideId>(),
        skippedAll: false,
        activeGuide: null,
      };
  return reduceGuideScheduler(state, {
    type: "hydrate",
    scopeKey: options.storageScopeKey,
    isGuidedMode: resolvedMode,
    progress,
    input: options.scheduleInput,
  });
}

function syncSchedulerRenderState(
  state: GuideSchedulerState,
  options: {
    gameId: string | undefined;
    playerId: string | undefined | null;
    storageScopeKey: string | null;
    storageIdentity: GuideStorageIdentity | null;
    scheduleInput: GuideScheduleInput;
    completionTrigger?: GuideCompletionTrigger | null;
    guideContext: GuidedWalkthroughContext;
  },
): GuideSchedulerState {
  let current = hydrateGuideScheduler(state, options);
  if (
    options.completionTrigger &&
    current.lastCompletionNonce !== options.completionTrigger.nonce
  ) {
    current = reduceGuideScheduler(current, {
      type: "completion_trigger",
      trigger: options.completionTrigger,
      context: options.guideContext,
    });
  }
  return reduceGuideScheduler(current, {
    type: "sync_context",
    input: options.scheduleInput,
  });
}

function scopeKeyFor(
  gameId: string | undefined,
  playerId: string | undefined | null,
  playerName: string | undefined | null,
): string | null {
  return gameId ? `${gameId}::${playerId ?? ""}::${playerName ?? ""}` : null;
}

function useGuideSchedulerActions(
  storageIdentity: GuideStorageIdentity | null,
  setState: React.Dispatch<React.SetStateAction<GuideSchedulerState>>,
): Pick<
  UseGuideSchedulerResult,
  | "finishGuide"
  | "skipTutorial"
  | "updateGuideStep"
  | "advanceGuideStep"
  | "backGuideStep"
> {
  const finishGuide = useCallback(
    (guideId: GuidedGuideId) => {
      if (storageIdentity) {
        markGuideSeenForGame(storageIdentity, guideId);
        clearActiveGuideForGame(storageIdentity);
      }
      setState((prev) =>
        reduceGuideScheduler(prev, { type: "finish_guide", guideId }),
      );
    },
    [setState, storageIdentity],
  );

  const skipTutorial = useCallback(() => {
    if (storageIdentity) {
      skipAllGuidesForGame(storageIdentity);
      clearActiveGuideForGame(storageIdentity);
    }
    setState((prev) => reduceGuideScheduler(prev, { type: "skip_all" }));
  }, [setState, storageIdentity]);

  const updateGuideStep = useCallback(
    (guideId: GuidedGuideId, stepIndex: number) => {
      if (storageIdentity) {
        setActiveGuideForGame(storageIdentity, guideId, stepIndex);
      }
      setState((prev) =>
        reduceGuideScheduler(prev, { type: "update_step", guideId, stepIndex }),
      );
    },
    [setState, storageIdentity],
  );

  const advanceGuideStep = useCallback(
    (totalSteps: number) => {
      setState((prev) => {
        const next = reduceGuideScheduler(prev, {
          type: "advance_step",
          totalSteps,
        });
        if (storageIdentity) {
          if (next.activeGuide) {
            setActiveGuideForGame(
              storageIdentity,
              next.activeGuide.guideId,
              next.activeGuide.stepIndex ?? 0,
            );
          } else if (prev.activeGuide) {
            markGuideSeenForGame(storageIdentity, prev.activeGuide.guideId);
            clearActiveGuideForGame(storageIdentity);
          }
        }
        return next;
      });
    },
    [setState, storageIdentity],
  );

  const backGuideStep = useCallback(() => {
    setState((prev) => {
      const next = reduceGuideScheduler(prev, { type: "back_step" });
      if (storageIdentity && next.activeGuide) {
        setActiveGuideForGame(
          storageIdentity,
          next.activeGuide.guideId,
          next.activeGuide.stepIndex ?? 0,
        );
      }
      return next;
    });
  }, [setState, storageIdentity]);

  return {
    finishGuide,
    skipTutorial,
    updateGuideStep,
    advanceGuideStep,
    backGuideStep,
  };
}

export function useGuideScheduler({
  gameId,
  playerId,
  playerName,
  selfPhase,
  guideContext,
  isSpectator,
  hasOverlayOpen,
  closeGameplayOverlays,
  completionTrigger,
}: UseGuideSchedulerOptions): UseGuideSchedulerResult {
  const storageIdentity = useMemo<GuideStorageIdentity | null>(() => {
    if (!gameId) return null;
    return {
      gameId,
      legacyPlayerId: playerId,
      playerName,
    };
  }, [gameId, playerId, playerName]);

  const storageScopeKey = scopeKeyFor(gameId, playerId, playerName);

  const scheduleInput = useMemo<GuideScheduleInput>(
    () => ({
      gameId,
      selfPhase,
      guideContext,
      isSpectator,
      hasOverlayOpen,
    }),
    [gameId, selfPhase, guideContext, isSpectator, hasOverlayOpen],
  );

  const [state, setState] = useState<GuideSchedulerState>(() =>
    createGuideSchedulerState(
      gameId ? resolveNewPlayerPreferenceForGame(gameId, playerId) : false,
    ),
  );

  // Hydrate synchronously when the game/player scope changes, restoring only showable guides.
  const current = syncSchedulerRenderState(state, {
    gameId,
    playerId,
    storageScopeKey,
    storageIdentity,
    scheduleInput,
    completionTrigger,
    guideContext,
  });

  if (current !== state) {
    setState(current);
  }

  const activeGuide = current.activeGuide;
  const activeNonce = activeGuide?.nonce ?? null;
  const activeGuideId = activeGuide?.guideId ?? null;
  const activeStepIndex = activeGuide?.stepIndex ?? 0;

  const handleGuideActivated = useEffectEvent(
    (guideId: GuidedGuideId, stepIndex: number) => {
      closeGameplayOverlays(getOverlayExceptionForGuide(guideId));
      if (storageIdentity) {
        setActiveGuideForGame(storageIdentity, guideId, stepIndex);
      }
    },
  );

  useEffect(() => {
    if (activeNonce === null || activeGuideId === null) return;
    handleGuideActivated(activeGuideId, activeStepIndex);
  }, [activeNonce, activeGuideId, activeStepIndex]);

  const persistSeenGuides = useEffectEvent(
    (seen: ReadonlySet<GuidedGuideId>, hasActive: boolean) => {
      if (!storageIdentity) return;
      for (const id of seen) {
        markGuideSeenForGame(storageIdentity, id);
      }
      if (!hasActive) {
        clearActiveGuideForGame(storageIdentity);
      }
    },
  );

  useEffect(() => {
    if (current.seenGuides.size === 0 && activeNonce !== null) return;
    persistSeenGuides(current.seenGuides, activeNonce !== null);
  }, [current.seenGuides, activeNonce]);

  const actions = useGuideSchedulerActions(storageIdentity, setState);

  return {
    isGuidedMode: current.isGuidedMode,
    guideRequest: current.activeGuide,
    dismissedImmediately: current.dismissedImmediately,
    ...actions,
  };
}

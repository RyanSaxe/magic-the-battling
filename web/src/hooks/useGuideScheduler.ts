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
}: UseGuideSchedulerOptions) {
  const storageIdentity = useMemo<GuideStorageIdentity | null>(() => {
    if (!gameId) return null;
    return {
      gameId,
      legacyPlayerId: playerId,
      playerName,
    };
  }, [gameId, playerId, playerName]);

  const storageScopeKey = gameId
    ? `${gameId}::${playerId ?? ""}::${playerName ?? ""}`
    : null;

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
  let current = state;
  if (current.scopeKey !== storageScopeKey) {
    const resolvedMode = gameId
      ? resolveNewPlayerPreferenceForGame(gameId, playerId)
      : false;
    const progress = storageIdentity
      ? getGuideProgressForGame(storageIdentity)
      : {
          seenGuides: new Set<GuidedGuideId>(),
          skippedAll: false,
          activeGuide: null,
        };
    current = reduceGuideScheduler(current, {
      type: "hydrate",
      scopeKey: storageScopeKey,
      isGuidedMode: resolvedMode,
      progress,
      input: scheduleInput,
    });
  }

  if (
    completionTrigger &&
    current.lastCompletionNonce !== completionTrigger.nonce
  ) {
    current = reduceGuideScheduler(current, {
      type: "completion_trigger",
      trigger: completionTrigger,
      context: guideContext,
    });
  }

  current = reduceGuideScheduler(current, {
    type: "sync_context",
    input: scheduleInput,
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
    [storageIdentity],
  );

  const skipTutorial = useCallback(() => {
    if (storageIdentity) {
      skipAllGuidesForGame(storageIdentity);
      clearActiveGuideForGame(storageIdentity);
    }
    setState((prev) => reduceGuideScheduler(prev, { type: "skip_all" }));
  }, [storageIdentity]);

  const updateGuideStep = useCallback(
    (guideId: GuidedGuideId, stepIndex: number) => {
      if (storageIdentity) {
        setActiveGuideForGame(storageIdentity, guideId, stepIndex);
      }
      setState((prev) =>
        reduceGuideScheduler(prev, { type: "update_step", guideId, stepIndex }),
      );
    },
    [storageIdentity],
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
    [storageIdentity],
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
  }, [storageIdentity]);

  return {
    isGuidedMode: current.isGuidedMode,
    guideRequest: current.activeGuide,
    dismissedImmediately: current.dismissedImmediately,
    finishGuide,
    skipTutorial,
    updateGuideStep,
    advanceGuideStep,
    backGuideStep,
  };
}

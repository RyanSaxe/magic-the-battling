import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ConditionalGuideId,
  GuidedGuideId,
  GuideRequest,
  GuideStorageIdentity,
  GuidedWalkthroughContext,
} from "./types";
import {
  clearActiveGuideForGame,
  getGuideProgressForGame,
  markGuideSeenForGame,
  setActiveGuideForGame,
  skipAllGuidesForGame,
} from "./storage";
import { resolveNewPlayerPreferenceForGame } from "../utils/deviceIdentity";
import type { Phase } from "../constants/phases";
import { GuideStateContext } from "./guideState";
import {
  getEligibleConditionalGuides,
  isAlwaysOnConditionalGuide,
  isConditionalGuideEligible,
} from "./content";

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return phase === "draft" || phase === "build" || phase === "battle" || phase === "reward";
}

type GuideOverlayException =
  | "rules"
  | "upgrades"
  | "actionMenu"
  | "share"
  | "buildSubmit"
  | "battleSubmit"
  | "battlePanel"
  | "battleZoneModal"
  | null;

interface GuideProviderProps {
  gameId: string | undefined;
  playerId: string | undefined | null;
  playerName: string | undefined | null;
  selfPhase: string | undefined;
  guideContext: GuidedWalkthroughContext;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
  closeGameplayOverlays: (except?: GuideOverlayException) => void;
  children: ReactNode;
}

export function GuideProvider({
  gameId,
  playerId,
  playerName,
  selfPhase,
  guideContext,
  isSpectator,
  hasOverlayOpen,
  closeGameplayOverlays,
  children,
}: GuideProviderProps) {
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    gameId ? resolveNewPlayerPreferenceForGame(gameId, playerId) : false,
  );
  const [seenGuides, setSeenGuides] = useState<Set<GuidedGuideId>>(new Set());
  const [skippedAll, setSkippedAll] = useState(false);
  const [guideRequest, setGuideRequest] = useState<GuideRequest | null>(null);
  const [guideQueue, setGuideQueue] = useState<ConditionalGuideId[]>([]);
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);

  const storageIdentity = useMemo<GuideStorageIdentity | null>(() => {
    if (!gameId) return null;
    return {
      gameId,
      legacyPlayerId: playerId,
      playerName,
    };
  }, [gameId, playerId, playerName]);
  const storageScopeKey = useMemo(
    () => (gameId ? `${gameId}::${playerId ?? ""}::${playerName ?? ""}` : null),
    [gameId, playerId, playerName],
  );
  const progressHydrated = hydratedScopeKey === storageScopeKey;

  useEffect(() => {
    const resolved = gameId
      ? resolveNewPlayerPreferenceForGame(gameId, playerId)
      : false;
    const progress = storageIdentity
      ? getGuideProgressForGame(storageIdentity)
      : {
          seenGuides: new Set<GuidedGuideId>(),
          skippedAll: false,
          activeGuide: null,
        };

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(resolved);
      setSeenGuides(progress.seenGuides);
      setSkippedAll(progress.skippedAll);
      setGuideRequest(
        progress.activeGuide
          ? {
              guideId: progress.activeGuide.guideId,
              nonce: Date.now(),
              stepIndex: progress.activeGuide.stepIndex,
            }
          : null,
      );
      setGuideQueue([]);
      setHydratedScopeKey(storageScopeKey);
    });

    return () => {
      cancelled = true;
    };
  }, [gameId, playerId, storageIdentity, storageScopeKey]);

  const finishGuide = useCallback(
    (guideId: GuidedGuideId) => {
      if (storageIdentity) {
        markGuideSeenForGame(storageIdentity, guideId);
        clearActiveGuideForGame(storageIdentity);
      }
      setSeenGuides((current) => {
        const next = new Set(current);
        next.add(guideId);
        return next;
      });
      setGuideRequest(null);
    },
    [storageIdentity],
  );

  const skipTutorial = useCallback(() => {
    if (storageIdentity) {
      skipAllGuidesForGame(storageIdentity);
      clearActiveGuideForGame(storageIdentity);
    }
    setSkippedAll(true);
    setGuideRequest(null);
    setGuideQueue([]);
  }, [storageIdentity]);

  const requestGuide = useCallback(
    (guideId: GuidedGuideId) => {
      const overlayException =
        guideId === "build_play_draw" ? "buildSubmit" as const
        : guideId === "battle_result_submit" ? "battleSubmit" as const
        : null;
      closeGameplayOverlays(overlayException);
      if (storageIdentity) {
        setActiveGuideForGame(storageIdentity, guideId, 0);
      }
      setGuideRequest((current) =>
        current ?? { guideId, nonce: Date.now(), stepIndex: 0 },
      );
    },
    [closeGameplayOverlays, storageIdentity],
  );

  const updateGuideStep = useCallback(
    (guideId: GuidedGuideId, stepIndex: number) => {
      if (!storageIdentity) return;
      setActiveGuideForGame(storageIdentity, guideId, stepIndex);
    },
    [storageIdentity],
  );

  const eligibleConditionalGuides = useMemo(
    () => getEligibleConditionalGuides(guideContext),
    [guideContext],
  );

  useEffect(() => {
    if (!gameId || !progressHydrated || isSpectator) {
      return;
    }

    const activeGuideId = guideRequest?.guideId ?? null;
    const pending = eligibleConditionalGuides.filter(
      (guideId) =>
        (isGuidedMode || isAlwaysOnConditionalGuide(guideId))
        && (!skippedAll || isAlwaysOnConditionalGuide(guideId))
        && !seenGuides.has(guideId)
        && activeGuideId !== guideId
        && !guideQueue.includes(guideId),
    );

    if (pending.length === 0) {
      return;
    }

    queueMicrotask(() => {
      setGuideQueue((current) => {
        const next = [...current];
        for (const guideId of pending) {
          if (!next.includes(guideId)) {
            next.push(guideId);
          }
        }
        return next;
      });
    });
  }, [
    eligibleConditionalGuides,
    gameId,
    guideQueue,
    guideRequest?.guideId,
    progressHydrated,
    isGuidedMode,
    isSpectator,
    seenGuides,
    skippedAll,
  ]);

  useEffect(() => {
    if (
      !gameId ||
      !selfPhase ||
      !progressHydrated ||
      isSpectator ||
      guideRequest !== null ||
      hasOverlayOpen
    ) {
      return;
    }

    const nextQueue = guideQueue.filter(
      (guideId) =>
        (isGuidedMode || isAlwaysOnConditionalGuide(guideId))
        && (!skippedAll || isAlwaysOnConditionalGuide(guideId))
        && !seenGuides.has(guideId)
        && isConditionalGuideEligible(guideId, guideContext),
    );

    if (nextQueue.length !== guideQueue.length) {
      queueMicrotask(() => {
        setGuideQueue(nextQueue);
      });
    }

    if (nextQueue.length > 0) {
      queueMicrotask(() => {
        requestGuide(nextQueue[0]);
      });
      return;
    }

    if (!isGuidedMode || skippedAll) {
      return;
    }

    if (!seenGuides.has("welcome")) {
      queueMicrotask(() => {
        requestGuide("welcome");
      });
      return;
    }

    if (
      selfPhase === "build"
      && guideContext.showBuildSubmitPopover
      && !seenGuides.has("build_play_draw")
    ) {
      queueMicrotask(() => {
        requestGuide("build_play_draw");
      });
      return;
    }

    if (
      selfPhase === "battle"
      && guideContext.showBattleSubmitPopover
      && !seenGuides.has("battle_result_submit")
    ) {
      queueMicrotask(() => {
        requestGuide("battle_result_submit");
      });
      return;
    }

    if (isTimelinePhase(selfPhase) && !seenGuides.has(selfPhase)) {
      queueMicrotask(() => {
        requestGuide(selfPhase);
      });
      return;
    }

    if (
      selfPhase === "reward"
      && guideContext.isStageEnd
      && !seenGuides.has("reward_stage_end")
    ) {
      queueMicrotask(() => requestGuide("reward_stage_end"));
      return;
    }

    if (nextQueue.length > 0) {
      const [nextGuide, ...rest] = nextQueue;
      queueMicrotask(() => {
        setGuideQueue(rest);
        requestGuide(nextGuide);
      });
    }
  }, [
    gameId,
    guideContext,
    guideQueue,
    guideRequest,
    hasOverlayOpen,
    progressHydrated,
    isGuidedMode,
    isSpectator,
    requestGuide,
    seenGuides,
    selfPhase,
    skippedAll,
  ]);

  const value = useMemo(
    () => ({
      isGuidedMode,
      guideRequest,
      finishGuide,
      skipTutorial,
      updateGuideStep,
    }),
    [finishGuide, guideRequest, isGuidedMode, skipTutorial, updateGuideStep],
  );

  return (
    <GuideStateContext.Provider value={value}>
      {children}
    </GuideStateContext.Provider>
  );
}

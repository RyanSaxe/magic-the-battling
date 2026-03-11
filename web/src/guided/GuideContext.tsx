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
  getGuideProgressForGame,
  markGuideSeenForGame,
  skipAllGuidesForGame,
} from "./storage";
import { resolveNewPlayerPreferenceForGame } from "../utils/deviceIdentity";
import type { Phase } from "../constants/phases";
import { GuideStateContext } from "./guideState";
import { getEligibleConditionalGuides, isConditionalGuideEligible } from "./content";

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return phase === "draft" || phase === "build" || phase === "battle" || phase === "reward";
}

interface GuideProviderProps {
  gameId: string | undefined;
  playerId: string | undefined | null;
  playerName: string | undefined | null;
  selfPhase: string | undefined;
  guideContext: GuidedWalkthroughContext;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
  closeGameplayOverlays: () => void;
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

  const storageIdentity = useMemo<GuideStorageIdentity | null>(() => {
    if (!gameId) return null;
    return {
      gameId,
      legacyPlayerId: playerId,
      playerName,
    };
  }, [gameId, playerId, playerName]);

  useEffect(() => {
    const resolved = gameId
      ? resolveNewPlayerPreferenceForGame(gameId, playerId)
      : false;
    const progress = storageIdentity
      ? getGuideProgressForGame(storageIdentity)
      : { seenGuides: new Set<GuidedGuideId>(), skippedAll: false };

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(resolved);
      setSeenGuides(progress.seenGuides);
      setSkippedAll(progress.skippedAll);
      setGuideRequest(null);
      setGuideQueue([]);
    });

    return () => {
      cancelled = true;
    };
  }, [gameId, playerId, storageIdentity]);

  const finishGuide = useCallback(
    (guideId: GuidedGuideId) => {
      if (storageIdentity) {
        markGuideSeenForGame(storageIdentity, guideId);
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
    }
    setSkippedAll(true);
    setGuideRequest(null);
    setGuideQueue([]);
  }, [storageIdentity]);

  const requestGuide = useCallback(
    (guideId: GuidedGuideId) => {
      closeGameplayOverlays();
      setGuideRequest((current) =>
        current ?? { guideId, nonce: Date.now() },
      );
    },
    [closeGameplayOverlays],
  );

  const eligibleConditionalGuides = useMemo(
    () => getEligibleConditionalGuides(guideContext),
    [guideContext],
  );

  useEffect(() => {
    if (!gameId || !isGuidedMode || isSpectator || skippedAll) {
      return;
    }

    const activeGuideId = guideRequest?.guideId ?? null;
    const pending = eligibleConditionalGuides.filter(
      (guideId) =>
        !seenGuides.has(guideId)
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
    isGuidedMode,
    isSpectator,
    seenGuides,
    skippedAll,
  ]);

  useEffect(() => {
    if (
      !gameId ||
      !selfPhase ||
      !isGuidedMode ||
      isSpectator ||
      skippedAll ||
      guideRequest !== null ||
      hasOverlayOpen
    ) {
      return;
    }

    const nextQueue = guideQueue.filter(
      (guideId) =>
        !seenGuides.has(guideId)
        && isConditionalGuideEligible(guideId, guideContext),
    );

    if (nextQueue.length !== guideQueue.length) {
      queueMicrotask(() => {
        setGuideQueue(nextQueue);
      });
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

    if (isTimelinePhase(selfPhase) && !seenGuides.has(selfPhase)) {
      queueMicrotask(() => {
        requestGuide(selfPhase);
      });
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
    isGuidedMode,
    isSpectator,
    requestGuide,
    seenGuides,
    selfPhase,
    skippedAll,
  ]);

  const value = useMemo(
    () => ({ isGuidedMode, guideRequest, finishGuide, skipTutorial }),
    [finishGuide, guideRequest, isGuidedMode, skipTutorial],
  );

  return (
    <GuideStateContext.Provider value={value}>
      {children}
    </GuideStateContext.Provider>
  );
}

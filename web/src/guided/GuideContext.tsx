import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConditionalGuideId, GuidedGuideId, GuideRequest, GuidedWalkthroughContext } from "./types";
import { getSeenGuidesForGame, markGuideSeenForGame } from "./storage";
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
  const [guideRequest, setGuideRequest] = useState<GuideRequest | null>(null);
  const [guideQueue, setGuideQueue] = useState<ConditionalGuideId[]>([]);

  useEffect(() => {
    const resolved = gameId
      ? resolveNewPlayerPreferenceForGame(gameId, playerId)
      : false;
    const nextSeenGuides = gameId
      ? getSeenGuidesForGame(gameId, playerId)
      : new Set<GuidedGuideId>();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(resolved);
      setSeenGuides(nextSeenGuides);
      setGuideRequest(null);
      setGuideQueue([]);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, playerId]);

  const startGuide = useCallback(
    (guideId: GuidedGuideId, isReplay = false) => {
      closeGameplayOverlays();
      setGuideRequest({ guideId, isReplay, nonce: Date.now() });
    },
    [closeGameplayOverlays],
  );

  const handleGuideClose = useCallback(
    (guideId: GuidedGuideId) => {
      if (gameId) {
        markGuideSeenForGame(gameId, guideId, playerId);
      }
      setSeenGuides((current) => {
        const next = new Set(current);
        next.add(guideId);
        return next;
      });
      setGuideRequest(null);
    },
    [gameId, playerId],
  );

  const conditionalOptions = useMemo(
    () => ({ isFirstBuildGuide: !seenGuides.has("build") }),
    [seenGuides],
  );

  const eligibleConditionalGuides = useMemo(
    () => getEligibleConditionalGuides(guideContext, conditionalOptions),
    [conditionalOptions, guideContext],
  );

  useEffect(() => {
    if (!gameId || !isGuidedMode || isSpectator) {
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
  }, [eligibleConditionalGuides, gameId, guideQueue, guideRequest?.guideId, isGuidedMode, isSpectator, seenGuides]);

  useEffect(() => {
    if (
      !gameId ||
      !selfPhase ||
      !isGuidedMode ||
      isSpectator ||
      guideRequest !== null ||
      hasOverlayOpen
    ) {
      return;
    }

    const nextQueue = guideQueue.filter((guideId) =>
      !seenGuides.has(guideId)
      && isConditionalGuideEligible(guideId, guideContext, conditionalOptions),
    );

    if (nextQueue.length !== guideQueue.length) {
      queueMicrotask(() => {
        setGuideQueue(nextQueue);
      });
    }

    if (!seenGuides.has("welcome")) {
      queueMicrotask(() => {
        setGuideRequest((current) =>
          current ?? { guideId: "welcome", nonce: Date.now() },
        );
      });
      return;
    }

    const shouldShowBuildTreasureHint =
      selfPhase === "build"
      && !seenGuides.has("build")
      && !seenGuides.has("hint_treasure_producer")
      && isConditionalGuideEligible("hint_treasure_producer", guideContext, conditionalOptions);

    if (shouldShowBuildTreasureHint) {
      queueMicrotask(() => {
        setGuideRequest((current) =>
          current ?? { guideId: "hint_treasure_producer", nonce: Date.now() },
        );
      });
      return;
    }

    if (!isTimelinePhase(selfPhase) || seenGuides.has(selfPhase)) {
      if (nextQueue.length === 0) {
        return;
      }
      queueMicrotask(() => {
        const [nextGuide, ...rest] = nextQueue;
        setGuideQueue(rest);
        setGuideRequest((current) =>
          current ?? { guideId: nextGuide, nonce: Date.now() },
        );
      });
      return;
    }

    queueMicrotask(() => {
      setGuideRequest((current) =>
        current ?? { guideId: selfPhase, nonce: Date.now() },
      );
    });
  }, [
    gameId,
    selfPhase,
    guideRequest,
    guideQueue,
    guideContext,
    seenGuides,
    isGuidedMode,
    isSpectator,
    hasOverlayOpen,
    conditionalOptions,
  ]);

  const value = useMemo(
    () => ({ isGuidedMode, guideRequest, startGuide, handleGuideClose }),
    [isGuidedMode, guideRequest, startGuide, handleGuideClose],
  );

  return (
    <GuideStateContext.Provider value={value}>
      {children}
    </GuideStateContext.Provider>
  );
}

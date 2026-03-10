import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GuidedGuideId, GuideRequest } from "./types";
import { getSeenGuidesForGame, markGuideSeenForGame } from "./storage";
import { resolveNewPlayerPreferenceForGame } from "../utils/deviceIdentity";
import type { Phase } from "../constants/phases";
import { GuideStateContext } from "./guideState";

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return phase === "draft" || phase === "build" || phase === "battle" || phase === "reward";
}

interface GuideProviderProps {
  gameId: string | undefined;
  playerId: string | undefined | null;
  selfPhase: string | undefined;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
  closeGameplayOverlays: () => void;
  children: ReactNode;
}

export function GuideProvider({
  gameId,
  playerId,
  selfPhase,
  isSpectator,
  hasOverlayOpen,
  closeGameplayOverlays,
  children,
}: GuideProviderProps) {
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    gameId ? resolveNewPlayerPreferenceForGame(gameId, playerId) : false,
  );
  const seenGuidesRef = useRef<Set<GuidedGuideId>>(new Set());
  const [guideRequest, setGuideRequest] = useState<GuideRequest | null>(null);

  useEffect(() => {
    const resolved = gameId
      ? resolveNewPlayerPreferenceForGame(gameId, playerId)
      : false;
    seenGuidesRef.current = gameId
      ? getSeenGuidesForGame(gameId, playerId)
      : new Set();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(resolved);
      setGuideRequest(null);
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
      seenGuidesRef.current.add(guideId);
      setGuideRequest(null);
    },
    [gameId, playerId],
  );

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

    if (!seenGuidesRef.current.has("welcome")) {
      queueMicrotask(() => {
        setGuideRequest((current) =>
          current ?? { guideId: "welcome", nonce: Date.now() },
        );
      });
      return;
    }

    if (!isTimelinePhase(selfPhase) || seenGuidesRef.current.has(selfPhase)) {
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
    isGuidedMode,
    isSpectator,
    hasOverlayOpen,
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

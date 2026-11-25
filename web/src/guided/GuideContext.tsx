/** Context provider exposing the Guided Mode scheduler owned by `useGuideScheduler`. */
import { useMemo, type ReactElement, type ReactNode } from "react";
import { useGuideScheduler } from "../hooks/useGuideScheduler";
import type {
  GuideCompletionTrigger,
  GuideOverlayException,
} from "./guideStateMachine";
import { GuideStateContext } from "./guideState";
import type { GuidedWalkthroughContext } from "./types";

interface GuideProviderProps {
  gameId: string | undefined;
  playerId: string | undefined | null;
  playerName: string | undefined | null;
  selfPhase: string | undefined;
  guideContext: GuidedWalkthroughContext;
  isSpectator: boolean;
  hasOverlayOpen: boolean;
  closeGameplayOverlays: (except?: GuideOverlayException) => void;
  completionTrigger?: GuideCompletionTrigger | null;
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
  completionTrigger,
  children,
}: GuideProviderProps): ReactElement {
  const {
    isGuidedMode,
    guideRequest,
    dismissedImmediately,
    finishGuide,
    skipTutorial,
    updateGuideStep,
    advanceGuideStep,
    backGuideStep,
  } = useGuideScheduler({
    gameId,
    playerId,
    playerName,
    selfPhase,
    guideContext,
    isSpectator,
    hasOverlayOpen,
    closeGameplayOverlays,
    completionTrigger,
  });

  const value = useMemo(
    () => ({
      isGuidedMode,
      guideRequest,
      dismissedImmediately,
      finishGuide,
      skipTutorial,
      updateGuideStep,
      advanceGuideStep,
      backGuideStep,
    }),
    [
      advanceGuideStep,
      backGuideStep,
      dismissedImmediately,
      finishGuide,
      guideRequest,
      isGuidedMode,
      skipTutorial,
      updateGuideStep,
    ],
  );

  return (
    <GuideStateContext.Provider value={value}>
      {children}
    </GuideStateContext.Provider>
  );
}

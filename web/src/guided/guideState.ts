import { createContext, useContext } from "react";
import type { GuidedGuideId, GuideRequest } from "./types";

export interface GuideState {
  isGuidedMode: boolean;
  guideRequest: GuideRequest | null;
  finishGuide: (guideId: GuidedGuideId) => void;
  skipTutorial: () => void;
  updateGuideStep: (guideId: GuidedGuideId, stepIndex: number) => void;
}

export const GuideStateContext = createContext<GuideState | null>(null);

export function useGuideContext(): GuideState {
  const ctx = useContext(GuideStateContext);
  if (!ctx) throw new Error("useGuideContext must be used within GuideProvider");
  return ctx;
}

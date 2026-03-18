import type { GuideRequest, GuidedGuideId } from "../guided/types";

export interface VisibleGuideStep {
  guideId: GuidedGuideId;
  stepId: string;
}

export function shouldBlockGuidesForBattleResolution(options: {
  activeBattleResolutionId: string | null;
  battleResolutionId: string | null | undefined;
  hasCachedBattle: boolean;
  selfPhase: string | undefined;
  shownResolutionIds: Set<string>;
}): boolean {
  const {
    activeBattleResolutionId,
    battleResolutionId,
    hasCachedBattle,
    selfPhase,
    shownResolutionIds,
  } = options;

  if (!battleResolutionId || !selfPhase || selfPhase === "battle") {
    return false;
  }

  if (activeBattleResolutionId === battleResolutionId) {
    return true;
  }

  return hasCachedBattle && !shownResolutionIds.has(battleResolutionId);
}

export function matchesGuideCompletionTrigger(options: {
  activeGuideRequest: GuideRequest | null;
  activeStepId: string | null | undefined;
  trigger: {
    guideId: GuidedGuideId;
    stepId: string;
  } | null;
}): boolean {
  const { activeGuideRequest, activeStepId, trigger } = options;

  if (!activeGuideRequest || !activeStepId || !trigger) {
    return false;
  }

  return (
    activeGuideRequest.guideId === trigger.guideId
    && activeStepId === trigger.stepId
  );
}

export function isSubmitPopoverGuideStepActive(
  visibleGuideStep: VisibleGuideStep | null,
  phase: "build" | "battle",
): boolean {
  if (!visibleGuideStep) {
    return false;
  }

  if (phase === "build") {
    return (
      visibleGuideStep.guideId === "build_play_draw"
      && visibleGuideStep.stepId === "play-draw"
    );
  }

  return (
    visibleGuideStep.guideId === "battle_result_submit"
    && visibleGuideStep.stepId === "result-submit"
  );
}

export function shouldDisableGameplayHotkeys(options: {
  modalOpen: boolean;
  visibleGuideStep: VisibleGuideStep | null;
}): boolean {
  const { modalOpen, visibleGuideStep } = options;
  return modalOpen || visibleGuideStep !== null;
}

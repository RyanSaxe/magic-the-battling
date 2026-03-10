import type { BattleView, SelfPlayerView } from "../types";
import type { Phase } from "../constants/phases";

export type GuidedGuideId = "welcome" | Phase;

export type GuideTargetId =
  | "timeline-stage-round"
  | "timeline-current-phase"
  | "build-workspace"
  | "build-battlefield"
  | "build-hand"
  | "build-submit"
  | "build-submit-popover"
  | "battle-board"
  | "battle-actions"
  | "battle-submit"
  | "reward-summary"
  | "reward-progression"
  | "draft-pack"
  | "draft-pool"
  | "phase-action-bar";

export type GuidePlacement = "top" | "right" | "bottom" | "left" | "center";

export type GuideStepCompletion =
  | { type: "manual" }
  | { type: "target-click" }
  | {
      type: "condition";
      allowInteraction?: boolean;
      isComplete: (
        ctx: GuidedWalkthroughContext,
        meta: GuideStepMeta | undefined,
      ) => boolean;
    };

export interface GuideStepMeta {
  [key: string]: string | number | boolean | null | undefined;
}

export interface GuideStepContent {
  summary: string;
  detail?: string;
  actionHint?: string | ((ctx: GuidedWalkthroughContext) => string);
}

export interface GuidedWalkthroughContext {
  currentPhase: Phase | null;
  selfPlayer: SelfPlayerView | null;
  currentBattle: BattleView | null;
  useUpgrades: boolean;
  hasRewardUpgradeChoice: boolean;
  selectedBasicsCount: number;
  handCount: number;
  handSize: number;
  buildReady: boolean;
  buildReadyPending: boolean;
  showBuildSubmitPopover: boolean;
  showBattleSubmitPopover: boolean;
  canManipulateOpponent: boolean;
  battleStateHash: string;
  closeGameplayOverlays: () => void;
  openBuildSubmitPopover: () => void;
  openBattleSubmitPopover: () => void;
}

export interface GuideStepDefinition {
  id: string;
  title: string;
  content: GuideStepContent;
  targetId?: GuideTargetId;
  placement?: GuidePlacement;
  spotlightPadding?: number;
  completion?: GuideStepCompletion;
  onEnter?: (
    ctx: GuidedWalkthroughContext,
  ) => GuideStepMeta | void;
}

export interface GuideDefinition {
  id: GuidedGuideId;
  label: string;
  phase?: Phase;
  steps: GuideStepDefinition[];
}

export interface GuideRequest {
  guideId: GuidedGuideId;
  isReplay?: boolean;
  nonce: number;
}

import type { BattleView, SelfPlayerView, ZoneName } from "../types";
import type { Phase } from "../constants/phases";

export type SidebarGuideTab = "you" | "opponents" | "others";

export type ConditionalGuideId =
  | "hint_treasure_producer"
  | "hint_treasure_cap"
  | "hint_reward_three_three"
  | "hint_build_unapplied_upgrade";

export type GuidedGuideId = "welcome" | Phase | ConditionalGuideId;

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
  | "battle-action-add-counter"
  | "battle-submit"
  | "battle-opponent-hand"
  | "reward-summary"
  | "reward-progression"
  | "reward-upgrades"
  | "draft-pack"
  | "draft-pool"
  | "draft-mobile-treasure"
  | "phase-action-bar"
  | "sidebar-toggle"
  | "sidebar-panel"
  | "sidebar-player-tabs"
  | "sidebar-tab-opponents"
  | "sidebar-opponent-list"
  | "sidebar-revealed-details"
  | "sidebar-current-player-treasure";

export type GuidePlacement = "top" | "right" | "bottom" | "left" | "center";
export type GuidePrimaryActionMode = "advance" | "minimize";
export type GuideTargetSelector =
  | string
  | ((ctx: GuidedWalkthroughContext) => string | undefined);

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
  minimizedText?: string | ((ctx: GuidedWalkthroughContext) => string);
}

export interface GuidedWalkthroughContext {
  currentPhase: Phase | null;
  selfPlayer: SelfPlayerView | null;
  currentBattle: BattleView | null;
  isMobile: boolean;
  sidebarOpen: boolean;
  revealedPlayerName: string | null;
  revealedPlayerTab: SidebarGuideTab;
  useUpgrades: boolean;
  hasRewardUpgradeChoice: boolean;
  selectedBasicsCount: number;
  handCount: number;
  handSize: number;
  buildReady: boolean;
  buildReadyPending: boolean;
  showBuildSubmitPopover: boolean;
  showBattleSubmitPopover: boolean;
  actionMenuOpen: boolean;
  selectedBattleCardId: string | null;
  selectedBattleCardZone: ZoneName | null;
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
  targetSelector?: GuideTargetSelector;
  placement?: GuidePlacement;
  spotlightPadding?: number;
  primaryActionLabel?: string;
  primaryActionMode?: GuidePrimaryActionMode;
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

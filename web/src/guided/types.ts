import type { BattleView, Card as GameCard, SelfPlayerView } from "../types";
import type { Phase } from "../constants/phases";

export type SidebarGuideTab = "you" | "opponents" | "others";

export type ConditionalGuideId =
  | "hint_treasure_producer"
  | "hint_treasure_cap"
  | "hint_build_unapplied_upgrade";

export type GuidedGuideId =
  | "welcome"
  | "build"
  | "build_play_draw"
  | "battle"
  | "battle_result_submit"
  | "reward"
  | "reward_stage_end"
  | "draft"
  | ConditionalGuideId;

export type GuideTargetId =
  | "timeline-stage-round"
  | "timeline-next-stage-round"
  | "timeline-phase-draft"
  | "timeline-phase-build"
  | "timeline-phase-battle"
  | "timeline-phase-reward"
  | "build-hand"
  | "build-workspace"
  | "build-battlefield"
  | "build-sideboard"
  | "build-submit-popover"
  | "build-apply-upgrade"
  | "game-content"
  | "battle-hand"
  | "battle-battlefield"
  | "battle-opponent-hand"
  | "battle-actions"
  | "battle-submit"
  | "battle-submit-popover"
  | "reward-summary"
  | "reward-progression"
  | "reward-current-upgrades"
  | "reward-upgrades"
  | "draft-pack"
  | "draft-pool"
  | "draft-roll"
  | "draft-mobile-treasure"
  | "sidebar-current-player-treasure"
  | "sidebar-toggle"
  | "sidebar-player-tabs"
  | "sidebar-tab-opponents"
  | "sidebar-opponent-list"
  | "sidebar-revealed-details"
  | "phase-action-bar";

export type GuidePlacement = "top" | "right" | "bottom" | "left" | "center";
export type GuideCardPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface GuideMedia {
  alt: string;
  imageUrl: string;
}

export interface GuideStepContent {
  summary: string;
  detail?: string;
  media?: GuideMedia;
  gallery?: GuideMedia[];
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
  showBuildSubmitPopover: boolean;
  showBattleSubmitPopover: boolean;
  availableRewardUpgrades: GameCard[];
  draftGuideOpponentName: string | null;
  draftGuideOpponentTab: SidebarGuideTab;
  draftGuideOpponentRevealedCount: number;
  isStageEnd: boolean;
}

export interface GuideStepSidebarState {
  openOnMobile?: boolean | ((ctx: GuidedWalkthroughContext) => boolean | undefined);
  tab?: SidebarGuideTab | ((ctx: GuidedWalkthroughContext) => SidebarGuideTab | undefined);
  playerName?: string | null | ((ctx: GuidedWalkthroughContext) => string | null | undefined);
}

export interface GuideStepDefinition {
  id: string;
  title: string;
  content: GuideStepContent;
  targetId?: GuideTargetId;
  targetSelector?: string | ((ctx: GuidedWalkthroughContext) => string | undefined);
  positionTargetId?: GuideTargetId | ((ctx: GuidedWalkthroughContext) => GuideTargetId | undefined);
  positionTargetSelector?: string | ((ctx: GuidedWalkthroughContext) => string | undefined);
  placement?: GuidePlacement;
  cardPlacement?: GuideCardPlacement;
  mobileCardPlacement?: GuideCardPlacement;
  spotlightPadding?: number;
  primaryActionLabel?: string;
  allowTargetInteraction?: boolean;
  sidebarState?: GuideStepSidebarState;
}

export interface GuideDefinition {
  id: GuidedGuideId;
  label: string;
  phase?: Phase;
  showSkipAll?: boolean;
  steps: GuideStepDefinition[];
}

export interface GuideRequest {
  guideId: GuidedGuideId;
  nonce: number;
  stepIndex?: number;
}

export interface ActiveGuideProgress {
  guideId: GuidedGuideId;
  stepIndex: number;
}

export interface GuideProgressState {
  seenGuides: Set<GuidedGuideId>;
  skippedAll: boolean;
  activeGuide: ActiveGuideProgress | null;
}

export interface GuideStorageIdentity {
  gameId: string;
  legacyPlayerId?: string | null;
  playerName?: string | null;
}

export interface GuideVisualCard {
  card: GameCard;
}

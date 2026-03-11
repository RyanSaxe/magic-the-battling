import type { BattleView, Card as GameCard, SelfPlayerView } from "../types";
import type { Phase } from "../constants/phases";

export type SidebarGuideTab = "you" | "opponents" | "others";

export type ConditionalGuideId =
  | "hint_treasure_producer"
  | "hint_treasure_cap";

export type GuidedGuideId =
  | "welcome"
  | "build"
  | "build_play_draw"
  | "battle"
  | "reward"
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
  | "build-battlefield"
  | "build-sideboard"
  | "build-submit-popover"
  | "battle-hand"
  | "battle-battlefield"
  | "battle-opponent-hand"
  | "reward-summary"
  | "reward-upgrades"
  | "draft-pack"
  | "draft-pool"
  | "draft-roll"
  | "draft-mobile-treasure"
  | "sidebar-current-player-treasure";

export type GuidePlacement = "top" | "right" | "bottom" | "left" | "center";

export interface GuideMedia {
  alt: string;
  imageUrl: string;
}

export interface GuideStepContent {
  summary: string;
  detail?: string;
  media?: GuideMedia;
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
}

export interface GuideStepDefinition {
  id: string;
  title: string;
  content: GuideStepContent;
  targetId?: GuideTargetId;
  targetSelector?: string | ((ctx: GuidedWalkthroughContext) => string | undefined);
  placement?: GuidePlacement;
  spotlightPadding?: number;
  primaryActionLabel?: string;
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
}

export interface GuideProgressState {
  seenGuides: Set<GuidedGuideId>;
  skippedAll: boolean;
}

export interface GuideStorageIdentity {
  gameId: string;
  legacyPlayerId?: string | null;
  playerName?: string | null;
}

export interface GuideVisualCard {
  card: GameCard;
}

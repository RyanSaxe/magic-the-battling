/**
 * Pure derived-state selectors and controller types for `useGameController`.
 */
import type { Dispatch, SetStateAction } from "react";
import type { GameVoiceControls } from "../components/game/GameBattleChrome";
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { FightSidebarView } from "../components/sidebar";
import type { Phase } from "../constants/phases";
import type { useContextStrip } from "../contexts";
import type { useDndActions, ZoneOwner } from "../dnd";
import type { GuideCompletionTrigger } from "../guided/guideStateMachine";
import type { GuidedWalkthroughContext } from "../guided/types";
import {
  isSubmitPopoverGuideStepActive,
  type VisibleGuideStep,
} from "../pages/gameGuideState";
import type { PhaseActionState } from "../pages/pendingPhaseAction";
import type { BattleZoneModalState } from "../pages/phases/Battle";
import type {
  BattleView,
  Card as CardType,
  GameState,
  PlayerView,
  ServerNoticeStatus,
  ZoneName,
} from "../types";
import { getOrdinal } from "../utils/format";
import { comparePlayersForSidebar } from "../utils/playerPlacement";
import type { TabSession } from "../utils/tabSession";
import { getUnrevealedAppliedUpgrades } from "../utils/upgrades";
import type { UseBattleEndFlowResult } from "./useBattleEndFlow";
import type { GameActions } from "./useGame";
import type { SeatState } from "./useGameSeat";
import type { GameShellMode } from "./useGameShellMode";
import type {
  GameSurface,
  GameSurfaceKind,
  PanelZone,
  UpgradesWindowMode,
  UseGameSurfacesResult,
} from "./useGameSurfaces";
import type {
  SpectateRequestControls,
  SpectateState,
} from "./useSpectateRequest";
import type { useViewportCardSizes } from "./useViewportCardSizes";
import type { SpectateRequest } from "./useWebSocket";

export type WatchingState = Extract<SpectateState, { kind: "watching" }>;

const END_PHASES = new Set<string>(["eliminated", "winner", "game_over"]);
const INACTIVE_SPECTATE_PHASES = new Set<string>([
  "eliminated",
  "awaiting_elimination",
  "winner",
  "game_over",
]);

export function isTimelinePhase(phase: string | undefined): phase is Phase {
  return (
    phase === "draft" ||
    phase === "build" ||
    phase === "battle" ||
    phase === "reward"
  );
}

function compareDraftGuideOpponents(a: PlayerView, b: PlayerView): number {
  const revealedDiff =
    b.most_recently_revealed_cards.length -
    a.most_recently_revealed_cards.length;
  if (revealedDiff !== 0) return revealedDiff;
  const pairingDiff =
    (b.pairing_probability ?? -1) - (a.pairing_probability ?? -1);
  if (pairingDiff !== 0) return pairingDiff;
  return comparePlayersForSidebar(a, b);
}

export function selectDraftGuideOpponent(
  players: PlayerView[],
  currentPlayerName: string,
): { name: string | null; revealedCount: number } {
  let best: PlayerView | null = null;
  for (const player of players) {
    if (
      player.name === currentPlayerName ||
      player.pairing_probability === null ||
      player.pairing_probability <= 0
    ) {
      continue;
    }
    if (!best || compareDraftGuideOpponents(player, best) < 0) {
      best = player;
    }
  }
  if (!best) return { name: null, revealedCount: 0 };
  return {
    name: best.name,
    revealedCount: best.most_recently_revealed_cards.length,
  };
}

export function resolveWsSessionId(
  watching: WatchingState | null,
  isSpectateMode: boolean,
  session: TabSession | null,
): string | null {
  if (watching) return watching.sessionId;
  if (isSpectateMode) return null;
  return session?.sessionId ?? null;
}

export function findMatchedUpgradeAnimation(
  pending: { upgradeId: string; targetId: string } | null,
  gameState: GameState | null,
): { upgrade: CardType; target: CardType } | null {
  if (!pending || gameState?.self_player.phase !== "build") return null;
  const matched = gameState.self_player.upgrades.find(
    (candidate) =>
      candidate.id === pending.upgradeId &&
      candidate.upgrade_target?.id === pending.targetId,
  );
  if (!matched?.upgrade_target) return null;
  return { upgrade: matched, target: matched.upgrade_target };
}

function resolveUpgradesModalMode(
  windowMode: UpgradesWindowMode | undefined,
  hasPendingBuildUpgrades: boolean,
): "view" | "apply" | "reveal" {
  if (windowMode === "view" || windowMode === "reveal") return windowMode;
  return hasPendingBuildUpgrades ? "apply" : "view";
}

function computeShareMeta(
  gameId: string,
  playerName: string,
  selfPlacement: number,
): { watchUrl: string; shareUrl: string; shareText: string } {
  const watchUrl = new URL("?spectate=true", window.location.href).toString();
  const shareUrl = gameId
    ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(playerName)}`
    : "";
  const shareText =
    selfPlacement === 1
      ? "Just won a game of Pitfight! Check out the game:"
      : `Just finished ${getOrdinal(selfPlacement)} in Pitfight! Check out the game:`;
  return { watchUrl, shareUrl, shareText };
}

function computeBattleDisplayMeta(options: {
  currentPhase: string;
  inSuddenDeathBuild: boolean;
  displayBattleResolution: boolean;
  battleViewForDisplay: BattleView | null;
}): {
  showsBattle: boolean;
  inSuddenDeath: boolean;
  allFaceDownIds: Set<string>;
  actionBarPhase: string;
} {
  const {
    currentPhase,
    inSuddenDeathBuild,
    displayBattleResolution,
    battleViewForDisplay,
  } = options;
  const showsBattle =
    (currentPhase === "battle" || displayBattleResolution) &&
    battleViewForDisplay !== null;
  const inSuddenDeath = showsBattle
    ? battleViewForDisplay.is_sudden_death
    : currentPhase === "build" && inSuddenDeathBuild;
  const allFaceDownIds = new Set<string>([
    ...(battleViewForDisplay?.your_zones.face_down_card_ids ?? []),
    ...(battleViewForDisplay?.opponent_zones.face_down_card_ids ?? []),
  ]);
  const actionBarPhase = displayBattleResolution ? "battle" : currentPhase;
  return { showsBattle, inSuddenDeath, allFaceDownIds, actionBarPhase };
}

function computePlacementMeta(options: {
  gameState: GameState;
  currentPhase: string;
  displayBattleResolution: boolean;
  isSpectator: boolean;
  deckSeen: boolean;
}): {
  canSpectate: boolean;
  selfPlacement: number;
  isOut: boolean;
  showsOutScreen: boolean;
  outPlace: string;
} {
  const { gameState, currentPhase, displayBattleResolution } = options;
  const canSpectate =
    currentPhase === "eliminated" &&
    gameState.players.some(
      (p) => !p.is_puppet && !INACTIVE_SPECTATE_PHASES.has(p.phase),
    );
  const selfPlacement =
    gameState.players.find((p) => p.name === gameState.self_player.name)
      ?.placement ?? 0;
  const isOut = currentPhase === "eliminated" && !displayBattleResolution;
  return {
    canSpectate,
    selfPlacement,
    isOut,
    showsOutScreen: isOut && !options.isSpectator && !options.deckSeen,
    outPlace: `${getOrdinal(selfPlacement)} of ${gameState.players.length}`,
  };
}

export interface GameDerivedState {
  currentPhase: string;
  displayBattleResolution: boolean;
  battleViewForDisplay: BattleView | null;
  showsBattle: boolean;
  inSuddenDeath: boolean;
  isEndPhase: boolean;
  canSpectate: boolean;
  selfPlacement: number;
  isOut: boolean;
  showsOutScreen: boolean;
  outPlace: string;
  watchUrl: string;
  shareUrl: string;
  shareText: string;
  hasPendingBuildUpgrades: boolean;
  upgradesModalMode: "view" | "apply" | "reveal";
  allFaceDownIds: Set<string>;
  actionBarPhase: string;
  needsUpgrade: boolean;
  canReady: boolean;
  canContinue: boolean;
  hasUnrevealedBattleUpgrades: boolean;
  buildSubmitGuideActive: boolean;
  battleSubmitGuideActive: boolean;
}

export function computeGameDerivedState(options: {
  gameState: GameState;
  gameId: string;
  isSpectator: boolean;
  deckSeen: boolean;
  selectedBasics: readonly string[];
  selectedUpgradeId: string | null;
  upgradesWindowMode: UpgradesWindowMode | undefined;
  visibleGuideStep: VisibleGuideStep | null;
  holdsBattleScreen: boolean;
  battleViewForDisplay: BattleView | null;
}): GameDerivedState {
  const { gameState, gameId, isSpectator, deckSeen } = options;
  const { self_player } = gameState;
  const currentPhase = self_player.phase;
  const displayBattleResolution = options.holdsBattleScreen;
  const battleMeta = computeBattleDisplayMeta({
    currentPhase,
    inSuddenDeathBuild: self_player.in_sudden_death,
    displayBattleResolution,
    battleViewForDisplay: options.battleViewForDisplay,
  });
  const placementMeta = computePlacementMeta({
    gameState,
    currentPhase,
    displayBattleResolution,
    isSpectator,
    deckSeen,
  });
  const shareMeta = computeShareMeta(
    gameId,
    self_player.name,
    placementMeta.selfPlacement,
  );
  const hasPendingBuildUpgrades =
    currentPhase === "build" &&
    self_player.upgrades.some((u) => !u.upgrade_target);
  const needsUpgrade =
    self_player.is_stage_increasing && gameState.available_upgrades.length > 0;

  return {
    currentPhase,
    displayBattleResolution,
    battleViewForDisplay: options.battleViewForDisplay,
    ...battleMeta,
    isEndPhase: END_PHASES.has(currentPhase),
    ...placementMeta,
    ...shareMeta,
    hasPendingBuildUpgrades,
    upgradesModalMode: resolveUpgradesModalMode(
      options.upgradesWindowMode,
      hasPendingBuildUpgrades,
    ),
    needsUpgrade,
    canReady:
      options.selectedBasics.filter(Boolean).length === 3 &&
      self_player.hand.length === self_player.hand_size,
    canContinue: !needsUpgrade || Boolean(options.selectedUpgradeId),
    hasUnrevealedBattleUpgrades:
      battleMeta.actionBarPhase === "battle" &&
      getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0,
    buildSubmitGuideActive: isSubmitPopoverGuideStepActive(
      options.visibleGuideStep,
      "build",
    ),
    battleSubmitGuideActive: isSubmitPopoverGuideStepActive(
      options.visibleGuideStep,
      "battle",
    ),
  };
}

export function buildGameGuideContext(options: {
  gameState: GameState | null;
  usesOverlaySidebar: boolean;
  drawerOpen: boolean;
  scoutingPlayer: string | null;
  submitHandOpen: boolean;
  showSubmitResultPopover: boolean;
}): GuidedWalkthroughContext | null {
  const { gameState } = options;
  if (!gameState) return null;
  const { self_player, current_battle } = gameState;
  const dgo = selectDraftGuideOpponent(gameState.players, self_player.name);
  return {
    currentPhase: isTimelinePhase(self_player.phase) ? self_player.phase : null,
    selfPlayer: self_player,
    currentBattle: current_battle,
    isMobile: options.usesOverlaySidebar,
    sidebarOpen: options.drawerOpen,
    revealedPlayerName: options.scoutingPlayer,
    useUpgrades: gameState.use_upgrades,
    hasRewardUpgradeChoice:
      self_player.is_stage_increasing &&
      gameState.available_upgrades.length > 0,
    showBuildSubmitPopover: options.submitHandOpen,
    showBattleSubmitPopover: options.showSubmitResultPopover,
    hasBattleRevealUpgrade:
      self_player.phase === "battle" &&
      getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0,
    availableRewardUpgrades: gameState.available_upgrades,
    draftGuideOpponentName: dgo.name,
    draftGuideOpponentRevealedCount: dgo.revealedCount,
    isStageEnd: self_player.is_stage_increasing,
  };
}

export interface GameController {
  gameId: string;
  isSpectateMode: boolean;
  isSpectator: boolean;
  needsSessionGuard: boolean;
  seat: SeatState;
  claim: (playerName?: string) => Promise<void>;
  takeBack: () => void;
  session: TabSession | null;
  spectate: SpectateRequestControls;
  watching: WatchingState | null;
  loadingSteps: readonly string[];
  sizes: ReturnType<typeof useViewportCardSizes>;
  shellMode: GameShellMode;
  usesOverlaySidebar: boolean;
  fightSidebarView: FightSidebarView;
  setFightSidebarView: Dispatch<SetStateAction<FightSidebarView>>;
  battleSidebarLayout: {
    topSectionHeight: number;
    middleLaneHeight: number;
  } | null;
  setBattleSidebarLayout: Dispatch<
    SetStateAction<{
      topSectionHeight: number;
      middleLaneHeight: number;
    } | null>
  >;
  gameState: GameState | null;
  isConnected: boolean;
  actions: GameActions;
  spectateRequests: SpectateRequest[];
  serverNotice: ServerNoticeStatus | null;
  surfaces: UseGameSurfacesResult;
  battleEnd: UseBattleEndFlowResult;
  previewState: ReturnType<typeof useContextStrip>["state"];
  setPreviewCard: ReturnType<typeof useContextStrip>["setPreviewCard"];
  phaseActionState: PhaseActionState;
  buildReadyPending: boolean;
  showSubmitResultPopover: boolean;
  selectedBasics: string[];
  setPickedBasics: Dispatch<SetStateAction<string[]>>;
  setHandSlots: (slots: (string | null)[]) => void;
  activeBuildUpgradeAnimation: { upgrade: CardType; target: CardType } | null;
  setActiveBuildUpgradeAnimation: Dispatch<
    SetStateAction<{ upgrade: CardType; target: CardType } | null>
  >;
  selectedUpgradeId: string | null;
  setSelectedUpgradeId: Dispatch<SetStateAction<string | null>>;
  selectedPoolCardId: string | null;
  setSelectedPoolCardId: Dispatch<SetStateAction<string | null>>;
  setVisibleGuideStep: Dispatch<SetStateAction<VisibleGuideStep | null>>;
  guideCompletionTrigger: GuideCompletionTrigger | null;
  setDeckSeen: Dispatch<SetStateAction<boolean>>;
  handleCardHover: (id: string, zone: ZoneName) => void;
  handleOpponentCardHover: (id: string, zone: ZoneName) => void;
  handleCardHoverEnd: () => void;
  handleSideboardEmptyClick: (owner: ZoneOwner) => void;
  handleOpenSideboardCardMenu: (
    e: React.MouseEvent,
    card: CardType,
    owner: ZoneOwner,
  ) => void;
  handleApplyUpgrade: (upgradeId: string, targetId: string) => void;
  handleRevealUpgrades: (upgradeIds: string[]) => void;
  handleRollDie: (sides: number) => void;
  handleYourLifeChange: (life: number) => void;
  handleOpponentLifeChange: (life: number) => void;
  handleCreateTreasure: () => void;
  handleCreateOpponentTreasure: () => void;
  handleCardMove: ReturnType<typeof useDndActions>["handleCardMove"];
  getValidDropZones: ReturnType<typeof useDndActions>["getValidDropZones"];
  openGameSurface: (surface: GameSurface) => void;
  closeGameplayOverlays: (except?: GameSurfaceKind) => void;
  openRulesPanel: (target?: RulesPanelTarget) => void;
  openUpgradesModal: (
    targetCardId?: string,
    mode?: UpgradesWindowMode,
    revealIds?: string[],
  ) => void;
  openBattleRevealUpgradesModal: (initialRevealIds?: string[]) => void;
  toggleBuildSubmitPopover: () => void;
  toggleBattleSubmitPopover: () => void;
  toggleZonePanel: (zone: PanelZone, owner: ZoneOwner) => void;
  setBattleZoneModalOpen: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void;
  handleBuildReadySubmit: (playDrawPreference: "play" | "draw") => void;
  handleBattleResultSubmit: (result: string) => void;
  handleContinue: () => void;
  handleGoToBuild: () => void;
  untapAll: (opponent?: boolean) => void;
  canRoll: boolean;
  guideContext: GuidedWalkthroughContext | null;
  voiceControls: GameVoiceControls;
  derived: GameDerivedState | null;
}

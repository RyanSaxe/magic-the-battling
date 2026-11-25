/**
 * State and action controller for the active game route (`Game.tsx`).
 * Owns seat/spectator resolution, WebSocket game state, surface stack,
 * battle-end flow, Guided Mode context, voice controls, and hotkeys.
 */
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { GameVoiceControls } from "../components/game/GameBattleChrome";
import {
  START_STEPS,
  useHandedOnSteps,
} from "../components/common/loadingSteps";
import type { RulesPanelTarget } from "../components/RulesPanel";
import type { FightSidebarView } from "../components/sidebar";
import type { Phase } from "../constants/phases";
import { useContextStrip, useToast } from "../contexts";
import { useDndActions, type ZoneOwner } from "../dnd";
import type { GuideCompletionTrigger } from "../guided/guideStateMachine";
import type { GuidedGuideId, GuidedWalkthroughContext } from "../guided/types";
import {
  isSubmitPopoverGuideStepActive,
  type VisibleGuideStep,
} from "../pages/gameGuideState";
import {
  initialPhaseActionState,
  isPhaseActionPending,
  reducePhaseAction,
  type PhaseAction,
} from "../pages/pendingPhaseAction";
import type { BattleZoneModalState } from "../pages/phases/Battle";
import type { Card as CardType, PlayerView, ZoneName } from "../types";
import { getAppErrorMessage, type AppError } from "../utils/appError";
import { getOrdinal } from "../utils/format";
import {
  comparePlayersForSidebar,
  getSidebarPlayerOrder,
} from "../utils/playerPlacement";
import { getUnrevealedAppliedUpgrades } from "../utils/upgrades";
import { getVoicePeerNames } from "../utils/voiceChat";
import { useBattleEndFlow } from "./useBattleEndFlow";
import { useCardMiddleTap } from "./useCardMiddleTap";
import { useGame } from "./useGame";
import { useGameHotkeys } from "./useGameHotkeys";
import { useGameSeat } from "./useGameSeat";
import { useGamePointerHover, useGameSessionSync } from "./useGameSessionSync";
import { useGameShellMode } from "./useGameShellMode";
import {
  useGameSurfaces,
  type GameSurface,
  type GameSurfaceKind,
  type PanelZone,
  type UpgradesWindowMode,
} from "./useGameSurfaces";
import { useSpectateRequest } from "./useSpectateRequest";
import { useViewportCardSizes } from "./useViewportCardSizes";
import { useVoiceChat } from "./useVoiceChat";
import type { VoiceSignalPayload } from "./useWebSocket";

const NO_BASICS: string[] = [];

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return (
    phase === "draft" ||
    phase === "build" ||
    phase === "battle" ||
    phase === "reward"
  );
}

function selectDraftGuideOpponent(
  players: PlayerView[],
  currentPlayerName: string,
): { name: string | null; revealedCount: number } {
  const opponents = players.filter(
    (p) =>
      p.name !== currentPlayerName &&
      p.pairing_probability !== null &&
      p.pairing_probability > 0,
  );
  if (opponents.length === 0) return { name: null, revealedCount: 0 };

  const best = [...opponents].sort((a, b) => {
    const revealedDiff =
      b.most_recently_revealed_cards.length -
      a.most_recently_revealed_cards.length;
    if (revealedDiff !== 0) return revealedDiff;
    const pairingDiff =
      (b.pairing_probability ?? -1) - (a.pairing_probability ?? -1);
    if (pairingDiff !== 0) return pairingDiff;
    return comparePlayersForSidebar(a, b);
  })[0];

  return {
    name: best.name,
    revealedCount: best.most_recently_revealed_cards.length,
  };
}

function resolveUpgradesModalMode(
  windowMode: UpgradesWindowMode | undefined,
  hasPendingBuildUpgrades: boolean,
): "view" | "apply" | "reveal" {
  if (windowMode === "view") return "view";
  if (windowMode === "reveal") return "reveal";
  return hasPendingBuildUpgrades ? "apply" : "view";
}

export function useGameController() {
  useCardMiddleTap();
  const { gameId = "" } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const isSpectateMode = searchParams.get("spectate") === "true";
  const { seat, claim, connectionOpened, connectionEnded, takeBack } =
    useGameSeat(gameId, { claimAutomatically: !isSpectateMode });
  const session = seat.kind === "held" ? seat.session : null;
  const spectate = useSpectateRequest(gameId);
  // A tab with a seat here, held or being reclaimed, plays it, even if it watched the game before joining.
  const watching =
    spectate.state.kind === "watching" &&
    (seat.kind === "none" || isSpectateMode)
      ? spectate.state
      : null;
  const spectatorConfig = useMemo(
    () =>
      watching
        ? { spectatePlayer: watching.target, requestId: watching.requestId }
        : null,
    [watching],
  );
  const isSpectator = !!spectatorConfig;

  const sizes = useViewportCardSizes();
  const shellMode = useGameShellMode();
  const usesOverlaySidebar = shellMode !== "big";
  const [fightSidebarView, setFightSidebarView] =
    useState<FightSidebarView>("fight");
  const [battleSidebarLayout, setBattleSidebarLayout] = useState<{
    topSectionHeight: number;
    middleLaneHeight: number;
  } | null>(null);
  const { addToast } = useToast();
  const [phaseActionState, dispatchPhaseAction] = useReducer(
    reducePhaseAction,
    { phase: null, buildReady: false, connected: false },
    initialPhaseActionState,
  );
  const [serverErrorNonce, setServerErrorNonce] = useState(0);
  const handleServerError = useCallback(
    (error: AppError) => {
      dispatchPhaseAction({ type: "failed" });
      setServerErrorNonce((count) => count + 1);
      addToast(
        getAppErrorMessage(
          error,
          "game-action",
          "That action could not be completed.",
        ),
        "error",
      );
    },
    [addToast],
  );

  const voiceSignalRef = useRef<((payload: VoiceSignalPayload) => void) | null>(
    null,
  );
  const loadingSteps = useHandedOnSteps(START_STEPS);
  const wsSessionId = watching
    ? watching.sessionId
    : isSpectateMode
      ? null
      : (session?.sessionId ?? null);
  const {
    status,
    gameState,
    isConnected,
    send,
    actions,
    spectateRequests,
    serverNotice,
  } = useGame(
    gameId || null,
    wsSessionId,
    spectatorConfig,
    handleServerError,
    useCallback((payload: VoiceSignalPayload) => {
      voiceSignalRef.current?.(payload);
    }, []),
  );

  const peerNames = useMemo(
    () => (gameState?.voice_chat_enabled ? getVoicePeerNames(gameState) : []),
    [gameState],
  );
  const voiceTargetNames = useMemo(() => new Set(peerNames), [peerNames]);
  const voiceChat = useVoiceChat(
    send,
    peerNames,
    gameState?.self_player.name ?? null,
    voiceSignalRef,
    useCallback(() => {
      addToast(
        "Microphone access was denied. Voice chat is unavailable.",
        "warning",
      );
    }, [addToast]),
    useCallback(
      (peerName: string) => {
        addToast(`Voice connection to ${peerName} failed.`, "warning");
      },
      [addToast],
    ),
  );

  const { state: previewState, setPreviewCard } = useContextStrip();
  const selfPhase = gameState?.self_player.phase;
  const surfaces = useGameSurfaces(selfPhase);
  const battleEndSnapshot = useMemo(
    () => ({
      phase: selfPhase,
      currentBattle: gameState?.current_battle ?? null,
      battleResolution: gameState?.battle_resolution ?? null,
      selfPlayerName: gameState?.self_player.name,
      selfUpgrades: gameState?.self_player.upgrades ?? [],
      connected: isConnected,
    }),
    [
      gameState?.battle_resolution,
      gameState?.current_battle,
      gameState?.self_player.name,
      gameState?.self_player.upgrades,
      isConnected,
      selfPhase,
    ],
  );
  const battleEnd = useBattleEndFlow({
    snapshot: battleEndSnapshot,
    serverErrorNonce,
    onSubmitResult: actions.battleSubmitResult,
    onRevealUpgrade: actions.battleRevealUpgrade,
    onCloseOverlays: () => surfaces.closeOverlays(),
  });

  useGameSessionSync({
    gameId,
    session,
    status,
    isSpectator,
    isConnected,
    selfPlayerName: gameState?.self_player.name,
    selfPhase,
    selfBuildReady: gameState?.self_player.build_ready ?? false,
    connectionOpened,
    connectionEnded,
    spectatorConnectionEnded: spectate.connectionEnded,
    dispatchPhaseAction,
  });

  const [pickedBasics, setPickedBasics] = useState<string[]>([]);
  const selectedBasics = isSpectator
    ? (gameState?.self_player.chosen_basics ?? NO_BASICS)
    : pickedBasics;
  const handSlotsRef = useRef<(string | null)[]>([]);
  const [pendingBuildUpgradeAnimation, setPendingBuildUpgradeAnimation] =
    useState<{ upgradeId: string; targetId: string } | null>(null);
  const [activeBuildUpgradeAnimation, setActiveBuildUpgradeAnimation] =
    useState<{ upgrade: CardType; target: CardType } | null>(null);
  if (
    pendingBuildUpgradeAnimation &&
    gameState?.self_player.phase === "build"
  ) {
    const matched = gameState.self_player.upgrades.find(
      (candidate) =>
        candidate.id === pendingBuildUpgradeAnimation.upgradeId &&
        candidate.upgrade_target?.id === pendingBuildUpgradeAnimation.targetId,
    );
    if (matched?.upgrade_target) {
      setActiveBuildUpgradeAnimation({
        upgrade: matched,
        target: matched.upgrade_target,
      });
      setPendingBuildUpgradeAnimation(null);
    }
  }

  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(
    null,
  );
  const [selectedPoolCardId, setSelectedPoolCardId] = useState<string | null>(
    null,
  );
  const [visibleGuideStep, setVisibleGuideStep] =
    useState<VisibleGuideStep | null>(null);
  const [guideCompletionTrigger, setGuideCompletionTrigger] =
    useState<GuideCompletionTrigger | null>(null);
  const guideCompletionNonceRef = useRef(0);
  const [deckSeen, setDeckSeen] = useState(false);

  const [lastPhase, setLastPhase] = useState(selfPhase);
  if (lastPhase !== selfPhase) {
    setLastPhase(selfPhase);
    setFightSidebarView("fight");
    if (selfPhase !== "reward") {
      setSelectedUpgradeId(null);
      setSelectedPoolCardId(null);
    }
  }

  const { hoveredCard, setHoveredCard } = useGamePointerHover(
    gameState?.current_battle,
    selfPhase,
  );
  const moveBattleCard = useCallback<typeof actions.battleMove>(
    (cardId, ...move) => {
      actions.battleMove(cardId, ...move);
      surfaces.notifyCardMoved(cardId);
    },
    [actions, surfaces],
  );
  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: selfPhase ?? "draft",
    battleMove: moveBattleCard,
  });

  const openGameSurface = useCallback(
    (surface: GameSurface) => {
      if (surface.kind !== "submitResult") battleEnd.cancelChangingResult();
      surfaces.open(surface);
    },
    [battleEnd, surfaces],
  );
  const closeGameplayOverlays = useCallback(
    (except?: GameSurfaceKind) => {
      if (except !== "submitResult") battleEnd.cancelChangingResult();
      surfaces.closeOverlays(except);
    },
    [battleEnd, surfaces],
  );
  const requestGuideCompletion = useCallback(
    (guideId: GuidedGuideId, stepId: string) => {
      guideCompletionNonceRef.current += 1;
      setGuideCompletionTrigger({
        guideId,
        stepId,
        nonce: guideCompletionNonceRef.current,
      });
    },
    [],
  );
  const sendPhaseAction = useCallback(
    (action: PhaseAction, sendFn: () => void) => {
      if (phaseActionState.pending) return false;
      dispatchPhaseAction({ type: "sent", action });
      sendFn();
      return true;
    },
    [phaseActionState.pending],
  );
  const buildReadyPending = isPhaseActionPending(
    phaseActionState.pending,
    "build_ready",
  );
  const showSubmitResultPopover =
    surfaces.submitResultOpen && !battleEnd.confirmingReveal;
  const openRulesPanel = useCallback(
    (target?: RulesPanelTarget) => openGameSurface({ kind: "guide", target }),
    [openGameSurface],
  );
  const openUpgradesModal = useCallback(
    (
      targetCardId?: string,
      mode: UpgradesWindowMode = "auto",
      revealIds: string[] = [],
    ) =>
      openGameSurface({
        kind: "upgrades",
        mode,
        targetId: targetCardId,
        revealIds,
      }),
    [openGameSurface],
  );
  const toggleBuildSubmitPopover = useCallback(() => {
    if (surfaces.submitHandOpen || buildReadyPending) {
      surfaces.close("submitHand");
      return;
    }
    openGameSurface({ kind: "submitHand" });
  }, [buildReadyPending, openGameSurface, surfaces]);
  const toggleBattleSubmitPopover = useCallback(() => {
    if (showSubmitResultPopover || battleEnd.submitPending) {
      surfaces.close("submitResult");
      return;
    }
    openGameSurface({ kind: "submitResult" });
  }, [
    battleEnd.submitPending,
    openGameSurface,
    showSubmitResultPopover,
    surfaces,
  ]);
  const toggleZonePanel = useCallback(
    (zone: PanelZone, owner: ZoneOwner) => {
      if (surfaces.isZonePanelOpen(zone, owner)) {
        surfaces.close("zone");
        return;
      }
      openGameSurface({ kind: "zone", zone, owner });
    },
    [openGameSurface, surfaces],
  );
  const setBattleZoneModalOpen = useCallback(
    (zone: BattleZoneModalState["zone"], owner: ZoneOwner, open: boolean) => {
      const same = surfaces.isZonePanelOpen(zone, owner);
      if (!open) {
        if (same) surfaces.close("zone");
      } else if (!same) {
        openGameSurface({ kind: "zone", zone, owner });
      }
    },
    [openGameSurface, surfaces],
  );
  const handleBuildReadySubmit = useCallback(
    (playDrawPreference: "play" | "draw") => {
      if (!gameState || gameState.self_player.phase !== "build") return;
      const sent = sendPhaseAction("build_ready", () =>
        actions.buildReady(
          selectedBasics,
          playDrawPreference,
          handSlotsRef.current.filter((id): id is string => id !== null),
        ),
      );
      if (!sent) return;
      requestGuideCompletion("build_play_draw", "play-draw");
      closeGameplayOverlays();
    },
    [
      actions,
      closeGameplayOverlays,
      gameState,
      requestGuideCompletion,
      selectedBasics,
      sendPhaseAction,
    ],
  );
  const handleBattleResultSubmit = useCallback(
    (result: string) => {
      requestGuideCompletion("battle_result_submit", "result-submit");
      const isLoss =
        result !== gameState?.self_player.name && result !== "draw";
      const unrevealed = gameState
        ? getUnrevealedAppliedUpgrades(gameState.self_player.upgrades)
        : [];
      battleEnd.submitResult(result, !isLoss && unrevealed.length > 0);
    },
    [battleEnd, gameState, requestGuideCompletion],
  );
  const handleContinue = useCallback(() => {
    if (
      !sendPhaseAction("reward_done", () =>
        actions.rewardDone(selectedUpgradeId ?? undefined),
      )
    ) {
      return;
    }
    requestGuideCompletion("reward", "continue");
  }, [actions, requestGuideCompletion, selectedUpgradeId, sendPhaseAction]);
  const handleGoToBuild = useCallback(() => {
    sendPhaseAction("draft_done", actions.draftDone);
  }, [actions, sendPhaseAction]);

  const canRoll =
    selfPhase === "draft" &&
    (gameState?.self_player.treasures ?? 0) > 0 &&
    (gameState?.self_player.current_pack?.length ?? 0) > 0;
  const sidebarPlayers = useMemo(
    () => (gameState ? getSidebarPlayerOrder(gameState.players) : []),
    [gameState],
  );
  const modalOpen =
    surfaces.blocksHotkeys ||
    previewState.previewCard !== null ||
    battleEnd.blocksHotkeys ||
    activeBuildUpgradeAnimation !== null;

  useGameHotkeys({
    gameState,
    isSpectator,
    usesOverlaySidebar,
    sidebarPlayers,
    selectedBasics,
    selectedUpgradeId,
    hoveredCard,
    clearHoveredCard: () => setHoveredCard(null),
    visibleGuideStep,
    guideOpen: surfaces.guideExpanded,
    hasRulesPanel: surfaces.guideSurface !== null,
    showUpgradesModal: surfaces.upgradesWindow !== null,
    actionMenuOpen: surfaces.actionMenuOpen,
    showSubmitHandPopover: surfaces.submitHandOpen,
    showSubmitResultPopover,
    buildReadyPending,
    confirmingReveal: battleEnd.confirmingReveal,
    changingResult: battleEnd.changingResult,
    modalOpen,
    canRoll,
    openRulesPanel,
    closeSurface: surfaces.close,
    openUpgradesModal,
    setScouting: surfaces.scout,
    toggleBuildSubmitPopover,
    toggleBattleSubmitPopover,
    toggleZonePanel,
    handleGoToBuild,
    handleBuildReadySubmit,
    handleBattleResultSubmit,
    handleContinue,
    startChangingResult: battleEnd.startChangingResult,
    moveBattleCard,
    actions,
  });

  const guideContext = useMemo<GuidedWalkthroughContext | null>(() => {
    if (!gameState) return null;
    const { self_player, current_battle } = gameState;
    const dgo = selectDraftGuideOpponent(gameState.players, self_player.name);
    return {
      currentPhase: isTimelinePhase(self_player.phase)
        ? self_player.phase
        : null,
      selfPlayer: self_player,
      currentBattle: current_battle,
      isMobile: usesOverlaySidebar,
      sidebarOpen: surfaces.drawerOpen,
      revealedPlayerName: surfaces.scouting?.player ?? null,
      useUpgrades: gameState.use_upgrades,
      hasRewardUpgradeChoice:
        self_player.is_stage_increasing &&
        gameState.available_upgrades.length > 0,
      showBuildSubmitPopover: surfaces.submitHandOpen,
      showBattleSubmitPopover: showSubmitResultPopover,
      hasBattleRevealUpgrade:
        self_player.phase === "battle" &&
        getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0,
      availableRewardUpgrades: gameState.available_upgrades,
      draftGuideOpponentName: dgo.name,
      draftGuideOpponentRevealedCount: dgo.revealedCount,
      isStageEnd: self_player.is_stage_increasing,
    };
  }, [
    gameState,
    showSubmitResultPopover,
    surfaces.drawerOpen,
    surfaces.scouting,
    surfaces.submitHandOpen,
    usesOverlaySidebar,
  ]);

  const voiceControls: GameVoiceControls = {
    state: voiceChat.state,
    toggleSelfMute: voiceChat.toggleSelfMute,
    togglePeerMute: voiceChat.togglePeerMute,
    targetsAvailable: peerNames.length > 0,
    targetNames: voiceTargetNames,
  };

  const untapAll = (opponent = false) => {
    const battle = gameState?.current_battle;
    if (!battle) return;
    const zones = opponent ? battle.opponent_zones : battle.your_zones;
    const battlefieldIds = new Set(zones.battlefield.map((c) => c.id));
    for (const cardId of zones.tapped_card_ids || []) {
      if (battlefieldIds.has(cardId)) {
        actions.battleUpdateCardState("untap", cardId);
      }
    }
  };

  const openBattleRevealUpgradesModal = (initialRevealIds: string[] = []) => {
    requestGuideCompletion("hint_battle_unrevealed_upgrade", "reveal-upgrade");
    openUpgradesModal(undefined, "reveal", initialRevealIds);
  };

  const derived = useMemo(() => {
    if (!gameState) return null;
    const { self_player } = gameState;
    const currentPhase = self_player.phase;
    const displayBattleResolution = battleEnd.holdsBattleScreen;
    const battleViewForDisplay = battleEnd.battleViewForDisplay;
    const showsBattle =
      (currentPhase === "battle" || displayBattleResolution) &&
      !!battleViewForDisplay;
    const inSuddenDeath = showsBattle
      ? !!battleViewForDisplay?.is_sudden_death
      : currentPhase === "build" && self_player.in_sudden_death;
    const isEndPhase =
      currentPhase === "eliminated" ||
      currentPhase === "winner" ||
      currentPhase === "game_over";
    const canSpectate =
      currentPhase === "eliminated" &&
      gameState.players.some(
        (p) =>
          !p.is_puppet &&
          p.phase !== "eliminated" &&
          p.phase !== "awaiting_elimination" &&
          p.phase !== "winner" &&
          p.phase !== "game_over",
      );
    const selfPlacement =
      gameState.players.find((p) => p.name === self_player.name)?.placement ??
      0;
    const isOut = currentPhase === "eliminated" && !displayBattleResolution;
    const showsOutScreen = isOut && !isSpectator && !deckSeen;
    const outPlace = `${getOrdinal(selfPlacement)} of ${gameState.players.length}`;
    const watchUrl = new URL("?spectate=true", window.location.href).toString();
    const shareUrl = gameId
      ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(self_player.name)}`
      : "";
    const shareText =
      selfPlacement === 1
        ? "Just won a game of Pitfight! Check out the game:"
        : `Just finished ${getOrdinal(selfPlacement)} in Pitfight! Check out the game:`;
    const hasPendingBuildUpgrades =
      currentPhase === "build" &&
      self_player.upgrades.some((u) => !u.upgrade_target);
    const upgradesModalMode = resolveUpgradesModalMode(
      surfaces.upgradesWindow?.mode,
      hasPendingBuildUpgrades,
    );
    const allFaceDownIds = new Set<string>([
      ...(battleViewForDisplay?.your_zones.face_down_card_ids ?? []),
      ...(battleViewForDisplay?.opponent_zones.face_down_card_ids ?? []),
    ]);
    const actionBarPhase = displayBattleResolution ? "battle" : currentPhase;
    const needsUpgrade =
      self_player.is_stage_increasing &&
      gameState.available_upgrades.length > 0;
    return {
      currentPhase,
      displayBattleResolution,
      battleViewForDisplay,
      showsBattle,
      inSuddenDeath,
      isEndPhase,
      canSpectate,
      selfPlacement,
      isOut,
      showsOutScreen,
      outPlace,
      watchUrl,
      shareUrl,
      shareText,
      hasPendingBuildUpgrades,
      upgradesModalMode,
      allFaceDownIds,
      actionBarPhase,
      needsUpgrade,
      canReady:
        selectedBasics.filter(Boolean).length === 3 &&
        self_player.hand.length === self_player.hand_size,
      canContinue: !needsUpgrade || !!selectedUpgradeId,
      hasUnrevealedBattleUpgrades:
        actionBarPhase === "battle" &&
        getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0,
      buildSubmitGuideActive: isSubmitPopoverGuideStepActive(
        visibleGuideStep,
        "build",
      ),
      battleSubmitGuideActive: isSubmitPopoverGuideStepActive(
        visibleGuideStep,
        "battle",
      ),
    };
  }, [
    battleEnd.battleViewForDisplay,
    battleEnd.holdsBattleScreen,
    deckSeen,
    gameId,
    gameState,
    isSpectator,
    selectedBasics,
    selectedUpgradeId,
    surfaces.upgradesWindow?.mode,
    visibleGuideStep,
  ]);

  const setHandSlots = useCallback((slots: (string | null)[]) => {
    handSlotsRef.current = slots;
  }, []);

  const handleCardHover = useCallback(
    (id: string, zone: ZoneName) =>
      setHoveredCard({ id, zone, owner: "player" }),
    [setHoveredCard],
  );
  const handleOpponentCardHover = useCallback(
    (id: string, zone: ZoneName) =>
      setHoveredCard({ id, zone, owner: "opponent" }),
    [setHoveredCard],
  );
  const handleCardHoverEnd = useCallback(
    () => setHoveredCard(null),
    [setHoveredCard],
  );
  const handleSideboardEmptyClick = useCallback(
    (owner: ZoneOwner) => {
      const sel = surfaces.selectedCard;
      if (sel && (sel.zone !== "sideboard" || sel.owner !== owner)) {
        actions.battleMove(
          sel.card.id,
          sel.zone,
          "sideboard",
          sel.owner,
          owner,
        );
        surfaces.setSelectedCard(null);
      }
    },
    [actions, surfaces],
  );
  const handleOpenSideboardCardMenu = useCallback(
    (e: React.MouseEvent, card: CardType, owner: ZoneOwner) => {
      surfaces.setCardMenu({
        card,
        zone: "sideboard",
        position: { x: e.clientX, y: e.clientY },
        isOpponent: owner === "opponent",
      });
    },
    [surfaces],
  );
  const handleApplyUpgrade = useCallback(
    (upgradeId: string, targetId: string) => {
      setPendingBuildUpgradeAnimation({ upgradeId, targetId });
      actions.buildApplyUpgrade(upgradeId, targetId);
    },
    [actions],
  );
  const handleRevealUpgrades = useCallback(
    (upgradeIds: string[]) => {
      upgradeIds.forEach((id) => actions.battleRevealUpgrade(id));
    },
    [actions],
  );
  const handleRollDie = useCallback(
    (sides: number) => {
      addToast(
        `Rolled a d${sides}: ${Math.floor(Math.random() * sides) + 1}`,
        "info",
      );
    },
    [addToast],
  );
  const handleYourLifeChange = useCallback(
    (life: number) => {
      if (!isSpectator) actions.battleUpdateLife("you", life);
    },
    [actions, isSpectator],
  );
  const handleOpponentLifeChange = useCallback(
    (life: number) => {
      if (!isSpectator) actions.battleUpdateLife("opponent", life);
    },
    [actions, isSpectator],
  );
  const handleCreateTreasure = useCallback(() => {
    actions.battleUpdateCardState("create_treasure", "", {});
  }, [actions]);
  const handleCreateOpponentTreasure = useCallback(() => {
    actions.battleUpdateCardState("create_treasure", "", {
      for_opponent: true,
    });
  }, [actions]);

  const needsSessionGuard =
    spectate.state.kind === "ended" ||
    (!isSpectator && (seat.kind !== "held" || isSpectateMode)) ||
    !gameState;

  return {
    gameId,
    isSpectateMode,
    isSpectator,
    needsSessionGuard,
    seat,
    claim,
    takeBack,
    session,
    spectate,
    watching,
    loadingSteps,
    sizes,
    shellMode,
    usesOverlaySidebar,
    fightSidebarView,
    setFightSidebarView,
    battleSidebarLayout,
    setBattleSidebarLayout,
    gameState,
    isConnected,
    actions,
    spectateRequests,
    serverNotice,
    surfaces,
    battleEnd,
    previewState,
    setPreviewCard,
    phaseActionState,
    buildReadyPending,
    showSubmitResultPopover,
    selectedBasics,
    setPickedBasics,
    setHandSlots,
    activeBuildUpgradeAnimation,
    setActiveBuildUpgradeAnimation,
    selectedUpgradeId,
    setSelectedUpgradeId,
    selectedPoolCardId,
    setSelectedPoolCardId,
    setVisibleGuideStep,
    guideCompletionTrigger,
    setDeckSeen,
    handleCardHover,
    handleOpponentCardHover,
    handleCardHoverEnd,
    handleSideboardEmptyClick,
    handleOpenSideboardCardMenu,
    handleApplyUpgrade,
    handleRevealUpgrades,
    handleRollDie,
    handleYourLifeChange,
    handleOpponentLifeChange,
    handleCreateTreasure,
    handleCreateOpponentTreasure,
    handleCardMove,
    getValidDropZones,
    openGameSurface,
    closeGameplayOverlays,
    openRulesPanel,
    openUpgradesModal,
    openBattleRevealUpgradesModal,
    toggleBuildSubmitPopover,
    toggleBattleSubmitPopover,
    toggleZonePanel,
    setBattleZoneModalOpen,
    handleBuildReadySubmit,
    handleBattleResultSubmit,
    handleContinue,
    handleGoToBuild,
    untapAll,
    canRoll,
    guideContext,
    voiceControls,
    derived,
  };
}

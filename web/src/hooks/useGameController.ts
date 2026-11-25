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
import type { FightSidebarView } from "../components/sidebar";
import { useContextStrip, useToast } from "../contexts";
import { useDndActions } from "../dnd";
import type { GuideCompletionTrigger } from "../guided/guideStateMachine";
import type { GuidedGuideId } from "../guided/types";
import type { VisibleGuideStep } from "../pages/gameGuideState";
import {
  initialPhaseActionState,
  isPhaseActionPending,
  reducePhaseAction,
} from "../pages/pendingPhaseAction";
import type { Card as CardType, GameState, Phase } from "../types";
import { getAppErrorMessage, type AppError } from "../utils/appError";
import { getSidebarPlayerOrder } from "../utils/playerPlacement";
import type { TabSession } from "../utils/tabSession";
import { getVoicePeerNames } from "../utils/voiceChat";
import {
  useGameBoardCallbacks,
  usePhaseSubmitActions,
} from "./gameControllerActions";
import {
  buildGameGuideContext,
  computeGameDerivedState,
  findMatchedUpgradeAnimation,
  resolveWsSessionId,
  type GameController,
  type WatchingState,
} from "./gameControllerDerived";
import {
  useBattleEndFlow,
  type BattleEndServerSnapshot,
} from "./useBattleEndFlow";
import { useCardMiddleTap } from "./useCardMiddleTap";
import { useGame } from "./useGame";
import { useGameHotkeys } from "./useGameHotkeys";
import { useGameSeat, type SeatState } from "./useGameSeat";
import { useGamePointerHover, useGameSessionSync } from "./useGameSessionSync";
import { useGameShellMode } from "./useGameShellMode";
import { useGameSurfaces } from "./useGameSurfaces";
import {
  useSpectateRequest,
  type SpectateRequestControls,
} from "./useSpectateRequest";
import { useViewportCardSizes } from "./useViewportCardSizes";
import { useVoiceChat } from "./useVoiceChat";
import type { VoiceSignalPayload } from "./useWebSocket";

export type { GameController };

const NO_BASICS: string[] = [];

function useGameAccess(): {
  gameId: string;
  isSpectateMode: boolean;
  isSpectator: boolean;
  seat: SeatState;
  claim: (playerName?: string) => Promise<void>;
  connectionOpened: (sessionId: string) => void;
  connectionEnded: (sessionId: string, error: AppError) => void;
  takeBack: () => void;
  session: TabSession | null;
  spectate: SpectateRequestControls;
  watching: WatchingState | null;
  spectatorConfig: { spectatePlayer: string; requestId: string } | null;
  wsSessionId: string | null;
} {
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
  const wsSessionId = resolveWsSessionId(watching, isSpectateMode, session);
  return {
    gameId,
    isSpectateMode,
    isSpectator: spectatorConfig !== null,
    seat,
    claim,
    connectionOpened,
    connectionEnded,
    takeBack,
    session,
    spectate,
    watching,
    spectatorConfig,
    wsSessionId,
  };
}

function useGameVoiceControls(options: {
  gameState: GameState | null;
  send: (action: string, payload?: Record<string, unknown>) => void;
  voiceSignalRef: React.RefObject<
    ((payload: VoiceSignalPayload) => void) | null
  >;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}): GameVoiceControls {
  const { gameState, send, voiceSignalRef, addToast } = options;
  const peerNames = useMemo(
    () => (gameState?.voice_chat_enabled ? getVoicePeerNames(gameState) : []),
    [gameState],
  );
  const voiceTargetNames = useMemo(() => new Set(peerNames), [peerNames]);
  const voiceChat = useVoiceChat({
    send,
    peerNames,
    selfPlayerName: gameState?.self_player.name ?? null,
    voiceSignalRef,
    onPermissionDenied: useCallback(() => {
      addToast(
        "Microphone access was denied. Voice chat is unavailable.",
        "warning",
      );
    }, [addToast]),
    onRetriesExhausted: useCallback(
      (peerName: string) => {
        addToast(`Voice connection to ${peerName} failed.`, "warning");
      },
      [addToast],
    ),
  });
  return {
    state: voiceChat.state,
    toggleSelfMute: voiceChat.toggleSelfMute,
    togglePeerMute: voiceChat.togglePeerMute,
    targetsAvailable: peerNames.length > 0,
    targetNames: voiceTargetNames,
  };
}

function buildBattleEndSnapshot(
  gameState: GameState | null,
  phase: Phase | undefined,
  connected: boolean,
): BattleEndServerSnapshot {
  return {
    phase,
    currentBattle: gameState?.current_battle ?? null,
    battleResolution: gameState?.battle_resolution ?? null,
    selfPlayerName: gameState?.self_player.name,
    selfUpgrades: gameState?.self_player.upgrades ?? [],
    connected,
  };
}

function readSelfPlayerSync(gameState: GameState | null): {
  selfPlayerName: string | undefined;
  selfBuildReady: boolean;
} {
  return {
    selfPlayerName: gameState?.self_player.name,
    selfBuildReady: gameState?.self_player.build_ready ?? false,
  };
}

function canPlayerRollDraft(gameState: GameState | null): boolean {
  if (!gameState || gameState.self_player.phase !== "draft") return false;
  return (
    gameState.self_player.treasures > 0 &&
    (gameState.self_player.current_pack?.length ?? 0) > 0
  );
}

function needsGameSessionGuard(options: {
  spectateKind: string;
  isSpectator: boolean;
  seatKind: SeatState["kind"];
  isSpectateMode: boolean;
  hasGameState: boolean;
}): boolean {
  if (options.spectateKind === "ended" || !options.hasGameState) return true;
  return (
    !options.isSpectator &&
    (options.seatKind !== "held" || options.isSpectateMode)
  );
}

function useGameTransientUiState(
  gameState: GameState | null,
  isSpectator: boolean,
): {
  selfPhase: Phase | undefined;
  fightSidebarView: FightSidebarView;
  setFightSidebarView: React.Dispatch<React.SetStateAction<FightSidebarView>>;
  battleSidebarLayout: {
    topSectionHeight: number;
    middleLaneHeight: number;
  } | null;
  setBattleSidebarLayout: React.Dispatch<
    React.SetStateAction<{
      topSectionHeight: number;
      middleLaneHeight: number;
    } | null>
  >;
  selectedBasics: string[];
  setPickedBasics: React.Dispatch<React.SetStateAction<string[]>>;
  handSlotsRef: React.RefObject<(string | null)[]>;
  setHandSlots: (slots: (string | null)[]) => void;
  setPendingBuildUpgradeAnimation: React.Dispatch<
    React.SetStateAction<{ upgradeId: string; targetId: string } | null>
  >;
  activeBuildUpgradeAnimation: { upgrade: CardType; target: CardType } | null;
  setActiveBuildUpgradeAnimation: React.Dispatch<
    React.SetStateAction<{ upgrade: CardType; target: CardType } | null>
  >;
  selectedUpgradeId: string | null;
  setSelectedUpgradeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedPoolCardId: string | null;
  setSelectedPoolCardId: React.Dispatch<React.SetStateAction<string | null>>;
  visibleGuideStep: VisibleGuideStep | null;
  setVisibleGuideStep: React.Dispatch<
    React.SetStateAction<VisibleGuideStep | null>
  >;
  guideCompletionTrigger: GuideCompletionTrigger | null;
  requestGuideCompletion: (guideId: GuidedGuideId, stepId: string) => void;
  deckSeen: boolean;
  setDeckSeen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const selfPhase = gameState?.self_player.phase;
  const [fightSidebarView, setFightSidebarView] =
    useState<FightSidebarView>("fight");
  const [battleSidebarLayout, setBattleSidebarLayout] = useState<{
    topSectionHeight: number;
    middleLaneHeight: number;
  } | null>(null);
  const [pickedBasics, setPickedBasics] = useState<string[]>([]);
  const selectedBasics = isSpectator
    ? (gameState?.self_player.chosen_basics ?? NO_BASICS)
    : pickedBasics;
  const handSlotsRef = useRef<(string | null)[]>([]);
  const [pendingBuildUpgradeAnimation, setPendingBuildUpgradeAnimation] =
    useState<{ upgradeId: string; targetId: string } | null>(null);
  const [activeBuildUpgradeAnimation, setActiveBuildUpgradeAnimation] =
    useState<{ upgrade: CardType; target: CardType } | null>(null);
  const matchedUpgradeAnim = findMatchedUpgradeAnimation(
    pendingBuildUpgradeAnimation,
    gameState,
  );
  if (matchedUpgradeAnim) {
    setActiveBuildUpgradeAnimation(matchedUpgradeAnim);
    setPendingBuildUpgradeAnimation(null);
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

  const setHandSlots = useCallback((slots: (string | null)[]) => {
    handSlotsRef.current = slots;
  }, []);

  return {
    selfPhase,
    fightSidebarView,
    setFightSidebarView,
    battleSidebarLayout,
    setBattleSidebarLayout,
    selectedBasics,
    setPickedBasics,
    handSlotsRef,
    setHandSlots,
    setPendingBuildUpgradeAnimation,
    activeBuildUpgradeAnimation,
    setActiveBuildUpgradeAnimation,
    selectedUpgradeId,
    setSelectedUpgradeId,
    selectedPoolCardId,
    setSelectedPoolCardId,
    visibleGuideStep,
    setVisibleGuideStep,
    guideCompletionTrigger,
    requestGuideCompletion,
    deckSeen,
    setDeckSeen,
  };
}

function isAnyModalBlockingHotkeys(options: {
  surfacesBlocking: boolean;
  hasPreview: boolean;
  battleEndBlocking: boolean;
  hasUpgradeAnimation: boolean;
}): boolean {
  return (
    options.surfacesBlocking ||
    options.hasPreview ||
    options.battleEndBlocking ||
    options.hasUpgradeAnimation
  );
}

export function useGameController(): GameController {
  useCardMiddleTap();
  const access = useGameAccess();
  const { gameId, isSpectateMode, isSpectator, seat, session, spectate } =
    access;

  const sizes = useViewportCardSizes();
  const shellMode = useGameShellMode();
  const usesOverlaySidebar = shellMode !== "big";
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
  const {
    status,
    gameState,
    isConnected,
    send,
    actions,
    spectateRequests,
    serverNotice,
  } = useGame({
    gameId: gameId || null,
    sessionId: access.wsSessionId,
    spectatorConfig: access.spectatorConfig,
    onServerError: handleServerError,
    onVoiceSignal: useCallback((payload: VoiceSignalPayload) => {
      voiceSignalRef.current?.(payload);
    }, []),
  });

  const voiceControls = useGameVoiceControls({
    gameState,
    send,
    voiceSignalRef,
    addToast,
  });

  const { state: previewState, setPreviewCard } = useContextStrip();
  const ui = useGameTransientUiState(gameState, isSpectator);
  const surfaces = useGameSurfaces(ui.selfPhase);
  const battleEndSnapshot = useMemo(
    () => buildBattleEndSnapshot(gameState, ui.selfPhase, isConnected),
    [gameState, isConnected, ui.selfPhase],
  );
  const battleEnd = useBattleEndFlow({
    snapshot: battleEndSnapshot,
    serverErrorNonce,
    onSubmitResult: actions.battleSubmitResult,
    onRevealUpgrade: actions.battleRevealUpgrade,
    onCloseOverlays: () => surfaces.closeOverlays(),
  });

  const { selfPlayerName, selfBuildReady } = readSelfPlayerSync(gameState);
  useGameSessionSync({
    gameId,
    session,
    status,
    isSpectator,
    isConnected,
    selfPlayerName,
    selfPhase: ui.selfPhase,
    selfBuildReady,
    connectionOpened: access.connectionOpened,
    connectionEnded: access.connectionEnded,
    spectatorConnectionEnded: spectate.connectionEnded,
    dispatchPhaseAction,
  });

  const { hoveredCard, setHoveredCard } = useGamePointerHover(
    battleEndSnapshot.currentBattle,
    ui.selfPhase,
  );
  const moveBattleCard = useCallback<typeof actions.battleMove>(
    (move) => {
      actions.battleMove(move);
      surfaces.notifyCardMoved(move.cardId);
    },
    [actions, surfaces],
  );
  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: ui.selfPhase ?? "draft",
    battleMove: moveBattleCard,
  });

  const buildReadyPending = isPhaseActionPending(
    phaseActionState.pending,
    "build_ready",
  );
  const showSubmitResultPopover =
    surfaces.submitResultOpen && !battleEnd.confirmingReveal;
  const boardCallbacks = useGameBoardCallbacks({
    gameState,
    isSpectator,
    actions,
    surfaces,
    battleEnd,
    buildReadyPending,
    showSubmitResultPopover,
    addToast,
    setHoveredCard,
    setPendingBuildUpgradeAnimation: ui.setPendingBuildUpgradeAnimation,
    requestGuideCompletion: ui.requestGuideCompletion,
  });
  const phaseSubmits = usePhaseSubmitActions({
    gameState,
    actions,
    battleEnd,
    selectedBasics: ui.selectedBasics,
    selectedUpgradeId: ui.selectedUpgradeId,
    handSlotsRef: ui.handSlotsRef,
    pendingAction: phaseActionState.pending,
    dispatchPhaseAction,
    closeGameplayOverlays: boardCallbacks.closeGameplayOverlays,
    requestGuideCompletion: ui.requestGuideCompletion,
  });

  const canRoll = canPlayerRollDraft(gameState);
  const sidebarPlayers = useMemo(
    () => (gameState ? getSidebarPlayerOrder(gameState.players) : []),
    [gameState],
  );
  const modalOpen = isAnyModalBlockingHotkeys({
    surfacesBlocking: surfaces.blocksHotkeys,
    hasPreview: previewState.previewCard !== null,
    battleEndBlocking: battleEnd.blocksHotkeys,
    hasUpgradeAnimation: ui.activeBuildUpgradeAnimation !== null,
  });

  useGameHotkeys({
    gameState,
    isSpectator,
    usesOverlaySidebar,
    sidebarPlayers,
    selectedBasics: ui.selectedBasics,
    selectedUpgradeId: ui.selectedUpgradeId,
    hoveredCard,
    clearHoveredCard: () => setHoveredCard(null),
    visibleGuideStep: ui.visibleGuideStep,
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
    openRulesPanel: boardCallbacks.openRulesPanel,
    closeSurface: surfaces.close,
    openUpgradesModal: boardCallbacks.openUpgradesModal,
    setScouting: surfaces.scout,
    toggleBuildSubmitPopover: boardCallbacks.toggleBuildSubmitPopover,
    toggleBattleSubmitPopover: boardCallbacks.toggleBattleSubmitPopover,
    toggleZonePanel: boardCallbacks.toggleZonePanel,
    handleGoToBuild: phaseSubmits.handleGoToBuild,
    handleBuildReadySubmit: phaseSubmits.handleBuildReadySubmit,
    handleBattleResultSubmit: phaseSubmits.handleBattleResultSubmit,
    handleContinue: phaseSubmits.handleContinue,
    startChangingResult: battleEnd.startChangingResult,
    moveBattleCard,
    actions,
  });

  const scoutingPlayer = surfaces.scouting?.player ?? null;
  const guideContext = useMemo(
    () =>
      buildGameGuideContext({
        gameState,
        usesOverlaySidebar,
        drawerOpen: surfaces.drawerOpen,
        scoutingPlayer,
        submitHandOpen: surfaces.submitHandOpen,
        showSubmitResultPopover,
      }),
    [
      gameState,
      scoutingPlayer,
      showSubmitResultPopover,
      surfaces.drawerOpen,
      surfaces.submitHandOpen,
      usesOverlaySidebar,
    ],
  );

  const upgradesWindowMode = surfaces.upgradesWindow?.mode;
  const derived = useMemo(
    () =>
      gameState
        ? computeGameDerivedState({
            gameState,
            gameId,
            isSpectator,
            deckSeen: ui.deckSeen,
            selectedBasics: ui.selectedBasics,
            selectedUpgradeId: ui.selectedUpgradeId,
            upgradesWindowMode,
            visibleGuideStep: ui.visibleGuideStep,
            holdsBattleScreen: battleEnd.holdsBattleScreen,
            battleViewForDisplay: battleEnd.battleViewForDisplay,
          })
        : null,
    [
      battleEnd.battleViewForDisplay,
      battleEnd.holdsBattleScreen,
      gameId,
      gameState,
      isSpectator,
      ui.deckSeen,
      ui.selectedBasics,
      ui.selectedUpgradeId,
      ui.visibleGuideStep,
      upgradesWindowMode,
    ],
  );

  const needsSessionGuard = needsGameSessionGuard({
    spectateKind: spectate.state.kind,
    isSpectator,
    seatKind: seat.kind,
    isSpectateMode,
    hasGameState: gameState !== null,
  });

  return {
    gameId,
    isSpectateMode,
    isSpectator,
    needsSessionGuard,
    seat,
    claim: access.claim,
    takeBack: access.takeBack,
    session,
    spectate,
    watching: access.watching,
    loadingSteps,
    sizes,
    shellMode,
    usesOverlaySidebar,
    fightSidebarView: ui.fightSidebarView,
    setFightSidebarView: ui.setFightSidebarView,
    battleSidebarLayout: ui.battleSidebarLayout,
    setBattleSidebarLayout: ui.setBattleSidebarLayout,
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
    selectedBasics: ui.selectedBasics,
    setPickedBasics: ui.setPickedBasics,
    setHandSlots: ui.setHandSlots,
    activeBuildUpgradeAnimation: ui.activeBuildUpgradeAnimation,
    setActiveBuildUpgradeAnimation: ui.setActiveBuildUpgradeAnimation,
    selectedUpgradeId: ui.selectedUpgradeId,
    setSelectedUpgradeId: ui.setSelectedUpgradeId,
    selectedPoolCardId: ui.selectedPoolCardId,
    setSelectedPoolCardId: ui.setSelectedPoolCardId,
    setVisibleGuideStep: ui.setVisibleGuideStep,
    guideCompletionTrigger: ui.guideCompletionTrigger,
    setDeckSeen: ui.setDeckSeen,
    ...boardCallbacks,
    ...phaseSubmits,
    handleCardMove,
    getValidDropZones,
    canRoll,
    guideContext,
    voiceControls,
    derived,
  };
}

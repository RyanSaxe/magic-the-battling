/** Lobby route for seat setup, deck submission, readiness, and starting a multiplayer game. */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSeat } from "../hooks/useGameSeat";
import { useGame } from "../hooks/useGame";
import { useLobbySync } from "../hooks/useLobbySync";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import { useHotkeys } from "../hooks/useHotkeys";
import { usePanelHoldsEnter } from "../hooks/usePanelHoldsEnter";
import { useCubeLook } from "../hooks/useCubeLook";
import { useBoardDesktop } from "../hooks/useBoardDesktop";
import type { ResumableSeat } from "../hooks/useResumableGames";
import { CloseSeatDialog } from "../components/ResumeGame";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";
import {
  AppHeader,
  GuideButton,
  HomeButton,
} from "../components/common/AppHeader";
import { BarLabel } from "../components/common/FrameBar";
import { PageFrame } from "../components/common/PageFrame";
import { LoadingScreen } from "../components/common/LoadingScreen";
import {
  START_STEPS,
  useHandedOnSteps,
} from "../components/common/loadingSteps";
import { LobbySeatNotice } from "../components/lobby/LobbySeatNotice";
import { RemovePlayerDialog } from "../components/lobby/RemovePlayerDialog";
import { SpectateRequestModal } from "../components/SpectateRequestModal";
import { type AppError, getAppErrorMessage } from "../utils/appError";
import type { LobbyPlayer, LobbyState } from "../types";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import { copyText } from "../utils/clipboard";
import { clearTabSession } from "../utils/tabSession";
import {
  buildLeavingSeat,
  buildLobbyHotkeys,
  deriveLobbyHostStatus,
} from "./lobbyState";
import { LobbyBody, ReconnectingOverlay } from "./LobbyViews";

function initialGuidedPreference(
  gameId: string,
  playerId: string | undefined,
): boolean {
  if (!gameId) return getDefaultNewPlayerPreference();
  return (
    getNewPlayerPreferenceForGame(gameId, playerId) ??
    getDefaultNewPlayerPreference()
  );
}

function isReadyActionDisabled(options: {
  isStarting: boolean;
  isConstructed: boolean;
  currentPlayer: LobbyPlayer | undefined;
}): boolean {
  if (options.isStarting) return true;
  if (!options.currentPlayer || !options.isConstructed) return false;
  return (
    !options.currentPlayer.is_ready &&
    options.currentPlayer.battler_status !== "ready"
  );
}

function resolveSummaryBattlerId(
  isConstructed: boolean,
  deckId: string | null | undefined,
  lobbyCubeId: string | undefined,
): string | null {
  return (isConstructed ? deckId : lobbyCubeId) ?? null;
}

function deriveDeckFlags(options: {
  lobbyState: LobbyState | null;
  currentPlayer: LobbyPlayer | undefined;
  editingDeck: boolean;
  battlerIdInput: string;
}): {
  isConstructed: boolean;
  hasLoadedBattler: boolean;
  isBattlerLoading: boolean;
  deckId: string | null | undefined;
  showsDeck: boolean;
  isEditingDeck: boolean;
  deckUnchanged: boolean;
  summaryBattlerId: string | null;
} {
  const { lobbyState, currentPlayer, editingDeck, battlerIdInput } = options;
  const isConstructed = lobbyState?.play_mode === "constructed";
  const battlerStatus = currentPlayer?.battler_status ?? null;
  const hasLoadedBattler = battlerStatus === "ready";
  const isBattlerLoading = battlerStatus === "loading";
  // A refused deck isn't the player's, though the field keeps its ID to correct.
  const deckId = battlerStatus === "error" ? null : currentPlayer?.battler_id;
  const isEditingDeck = hasLoadedBattler && editingDeck;
  return {
    isConstructed,
    hasLoadedBattler,
    isBattlerLoading,
    deckId,
    showsDeck: hasLoadedBattler && !editingDeck,
    isEditingDeck,
    deckUnchanged: isEditingDeck && battlerIdInput.trim() === deckId,
    summaryBattlerId: resolveSummaryBattlerId(
      isConstructed,
      deckId,
      lobbyState?.cube_id,
    ),
  };
}

function useLobbyDeckState(options: {
  lobbyState: LobbyState | null;
  currentPlayer: LobbyPlayer | undefined;
  submitBattlerAction: (id: string) => void;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}): {
  isConstructed: boolean;
  hasLoadedBattler: boolean;
  isBattlerLoading: boolean;
  deckId: string | null | undefined;
  showsDeck: boolean;
  isEditingDeck: boolean;
  deckUnchanged: boolean;
  summaryBattlerId: string | null;
  battlerIdInput: string;
  setBattlerIdInput: (value: string) => void;
  setEditingDeck: (editing: boolean) => void;
  submitBattler: () => void;
  editDeck: () => void;
  handleBattlerButtonClick: () => void;
} {
  const { lobbyState, currentPlayer, submitBattlerAction, addToast } = options;
  const [battlerIdInput, setBattlerIdInput] = useState("");
  const [syncedBattlerId, setSyncedBattlerId] = useState("");
  const [editingDeck, setEditingDeck] = useState(false);

  const serverBattlerId = currentPlayer?.battler_id ?? "";
  if (syncedBattlerId !== serverBattlerId) {
    setSyncedBattlerId(serverBattlerId);
    setBattlerIdInput(serverBattlerId);
  }
  const flags = deriveDeckFlags({
    lobbyState,
    currentPlayer,
    editingDeck,
    battlerIdInput,
  });

  const submitBattler = (): void => {
    const battlerId = battlerIdInput.trim();
    if (!battlerId) {
      addToast(
        flags.isConstructed ? "Please enter a deck" : "Please enter a cube ID",
        "error",
      );
      return;
    }
    setEditingDeck(false);
    submitBattlerAction(battlerId);
  };

  const editDeck = (): void => {
    setBattlerIdInput(flags.deckId ?? "");
    setEditingDeck(true);
  };

  const handleBattlerButtonClick = (): void => {
    if (flags.showsDeck) {
      editDeck();
      return;
    }
    submitBattler();
  };

  return {
    ...flags,
    battlerIdInput,
    setBattlerIdInput,
    setEditingDeck,
    submitBattler,
    editDeck,
    handleBattlerButtonClick,
  };
}

function useLobbyGuidedMode(
  gameId: string,
  playerId: string | undefined,
): [boolean, (next: boolean) => void] {
  const scopeKey = gameId ? `${gameId}::${playerId ?? ""}` : null;
  const [guidedScope, setGuidedScope] = useState<string | null>(scopeKey);
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    initialGuidedPreference(gameId, playerId),
  );
  if (guidedScope !== scopeKey) {
    setGuidedScope(scopeKey);
    if (gameId) {
      setIsGuidedMode(initialGuidedPreference(gameId, playerId));
    }
  }
  const toggle = (nextValue: boolean): void => {
    setIsGuidedMode(nextValue);
    setGlobalGuidedModePreference(nextValue);
    if (gameId) {
      setNewPlayerPreferenceForGame(gameId, nextValue, playerId);
    }
  };
  return [isGuidedMode, toggle];
}

function useLobbyVoice(options: {
  gameId: string;
  sessionId: string | null;
  lobbyState: LobbyState | null;
  sessionPlayerId: string | undefined;
  send: (action: string, payload: Record<string, unknown>) => void;
  voiceSignalRef: React.RefObject<
    ((payload: VoiceSignalPayload) => void) | null
  >;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}): ReturnType<typeof useVoiceChat> {
  const {
    gameId,
    sessionId,
    lobbyState,
    sessionPlayerId,
    send,
    voiceSignalRef,
    addToast,
  } = options;
  const peerNames = useMemo(() => {
    if (!lobbyState?.voice_chat_enabled || !sessionPlayerId) return [];
    return lobbyState.players
      .filter((p) => p.player_id !== sessionPlayerId)
      .map((p) => p.name);
  }, [lobbyState, sessionPlayerId]);

  const selfName =
    lobbyState?.players.find((p) => p.player_id === sessionPlayerId)?.name ??
    null;

  const handleMicDenied = useCallback(() => {
    addToast(
      "Microphone access was denied. Voice chat is unavailable.",
      "warning",
    );
  }, [addToast]);

  const handleRetriesExhausted = useCallback(
    (peerName: string) => {
      addToast(`Voice connection to ${peerName} failed.`, "warning");
    },
    [addToast],
  );

  const voiceName = lobbyState?.voice_chat_enabled ? selfName : null;
  return useVoiceChat({
    send,
    peerNames,
    selfPlayerName: voiceName,
    voiceSignalRef,
    gameId: gameId || null,
    sessionId,
    onPermissionDenied: handleMicDenied,
    onRetriesExhausted: handleRetriesExhausted,
  });
}

function LobbyStartingView({
  isConnected,
  spectateRequest,
  onRespondSpectate,
  rulesPanel,
}: {
  isConnected: boolean;
  spectateRequest:
    | Parameters<typeof SpectateRequestModal>[0]["request"]
    | undefined;
  onRespondSpectate: (requestId: string, allowed: boolean) => void;
  rulesPanel: ReactElement | false;
}): ReactElement {
  return (
    <>
      {!isConnected && <ReconnectingOverlay />}
      <LoadingScreen steps={START_STEPS} current="Deal cards" />
      {spectateRequest && (
        <SpectateRequestModal
          request={spectateRequest}
          onRespond={onRespondSpectate}
        />
      )}
      {rulesPanel}
    </>
  );
}

function findRemovablePlayer(
  lobbyState: LobbyState | null,
  currentPlayer: LobbyPlayer | undefined,
  removingId: string | null,
): LobbyPlayer | undefined {
  if (!currentPlayer?.is_host || !removingId) return undefined;
  return lobbyState?.players.find(
    (p) => p.player_id === removingId && !p.is_host,
  );
}

function LobbyOverlays({
  removing,
  leavingSeat,
  spectateRequest,
  showRulesPanel,
  guideMinimized,
  rulesPanelTarget,
  gameId,
  playerName,
  useUpgrades,
  onKeepPlayer,
  onConfirmRemovePlayer,
  onKeepSeat,
  onSeatClosed,
  onRespondSpectate,
  onCloseRulesPanel,
  onGuideMinimizedChange,
}: {
  removing: LobbyPlayer | undefined;
  leavingSeat: ResumableSeat | null;
  spectateRequest:
    | Parameters<typeof SpectateRequestModal>[0]["request"]
    | undefined;
  showRulesPanel: boolean;
  guideMinimized: boolean;
  rulesPanelTarget: RulesPanelTarget | undefined;
  gameId: string;
  playerName: string | undefined;
  useUpgrades: boolean | undefined;
  onKeepPlayer: () => void;
  onConfirmRemovePlayer: (playerId: string) => void;
  onKeepSeat: () => void;
  onSeatClosed: (gameId: string) => void;
  onRespondSpectate: (requestId: string, allowed: boolean) => void;
  onCloseRulesPanel: () => void;
  onGuideMinimizedChange: (minimized: boolean) => void;
}): ReactElement {
  return (
    <>
      {removing && (
        <RemovePlayerDialog
          name={removing.name}
          onKeep={onKeepPlayer}
          onRemove={() => onConfirmRemovePlayer(removing.player_id)}
        />
      )}
      {leavingSeat && (
        <CloseSeatDialog
          seat={leavingSeat}
          onKeep={onKeepSeat}
          onClosed={() => onSeatClosed(leavingSeat.gameId)}
        />
      )}
      {spectateRequest && (
        <SpectateRequestModal
          request={spectateRequest}
          onRespond={onRespondSpectate}
        />
      )}
      {showRulesPanel && (
        <RulesPanel
          onClose={onCloseRulesPanel}
          minimized={guideMinimized}
          onMinimizedChange={onGuideMinimizedChange}
          target={rulesPanelTarget}
          gameId={gameId}
          playerName={playerName}
          useUpgrades={useUpgrades}
        />
      )}
    </>
  );
}

function LobbyGateScreen({
  seat,
  gameId,
  header,
  gameStatePresent,
  lobbyState,
  isStarting,
  isConnected,
  openingSteps,
  spectateRequest,
  onJoined,
  onClaim,
  onTakeBack,
  onRespondSpectate,
  overlays,
}: {
  seat: ReturnType<typeof useGameSeat>["seat"];
  gameId: string;
  header: ReactElement;
  gameStatePresent: boolean;
  lobbyState: LobbyState | null;
  isStarting: boolean;
  isConnected: boolean;
  openingSteps: ReturnType<typeof useHandedOnSteps>;
  spectateRequest:
    | Parameters<typeof SpectateRequestModal>[0]["request"]
    | undefined;
  onJoined: ReturnType<typeof useGameSeat>["adopt"];
  onClaim: (playerName: string) => void;
  onTakeBack: () => void;
  onRespondSpectate: (requestId: string, allowed: boolean) => void;
  overlays: ReactElement;
}): ReactElement | null {
  if (seat.kind !== "held") {
    return (
      <>
        <PageFrame header={header} center contentClassName="items-center">
          <LobbySeatNotice
            gameId={gameId}
            seat={seat}
            onJoined={onJoined}
            onClaim={onClaim}
            onTakeBack={onTakeBack}
          />
        </PageFrame>
        {overlays}
      </>
    );
  }
  // The game arrives before the route changes, and takes the lobby's state with it.
  if (gameStatePresent) {
    return <LoadingScreen steps={START_STEPS} current="Open board" />;
  }
  if (!lobbyState) {
    return (
      <>
        <LoadingScreen
          title="Opening lobby"
          steps={openingSteps}
          current="Open lobby"
        />
        {overlays}
      </>
    );
  }
  if (isStarting) {
    return (
      <LobbyStartingView
        isConnected={isConnected}
        spectateRequest={spectateRequest}
        onRespondSpectate={onRespondSpectate}
        rulesPanel={overlays}
      />
    );
  }
  return null;
}

function shouldResetClosedHostChange(
  hostPass: string | null,
  closedHostChange: string | null,
): boolean {
  return Boolean(hostPass && closedHostChange && closedHostChange !== hostPass);
}

function extractSeatSession(seat: ReturnType<typeof useGameSeat>["seat"]): {
  session:
    | Extract<
        ReturnType<typeof useGameSeat>["seat"],
        { kind: "held" }
      >["session"]
    | null;
  sessionId: string | null;
  sessionPlayerId: string | undefined;
} {
  if (seat.kind !== "held") {
    return { session: null, sessionId: null, sessionPlayerId: undefined };
  }
  return {
    session: seat.session,
    sessionId: seat.session.sessionId,
    sessionPlayerId: seat.session.playerId,
  };
}

function extractLobbyPlayerMeta(
  lobbyState: LobbyState | null,
  sessionPlayerId: string | undefined,
): {
  currentPlayer: LobbyPlayer | undefined;
  isStarting: boolean;
  battlerError: string | null;
  selfName: string | null;
} {
  const currentPlayer = lobbyState?.players.find(
    (p) => p.player_id === sessionPlayerId,
  );
  return {
    currentPlayer,
    isStarting: lobbyState?.start_status === "starting",
    battlerError: currentPlayer?.battler_error ?? null,
    selfName: currentPlayer?.name ?? null,
  };
}

function useLobbyRouteController(): {
  gameId: string;
  navigate: ReturnType<typeof useNavigate>;
  openingSteps: ReturnType<typeof useHandedOnSteps>;
  seatHook: ReturnType<typeof useGameSeat>;
  session:
    | Extract<
        ReturnType<typeof useGameSeat>["seat"],
        { kind: "held" }
      >["session"]
    | null;
  sessionPlayerId: string | undefined;
  gameHook: ReturnType<typeof useGame>;
  voiceChat: ReturnType<typeof useVoiceChat>;
  currentPlayer: LobbyPlayer | undefined;
  deck: ReturnType<typeof useLobbyDeckState>;
  cubeLook: ReturnType<typeof useCubeLook>;
  hostStatus: ReturnType<typeof deriveLobbyHostStatus>;
  isStarting: boolean;
  readyActionDisabled: boolean;
  startAwaitingServer: boolean;
  requestStart: () => void;
  toggleReady: () => void;
  closedHostChange: string | null;
  setClosedHostChange: (pass: string | null) => void;
} {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const openingSteps = useHandedOnSteps(["Open lobby"]);
  const seatHook = useGameSeat(gameId);
  const { session, sessionId, sessionPlayerId } = extractSeatSession(
    seatHook.seat,
  );
  const { addToast } = useToast();
  const [startSentIn, setStartSentIn] = useState<LobbyState | null>(null);
  const [closedHostChange, setClosedHostChange] = useState<string | null>(null);
  const handleServerError = useCallback(
    (error: AppError) => {
      setStartSentIn(null);
      addToast(
        getAppErrorMessage(
          error,
          "lobby-action",
          "That action could not be completed.",
        ),
        "error",
      );
    },
    [addToast, setStartSentIn],
  );
  const voiceSignalRef = useRef<((payload: VoiceSignalPayload) => void) | null>(
    null,
  );
  const handleVoiceSignal = useCallback((payload: VoiceSignalPayload) => {
    voiceSignalRef.current?.(payload);
  }, []);

  const gameHook = useGame({
    gameId: gameId || null,
    sessionId,
    spectatorConfig: null,
    onServerError: handleServerError,
    onVoiceSignal: handleVoiceSignal,
  });
  const voiceChat = useLobbyVoice({
    gameId,
    sessionId,
    lobbyState: gameHook.lobbyState,
    sessionPlayerId,
    send: gameHook.send,
    voiceSignalRef,
    addToast,
  });

  const { currentPlayer, isStarting, battlerError, selfName } =
    extractLobbyPlayerMeta(gameHook.lobbyState, sessionPlayerId);
  const deck = useLobbyDeckState({
    lobbyState: gameHook.lobbyState,
    currentPlayer,
    submitBattlerAction: gameHook.actions.submitBattler,
    addToast,
  });
  const cubeLook = useCubeLook(deck.summaryBattlerId);
  const readyActionDisabled = isReadyActionDisabled({
    isStarting,
    isConstructed: deck.isConstructed,
    currentPlayer,
  });
  const startAwaitingServer =
    startSentIn !== null && startSentIn === gameHook.lobbyState;
  const hostStatus = deriveLobbyHostStatus({
    lobbyState: gameHook.lobbyState,
    sessionPlayerId,
    currentPlayer,
    closedHostChange,
  });
  if (shouldResetClosedHostChange(hostStatus.hostPass, closedHostChange)) {
    setClosedHostChange(null);
  }

  useLobbySync({
    gameId,
    session,
    status: gameHook.status,
    lobbyState: gameHook.lobbyState,
    gameState: gameHook.gameState,
    battlerError,
    hostName: hostStatus.hostName,
    selfName,
    lostHost: hostStatus.lostHost,
    gainedHost: hostStatus.gainedHost,
    connectionOpened: seatHook.connectionOpened,
    connectionEnded: seatHook.connectionEnded,
    addToast,
  });

  const requestStart = (): void => {
    if (!gameHook.lobbyState?.can_start || startAwaitingServer) return;
    setStartSentIn(gameHook.lobbyState);
    gameHook.actions.startGame();
  };
  const toggleReady = (): void => {
    if (!currentPlayer || readyActionDisabled) return;
    gameHook.actions.setReady(!currentPlayer.is_ready);
  };

  return {
    gameId,
    navigate,
    openingSteps,
    seatHook,
    session,
    sessionPlayerId,
    gameHook,
    voiceChat,
    currentPlayer,
    deck,
    cubeLook,
    hostStatus,
    isStarting,
    readyActionDisabled,
    startAwaitingServer,
    requestStart,
    toggleReady,
    closedHostChange,
    setClosedHostChange,
  };
}

function shouldShowGateScreen(options: {
  seatKind: ReturnType<typeof useGameSeat>["seat"]["kind"];
  gameStatePresent: boolean;
  lobbyState: LobbyState | null;
  isStarting: boolean;
}): boolean {
  return (
    options.seatKind !== "held" ||
    options.gameStatePresent ||
    !options.lobbyState ||
    options.isStarting
  );
}

function LobbyHeader({
  canLeaveLobby,
  guideDot,
  onLeaveClick,
  onOpenGuide,
}: {
  canLeaveLobby: boolean;
  guideDot: boolean;
  onLeaveClick: () => void;
  onOpenGuide: () => void;
}): ReactElement {
  return (
    <AppHeader
      helpers={
        <>
          {canLeaveLobby && (
            <button
              type="button"
              onClick={onLeaveClick}
              className="btn btn-secondary"
            >
              <BarLabel desktop="Leave Lobby" phone="Leave" />
            </button>
          )}
          <GuideButton
            onClick={onOpenGuide}
            className={guideDot ? "btn-dot-phone" : ""}
          />
        </>
      }
      home={<HomeButton />}
    />
  );
}

function useLobbyUiModals(c: ReturnType<typeof useLobbyRouteController>): {
  copied: boolean;
  showRulesPanel: boolean;
  guideMinimized: boolean;
  rulesPanelTarget: RulesPanelTarget | undefined;
  removing: LobbyPlayer | undefined;
  leavingSeat: ResumableSeat | null;
  openGuide: (target?: RulesPanelTarget) => void;
  copyJoinLink: () => Promise<void>;
  openLeaveDialog: () => void;
  setRemovingId: (id: string | null) => void;
  setLeavingSeat: (seat: ResumableSeat | null) => void;
  setShowRulesPanel: (show: boolean) => void;
  setGuideMinimized: (minimized: boolean) => void;
} {
  const { lobbyState } = c.gameHook;
  const [copied, setCopied] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [guideMinimized, setGuideMinimized] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [leavingSeat, setLeavingSeat] = useState<ResumableSeat | null>(null);
  const [rulesPanelTarget, setRulesPanelTarget] = useState<
    RulesPanelTarget | undefined
  >(undefined);

  const openGuide = (target?: RulesPanelTarget): void => {
    if (target || !showRulesPanel) setRulesPanelTarget(target);
    setGuideMinimized(false);
    setShowRulesPanel(true);
  };

  const guideTakesKeys = showRulesPanel && !guideMinimized;
  const removing = findRemovablePlayer(lobbyState, c.currentPlayer, removingId);
  useHotkeys(
    buildLobbyHotkeys({
      guideTakesKeys,
      lobbyState,
      currentPlayer: c.currentPlayer,
      isConstructed: c.deck.isConstructed,
      canClickBattler:
        !c.deck.isBattlerLoading && !c.isStarting && !c.deck.deckUnchanged,
      toggleGuide: () => {
        if (guideTakesKeys) {
          setShowRulesPanel(false);
          return;
        }
        openGuide();
      },
      toggleReady: c.toggleReady,
      onBattlerHotkey: c.deck.handleBattlerButtonClick,
      requestStart: c.requestStart,
    }),
    Boolean(c.session) && !removing && !leavingSeat,
  );
  usePanelHoldsEnter(guideTakesKeys);

  const copyJoinLink = async (): Promise<void> => {
    if (!(await copyText(`${window.location.origin}/game/${c.gameId}/lobby`))) {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openLeaveDialog = (): void => {
    if (!c.gameId || !lobbyState || !c.currentPlayer) return;
    setLeavingSeat(
      buildLeavingSeat({
        gameId: c.gameId,
        lobbyState,
        currentPlayer: c.currentPlayer,
        summaryBattlerId: c.deck.summaryBattlerId,
        cubeLook: c.cubeLook,
      }),
    );
  };

  return {
    copied,
    showRulesPanel,
    guideMinimized,
    rulesPanelTarget,
    removing,
    leavingSeat,
    openGuide,
    copyJoinLink,
    openLeaveDialog,
    setRemovingId,
    setLeavingSeat,
    setShowRulesPanel,
    setGuideMinimized,
  };
}

function deriveLobbyHeaderAndOverlayMeta(
  c: ReturnType<typeof useLobbyRouteController>,
  ui: ReturnType<typeof useLobbyUiModals>,
): {
  canLeaveLobby: boolean;
  guideDot: boolean;
  spectateRequest:
    | Parameters<typeof SpectateRequestModal>[0]["request"]
    | undefined;
  playerName: string | undefined;
  useUpgrades: boolean | undefined;
} {
  const { lobbyState, spectateRequests } = c.gameHook;
  return {
    canLeaveLobby: Boolean(
      c.session && c.gameId && lobbyState && c.currentPlayer && !c.isStarting,
    ),
    guideDot: ui.showRulesPanel && ui.guideMinimized,
    spectateRequest: c.isStarting ? undefined : spectateRequests[0],
    playerName: c.currentPlayer?.name,
    useUpgrades: lobbyState?.use_upgrades,
  };
}

export function Lobby(): ReactElement {
  const c = useLobbyRouteController();
  const {
    lobbyState,
    gameState,
    isConnected,
    actions,
    send,
    spectateRequests,
  } = c.gameHook;
  const [isGuidedMode, handleGuidedModeToggle] = useLobbyGuidedMode(
    c.gameId,
    c.sessionPlayerId,
  );
  const isBoard = useBoardDesktop();
  const ui = useLobbyUiModals(c);
  const meta = deriveLobbyHeaderAndOverlayMeta(c, ui);

  const header = (
    <LobbyHeader
      canLeaveLobby={meta.canLeaveLobby}
      guideDot={meta.guideDot}
      onLeaveClick={ui.openLeaveDialog}
      onOpenGuide={() => ui.openGuide()}
    />
  );

  const overlays = (
    <LobbyOverlays
      removing={ui.removing}
      leavingSeat={ui.leavingSeat}
      spectateRequest={meta.spectateRequest}
      showRulesPanel={ui.showRulesPanel}
      guideMinimized={ui.guideMinimized}
      rulesPanelTarget={ui.rulesPanelTarget}
      gameId={c.gameId}
      playerName={meta.playerName}
      useUpgrades={meta.useUpgrades}
      onKeepPlayer={() => ui.setRemovingId(null)}
      onConfirmRemovePlayer={(playerId) => {
        actions.kickPlayer(playerId);
        ui.setRemovingId(null);
      }}
      onKeepSeat={() => ui.setLeavingSeat(null)}
      onSeatClosed={(closedGameId) => {
        clearTabSession(closedGameId);
        ui.setLeavingSeat(null);
        void c.navigate("/", { replace: true });
      }}
      onRespondSpectate={actions.spectateResponse}
      onCloseRulesPanel={() => ui.setShowRulesPanel(false)}
      onGuideMinimizedChange={ui.setGuideMinimized}
    />
  );

  const showGate = shouldShowGateScreen({
    seatKind: c.seatHook.seat.kind,
    gameStatePresent: Boolean(gameState),
    lobbyState,
    isStarting: c.isStarting,
  });
  if (showGate || !lobbyState) {
    return (
      <LobbyGateScreen
        seat={c.seatHook.seat}
        gameId={c.gameId}
        header={header}
        gameStatePresent={Boolean(gameState)}
        lobbyState={lobbyState}
        isStarting={c.isStarting}
        isConnected={isConnected}
        openingSteps={c.openingSteps}
        spectateRequest={spectateRequests[0]}
        onJoined={c.seatHook.adopt}
        onClaim={(playerName) => {
          void c.seatHook.claim(playerName);
        }}
        onTakeBack={c.seatHook.takeBack}
        onRespondSpectate={actions.spectateResponse}
        overlays={overlays}
      />
    );
  }

  return (
    <>
      {!isConnected && <ReconnectingOverlay />}
      <LobbyBody
        isBoard={isBoard}
        header={header}
        lobbyState={lobbyState}
        currentPlayer={c.currentPlayer}
        sessionPlayerId={c.sessionPlayerId}
        cubeLook={c.cubeLook}
        summaryBattlerId={c.deck.summaryBattlerId}
        voiceChat={c.voiceChat}
        seatActions={{
          addPuppet: actions.addPuppet,
          removePuppet: actions.removePuppet,
          kickPlayer: ui.setRemovingId,
        }}
        isGuidedMode={isGuidedMode}
        onGuidedModeToggle={handleGuidedModeToggle}
        onVoiceChatToggle={(enabled) => send("set_voice_chat", { enabled })}
        onTargetPlayerCountChange={actions.setTargetPlayerCount}
        onToggleReady={c.toggleReady}
        onRequestStart={c.requestStart}
        readyActionDisabled={c.readyActionDisabled}
        startAwaitingServer={c.startAwaitingServer}
        copied={ui.copied}
        onCopyJoinLink={() => {
          void ui.copyJoinLink();
        }}
        onOpenGuide={ui.openGuide}
        deckId={c.deck.deckId}
        hasLoadedBattler={c.deck.hasLoadedBattler}
        showsDeck={c.deck.showsDeck}
        isEditingDeck={c.deck.isEditingDeck}
        isBattlerLoading={c.deck.isBattlerLoading}
        deckUnchanged={c.deck.deckUnchanged}
        battlerIdInput={c.deck.battlerIdInput}
        onBattlerIdInputChange={c.deck.setBattlerIdInput}
        onCancelEditDeck={() => c.deck.setEditingDeck(false)}
        onEditDeck={c.deck.editDeck}
        onSubmitBattler={c.deck.submitBattler}
        onBattlerButtonClick={c.deck.handleBattlerButtonClick}
        hostChange={c.hostStatus.hostChange}
        awayHost={c.hostStatus.awayHost}
        onDismissHostChange={() => c.setClosedHostChange(c.hostStatus.hostPass)}
      />
      {overlays}
    </>
  );
}

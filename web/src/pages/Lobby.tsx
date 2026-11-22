import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSeat } from "../hooks/useGameSeat";
import { useGame } from "../hooks/useGame";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import { useHotkeys } from "../hooks/useHotkeys";
import { InfoIcon } from "../components/icons/InfoIcon";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { MicToggle } from "../components/sidebar/MicToggle";
import { useToast } from "../contexts";
import { AppHeader, GuideButton, HomeButton } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { type LoadingRouteState, START_STEPS, useHandedOnSteps } from "../components/common/loadingSteps";
import { LobbySeatNotice } from "../components/lobby/LobbySeatNotice";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { SpectateRequestModal } from "../components/SpectateRequestModal";
import { type AppError, getAppErrorMessage } from "../utils/appError";
import type { LobbyState } from "../types";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import { DIALOG_BACKDROP, LINK, TEXT_INPUT } from "../components/common/styles";
import { Tag } from "../components/common/Tag";
import { PuppetIcon } from "../components/icons";
import { copyText } from "../utils/clipboard";

const EVEN_PLAYER_CAP_OPTIONS = [2, 4, 6, 8] as const;

function cubeCobraUrl(battlerId: string) {
  return `https://cubecobra.com/cube/overview/${encodeURIComponent(battlerId)}`;
}

function GuidedModeSwitch({
  enabled,
  setEnabled,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const guidedModeHelpText =
    "Guided Mode gives you a brief walkthrough the first time a new phase, action, or situation comes up.";
  const [showGuidedModeHelp, setShowGuidedModeHelp] = useState(false);
  const guidedModeHelpRef = useRef<HTMLDivElement>(null);
  const [popupAnchorX, setPopupAnchorX] = useState<"right" | "left" | "center">("right");
  const [popupAnchorY, setPopupAnchorY] = useState<"top" | "bottom">("top");

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!guidedModeHelpRef.current?.contains(target)) {
        setShowGuidedModeHelp(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!showGuidedModeHelp) return;

    const repositionPopup = () => {
      const anchor = guidedModeHelpRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const popupWidth = Math.min(256, window.innerWidth - viewportPadding * 2);
      const canAlignRight = rect.right - popupWidth >= viewportPadding;
      const canAlignLeft = rect.left + popupWidth <= window.innerWidth - viewportPadding;

      if (canAlignRight) {
        setPopupAnchorX("right");
      } else if (canAlignLeft) {
        setPopupAnchorX("left");
      } else {
        setPopupAnchorX("center");
      }

      const estimatedPopupHeight = 96;
      setPopupAnchorY(
        rect.top - estimatedPopupHeight >= viewportPadding ? "top" : "bottom",
      );
    };

    repositionPopup();
    window.addEventListener("resize", repositionPopup);
    window.addEventListener("scroll", repositionPopup, true);
    return () => {
      window.removeEventListener("resize", repositionPopup);
      window.removeEventListener("scroll", repositionPopup, true);
    };
  }, [showGuidedModeHelp]);

  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ivory-muted)]">
          Guided
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="sr-only peer"
        />
        <span className="switch-track relative inline-flex h-5 w-10 items-center rounded-full transition-colors">
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </span>
      </label>
      <div ref={guidedModeHelpRef} className="relative group shrink-0">
        <button
          type="button"
          className="touch-area [--touch-area-left:-7px] text-[var(--ivory-muted)] hover:text-[var(--ivory)]"
          aria-label="What guided mode does"
          aria-expanded={showGuidedModeHelp}
          onClick={() => setShowGuidedModeHelp((v) => !v)}
        >
          <InfoIcon size="sm" />
        </button>
        <span
          className={`absolute w-64 rounded-lg modal-chrome border gold-border shadow-xl p-2 text-left text-[11px] text-[var(--ivory)] transition-opacity z-[60] ${
            popupAnchorX === "right"
              ? "right-0"
              : popupAnchorX === "left"
                ? "left-0"
                : "left-1/2 -translate-x-1/2"
          } ${
            popupAnchorY === "top" ? "bottom-full mb-2" : "top-full mt-2"
          } ${
            showGuidedModeHelp
              ? "opacity-100"
              : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
          style={{ maxWidth: "calc(100vw - 1rem)" }}
        >
          {guidedModeHelpText}
        </span>
      </div>
    </div>
  );
}

function VoiceChatSwitch({
  enabled,
  setEnabled,
  isHost,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  isHost: boolean;
}) {
  const voiceHelpText =
    "Voice chat may not work for all players. If it doesn't connect, use Discord instead.";
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);
  const voiceHelpRef = useRef<HTMLDivElement>(null);
  const [popupAnchorX, setPopupAnchorX] = useState<"right" | "left" | "center">("right");
  const [popupAnchorY, setPopupAnchorY] = useState<"top" | "bottom">("top");

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!voiceHelpRef.current?.contains(target)) {
        setShowVoiceHelp(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!showVoiceHelp) return;

    const repositionPopup = () => {
      const anchor = voiceHelpRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const popupWidth = Math.min(256, window.innerWidth - viewportPadding * 2);
      const canAlignRight = rect.right - popupWidth >= viewportPadding;
      const canAlignLeft = rect.left + popupWidth <= window.innerWidth - viewportPadding;

      if (canAlignRight) {
        setPopupAnchorX("right");
      } else if (canAlignLeft) {
        setPopupAnchorX("left");
      } else {
        setPopupAnchorX("center");
      }

      const estimatedPopupHeight = 96;
      setPopupAnchorY(
        rect.top - estimatedPopupHeight >= viewportPadding ? "top" : "bottom",
      );
    };

    repositionPopup();
    window.addEventListener("resize", repositionPopup);
    window.addEventListener("scroll", repositionPopup, true);
    return () => {
      window.removeEventListener("resize", repositionPopup);
      window.removeEventListener("scroll", repositionPopup, true);
    };
  }, [showVoiceHelp]);

  return (
    <div
      className={`flex items-center gap-1.5${
        !isHost ? ' opacity-50' : ''
      }`}
    >
      <label className={`flex items-center gap-1.5${isHost ? ' cursor-pointer' : ' cursor-default'}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ivory-muted)]">
          Voice
        </span>
        <Tag tone="gold" small className="max-[389px]:hidden">
          Beta
        </Tag>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => isHost && setEnabled(e.target.checked)}
          disabled={!isHost}
          className="sr-only peer"
        />
        <span className="switch-track relative inline-flex h-5 w-10 items-center rounded-full transition-colors">
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </label>
      <div ref={voiceHelpRef} className="relative group shrink-0">
        <button
          type="button"
          className="touch-area [--touch-area-left:-7px] text-[var(--ivory-muted)] hover:text-[var(--ivory)]"
          aria-label="Voice chat info"
          aria-expanded={showVoiceHelp}
          onClick={() => setShowVoiceHelp((v) => !v)}
        >
          <InfoIcon size="sm" />
        </button>
        <span
          className={`absolute w-64 rounded-lg modal-chrome border gold-border shadow-xl p-2 text-left text-[11px] text-[var(--ivory)] transition-opacity z-[60] ${
            popupAnchorX === "right"
              ? "right-0"
              : popupAnchorX === "left"
                ? "left-0"
                : "left-1/2 -translate-x-1/2"
          } ${
            popupAnchorY === "top" ? "bottom-full mb-2" : "top-full mt-2"
          } ${
            showVoiceHelp
              ? "opacity-100"
              : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
          style={{ maxWidth: "calc(100vw - 1rem)" }}
        >
          {voiceHelpText}
        </span>
      </div>
    </div>
  );
}

export function Lobby() {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const openingSteps = useHandedOnSteps(["Open lobby"]);
  const { seat, claim, adopt, connectionOpened, connectionEnded, takeBack } = useGameSeat(gameId);
  const session = seat.kind === "held" ? seat.session : null;
  const { addToast } = useToast();
  const [startSentIn, setStartSentIn] = useState<LobbyState | null>(null);
  const handleServerError = useCallback((error: AppError) => {
    setStartSentIn(null);
    addToast(getAppErrorMessage(error, "lobby-action", "That action could not be completed."), "error");
  }, [addToast]);

  const voiceSignalRef = useRef<((payload: VoiceSignalPayload) => void) | null>(null);
  const handleVoiceSignal = useCallback((payload: VoiceSignalPayload) => {
    voiceSignalRef.current?.(payload);
  }, []);

  const {
    status,
    lobbyState,
    gameState,
    isConnected,
    actions,
    send,
    spectateRequests,
  } = useGame(
    gameId || null,
    session?.sessionId ?? null,
    null,
    handleServerError,
    handleVoiceSignal,
  );

  const peerNames = useMemo(() => {
    if (!lobbyState?.voice_chat_enabled || !session) return []
    return lobbyState.players
      .filter(p => p.player_id !== session.playerId)
      .map(p => p.name)
  }, [lobbyState, session])

  const selfName = lobbyState?.players.find(p => p.player_id === session?.playerId)?.name ?? null

  const handleMicDenied = useCallback(() => {
    addToast("Microphone access was denied. Voice chat is unavailable.", "warning")
  }, [addToast])

  const handleRetriesExhausted = useCallback((peerName: string) => {
    addToast(`Voice connection to ${peerName} failed.`, "warning")
  }, [addToast])

  const voiceChat = useVoiceChat(send, peerNames, selfName, voiceSignalRef, handleMicDenied, handleRetriesExhausted);

  const [copied, setCopied] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [guideMinimized, setGuideMinimized] = useState(false);
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    getDefaultNewPlayerPreference(),
  );
  const [battlerIdInput, setBattlerIdInput] = useState("");
  const [rulesPanelTarget, setRulesPanelTarget] = useState<
    RulesPanelTarget | undefined
  >(undefined);
  const lastCubeLoadingErrorRef = useRef<string | null>(null);
  const lastBattlerErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const existing = getNewPlayerPreferenceForGame(gameId, session?.playerId);
    const initial = existing ?? getDefaultNewPlayerPreference();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsGuidedMode(initial);
    });
    if (existing === null) {
      setNewPlayerPreferenceForGame(gameId, initial, session?.playerId);
    }
    return () => {
      cancelled = true;
    };
  }, [gameId, session?.playerId]);

  const handleGuidedModeToggle = (nextValue: boolean) => {
    setIsGuidedMode(nextValue);
    setGlobalGuidedModePreference(nextValue);
    if (gameId) {
      setNewPlayerPreferenceForGame(gameId, nextValue, session?.playerId);
    }
  };

  const currentPlayer = lobbyState?.players.find(
    (p) => p.player_id === session?.playerId,
  );
  const isConstructed = lobbyState?.play_mode === "constructed";
  const battlerStatus = currentPlayer?.battler_status ?? null;
  const hasLoadedBattler = battlerStatus === "ready";
  const isBattlerLoading = battlerStatus === "loading";
  const isStarting = lobbyState?.start_status === "starting";
  const readyActionDisabled =
    isStarting ||
    (!!currentPlayer &&
      isConstructed === true &&
      !currentPlayer.is_ready &&
      battlerStatus !== "ready");
  // The server answers a start with a new lobby state or an error, and either one re-enables the button.
  const startAwaitingServer = startSentIn !== null && startSentIn === lobbyState;

  const requestStart = () => {
    if (!lobbyState?.can_start || startAwaitingServer) return;
    setStartSentIn(lobbyState);
    actions.startGame();
  };

  const toggleReady = () => {
    if (!currentPlayer || readyActionDisabled) return;
    actions.setReady(!currentPlayer.is_ready);
  };

  useEffect(() => {
    const nextBattlerId = currentPlayer?.battler_id ?? "";
    queueMicrotask(() => {
      setBattlerIdInput((previous) =>
        previous === nextBattlerId ? previous : nextBattlerId,
      );
    });
  }, [currentPlayer?.battler_id]);

  useEffect(() => {
    const nextError =
      lobbyState?.play_mode === "limited" &&
      lobbyState.cube_loading_status === "error"
        ? lobbyState.cube_loading_error
        : null;
    if (!nextError || nextError === lastCubeLoadingErrorRef.current) {
      if (!nextError) {
        lastCubeLoadingErrorRef.current = null;
      }
      return;
    }
    lastCubeLoadingErrorRef.current = nextError;
    addToast(nextError, "error");
  }, [
    addToast,
    lobbyState?.cube_loading_error,
    lobbyState?.cube_loading_status,
    lobbyState?.play_mode,
  ]);

  useEffect(() => {
    const nextError = currentPlayer?.battler_error ?? null;
    if (!nextError || nextError === lastBattlerErrorRef.current) {
      if (!nextError) {
        lastBattlerErrorRef.current = null;
      }
      return;
    }
    lastBattlerErrorRef.current = nextError;
    addToast(nextError, "error");
  }, [addToast, currentPlayer?.battler_error]);

  const submitBattler = () => {
    const battlerId = battlerIdInput.trim();
    if (!battlerId) {
      addToast(isConstructed ? "Please enter a deck" : "Please enter a cube ID", "error");
      return;
    }
    actions.submitBattler(battlerId);
  };

  const clearBattler = () => {
    if (!hasLoadedBattler) return;
    actions.clearBattler();
  };

  const handleBattlerButtonClick = () => {
    if (hasLoadedBattler) {
      clearBattler();
      return;
    }
    submitBattler();
  };

  const lobbyHotkeyMap: Record<string, () => void> = {
    "?": () => {
      if (showRulesPanel) {
        setShowRulesPanel(false);
        return;
      }
      setRulesPanelTarget(undefined);
      setShowRulesPanel(true);
    },
  };
  const guideTakesKeys = showRulesPanel && !guideMinimized;
  if (lobbyState && currentPlayer && !guideTakesKeys) {
    const isHost = currentPlayer.is_host;
    lobbyHotkeyMap["r"] = toggleReady;
    if (isConstructed) {
      lobbyHotkeyMap["b"] = () => {
        if (isBattlerLoading || isStarting) return;
        handleBattlerButtonClick();
      };
    }
    lobbyHotkeyMap["Enter"] = () => {
      if (isHost && lobbyState.can_start) {
        requestStart();
      } else {
        toggleReady();
      }
    };
  }
  useHotkeys(lobbyHotkeyMap, !!session && !guideTakesKeys);

  useEffect(() => {
    if (gameState) {
      const state: LoadingRouteState = { loadingSteps: START_STEPS };
      navigate(`/game/${gameId}/play`, { state });
    }
  }, [gameState, gameId, navigate]);

  useEffect(() => {
    if (!session) return;
    if (status.kind === "open") connectionOpened(session.sessionId);
    if (status.kind === "ended") connectionEnded(session.sessionId, status.error);
  }, [status, session, connectionOpened, connectionEnded]);

  const hostName = lobbyState?.players.find((p) => p.is_host)?.name ?? null;
  const awayHost = lobbyState?.players.find((p) => p.is_host && !p.is_connected) ?? null;
  const previousHostRef = useRef<string | null>(null);
  useEffect(() => {
    const previousHost = previousHostRef.current;
    previousHostRef.current = hostName;
    if (!previousHost || !hostName || previousHost === hostName) return;
    addToast(
      hostName === selfName
        ? `You're the host now. ${previousHost} left the lobby.`
        : `${hostName} is now the host.`,
      "info",
    );
  }, [hostName, selfName, addToast]);

  const copyJoinCode = async () => {
    if (!lobbyState?.join_code) return;
    await copyText(lobbyState.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const header = (
    <AppHeader
      helpers={
        <GuideButton
          onClick={() => {
            setRulesPanelTarget(undefined);
            setShowRulesPanel(true);
          }}
        />
      }
      home={<HomeButton />}
    />
  );

  const rulesPanel = showRulesPanel && (
    <RulesPanel
      onClose={() => setShowRulesPanel(false)}
      onMinimizedChange={setGuideMinimized}
      initialDocId={rulesPanelTarget?.docId}
      initialTab={rulesPanelTarget?.tab}
      gameId={gameId}
      playerName={currentPlayer?.name}
      useUpgrades={undefined}
    />
  );

  if (seat.kind !== "held") {
    return (
      <>
        <PageFrame header={header} center contentClassName="items-center">
          <LobbySeatNotice
            gameId={gameId}
            seat={seat}
            onJoined={adopt}
            onClaim={(playerName) => void claim(playerName)}
            onTakeBack={takeBack}
          />
        </PageFrame>
        {rulesPanel}
      </>
    );
  }

  // The game arrives before the route changes, and takes the lobby's state with it.
  if (gameState) {
    return <LoadingScreen steps={START_STEPS} current="Open board" />;
  }

  if (!lobbyState) {
    return (
      <>
        <LoadingScreen title="Opening lobby" steps={openingSteps} current="Open lobby" />
        {rulesPanel}
      </>
    );
  }

  const reconnecting = !isConnected && (
    <div className={`fixed inset-0 z-50 ${DIALOG_BACKDROP} flex items-center justify-center`}>
      <div className="modal-chrome border gold-border rounded-lg shadow-xl px-5 py-3 flex items-center gap-3">
        <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm text-[var(--ivory)]">Reconnecting...</span>
      </div>
    </div>
  );

  if (isStarting) {
    return (
      <>
        {reconnecting}
        <LoadingScreen steps={START_STEPS} current="Deal cards" />
        {spectateRequests[0] && (
          <SpectateRequestModal request={spectateRequests[0]} onRespond={actions.spectateResponse} />
        )}
        {rulesPanel}
      </>
    );
  }

  return (
    <>
      {reconnecting}
      <PageFrame
        header={header}
        center
        hints="game"
      >
        <SurfaceCard className="overflow-visible">
          {lobbyState &&
            (() => {
              const isHost = currentPlayer?.is_host ?? false;
              const isReady = currentPlayer?.is_ready ?? false;
              const puppetCount = lobbyState.puppet_count;
              const playerCap = lobbyState.target_player_count;
              const occupiedSlots = lobbyState.players.length + puppetCount;
              const playerCapIndex = EVEN_PLAYER_CAP_OPTIONS.findIndex(
                (value) => value === playerCap,
              );
              const previousPlayerCap =
                playerCapIndex > 0
                  ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex - 1]
                  : null;
              const nextPlayerCap =
                playerCapIndex >= 0 &&
                playerCapIndex < EVEN_PLAYER_CAP_OPTIONS.length - 1
                  ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex + 1]
                  : null;
              const canDecreasePlayerCap =
                previousPlayerCap !== null &&
                previousPlayerCap >= occupiedSlots;
              const canIncreasePlayerCap = nextPlayerCap !== null;
              const availablePuppets = lobbyState.available_puppet_count;
              const canAddPuppet =
                availablePuppets !== null &&
                puppetCount < availablePuppets &&
                occupiedSlots < playerCap;
              const summaryBattlerId =
                lobbyState.play_mode === "limited"
                  ? lobbyState.cube_id
                  : currentPlayer?.battler_id ?? null;
              const canBrowseCards =
                lobbyState.play_mode === "limited" ||
                currentPlayer?.battler_status === "ready";
              const openGuide = (target?: RulesPanelTarget) => {
                setRulesPanelTarget(target);
                setShowRulesPanel(true);
              };

              const filledSlots = [
                ...lobbyState.players.map((player) => ({
                  kind: "player" as const,
                  key: player.player_id,
                  player,
                })),
                ...Array.from({ length: puppetCount }).map((_, i) => ({
                  kind: "puppet" as const,
                  key: `puppet-${i}`,
                  puppetIndex: i,
                })),
              ].slice(0, 8);
              const playerSlots = [
                ...filledSlots,
                ...Array.from({
                  length: Math.max(0, playerCap - filledSlots.length),
                }).map((_, i) => ({
                  kind: "open" as const,
                  key: `open-${i}`,
                })),
              ];

              return (
                <>
                  <div className="rounded-lg p-3 mb-3 text-center bg-black/35 border border-black/40">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
                        {lobbyState.join_code}
                      </span>
                      <button
                        onClick={copyJoinCode}
                        className="btn btn-secondary text-xs py-0.5 px-2"
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div className="border-t border-black/40 mt-2 pt-2 grid grid-cols-[0.9fr_1.85fr_0.7fr_0.8fr] text-left">
                      <div className="min-w-0 px-1.5 first:pl-0">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ivory-muted)]">
                          Mode
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-amber-400">
                          {lobbyState.play_mode === "constructed" ? "Const." : "Limited"}
                        </div>
                      </div>
                      <div className="min-w-0 border-l border-black/40 px-2">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ivory-muted)]">
                          {isConstructed ? "Deck" : "Cube"}
                        </div>
                        {summaryBattlerId ? (
                          <a
                            href={cubeCobraUrl(summaryBattlerId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={summaryBattlerId}
                            className={`mt-0.5 block truncate text-[11px] ${LINK} transition-colors`}
                          >
                            {summaryBattlerId}
                          </a>
                        ) : (
                          <div className="mt-0.5 truncate text-[11px] text-[var(--ivory-muted)]">
                            Missing
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 border-l border-black/40 px-2">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ivory-muted)]">
                          Upgr.
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-amber-400">
                          {lobbyState.use_upgrades ? "On" : "Off"}
                        </div>
                      </div>
                      <div className="min-w-0 border-l border-black/40 pl-2 pr-0">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ivory-muted)]">
                          Browse
                        </div>
                        <button
                          onClick={() => openGuide({ docId: "__cards__" })}
                          disabled={!canBrowseCards}
                          className="mt-0.5 block w-full truncate text-left text-[11px] text-amber-400 transition-colors hover:text-amber-300 disabled:text-[var(--ivory-faint)] disabled:cursor-not-allowed"
                        >
                          Cards
                        </button>
                      </div>
                    </div>
                  </div>

                  {awayHost && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 mb-3 text-xs leading-snug text-amber-200">
                      <svg aria-hidden className="w-4 h-4 shrink-0 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span>
                        <b>{awayHost.name}</b> (host) is away. If they&apos;re not back within a minute, the next
                        player becomes host.
                      </span>
                    </div>
                  )}

                  {lobbyState.play_mode === "constructed" && currentPlayer && (
                    <div className="bg-black/35 rounded-lg border border-black/40 p-3 mb-3">
                      <h2 className="text-white font-medium text-sm">{isConstructed ? "Your Deck" : "Your Cube"}</h2>
                      <div className="mt-3 flex gap-2">
                        {hasLoadedBattler ? (
                          <div
                            title={battlerIdInput}
                            className="w-full h-[42px] border border-black/40 rounded px-3 py-2 text-base bg-black/20 text-[var(--ivory-muted)] overflow-hidden text-ellipsis whitespace-nowrap select-none cursor-default"
                          >
                            {battlerIdInput}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={battlerIdInput}
                            onChange={(event) => setBattlerIdInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !isBattlerLoading) {
                                submitBattler();
                              }
                            }}
                            placeholder={isConstructed ? "Enter deck list" : "CubeCobra cube ID"}
                            disabled={isBattlerLoading}
                            className={`${TEXT_INPUT} disabled:opacity-50 disabled:cursor-not-allowed`}
                          />
                        )}
                        <button
                          onClick={handleBattlerButtonClick}
                          disabled={isBattlerLoading}
                          className="btn btn-primary btn-dark-border px-4 py-2 shrink-0"
                        >
                          {hasLoadedBattler ? "Change" : isBattlerLoading ? "Loading..." : "Submit"}
                        </button>
                      </div>
                    </div>
                  )}

            <div className="bg-black/35 rounded-lg border border-black/40 p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                {isHost ? (
                  <>
                    <div className="flex items-center justify-center gap-1 rounded-md border border-black/40 bg-black/30 px-1.5 py-1 w-[calc(50%-0.25rem)]">
                      <button
                        type="button"
                        onClick={() => {
                          if (previousPlayerCap !== null) {
                            actions.setTargetPlayerCount(previousPlayerCap);
                          }
                        }}
                        disabled={!canDecreasePlayerCap}
                        aria-label="Decrease player count"
                        className="flex h-6 w-6 items-center justify-center rounded border border-black/40 bg-black/40 text-sm text-white transition-colors hover:bg-black/20 disabled:cursor-not-allowed disabled:text-[var(--ivory-faint)] disabled:hover:bg-black/40"
                      >
                        -
                      </button>
                      <span className="min-w-[3.5rem] text-center text-sm font-semibold text-white">
                        {playerCap} players
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (nextPlayerCap !== null) {
                            actions.setTargetPlayerCount(nextPlayerCap);
                          }
                        }}
                        disabled={!canIncreasePlayerCap}
                        aria-label="Increase player count"
                        className="flex h-6 w-6 items-center justify-center rounded border border-black/40 bg-black/40 text-sm text-white transition-colors hover:bg-black/20 disabled:cursor-not-allowed disabled:text-[var(--ivory-faint)] disabled:hover:bg-black/40"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => actions.addPuppet()}
                        disabled={!canAddPuppet}
                        className={`text-sm ${LINK} disabled:text-[var(--ivory-faint)] disabled:cursor-not-allowed transition-colors`}
                      >
                        + Add Puppet
                      </button>
                      <button
                        onClick={() =>
                          openGuide({
                            docId: "faq",
                            tab: "why-are-my-opponents-cards-face-up",
                          })
                        }
                        className="w-5 h-5 rounded-full bg-black/30 border border-black/40 text-[var(--ivory-muted)] hover:bg-black/20 hover:text-white transition-all text-[10px] flex items-center justify-center"
                        title="What are Puppets?"
                      >
                        ?
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{playerCap} players</span>
                    {puppetCount > 0 && (
                      <button
                        onClick={() =>
                          openGuide({
                            docId: "faq",
                            tab: "why-are-my-opponents-cards-face-up",
                          })
                        }
                        className="text-[var(--ivory-muted)] hover:text-[var(--ivory)] text-xs transition-colors"
                      >
                        What are Puppets?
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {playerSlots.map((slot) => {
                  if (slot.kind === "player") {
                    const { player } = slot;
                    return (
                      <div
                        key={slot.key}
                        className="bg-black/30 border border-black/40 px-3 py-2.5 rounded-lg flex items-center gap-2 min-w-0"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            player.is_ready ? "bg-green-500" : "bg-[var(--ivory-faint)]"
                          }${player.is_connected ? "" : " opacity-40"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm truncate ${player.is_connected ? "text-white" : "text-[var(--ivory-muted)]"}`}>
                            {player.name}
                          </div>
                          {!player.is_connected && (
                            <div className="text-[10px] leading-3 uppercase tracking-[0.08em] text-[var(--ivory-muted)]">
                              Away
                            </div>
                          )}
                        </div>
                        {player.player_id === session?.playerId && voiceChat.state.peers.length > 0 && (
                          <MicToggle
                            muted={voiceChat.state.isMuted}
                            audioLevelKey="__self__"
                            onClick={() => voiceChat.toggleSelfMute()}
                          />
                        )}
                        {(() => {
                          const peer = player.player_id !== session?.playerId
                            ? voiceChat.state.peers.find(p => p.name === player.name)
                            : null
                          return peer ? (
                            <MicToggle
                              muted={voiceChat.state.mutedPeers.has(player.name)}
                              connectionState={peer.connectionState}
                              audioLevelKey={player.name}
                              remoteMuted={voiceChat.state.remoteMutedPeers.has(player.name)}
                              onClick={() => voiceChat.togglePeerMute(player.name)}
                            />
                          ) : null
                        })()}
                        {player.is_host && (
                          <span className="text-amber-400 text-xs shrink-0">
                            Host
                          </span>
                        )}
                        {isHost && !player.is_host && (
                          <button
                            onClick={() => actions.kickPlayer(player.player_id)}
                            className="text-[var(--ivory-muted)] hover:text-red-400 transition-colors shrink-0 text-xs"
                            title="Remove player"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  }

                  if (slot.kind === "puppet") {
                    const isSearching = availablePuppets === null;
                    const botAvailable =
                      !isSearching && slot.puppetIndex < availablePuppets;
                    return (
                      <div
                        key={slot.key}
                        className={`bg-black/30 px-3 py-2.5 rounded-lg flex items-center gap-2 border border-dashed ${
                          isSearching
                            ? "border-amber-600/50"
                            : botAvailable
                              ? "border-[var(--ivory-faint)]"
                              : "border-red-700/50"
                        }`}
                      >
                        {isSearching ? (
                          <svg
                            className="animate-spin h-3 w-3 text-amber-500 shrink-0"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        ) : (
                          <PuppetIcon size="sm" className={`shrink-0 ${botAvailable ? "" : "opacity-50"}`} />
                        )}
                        <span
                          className={`text-sm italic ${isSearching ? "text-amber-400" : botAvailable ? "text-[var(--ivory-soft)]" : "text-red-400/70"}`}
                        >
                          Puppet {slot.puppetIndex + 1}
                        </span>
                        {isHost && (
                          <button
                            onClick={() => actions.removePuppet()}
                            className="text-[var(--ivory-muted)] hover:text-red-400 transition-colors shrink-0 ml-auto text-xs"
                            title="Remove puppet"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot.key}
                      className="bg-black/20 border border-dashed border-black/35 px-3 py-2.5 rounded-lg flex items-center gap-2 min-w-0"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0 bg-black/40" />
                      <span className="text-[var(--ivory-muted)] text-sm italic">
                        required
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 mb-3">
              <div className="flex items-center justify-between gap-2 rounded-md border border-black/40 bg-black/40 px-2 py-1">
                <GuidedModeSwitch
                  enabled={isGuidedMode}
                  setEnabled={handleGuidedModeToggle}
                />
                <VoiceChatSwitch
                  enabled={lobbyState.voice_chat_enabled}
                  setEnabled={(v) => send('set_voice_chat', { enabled: v })}
                  isHost={isHost}
                />
              </div>

              <div className={isHost ? "grid grid-cols-2 gap-2" : ""}>
                <button
                  onClick={toggleReady}
                  disabled={readyActionDisabled}
                  className={`btn btn-dark-border w-full py-2 ${
                    isReady ? "btn-secondary" : "btn-success"
                  }`}
                >
                  {isReady ? "Unready" : "Ready"}
                </button>

                {isHost && (
                  <button
                    onClick={requestStart}
                    disabled={!lobbyState.can_start || startAwaitingServer}
                    className="btn btn-primary btn-dark-border w-full py-2"
                  >
                    Start Game
                  </button>
                )}
              </div>
            </div>

                </>
              );
            })()}
        </SurfaceCard>
      </PageFrame>
      {spectateRequests[0] && (
        <SpectateRequestModal request={spectateRequests[0]} onRespond={actions.spectateResponse} />
      )}
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
          onMinimizedChange={setGuideMinimized}
          initialDocId={rulesPanelTarget?.docId}
          initialTab={rulesPanelTarget?.tab}
          gameId={gameId}
          playerName={currentPlayer?.name}
          useUpgrades={lobbyState?.use_upgrades}
        />
      )}
    </>
  );
}

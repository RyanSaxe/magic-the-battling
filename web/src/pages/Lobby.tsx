import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSeat } from "../hooks/useGameSeat";
import { useGame } from "../hooks/useGame";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import { useHotkeys } from "../hooks/useHotkeys";
import { useCubeLook } from "../hooks/useCubeLook";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";
import { AppHeader, GuideButton, HomeButton } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { InfoTip } from "../components/common/InfoTip";
import { Switch } from "../components/common/Switch";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { type LoadingRouteState, START_STEPS, useHandedOnSteps } from "../components/common/loadingSteps";
import { LobbySeatNotice } from "../components/lobby/LobbySeatNotice";
import { LobbySeats } from "../components/lobby/LobbySeats";
import { CubeBanner } from "../components/setup/CubeBanner";
import { GuidedSwitch } from "../components/setup/GuidedSwitch";
import { Spinner } from "../components/icons/Spinner";
import { SpectateRequestModal } from "../components/SpectateRequestModal";
import { type AppError, getAppErrorMessage } from "../utils/appError";
import type { LobbyState } from "../types";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import { DIALOG_BACKDROP, POPOVER_CHROME } from "../components/common/styles";

const EVEN_PLAYER_CAP_OPTIONS = [2, 4, 6, 8] as const;
const PUPPET_HELP: RulesPanelTarget = { docId: "faq", tab: "why-are-my-opponents-cards-face-up" };
const VOICE_HELP = "Voice chat may not work for all players. If it doesn't connect, use Discord instead.";

function cubeCobraUrl(battlerId: string) {
  return `https://cubecobra.com/cube/overview/${encodeURIComponent(battlerId)}`;
}

/** What Start Game is waiting on. The player's own deck comes first, as their next step. */
function startBlocker(lobby: LobbyState, openSeats: number, needsDeck: boolean): string {
  if (needsDeck) return "Submit your deck first";
  const { players, puppet_count: puppets, available_puppet_count: available } = lobby;
  const notReady = players.filter((player) => !player.is_ready).length;
  const waitingOn = [];
  if (openSeats > 0) waitingOn.push(`${openSeats} open ${openSeats === 1 ? "seat" : "seats"}`);
  if (notReady > 0) waitingOn.push(`${notReady} not ready`);
  if (waitingOn.length > 0) return waitingOn.join(" · ");
  if (lobby.play_mode === "limited" && lobby.cube_loading_status === "error") return "Couldn't load the cube";
  if (puppets > 0 && available === null) return "Finding puppets";
  if (puppets > 0 && available !== null && available < puppets) return "Not enough puppets";
  return "";
}

function AwayHostNotice({ name, className }: { name: string; className: string }) {
  return (
    <p className={`${className} ${name.length > 22 ? "is-long" : ""}`}>
      <svg aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold)]" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span>
        <b>{name}</b> (host) is away. If they&apos;re not back within a minute, the next player becomes host.
      </span>
    </p>
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
  // A refused deck isn't the player's, though the field keeps its ID to correct.
  const deckId = battlerStatus === "error" ? null : currentPlayer?.battler_id;
  const summaryBattlerId = (isConstructed ? deckId : lobbyState?.cube_id) ?? null;
  const cubeLook = useCubeLook(summaryBattlerId);
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
      setRulesPanelTarget(undefined);
      setShowRulesPanel(true);
    },
  };
  if (lobbyState && currentPlayer && !showRulesPanel) {
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
  useHotkeys(lobbyHotkeyMap, !!session && !showRulesPanel);

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
    try {
      await navigator.clipboard.writeText(lobbyState.join_code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = lobbyState.join_code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
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
      <div className={`${POPOVER_CHROME} px-5 py-3 flex items-center gap-3`}>
        <Spinner className="h-4 w-4 shrink-0 text-[var(--color-gold)]" />
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

  const isHost = currentPlayer?.is_host ?? false;
  const isReady = currentPlayer?.is_ready ?? false;
  const playerCap = lobbyState.target_player_count;
  const occupiedSlots = lobbyState.players.length + lobbyState.puppet_count;
  const openSeats = Math.max(0, playerCap - occupiedSlots);
  const playerCapIndex = EVEN_PLAYER_CAP_OPTIONS.findIndex((value) => value === playerCap);
  const previousPlayerCap = playerCapIndex > 0 ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex - 1] : null;
  const nextPlayerCap =
    playerCapIndex >= 0 && playerCapIndex < EVEN_PLAYER_CAP_OPTIONS.length - 1
      ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex + 1]
      : null;
  const canDecreasePlayerCap = isHost && previousPlayerCap !== null && previousPlayerCap >= occupiedSlots;
  const canIncreasePlayerCap = isHost && nextPlayerCap !== null;
  const canBrowseCards = !isConstructed || hasLoadedBattler;
  const needsDeck = isConstructed && !!currentPlayer && !hasLoadedBattler;
  // Inviting is the host's next step until the seats are full, unless their own deck comes first.
  const copyIsNext = isHost && !needsDeck && openSeats > 0;
  const startWaits = !lobbyState.can_start;
  const startReason = startWaits ? startBlocker(lobbyState, openSeats, needsDeck) : "";

  const openGuide = (target: RulesPanelTarget) => {
    setRulesPanelTarget(target);
    setShowRulesPanel(true);
  };

  return (
    <>
      {reconnecting}
      <PageFrame header={header} scroll={false} contentClassName="setup-page" hints="game">
        <CubeBanner
          look={cubeLook}
          playMode={lobbyState.play_mode}
          notice={awayHost && <AwayHostNotice name={awayHost.name} className="cube-banner-notice" />}
          href={summaryBattlerId ? cubeCobraUrl(summaryBattlerId) : undefined}
          action={
            <button
              onClick={() => openGuide({ docId: "__cards__" })}
              disabled={!canBrowseCards}
              className="btn btn-secondary btn-pill"
            >
              Cards
            </button>
          }
        >
          <div>
            <span className="setup-caption join-code-caption">Join code</span>
            <span className="join-code">{lobbyState.join_code}</span>
          </div>
          <button onClick={copyJoinCode} className={`btn btn-pill ${copyIsNext ? "btn-primary" : "btn-secondary"}`}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <div className="seat-stepper">
            <button
              type="button"
              onClick={() => {
                if (previousPlayerCap !== null) actions.setTargetPlayerCount(previousPlayerCap);
              }}
              disabled={!canDecreasePlayerCap}
              aria-label="Decrease player count"
              className={`btn btn-secondary btn-pill btn-pill-square ${isHost ? "" : "invisible"}`}
            >
              −
            </button>
            <span className="seat-count">{playerCap} seats</span>
            <button
              type="button"
              onClick={() => {
                if (nextPlayerCap !== null) actions.setTargetPlayerCount(nextPlayerCap);
              }}
              disabled={!canIncreasePlayerCap}
              aria-label="Increase player count"
              className={`btn btn-secondary btn-pill btn-pill-square ${isHost ? "" : "invisible"}`}
            >
              +
            </button>
          </div>
        </CubeBanner>

        <div className="setup-felt lobby-felt">
          <p className="lobby-summary">
            <b>
              {occupiedSlots} of {playerCap} seated
            </b>
            <span>
              {isConstructed ? "Constructed" : "Limited"} · Upgrades {lobbyState.use_upgrades ? "On" : "Off"}
            </span>
          </p>

          {isConstructed && currentPlayer && (
            <div className={`setup-row lobby-deck ${hasLoadedBattler ? "is-loaded" : ""}`}>
              {hasLoadedBattler ? (
                <div className="setup-field">
                  <span className="setup-caption">Your deck</span>
                  <span className="setup-value text-[var(--ivory-muted)]">{battlerIdInput}</span>
                </div>
              ) : (
                <label className="setup-field">
                  <span className="setup-caption">Your deck</span>
                  <input
                    type="text"
                    value={battlerIdInput}
                    onChange={(event) => setBattlerIdInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !isBattlerLoading) {
                        submitBattler();
                      }
                    }}
                    placeholder="Enter deck list"
                    disabled={isBattlerLoading}
                    className="setup-input"
                  />
                </label>
              )}
              <button
                onClick={handleBattlerButtonClick}
                disabled={isBattlerLoading}
                className={`btn setup-submit ${hasLoadedBattler ? "btn-secondary" : "btn-primary"}`}
              >
                {hasLoadedBattler ? "Change" : isBattlerLoading ? "Loading..." : "Submit"}
              </button>
            </div>
          )}

          <LobbySeats
            lobby={lobbyState}
            isHost={isHost}
            openSeats={openSeats}
            compact={playerCap > 6}
            selfId={session?.playerId}
            voiceChat={voiceChat}
            actions={actions}
            onPuppetHelp={() => openGuide(PUPPET_HELP)}
          />

          {/* Shown instead of the banner's, where a short phone needs the banner for the deck */}
          {isConstructed && awayHost && <AwayHostNotice name={awayHost.name} className="lobby-away-notice" />}

          <div className="lobby-settings">
            <GuidedSwitch enabled={isGuidedMode} setEnabled={handleGuidedModeToggle} />
            <div className="setup-setting">
              <Switch
                checked={lobbyState.voice_chat_enabled}
                onChange={(enabled) => send("set_voice_chat", { enabled })}
                disabled={!isHost}
              >
                Voice <span className="switch-beta">Beta</span>
              </Switch>
              <InfoTip label="Voice chat info" text={VOICE_HELP} />
            </div>
          </div>

          <div className={`lobby-actions ${isHost ? "" : "is-guest"}`}>
            <button
              onClick={toggleReady}
              disabled={readyActionDisabled}
              className={`btn setup-next ${isReady ? "btn-secondary" : "btn-success"}`}
            >
              {isReady ? "Unready" : "Ready"}
            </button>
            {isHost && (
              <button
                onClick={requestStart}
                disabled={!lobbyState.can_start || startAwaitingServer}
                className={`btn setup-next ${startWaits ? "setup-waiting" : "btn-primary"}`}
              >
                Start Game
                {startReason && <small>{startReason}</small>}
              </button>
            )}
          </div>
        </div>
      </PageFrame>
      {spectateRequests[0] && (
        <SpectateRequestModal request={spectateRequests[0]} onRespond={actions.spectateResponse} />
      )}
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
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

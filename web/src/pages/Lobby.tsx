import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSeat } from "../hooks/useGameSeat";
import { useGame } from "../hooks/useGame";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import { useHotkeys } from "../hooks/useHotkeys";
import { usePanelHoldsEnter } from "../utils/enterKey";
import { useCubeLook } from "../hooks/useCubeLook";
import { useBoardDesktop } from "../hooks/useBoardDesktop";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";
import { AppHeader, GuideButton, HomeButton } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { ZoneLabel } from "../components/common/ZoneLabel";
import { InfoTip } from "../components/common/InfoTip";
import { Switch } from "../components/common/Switch";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { type LoadingRouteState, START_STEPS, useHandedOnSteps } from "../components/common/loadingSteps";
import { LobbySeatNotice } from "../components/lobby/LobbySeatNotice";
import { LobbySeats } from "../components/lobby/LobbySeats";
import { RemovePlayerDialog } from "../components/lobby/RemovePlayerDialog";
import { BoardArt, BoardCubeTitle, BoardDrawerHead, BoardLobbySeats } from "../components/setup/BoardParts";
import { CubeBanner } from "../components/setup/CubeBanner";
import { GuidedSwitch } from "../components/setup/GuidedSwitch";
import { CrossIcon } from "../components/icons/CrossIcon";
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
import { copyText } from "../utils/clipboard";

const EVEN_PLAYER_CAP_OPTIONS = [2, 4, 6, 8] as const;
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

function HostChangedNotice({ name, text, onClose, className }: {
  name: string;
  text: string;
  onClose: () => void;
  className: string;
}) {
  return (
    <p className={`${className} ${name.length > 22 ? "is-long" : ""}`}>
      <svg aria-hidden className="h-4 w-4 shrink-0 text-[var(--color-gold)]" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6l4 3 4-6 4 6 4-3-1.5 9h-13z" />
      </svg>
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="icon-target">
        <CrossIcon />
      </button>
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

  const voiceName = lobbyState?.voice_chat_enabled ? selfName : null
  const voiceChat = useVoiceChat(send, peerNames, voiceName, voiceSignalRef, handleMicDenied, handleRetriesExhausted);

  const [copied, setCopied] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [guideMinimized, setGuideMinimized] = useState(false);
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    getDefaultNewPlayerPreference(),
  );
  const [battlerIdInput, setBattlerIdInput] = useState("");
  const [editingDeck, setEditingDeck] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [closedHostChange, setClosedHostChange] = useState<string | null>(null);
  const isBoard = useBoardDesktop();
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
  const showsDeck = hasLoadedBattler && !editingDeck;
  const isEditingDeck = hasLoadedBattler && editingDeck;
  const deckUnchanged = isEditingDeck && battlerIdInput.trim() === deckId;
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
    setEditingDeck(false);
    actions.submitBattler(battlerId);
  };

  const editDeck = () => {
    setBattlerIdInput(deckId ?? "");
    setEditingDeck(true);
  };

  const handleBattlerButtonClick = () => {
    if (showsDeck) {
      editDeck();
      return;
    }
    submitBattler();
  };

  const openGuide = (target?: RulesPanelTarget) => {
    // Without a page, a Guide already open keeps its place.
    if (target || !showRulesPanel) setRulesPanelTarget(target);
    setGuideMinimized(false);
    setShowRulesPanel(true);
  };
  const guideTakesKeys = showRulesPanel && !guideMinimized;
  const lobbyHotkeyMap: Record<string, () => void> = {
    "?": () => {
      if (guideTakesKeys) {
        setShowRulesPanel(false);
        return;
      }
      openGuide();
    },
  };
  if (lobbyState && currentPlayer && !guideTakesKeys) {
    const isHost = currentPlayer.is_host;
    lobbyHotkeyMap["r"] = toggleReady;
    if (isConstructed) {
      lobbyHotkeyMap["b"] = () => {
        if (isBattlerLoading || isStarting || deckUnchanged) return;
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
  const removing = currentPlayer?.is_host
    ? lobbyState?.players.find((p) => p.player_id === removingId && !p.is_host)
    : undefined;
  useHotkeys(lobbyHotkeyMap, !!session && !removing);
  usePanelHoldsEnter(guideTakesKeys);

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

  const host = lobbyState?.players.find((p) => p.is_host) ?? null;
  const hostName = host?.name ?? null;
  const awayHost = host && !host.is_connected ? host : null;
  const previousHost = lobbyState?.players.find((p) => p.player_id === lobbyState.previous_host_id) ?? null;
  const lostHost = !!previousHost && previousHost.player_id === session?.playerId;
  const gainedHost = !!previousHost && currentPlayer?.is_host === true;

  const hostPass = previousHost && host ? `${previousHost.player_id}:${host.player_id}` : null;
  // A later pass can be between the same two players, and they're told again.
  if (hostPass && closedHostChange && closedHostChange !== hostPass) setClosedHostChange(null);
  let hostChange: { name: string; text: string } | null = null;
  if (hostPass !== closedHostChange) {
    if (lostHost && hostName) {
      hostChange = { name: hostName, text: `You were away, so ${hostName} is the host now.` };
    } else if (gainedHost && !previousHost.is_connected) {
      hostChange = { name: previousHost.name, text: `You're the host now. ${previousHost.name} is away.` };
    }
  }

  const previousHostRef = useRef<string | null>(null);
  useEffect(() => {
    const previousName = previousHostRef.current;
    previousHostRef.current = hostName;
    if (!previousName || !hostName || previousName === hostName) return;
    // The notice tells those two, unless the previous host's seat is gone.
    if (lostHost || gainedHost) return;
    addToast(
      hostName === selfName
        ? `You're the host now. ${previousName} left the lobby.`
        : `${hostName} is now the host.`,
      "info",
    );
  }, [hostName, selfName, lostHost, gainedHost, addToast]);

  const copyJoinLink = async () => {
    if (!(await copyText(`${window.location.origin}/game/${gameId}/lobby`))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const header = (
    <AppHeader
      helpers={
        <GuideButton
          onClick={() => openGuide()}
          className={showRulesPanel && guideMinimized ? "btn-dot-phone" : ""}
        />
      }
      home={<HomeButton />}
    />
  );

  const rulesPanel = showRulesPanel && (
    <RulesPanel
      onClose={() => setShowRulesPanel(false)}
      minimized={guideMinimized}
      onMinimizedChange={setGuideMinimized}
      target={rulesPanelTarget}
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
  const copyIsNext = isHost && !needsDeck && !isEditingDeck && openSeats > 0;
  const startWaits = !lobbyState.can_start;
  const startReason = startWaits ? startBlocker(lobbyState, openSeats, needsDeck) : "";
  const hostNotice = (className: string) => {
    if (hostChange) {
      return <HostChangedNotice {...hostChange} className={className} onClose={() => setClosedHostChange(hostPass)} />;
    }
    return awayHost && <AwayHostNotice name={awayHost.name} className={className} />;
  };
  const seatActions = { ...actions, kickPlayer: setRemovingId };

  const cardsButton = (
    <button
      onClick={() => openGuide({ docId: "__cards__" })}
      disabled={!canBrowseCards}
      className="btn btn-secondary btn-pill"
    >
      Cards
    </button>
  );
  const joinCodeBlock = (
    <>
      <div>
        <span className="setup-caption join-code-caption">Join code</span>
        <span className="join-code">{lobbyState.join_code}</span>
      </div>
      <button onClick={copyJoinLink} className={`btn btn-pill ${copyIsNext ? "btn-primary" : "btn-secondary"}`}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </>
  );
  const seatStepper = (
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
  );
  const lobbySettings = (
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
  );
  const lobbyActions = (
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
          data-ends-phase
          disabled={!lobbyState.can_start || startAwaitingServer}
          className={`btn setup-next ${startWaits ? "setup-waiting" : "btn-primary"}`}
        >
          Start Game
          {startReason && <small>{startReason}</small>}
        </button>
      )}
    </div>
  );
  const deckEntryFields = (
    <>
      <label className="setup-field">
        <span className="setup-caption">Your deck</span>
        <input
          type="text"
          value={battlerIdInput}
          onChange={(event) => setBattlerIdInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isBattlerLoading && !deckUnchanged) {
              submitBattler();
            }
          }}
          autoFocus={isEditingDeck}
          onFocus={(event) => {
            if (isEditingDeck) event.target.select();
          }}
          placeholder="Deck ID"
          disabled={isBattlerLoading}
          className="setup-input"
        />
      </label>
      {isEditingDeck && (
        <button onClick={() => setEditingDeck(false)} className="btn btn-secondary setup-submit">
          Cancel
        </button>
      )}
      <button
        onClick={handleBattlerButtonClick}
        disabled={isBattlerLoading || deckUnchanged}
        className={`btn setup-submit ${deckUnchanged ? "setup-waiting" : "btn-primary"}`}
      >
        {isBattlerLoading ? "Loading..." : "Submit"}
      </button>
    </>
  );
  const boardNeedsDeckEntry = isConstructed && !!currentPlayer && !showsDeck;
  const boardNotice = hostNotice("board-notice");

  return (
    <>
      {reconnecting}
      {isBoard ? (
        <PageFrame
          header={header}
          scroll={false}
          contentClassName="setup-page board-page"
          hints="game"
          aside={
            <aside aria-label="At the table" className="board-aside frame-chrome is-lobby">
              <BoardDrawerHead />
              <div className="board-seats">
                <BoardLobbySeats
                  lobby={lobbyState}
                  isHost={isHost}
                  openSeats={openSeats}
                  selfId={session?.playerId}
                  voiceChat={voiceChat}
                  actions={seatActions}
                  onPuppetHelp={() => openGuide({ docId: "faq", tab: "why-are-my-opponents-cards-face-up" })}
                />
              </div>
            </aside>
          }
        >
          <div className="board-layout is-lobby">
            <section className="zone-hand board-cube">
              <BoardArt
                look={boardNeedsDeckEntry ? null : cubeLook}
                empty={
                  boardNeedsDeckEntry ? (
                    <div className="board-slot-entry">
                      <div className="setup-row board-deck">{deckEntryFields}</div>
                    </div>
                  ) : undefined
                }
              />
              <div className="board-words">
                {boardNotice || (
                  <BoardCubeTitle
                    look={isConstructed && !hasLoadedBattler ? null : cubeLook}
                    playMode={lobbyState.play_mode}
                    href={summaryBattlerId ? cubeCobraUrl(summaryBattlerId) : undefined}
                  />
                )}
                <p className="board-summary">
                  <b className="font-semibold text-[var(--ivory)]">
                    {occupiedSlots} of {playerCap} seated
                  </b>
                  <br />
                  {isConstructed ? "Constructed" : "Limited"} · Upgrades {lobbyState.use_upgrades ? "On" : "Off"}
                  {lobbyState.auto_approve_spectators && <span className="lobby-spectating">Open Spectating</span>}
                </p>
                <div className="board-code">{joinCodeBlock}</div>
                <div className="board-cube-actions">
                  {cardsButton}
                  {isConstructed && currentPlayer && showsDeck && (
                    <button
                      type="button"
                      onClick={editDeck}
                      disabled={isBattlerLoading}
                      className="btn btn-secondary btn-pill"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>
            </section>
            <section className="zone-battlefield board-setup">
              <ZoneLabel hideGrip>Lobby</ZoneLabel>
              <div className="board-two">
                <div className="board-stack board-lobby-options">
                  {seatStepper}
                  {lobbySettings}
                </div>
                <div className="board-lobby-start">{lobbyActions}</div>
              </div>
            </section>
          </div>
        </PageFrame>
      ) : (
        <PageFrame header={header} scroll={false} contentClassName="setup-page" hints="game">
          <CubeBanner
            look={cubeLook}
            playMode={lobbyState.play_mode}
            notice={hostNotice("cube-banner-notice")}
            href={summaryBattlerId ? cubeCobraUrl(summaryBattlerId) : undefined}
            action={cardsButton}
          >
            {joinCodeBlock}
            {seatStepper}
          </CubeBanner>

          <div className="setup-felt lobby-felt">
            <p className="lobby-summary">
              <b>
                {occupiedSlots} of {playerCap} seated
              </b>
              <span>
                {isConstructed ? "Constructed" : "Limited"} · Upgrades {lobbyState.use_upgrades ? "On" : "Off"}
                {lobbyState.auto_approve_spectators && <span className="lobby-spectating">Open Spectating</span>}
              </span>
            </p>

            {isConstructed && currentPlayer && (
              <div className={`setup-row lobby-deck ${showsDeck ? "is-loaded" : ""}`}>
                {showsDeck ? (
                  <>
                    <div className="setup-field">
                      <span className="setup-caption">Your deck</span>
                      <span className="setup-value text-[var(--ivory-muted)]">{deckId}</span>
                    </div>
                    <button
                      onClick={handleBattlerButtonClick}
                      disabled={isBattlerLoading}
                      className="btn setup-submit btn-secondary"
                    >
                      Change
                    </button>
                  </>
                ) : (
                  deckEntryFields
                )}
              </div>
            )}

            <LobbySeats
              lobby={lobbyState}
              isHost={isHost}
              openSeats={openSeats}
              compact={playerCap > 6}
              selfId={session?.playerId}
              voiceChat={voiceChat}
              actions={seatActions}
              onPuppetHelp={() => openGuide({ docId: "faq", tab: "why-are-my-opponents-cards-face-up" })}
            />

            {/* Shown instead of the banner's, where a short phone needs the banner for the deck */}
            {isConstructed && hostNotice("lobby-away-notice")}

            {lobbySettings}
            {lobbyActions}
          </div>
        </PageFrame>
      )}
      {removing && (
        <RemovePlayerDialog
          name={removing.name}
          onKeep={() => setRemovingId(null)}
          onRemove={() => {
            actions.kickPlayer(removing.player_id);
            setRemovingId(null);
          }}
        />
      )}
      {spectateRequests[0] && (
        <SpectateRequestModal request={spectateRequests[0]} onRespond={actions.spectateResponse} />
      )}
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
          minimized={guideMinimized}
          onMinimizedChange={setGuideMinimized}
          target={rulesPanelTarget}
          gameId={gameId}
          playerName={currentPlayer?.name}
          useUpgrades={lobbyState?.use_upgrades}
        />
      )}
    </>
  );
}

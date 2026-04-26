import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import {
  rejoinGame,
  getGameStatus,
  createSpectateRequest,
  getSpectateRequestStatus,
} from "../api/client";
import type { BattleView, Card as CardType, GameStatusResponse, PlayerView, RevealAnimation, ZoneName } from "../types";
import { DraftPhase } from "./phases/Draft";
import { BuildPhase } from "./phases/Build";
import { BattlePhase, type BattleSelectedCard, type BattleZoneModalState } from "./phases/Battle";
import { RewardPhase } from "./phases/Reward";
import { Sidebar } from "../components/sidebar";
import { BattleSidebarContent } from "../components/sidebar/BattleSidebarContent";
import { MicToggle } from "../components/sidebar/MicToggle";
import { GameSummary } from "../components/GameSummary";
import { ShareModal } from "../components/ShareModal";
import { ActionMenu } from "../components/ActionMenu";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { GuidedWalkthrough } from "../guided/GuidedWalkthrough";
import { GuideProvider } from "../guided/GuideContext";
import { useGuideContext } from "../guided/guideState";
import { buildGuideDefinition } from "../guided/content";
import { getOrdinal } from "../utils/format";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { ContextStripProvider, useContextStrip, useToast } from "../contexts";
import { FaceDownProvider } from "../contexts/FaceDownContext";
import { CardPreviewContext, CardPreviewModal } from "../components/card";
import { GameDndProvider, useDndActions, DraggableCard, type ZoneOwner } from "../dnd";
import { useViewportCardSizes } from "../hooks/useViewportCardSizes";
import { useGameShellMode } from "../hooks/useGameShellMode";
import { useElementHeight } from "../hooks/useElementHeight";
import { BattleResolutionOverlay } from "../components/common/BattleResolutionOverlay";
import { BattleRevealOverlay } from "../components/common/BattleRevealOverlay";
import { BuildUpgradeOverlay } from "../components/common/BuildUpgradeOverlay";
import { type AppError, getAppErrorMessage, unknownToAppError } from "../utils/appError";
import { RevealBeforeSubmitModal } from "../components/common/RevealBeforeSubmitModal";
import { ServerStatusWindow } from "../components/common/ServerStatusWindow";
import { UpgradesModal } from "../components/common/UpgradesModal";
import { DndPanel } from "../components/common/DndPanel";
import { SubmitPopover } from "../components/common/SubmitPopover";
import { ZoneDivider } from "../components/common/ZoneDivider";
import { useHotkeys } from "../hooks/useHotkeys";
import { shouldClearSessionOnInvalidEvent } from "../utils/sessionRecovery";
import {
  comparePlayersForSidebar,
  getSidebarPlayerOrder,
} from "../utils/playerPlacement";
import {
  buildAppliedUpgradeMap,
  buildHiddenAppliedUpgradeMap,
  getRevealedAppliedUpgrades,
  getUnrevealedAppliedUpgrades,
} from "../utils/upgrades";
import type { Phase } from "../constants/phases";
import type {
  GuideRequest,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "../guided/types";
import {
  getRememberedPlayerForGame,
  pickAutoReconnectPlayer,
  rememberPlayerForGame,
} from "../utils/deviceIdentity";
import {
  isSubmitPopoverGuideStepActive,
  matchesGuideCompletionTrigger,
  shouldDisableGameplayHotkeys,
  shouldBlockGuidesForBattleResolution,
  type VisibleGuideStep,
} from "./gameGuideState";
import { canUseBattleFaceDownAction, canUseBattleFlipAction } from "../utils/battleInteraction";
import { getVoicePeerNames } from "../utils/voiceChat";

interface SpectatorConfig {
  spectatePlayer: string;
  requestId: string;
}

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

type ActiveDndPanel = "sideboard" | "opponentSideboard" | "graveyard" | "exile" | null;
type BattleZoneModal = BattleZoneModalState | null;
type BattleSidebarLayout = {
  topSectionHeight: number;
  middleLaneHeight: number;
} | null;
type PendingBuildUpgradeAnimation = {
  upgradeId: string;
  targetId: string;
};
type OverlayKey =
  | "rules"
  | "upgrades"
  | "actionMenu"
  | "share"
  | "buildSubmit"
  | "battleSubmit"
  | "battlePanel"
  | "battleZoneModal";

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return phase === "draft" || phase === "build" || phase === "battle" || phase === "reward";
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
      b.most_recently_revealed_cards.length - a.most_recently_revealed_cards.length;
    if (revealedDiff !== 0) return revealedDiff;
    const pairingDiff = (b.pairing_probability ?? -1) - (a.pairing_probability ?? -1);
    if (pairingDiff !== 0) return pairingDiff;
    return comparePlayersForSidebar(a, b);
  })[0];

  return { name: best.name, revealedCount: best.most_recently_revealed_cards.length };
}

function PlayerSelectionModal({
  gameId,
  onSessionCreated,
}: {
  gameId: string;
  onSessionCreated: (
    sessionId: string,
    playerId: string,
    spectatorConfig?: SpectatorConfig
  ) => void;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [spectatorName, setSpectatorName] = useState("");
  const [requestStatus, setRequestStatus] = useState<
    "idle" | "waiting" | "denied"
  >("idle");
  const [error, setError] = useState("");
  const [rejoinName, setRejoinName] = useState("");
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const autoReconnectAttemptedRef = useRef(false);

  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    let interval: number | null = null;

    const fetchStatus = () => {
      getGameStatus(gameId)
        .then((data) => {
          consecutiveErrorsRef.current = 0;
          setStatus(data);
        })
        .catch(() => {
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= 3 && interval != null) {
            clearInterval(interval);
            interval = null;
          }
        });
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 3000);

    return () => {
      if (interval != null) clearInterval(interval);
    };
  }, [gameId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  const handleReconnect = useCallback(
    async (playerName: string, options?: { silent?: boolean }) => {
      setRejoinName(playerName);
      setRejoinLoading(true);
      if (!options?.silent) {
        setError("");
      }

      try {
        const response = await rejoinGame(gameId, playerName);
        rememberPlayerForGame(gameId, playerName.trim());
        onSessionCreated(response.session_id, response.player_id);
      } catch (err) {
        if (!options?.silent) {
          setError(unknownToAppError(err, "rejoin-game", "Failed to reconnect").message);
        }
      } finally {
        setRejoinLoading(false);
      }
    },
    [gameId, onSessionCreated],
  );

  useEffect(() => {
    if (rejoinLoading || requestStatus !== "idle" || selectedPlayer !== null || !status) {
      return;
    }

    const rememberedPlayer = getRememberedPlayerForGame(gameId);
    const autoPlayer = pickAutoReconnectPlayer(rememberedPlayer, status.players);
    if (!autoPlayer || autoReconnectAttemptedRef.current) {
      return;
    }

    autoReconnectAttemptedRef.current = true;
    void handleReconnect(autoPlayer, { silent: true });
  }, [gameId, handleReconnect, rejoinLoading, requestStatus, selectedPlayer, status]);

  const handleWatchRequest = async () => {
    if (!selectedPlayer || !spectatorName.trim()) {
      setError("Please enter your name");
      return;
    }

    setError("");
    try {
      const { request_id } = await createSpectateRequest(
        gameId,
        selectedPlayer,
        spectatorName
      );
      setRequestStatus("waiting");
      pollForApproval(request_id, selectedPlayer);
    } catch (err) {
      setError(unknownToAppError(err, "spectate-request", "Failed to send watch request").message);
    }
  };

  const pollForApproval = (requestId: string, playerName: string) => {
    const poll = async () => {
      try {
        const result = await getSpectateRequestStatus(gameId, requestId);
        if (result.status === "approved" && result.session_id && result.player_id) {
          onSessionCreated(result.session_id, result.player_id, {
            spectatePlayer: playerName,
            requestId,
          });
        } else if (result.status === "denied") {
          setRequestStatus("denied");
        } else {
          pollingRef.current = window.setTimeout(poll, 1000);
        }
      } catch (err) {
        setError(unknownToAppError(err, "spectate-status", "Failed to check request status").message);
        setRequestStatus("idle");
      }
    };
    poll();
  };

  const handleQuickWatch = async (playerName: string) => {
    setError("");
    setSelectedPlayer(playerName);
    try {
      const { request_id } = await createSpectateRequest(
        gameId,
        playerName,
        "Spectator"
      );
      pollForApproval(request_id, playerName);
    } catch (err) {
      setError(unknownToAppError(err, "spectate-request", "Failed to start spectating").message);
    }
  };

  if (!status) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="text-white">Loading game info...</div>
      </div>
    );
  }

  const humanPlayers = status.players.filter((p) => !p.is_puppet);
  const watchablePlayers = humanPlayers.filter(
    (p) =>
      p.phase !== "eliminated" &&
      p.phase !== "awaiting_elimination" &&
      p.phase !== "winner" &&
      p.phase !== "game_over"
  );

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white text-center mb-6">
          Join Game
        </h1>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        {requestStatus === "waiting" && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">
              Waiting for {selectedPlayer} to respond...
            </p>
            <button
              onClick={() => {
                if (pollingRef.current) clearTimeout(pollingRef.current);
                setRequestStatus("idle");
                setSelectedPlayer(null);
              }}
              className="mt-4 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {requestStatus === "denied" && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-4">
              {selectedPlayer} denied your request to watch.
            </p>
            <button
              onClick={() => {
                setRequestStatus("idle");
                setSelectedPlayer(null);
              }}
              className="btn btn-secondary"
            >
              Try Again
            </button>
          </div>
        )}

        {requestStatus === "idle" && !selectedPlayer && (
          <>
            <p className="text-gray-400 text-center mb-4">
              Select a player to reconnect or watch
            </p>
            <div className="space-y-3 mb-6">
              {humanPlayers.map((player) => (
                <div
                  key={player.name}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        player.is_connected ? "bg-green-500" : "bg-gray-500"
                      }`}
                    />
                    <span className="text-white">{player.name}</span>
                    <span className="text-gray-500 text-sm">
                      ({player.phase})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {!player.is_connected ? (
                      <button
                        onClick={() => handleReconnect(player.name)}
                        disabled={rejoinLoading}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        {rejoinLoading && rejoinName === player.name
                          ? "..."
                          : "Connect"}
                      </button>
                    ) : watchablePlayers.some((p) => p.name === player.name) ? (
                      <button
                        onClick={() =>
                          status.auto_approve_spectators
                            ? handleQuickWatch(player.name)
                            : setSelectedPlayer(player.name)
                        }
                        className="btn btn-secondary text-sm py-1 px-3"
                      >
                        Watch
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </>
        )}

        {requestStatus === "idle" && selectedPlayer && (
          <div className="space-y-4">
            <p className="text-gray-300 text-center">
              Request to watch <strong>{selectedPlayer}</strong>'s game
            </p>
            <div>
              <label className="block text-gray-300 mb-1">Your Name</label>
              <input
                type="text"
                value={spectatorName}
                onChange={(e) => setSpectatorName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Enter your name"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="btn btn-secondary flex-1 py-2"
              >
                Back
              </button>
              <button
                onClick={handleWatchRequest}
                disabled={!spectatorName.trim()}
                className="btn btn-primary flex-1 py-2"
              >
                Request to Watch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SpectateRequestModal({
  spectatorName,
  requestId,
  onRespond,
}: {
  spectatorName: string;
  requestId: string;
  onRespond: (requestId: string, allowed: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="modal-chrome border gold-border rounded-lg p-6 w-full max-w-sm mx-4">
        <h2 className="text-xl text-white mb-4">Spectate Request</h2>
        <p className="text-gray-300 mb-6">
          <strong>{spectatorName}</strong> wants to watch your game.
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-primary flex-1"
            onClick={() => onRespond(requestId, true)}
          >
            Allow
          </button>
          <button
            className="btn btn-secondary flex-1"
            onClick={() => onRespond(requestId, false)}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function GameGuideLayer({
  rootRef,
  context,
  sidebarOpen,
  setSidebarOpen,
  guideCompletionTrigger,
  onVisibleGuideStepChange,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  context: GuidedWalkthroughContext;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  guideCompletionTrigger: {
    guideId: GuidedGuideId;
    stepId: string;
    nonce: number;
  } | null;
  onVisibleGuideStepChange: (step: VisibleGuideStep | null) => void;
}) {
  const GUIDE_HANDOFF_LINGER_MS = 450;
  const { state, setRevealedPlayerName } = useContextStrip();
  const { guideRequest, finishGuide, skipTutorial, updateGuideStep } = useGuideContext();
  const [activeStepState, setActiveStepState] = useState<{
    nonce: number | null;
    stepIndex: number;
  }>({
    nonce: guideRequest?.nonce ?? null,
    stepIndex: guideRequest?.stepIndex ?? 0,
  });
  const [renderRequest, setRenderRequest] = useState<GuideRequest | null>(guideRequest);
  const [renderGuide, setRenderGuide] = useState(
    () => (guideRequest ? buildGuideDefinition(guideRequest.guideId, context) : null),
  );
  const sidebarRestoreRef = useRef<{
    sidebarOpen: boolean;
    revealedPlayerName: string | null;
    revealedPlayerTab: "seen" | "overview";
  } | null>(null);
  const activeRequest = guideRequest ?? renderRequest;
  const requestActive = !!guideRequest && guideRequest.nonce === activeRequest?.nonce;
  const stepIndex =
    activeRequest && activeStepState.nonce === activeRequest.nonce
      ? activeStepState.stepIndex
      : (activeRequest?.stepIndex ?? 0);

  useEffect(() => {
    if (guideRequest) {
      queueMicrotask(() => {
        setRenderRequest(guideRequest);
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRenderRequest(null);
    }, GUIDE_HANDOFF_LINGER_MS);

    return () => window.clearTimeout(timeoutId);
  }, [guideRequest]);

  const liveGuide = useMemo(
    () => (guideRequest ? buildGuideDefinition(guideRequest.guideId, context) : null),
    [context, guideRequest],
  );
  const guide = guideRequest ? liveGuide : renderGuide;
  const activeStep = guide?.steps[stepIndex] ?? null;

  useEffect(() => {
    if (guideRequest && liveGuide) {
      queueMicrotask(() => {
        setRenderGuide(liveGuide);
      });
      return;
    }

    if (!activeRequest) {
      queueMicrotask(() => {
        setRenderGuide(null);
      });
    }
  }, [activeRequest, guideRequest, liveGuide]);

  const restoreSidebarState = useCallback(() => {
    const snapshot = sidebarRestoreRef.current;
    if (!snapshot) {
      return;
    }

    sidebarRestoreRef.current = null;
    if (context.isMobile) {
      if (sidebarOpen) {
        setSidebarOpen(false);
      }
    } else if (sidebarOpen !== snapshot.sidebarOpen) {
      setSidebarOpen(snapshot.sidebarOpen);
    }
    if (
      state.revealedPlayerName !== snapshot.revealedPlayerName
      || state.revealedPlayerTab !== snapshot.revealedPlayerTab
    ) {
      setRevealedPlayerName(snapshot.revealedPlayerName, snapshot.revealedPlayerTab);
    }
  }, [
    context.isMobile,
    setRevealedPlayerName,
    setSidebarOpen,
    sidebarOpen,
    state.revealedPlayerName,
    state.revealedPlayerTab,
  ]);

  const resolvedSidebarState = useMemo(() => {
    const sidebarState = activeStep?.sidebarState;
    if (!sidebarState) {
      return null;
    }

    const resolveValue = <T,>(
      value: T | ((ctx: GuidedWalkthroughContext) => T | undefined) | undefined,
    ): T | undefined => (
      typeof value === "function"
        ? (value as (ctx: GuidedWalkthroughContext) => T | undefined)(context)
        : value
    );

    return {
      openOnMobile: resolveValue(sidebarState.openOnMobile),
      playerName: resolveValue(sidebarState.playerName),
      detailTab: resolveValue(sidebarState.detailTab),
    };
  }, [activeStep?.sidebarState, context]);

  useLayoutEffect(() => {
    if (!guideRequest || !resolvedSidebarState) {
      restoreSidebarState();
      return;
    }

    if (!sidebarRestoreRef.current) {
      sidebarRestoreRef.current = {
        sidebarOpen,
        revealedPlayerName: state.revealedPlayerName,
        revealedPlayerTab: state.revealedPlayerTab,
      };
    }

    if (context.isMobile) {
      if (resolvedSidebarState.openOnMobile === true && !sidebarOpen) {
        setSidebarOpen(true);
      }
      if (resolvedSidebarState.openOnMobile === false && sidebarOpen) {
        setSidebarOpen(false);
      }
    }
    if (
      resolvedSidebarState.playerName !== undefined
      && (
        state.revealedPlayerName !== resolvedSidebarState.playerName
        || (
          resolvedSidebarState.detailTab !== undefined
          && state.revealedPlayerTab !== resolvedSidebarState.detailTab
        )
      )
    ) {
      setRevealedPlayerName(
        resolvedSidebarState.playerName,
        resolvedSidebarState.detailTab ?? state.revealedPlayerTab,
      );
    }
  }, [
    context.isMobile,
    guideRequest,
    resolvedSidebarState,
    restoreSidebarState,
    setRevealedPlayerName,
    setSidebarOpen,
    sidebarOpen,
    state.revealedPlayerName,
    state.revealedPlayerTab,
  ]);

  useLayoutEffect(() => restoreSidebarState, [restoreSidebarState]);

  useEffect(() => {
    if (!guideRequest || !activeStep) {
      return;
    }

    if (!matchesGuideCompletionTrigger({
      activeGuideRequest: guideRequest,
      activeStepId: activeStep.id,
      trigger: guideCompletionTrigger,
    })) {
      return;
    }

    queueMicrotask(() => {
      setRenderRequest(null);
      finishGuide(guideRequest.guideId);
    });
  }, [activeStep, finishGuide, guideCompletionTrigger, guideRequest]);

  const handleAdvanceStep = useCallback(() => {
    if (!guideRequest || !guide) {
      return;
    }

    setActiveStepState((current) => {
      const baseStepIndex =
        current.nonce === guideRequest.nonce
          ? current.stepIndex
          : (guideRequest.stepIndex ?? 0);
      const next = baseStepIndex + 1;
      if (next >= guide.steps.length) {
        queueMicrotask(() => finishGuide(guideRequest.guideId));
        return {
          nonce: guideRequest.nonce,
          stepIndex: baseStepIndex,
        };
      }

      updateGuideStep(guideRequest.guideId, next);
      return {
        nonce: guideRequest.nonce,
        stepIndex: next,
      };
    });
  }, [finishGuide, guide, guideRequest, updateGuideStep]);

  const handleBackStep = useCallback(() => {
    if (!guideRequest) {
      return;
    }

    setActiveStepState((current) => {
      const baseStepIndex =
        current.nonce === guideRequest.nonce
          ? current.stepIndex
          : (guideRequest.stepIndex ?? 0);
      const next = Math.max(0, baseStepIndex - 1);
      if (next !== baseStepIndex) {
        updateGuideStep(guideRequest.guideId, next);
      }
      return {
        nonce: guideRequest.nonce,
        stepIndex: next,
      };
    });
  }, [guideRequest, updateGuideStep]);

  useEffect(() => {
    onVisibleGuideStepChange(
      activeRequest && activeStep
        ? { guideId: activeRequest.guideId, stepId: activeStep.id }
        : null,
    );
  }, [activeRequest, activeStep, onVisibleGuideStepChange]);

  useEffect(() => () => {
    onVisibleGuideStepChange(null);
  }, [onVisibleGuideStepChange]);

  if (!activeRequest) return null;
  return (
    <GuidedWalkthrough
      rootRef={rootRef}
      request={activeRequest}
      context={context}
      stepIndex={stepIndex}
      requestActive={requestActive}
      onClose={finishGuide}
      onSkipAll={skipTutorial}
      onAdvanceStep={handleAdvanceStep}
      onBackStep={handleBackStep}
    />
  );
}

function GameContent() {
  const { gameId } = useParams<{ gameId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, saveSession, clearSession } = useSession();

  const [spectatorConfig, setSpectatorConfig] = useState<SpectatorConfig | null>(null);
  const [spectatingPlayer, setSpectatingPlayer] = useState<string | null>(null);

  const sizes = useViewportCardSizes();
  const shellMode = useGameShellMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [battleSidebarLayout, setBattleSidebarLayout] = useState<BattleSidebarLayout>(null);
  const [phaseTimelineRef, phaseTimelineHeight] = useElementHeight();
  const [battleLifeRailRef, battleLifeRailHeight] = useElementHeight();
  const [actionBarRef, actionBarHeight] = useElementHeight();
  const usesOverlaySidebar = shellMode !== "big";
  const overlaySidebarOpen = usesOverlaySidebar && sidebarOpen;
  const isSmallShell = shellMode === "small";
  const phaseTimelineHeaderClassName =
    shellMode === "small" ? "py-1.5 bar-pad-both" : "py-1.5 bar-pad-left";
  const phaseTimelineRightActionsClassName =
    shellMode === "small" ? "" : "sm:-translate-x-2";
  const actionBarPaddingClass =
    shellMode === "small" ? "bar-pad-both" : "bar-pad-main";

  const isSpectateMode = searchParams.get("spectate") === "true";
  const { addToast } = useToast();
  const buildReadyPendingRef = useRef(false);
  const [buildReadyPending, setBuildReadyPending] = useState(false);
  const handleServerError = useCallback((error: AppError) => {
    if (buildReadyPendingRef.current) {
      buildReadyPendingRef.current = false;
      setBuildReadyPending(false);
    }
    addToast(getAppErrorMessage(error, "game-action", "That action could not be completed."), "error");
  }, [addToast]);

  const voiceSignalRef = useRef<((payload: VoiceSignalPayload) => void) | null>(null);
  const handleVoiceSignal = useCallback((payload: VoiceSignalPayload) => {
    voiceSignalRef.current?.(payload);
  }, []);

  const navigate = useNavigate();
  const { gameState, isConnected, send, actions, pendingSpectateRequest, serverNotice, connectionError, invalidSession } = useGame(
    gameId ?? null,
    isSpectateMode ? null : session?.sessionId ?? null,
    spectatorConfig,
    handleServerError,
    handleVoiceSignal,
  );

  const peerNames = useMemo(() => {
    if (!gameState?.voice_chat_enabled) return []
    return getVoicePeerNames(gameState)
  }, [gameState]);
  const voiceTargetNames = useMemo(() => new Set(peerNames), [peerNames]);
  const voiceTargetsAvailable = peerNames.length > 0;

  const handleMicDenied = useCallback(() => {
    addToast("Microphone access was denied. Voice chat is unavailable.", "warning")
  }, [addToast])

  const handleRetriesExhausted = useCallback((peerName: string) => {
    addToast(`Voice connection to ${peerName} failed.`, "warning")
  }, [addToast])

  const voiceChat = useVoiceChat(send, peerNames, gameState?.self_player.name ?? null, voiceSignalRef, handleMicDenied, handleRetriesExhausted);

  const renderMicToggle = useCallback((player: PlayerView) => {
    if (!voiceTargetsAvailable) return null
    if (player.is_puppet || player.is_ghost) return null
    if (voiceChat.state.peers.length === 0 && !voiceChat.state.isAvailable) return null
    const isSelf = player.name === gameState?.self_player.name
    if (isSelf) {
      return (
        <MicToggle
          muted={voiceChat.state.isMuted}
          audioLevelKey="__self__"
          variant="player-row"
          onClick={() => voiceChat.toggleSelfMute()}
        />
      )
    }
    if (!voiceTargetNames.has(player.name)) return null
    const peer = voiceChat.state.peers.find(p => p.name === player.name)
    if (!peer) return null
    return (
      <MicToggle
        muted={voiceChat.state.mutedPeers.has(player.name)}
        connectionState={peer.connectionState}
        audioLevelKey={player.name}
        remoteMuted={voiceChat.state.remoteMutedPeers.has(player.name)}
        variant="player-row"
        onClick={() => voiceChat.togglePeerMute(player.name)}
      />
    )
  }, [gameState?.self_player.name, voiceChat, voiceTargetNames, voiceTargetsAvailable])

  const { state, setPreviewCard, setRevealedPlayerName } = useContextStrip();

  const isSpectator = !!spectatorConfig;
  const wasInvalidSessionRef = useRef(false);
  const guideRootRef = useRef<HTMLDivElement>(null);
  const selfPhase = gameState?.self_player.phase;

  useEffect(() => {
    const shouldClear = shouldClearSessionOnInvalidEvent(
      invalidSession,
      wasInvalidSessionRef.current,
      !!session,
    );
    wasInvalidSessionRef.current = invalidSession;
    if (shouldClear) {
      clearSession();
    }
  }, [invalidSession, session, clearSession]);

  useEffect(() => {
    const playerName = gameState?.self_player.name;
    if (!gameId || !playerName || isSpectator) {
      return;
    }
    rememberPlayerForGame(gameId, playerName);
  }, [gameId, gameState?.self_player.name, isSpectator]);

  useEffect(() => {
    const selfPlayer = gameState?.self_player;
    if (!selfPlayer) {
      buildReadyPendingRef.current = false;
      queueMicrotask(() => setBuildReadyPending(false));
      return;
    }
    if (selfPlayer.phase !== "build" || !selfPlayer.build_ready) {
      buildReadyPendingRef.current = false;
      queueMicrotask(() => setBuildReadyPending(false));
    }
  }, [
    gameId,
    session?.playerId,
    gameState?.self_player,
    gameState?.self_player.phase,
    gameState?.self_player.build_ready,
  ]);

  // Lifted state from Build phase
  type UpgradesModalOpenMode = 'auto' | 'view' | 'reveal';
  const [selectedBasics, setSelectedBasics] = useState<string[]>([]);
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [upgradesModalOpenMode, setUpgradesModalOpenMode] =
    useState<UpgradesModalOpenMode>('auto');
  const [upgradeInitialTargetId, setUpgradeInitialTargetId] = useState<string | undefined>(undefined);
  const [upgradeInitialId, setUpgradeInitialId] = useState<string | undefined>(undefined);
  const [upgradeInitialRevealIds, setUpgradeInitialRevealIds] = useState<string[]>([]);
  const handSlotsRef = useRef<(string | null)[]>([]);
  const [pendingBuildUpgradeAnimation, setPendingBuildUpgradeAnimation] =
    useState<PendingBuildUpgradeAnimation | null>(null);
  const [activeBuildUpgradeAnimation, setActiveBuildUpgradeAnimation] = useState<{
    upgrade: CardType;
    target: CardType;
  } | null>(null);

  // Lifted state from Reward phase
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(
    null,
  );
  const [selectedPoolCardId, setSelectedPoolCardId] = useState<string | null>(null);

  // Lifted state from Battle phase
  const [battleSelectedCard, setBattleSelectedCard] = useState<BattleSelectedCard | null>(null);
  const [isChangingResult, setIsChangingResult] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [activeDndPanel, setActiveDndPanel] = useState<ActiveDndPanel>(null);
  const [activeBattleZoneModal, setActiveBattleZoneModal] = useState<BattleZoneModal>(null);
  const [showSubmitHandPopover, setShowSubmitHandPopover] = useState(false);
  const [showSubmitResultPopover, setShowSubmitResultPopover] = useState(false);
  const [pendingBattleResult, setPendingBattleResult] = useState<string | null>(null);
  const [pendingPostRevealSubmit, setPendingPostRevealSubmit] = useState<string | null>(null);
  const [visibleGuideStep, setVisibleGuideStep] = useState<VisibleGuideStep | null>(null);
  const [guideCompletionTrigger, setGuideCompletionTrigger] = useState<{
    guideId: GuidedGuideId;
    stepId: string;
    nonce: number;
  } | null>(null);
  const [dismissedServerNoticeAt, setDismissedServerNoticeAt] = useState<string | null>(null);
  const [cachedBattleForResolution, setCachedBattleForResolution] = useState<BattleView | null>(null);
  const [activeBattleResolutionId, setActiveBattleResolutionId] = useState<string | null>(null);
  const [shownBattleResolutionIds, setShownBattleResolutionIds] = useState<Set<string>>(new Set());
  const [shownRevealAnimationIds, setShownRevealAnimationIds] = useState<Set<string>>(new Set());
  const [activeRevealAnimation, setActiveRevealAnimation] = useState<RevealAnimation | null>(null);
  const battleResolutionId = gameState?.battle_resolution?.resolution_id ?? null;

  useEffect(() => {
    if (gameState?.self_player.phase === "battle" && gameState.current_battle) {
      const battleSnapshot = gameState.current_battle;
      queueMicrotask(() => setCachedBattleForResolution(battleSnapshot));
    }
  }, [gameState?.current_battle, gameState?.self_player.phase]);

  useEffect(() => {
    const selfPlayer = gameState?.self_player;
    if (!selfPlayer || !pendingBuildUpgradeAnimation || selfPlayer.phase !== "build") {
      return;
    }

    const upgrade = selfPlayer.upgrades.find(
      (candidate) =>
        candidate.id === pendingBuildUpgradeAnimation.upgradeId &&
        candidate.upgrade_target?.id === pendingBuildUpgradeAnimation.targetId,
    );
    if (!upgrade?.upgrade_target) {
      return;
    }

    const nextAnimation = {
      upgrade,
      target: upgrade.upgrade_target,
    };
    queueMicrotask(() => {
      setActiveBuildUpgradeAnimation(nextAnimation);
      setPendingBuildUpgradeAnimation(null);
    });
  }, [gameState?.self_player, pendingBuildUpgradeAnimation]);

  useEffect(() => {
    const battle = gameState?.current_battle;
    if (!battle || activeRevealAnimation || pendingBattleResult) return;
    if (gameState?.self_player.phase !== "battle") return;

    const pending = battle.pending_reveal_animations ?? [];
    const next = pending.find((a) => !shownRevealAnimationIds.has(a.animation_id));
    if (!next) return;

    queueMicrotask(() => {
      setActiveRevealAnimation(next);
      setShownRevealAnimationIds((prev) => {
        const s = new Set(prev);
        s.add(next.animation_id);
        return s;
      });
    });
  }, [gameState?.current_battle, gameState?.self_player.phase, activeRevealAnimation, shownRevealAnimationIds, pendingBattleResult]);

  const prevPhaseRef = useRef(gameState?.self_player.phase);
  if (gameState?.self_player.phase !== prevPhaseRef.current) {
    prevPhaseRef.current = gameState?.self_player.phase;
    if (gameState?.self_player.phase !== 'battle' && battleSelectedCard !== null) {
      setBattleSelectedCard(null);
    }
  }

  useEffect(() => {
    setRevealedPlayerName(null);
    if (selfPhase !== "battle") {
      queueMicrotask(() => {
        setActionMenuOpen(false);
        setActiveDndPanel(null);
        setActiveBattleZoneModal(null);
        setShowSubmitResultPopover(false);
        setIsChangingResult(false);
      });
    }
    if (selfPhase !== "build") {
      queueMicrotask(() => setShowSubmitHandPopover(false));
    }
  }, [selfPhase, setRevealedPlayerName]);

  // Rules panel state
  const [rulesPanelOpen, setRulesPanelOpen] = useState(false);
  const [rulesPanelTarget, setRulesPanelTarget] = useState<RulesPanelTarget | undefined>(undefined);

  // Share modal state (game-over header)
  const [shareOpen, setShareOpen] = useState(false);

  // Hover tracking for hotkeys
  const [hoveredCard, setHoveredCard] = useState<{ id: string; zone: ZoneName; owner: 'player' | 'opponent' } | null>(null);
  const guideCompletionNonceRef = useRef(0);
  const handleCardHover = (cardId: string, zone: ZoneName) => {
    setHoveredCard({ id: cardId, zone, owner: 'player' });
  };
  const handleOpponentCardHover = (cardId: string, zone: ZoneName) => {
    setHoveredCard({ id: cardId, zone, owner: 'opponent' });
  };
  const handleCardHoverEnd = () => setHoveredCard(null);

  useEffect(() => {
    queueMicrotask(() => setHoveredCard(null));
  }, [selfPhase]);

  // DnD setup for battle phase
  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: gameState?.self_player?.phase ?? "draft",
    battleMove: actions.battleMove,
  });

  const handleYourLifeChange = (life: number) => {
    if (isSpectator) return;
    actions.battleUpdateLife("you", life);
  };

  const handleOpponentLifeChange = (life: number) => {
    if (isSpectator) return;
    actions.battleUpdateLife("opponent", life);
  };

  const handleSessionCreated = (
    sessionId: string,
    playerId: string,
    config?: SpectatorConfig
  ) => {
    saveSession(sessionId, playerId);
    if (config) {
      setSpectatorConfig(config);
      setSpectatingPlayer(config.spectatePlayer);
    }
    if (isSpectateMode) {
      setSearchParams({});
    }
  };

  const handleSpectateNewTab = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("spectate", "true");
    window.open(url.toString(), '_blank');
  };

  const closeGameplayOverlays = useCallback((except: OverlayKey | null = null) => {
    if (except !== "rules") {
      setRulesPanelOpen(false);
    }
    if (except !== "upgrades") {
      setShowUpgradesModal(false);
      setUpgradeInitialTargetId(undefined);
      setUpgradeInitialId(undefined);
      setUpgradeInitialRevealIds([]);
      setUpgradesModalOpenMode("auto");
    }
    if (except !== "actionMenu") {
      setActionMenuOpen(false);
    }
    if (except !== "share") {
      setShareOpen(false);
    }
    if (except !== "buildSubmit") {
      setShowSubmitHandPopover(false);
    }
    if (except !== "battleSubmit") {
      setShowSubmitResultPopover(false);
      setIsChangingResult(false);
    }
    if (except !== "battlePanel") {
      setActiveDndPanel(null);
    }
    if (except !== "battleZoneModal") {
      setActiveBattleZoneModal(null);
    }
  }, []);

  useEffect(() => {
    const phase = gameState?.self_player.phase;
    if (!battleResolutionId || !phase || phase === "battle" || !cachedBattleForResolution) {
      return;
    }
    if (shownBattleResolutionIds.has(battleResolutionId)) {
      return;
    }

    queueMicrotask(() => {
      closeGameplayOverlays();
      setActiveBattleResolutionId(battleResolutionId);
      setShownBattleResolutionIds((current) => {
        if (current.has(battleResolutionId)) {
          return current;
        }

        const next = new Set(current);
        next.add(battleResolutionId);
        return next;
      });
    });
  }, [
    battleResolutionId,
    cachedBattleForResolution,
    closeGameplayOverlays,
    gameState?.self_player.phase,
    shownBattleResolutionIds,
  ]);

  const openRulesPanel = useCallback((target?: RulesPanelTarget) => {
    closeGameplayOverlays("rules");
    setRulesPanelTarget(target);
    setRulesPanelOpen(true);
  }, [closeGameplayOverlays]);

  const closeUpgradesModal = useCallback(() => {
    setShowUpgradesModal(false);
    setUpgradeInitialTargetId(undefined);
    setUpgradeInitialId(undefined);
    setUpgradeInitialRevealIds([]);
    setUpgradesModalOpenMode('auto');
  }, []);

  const requestGuideCompletion = useCallback((guideId: GuidedGuideId, stepId: string) => {
    guideCompletionNonceRef.current += 1;
    setGuideCompletionTrigger({
      guideId,
      stepId,
      nonce: guideCompletionNonceRef.current,
    });
  }, []);

  const openUpgradesModal = useCallback((
    targetCardId?: string,
    mode: UpgradesModalOpenMode = 'auto',
    initialRevealIds: string[] = [],
  ) => {
    closeGameplayOverlays("upgrades");
    setUpgradeInitialTargetId(targetCardId);
    setUpgradeInitialId(undefined);
    setUpgradeInitialRevealIds(initialRevealIds);
    setUpgradesModalOpenMode(mode);
    setShowUpgradesModal(true);
  }, [closeGameplayOverlays]);

  const openBuildApplyUpgradeModal = useCallback((options: {
    targetCardId?: string;
    upgradeId?: string;
  } = {}) => {
    closeGameplayOverlays("upgrades");
    setUpgradeInitialTargetId(options.targetCardId);
    setUpgradeInitialId(options.upgradeId);
    setUpgradeInitialRevealIds([]);
    setUpgradesModalOpenMode("auto");
    setShowUpgradesModal(true);
  }, [closeGameplayOverlays]);

  const handleBuildReadySubmit = useCallback((
    playDrawPreference: "play" | "draw",
  ) => {
    if (buildReadyPendingRef.current || !gameState || gameState.self_player.phase !== "build") {
      return;
    }
    buildReadyPendingRef.current = true;
    setBuildReadyPending(true);
    requestGuideCompletion("build_play_draw", "play-draw");
    closeGameplayOverlays();
    actions.buildReady(
      selectedBasics,
      playDrawPreference,
      handSlotsRef.current.filter((id): id is string => id !== null),
    );
  }, [actions, closeGameplayOverlays, gameState, requestGuideCompletion, selectedBasics]);

  const openBuildSubmitPopover = useCallback(() => {
    if (showSubmitHandPopover || buildReadyPending) {
      return;
    }
    closeGameplayOverlays("buildSubmit");
    setShowSubmitHandPopover(true);
  }, [buildReadyPending, closeGameplayOverlays, showSubmitHandPopover]);

  const toggleBuildSubmitPopover = useCallback(() => {
    if (showSubmitHandPopover || buildReadyPending) {
      setShowSubmitHandPopover(false);
      return;
    }
    openBuildSubmitPopover();
  }, [buildReadyPending, openBuildSubmitPopover, showSubmitHandPopover]);

  const openActionMenu = useCallback(() => {
    closeGameplayOverlays("actionMenu");
    setActionMenuOpen(true);
  }, [closeGameplayOverlays]);

  const openBattleSubmitPopover = useCallback(() => {
    if (showSubmitResultPopover) {
      return;
    }
    closeGameplayOverlays("battleSubmit");
    setShowSubmitResultPopover(true);
  }, [closeGameplayOverlays, showSubmitResultPopover]);

  const toggleBattleSubmitPopover = useCallback(() => {
    if (showSubmitResultPopover) {
      setShowSubmitResultPopover(false);
      return;
    }
    openBattleSubmitPopover();
  }, [openBattleSubmitPopover, showSubmitResultPopover]);

  const toggleBattlePanel = useCallback((panel: Exclude<ActiveDndPanel, null>) => {
    if (activeDndPanel === panel) {
      setActiveDndPanel(null);
      return;
    }
    closeGameplayOverlays("battlePanel");
    setActiveDndPanel(panel);
  }, [activeDndPanel, closeGameplayOverlays]);

  const setBattleZoneModalOpen = useCallback((
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => {
    const isSameModal =
      activeBattleZoneModal?.zone === zone &&
      activeBattleZoneModal.owner === owner;
    if (!open) {
      if (isSameModal) {
        setActiveBattleZoneModal(null);
      }
      return;
    }
    if (isSameModal) {
      return;
    }
    closeGameplayOverlays("battleZoneModal");
    setActiveBattleZoneModal({ zone, owner });
  }, [activeBattleZoneModal, closeGameplayOverlays]);

  const openShareModal = useCallback(() => {
    closeGameplayOverlays("share");
    setShareOpen(true);
  }, [closeGameplayOverlays]);

  const handleBattleResultSubmit = useCallback((result: string) => {
    requestGuideCompletion("battle_result_submit", "result-submit");
    setIsChangingResult(false);
    setShowSubmitResultPopover(false);

    const isLoss = result !== gameState?.self_player.name && result !== "draw";
    const unrevealed = gameState
      ? getUnrevealedAppliedUpgrades(gameState.self_player.upgrades)
      : [];

    if (!isLoss && unrevealed.length > 0) {
      setPendingBattleResult(result);
      return;
    }

    actions.battleSubmitResult(result);
  }, [actions, gameState, requestGuideCompletion]);

  const handleRevealAndSubmit = useCallback((upgradeIds: string[]) => {
    upgradeIds.forEach((id) => actions.battleRevealUpgrade(id));
    setPendingPostRevealSubmit(pendingBattleResult);
    setPendingBattleResult(null);
  }, [actions, pendingBattleResult]);

  const handleSkipAndSubmit = useCallback(() => {
    if (pendingBattleResult) {
      actions.battleSubmitResult(pendingBattleResult);
    }
    setPendingBattleResult(null);
  }, [actions, pendingBattleResult]);

  const handleContinue = useCallback(() => {
    requestGuideCompletion("reward", "continue");
    actions.rewardDone(selectedUpgradeId ?? undefined);
    setSelectedUpgradeId(null);
    setSelectedPoolCardId(null);
  }, [actions, requestGuideCompletion, selectedUpgradeId]);

  const hasPendingBattleResolution =
    !!battleResolutionId &&
    gameState?.self_player.phase !== "battle" &&
    cachedBattleForResolution !== null &&
    !shownBattleResolutionIds.has(battleResolutionId);
  const buildSubmitGuideActive = isSubmitPopoverGuideStepActive(visibleGuideStep, "build");
  const battleSubmitGuideActive = isSubmitPopoverGuideStepActive(visibleGuideStep, "battle");

  // Hotkeys — must be before early returns to satisfy rules-of-hooks
  const modalOpen =
    rulesPanelOpen ||
    showUpgradesModal ||
    actionMenuOpen ||
    activeDndPanel !== null ||
    activeBattleZoneModal !== null ||
    shareOpen ||
    state.previewCard !== null ||
    hasPendingBattleResolution ||
    activeBattleResolutionId !== null ||
    activeBuildUpgradeAnimation !== null ||
    pendingBattleResult !== null ||
    activeRevealAnimation !== null ||
    pendingPostRevealSubmit !== null;
  const gameplayHotkeysDisabled = shouldDisableGameplayHotkeys({
    modalOpen,
    visibleGuideStep,
  });
  const sidebarPlayers = useMemo(
    () => (gameState ? getSidebarPlayerOrder(gameState.players) : []),
    [gameState],
  );
  const hotkeyMap: Record<string, () => void> = (() => {
    const currentPhaseId = gameState?.self_player.phase;
    const map: Record<string, () => void> = {
      '?': () => {
        openRulesPanel(
          currentPhaseId && ['draft', 'build', 'battle', 'reward'].includes(currentPhaseId)
            ? { docId: currentPhaseId, tab: 'controls' }
            : undefined,
        );
      },
    };
    if (!gameState || isSpectator || gameplayHotkeysDisabled) return map;

    const { self_player: sp, current_battle: cb } = gameState;
    const phase = sp.phase;

    if (!usesOverlaySidebar && phase !== "battle") {
      sidebarPlayers.slice(0, 8).forEach((player, index) => {
        map[String(index + 1)] = () => {
          setRevealedPlayerName(player.name, "seen");
        };
      });
    }

    if (phase === 'draft') {
      map['r'] = () => {
        if (sp.treasures > 0 && (sp.current_pack?.length ?? 0) > 0) {
          actions.draftRoll();
        }
      };
      map['Enter'] = () => actions.draftDone();
      map['u'] = () => {
        if (sp.upgrades.length > 0) openUpgradesModal(undefined, 'view');
      };
    } else if (phase === 'build') {
      if (showSubmitHandPopover) {
        const basicsComplete = selectedBasics.filter(Boolean).length === 3;
        const handFull = sp.hand.length === sp.hand_size;
        const canReady = basicsComplete && handFull;
        if (canReady) {
          map['p'] = () => handleBuildReadySubmit('play');
          map['d'] = () => handleBuildReadySubmit('draw');
        }
        map['Enter'] = () => setShowSubmitHandPopover(false);
      } else {
        map['Enter'] = () => {
          if (sp.build_ready) {
            actions.buildUnready();
          } else {
            const basicsComplete = selectedBasics.filter(Boolean).length === 3;
            const handFull = sp.hand.length === sp.hand_size;
            if (basicsComplete && handFull && !buildReadyPending) {
              toggleBuildSubmitPopover();
            }
          }
        };
      }
      map['u'] = () => {
        if (sp.upgrades.length > 0) openUpgradesModal(undefined, 'view');
      };
      if (hoveredCard && sp.upgrades.some((u) => !u.upgrade_target)) {
        map['u'] = () => {
          openUpgradesModal(hoveredCard.id);
        };
      }
    } else if (phase === 'battle' && cb) {
      if (showSubmitResultPopover) {
        map['w'] = () => {
          handleBattleResultSubmit(sp.name);
        };
        map['d'] = () => {
          handleBattleResultSubmit("draw");
        };
        map['l'] = () => {
          handleBattleResultSubmit(cb.opponent_name);
        };
        map['Enter'] = () => setShowSubmitResultPopover(false);
      } else {
        if (hoveredCard) {
          const ownerZones = hoveredCard.owner === 'player' ? cb.your_zones : cb.opponent_zones;
          map['t'] = () => {
            if (hoveredCard.zone === 'battlefield') {
              const tapped = ownerZones.tapped_card_ids?.includes(hoveredCard.id);
              actions.battleUpdateCardState(tapped ? 'untap' : 'tap', hoveredCard.id);
            }
          };
          map['f'] = () => {
            const ownerZones = hoveredCard.owner === 'player' ? cb.your_zones : cb.opponent_zones;
            const isFaceDown = ownerZones.face_down_card_ids?.includes(hoveredCard.id);
            if (!canUseBattleFaceDownAction(hoveredCard.owner, cb.can_manipulate_opponent)) {
              if (!canUseBattleFlipAction(hoveredCard.owner, !!isFaceDown, cb.can_manipulate_opponent)) return;
              const card = ownerZones[hoveredCard.zone]?.find((c: { id: string }) => c.id === hoveredCard.id);
              if (card?.flip_image_url) {
                actions.battleUpdateCardState('flip', hoveredCard.id);
              }
              return;
            }
            if (isFaceDown) {
              actions.battleUpdateCardState('face_down', hoveredCard.id);
            } else {
              const card = ownerZones[hoveredCard.zone]?.find((c: { id: string }) => c.id === hoveredCard.id);
              if (card?.flip_image_url) {
                actions.battleUpdateCardState('flip', hoveredCard.id);
              } else {
                actions.battleUpdateCardState('face_down', hoveredCard.id);
              }
            }
          };
          const moveZones = { g: 'graveyard', h: 'hand', b: 'battlefield', e: 'exile', l: 'library' } as const;
          for (const [key, toZone] of Object.entries(moveZones)) {
            map[key] = () => {
              if (toZone !== hoveredCard.zone) {
                const zoneCards = ownerZones[hoveredCard.zone];
                const idx = zoneCards.findIndex(c => c.id === hoveredCard.id);
                actions.battleMove(hoveredCard.id, hoveredCard.zone, toZone as ZoneName, hoveredCard.owner, hoveredCard.owner);
                const nextCard = zoneCards[idx + 1] ?? zoneCards[idx - 1] ?? null;
                setHoveredCard(nextCard ? { id: nextCard.id, zone: hoveredCard.zone, owner: hoveredCard.owner } : null);
              }
            };
          }
          map['u'] = () => {
            if (!cb) return;
            const battlefieldIds = new Set(cb.your_zones.battlefield.map(c => c.id));
            for (const cardId of cb.your_zones.tapped_card_ids || []) {
              if (battlefieldIds.has(cardId)) actions.battleUpdateCardState('untap', cardId);
            }
          };
          map['p'] = () => actions.battlePassTurn();
        } else {
          map['u'] = () => {
            if (!cb) return;
            const battlefieldIds = new Set(cb.your_zones.battlefield.map(c => c.id));
            for (const cardId of cb.your_zones.tapped_card_ids || []) {
              if (battlefieldIds.has(cardId)) actions.battleUpdateCardState('untap', cardId);
            }
          };
          map['p'] = () => actions.battlePassTurn();
          map['t'] = () => actions.battleUpdateCardState("create_treasure", "", {});
          map['g'] = () => {
            if (cb.your_zones.graveyard.length > 0) toggleBattlePanel('graveyard');
          };
          map['e'] = () => {
            if (cb.your_zones.exile.length > 0) toggleBattlePanel('exile');
          };
          map['s'] = () => {
            if (cb.your_zones.sideboard.length > 0) toggleBattlePanel('sideboard');
          };
        }
        map['Enter'] = () => {
          const mySubmission = cb.result_submissions[sp.name];
          if (mySubmission && !isChangingResult) {
            setIsChangingResult(true);
          } else {
            toggleBattleSubmitPopover();
          }
        };
        map['v'] = () => {
          if (sp.upgrades.length > 0) openUpgradesModal(undefined, 'view');
        };
      }
    } else if (phase === 'reward') {
      map['Enter'] = () => {
        const isStageIncreasing = sp.is_stage_increasing;
        const needsUpgrade = isStageIncreasing && gameState.available_upgrades.length > 0;
        const canCont = !needsUpgrade || !!selectedUpgradeId;
        if (canCont) {
          handleContinue();
        }
      };
    }

    return map;
  })();

  useHotkeys(hotkeyMap, !gameplayHotkeysDisabled);

  const guideContext = useMemo<GuidedWalkthroughContext | null>(() => {
    if (!gameState) return null;
    const { self_player, current_battle } = gameState;
    const currentPhase = self_player.phase;
    const isStageIncreasing = self_player.is_stage_increasing;
    const needsUpgrade = isStageIncreasing && gameState.available_upgrades.length > 0;
    const dgo = selectDraftGuideOpponent(gameState.players, self_player.name);
    return {
      currentPhase: isTimelinePhase(currentPhase) ? currentPhase : null,
      selfPlayer: self_player,
      currentBattle: current_battle,
      isMobile: usesOverlaySidebar,
      sidebarOpen,
      revealedPlayerName: state.revealedPlayerName,
      useUpgrades: gameState.use_upgrades,
      hasRewardUpgradeChoice: needsUpgrade,
      showBuildSubmitPopover: showSubmitHandPopover,
      showBattleSubmitPopover: showSubmitResultPopover,
      hasBattleRevealUpgrade:
        currentPhase === "battle" && getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0,
      availableRewardUpgrades: gameState.available_upgrades,
      draftGuideOpponentName: dgo.name,
      draftGuideOpponentRevealedCount: dgo.revealedCount,
      isStageEnd: self_player.is_stage_increasing,
    };
  }, [
    gameState, usesOverlaySidebar, sidebarOpen,
    state.revealedPlayerName,
    showSubmitHandPopover, showSubmitResultPopover,
  ]);

  if (!session || isSpectateMode) {
    return (
      <PlayerSelectionModal
        gameId={gameId!}
        onSessionCreated={handleSessionCreated}
      />
    );
  }

  if (connectionError && !invalidSession) {
    const title = connectionError.code === "SPECTATE_TARGET_NOT_FOUND" ? "Spectate Unavailable" : "Game Unavailable";
    const message = getAppErrorMessage(
      connectionError,
      "game-connection",
      "This game is no longer available. It may have ended or been cleared during a server restart.",
    );
    return (
      <div className="game-table flex items-center justify-center">
        <div className="modal-chrome border gold-border rounded-lg p-5 max-w-md w-[min(92vw,28rem)]">
          <h2 className="text-lg font-semibold text-amber-200">
            {title}
          </h2>
          <p className="text-sm text-gray-200 mt-2 leading-snug">
            {message}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigate("/play")}
              className="btn btn-primary flex-1 py-2"
            >
              New Game
            </button>
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary flex-1 py-2"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-table flex items-center justify-center">
        <div className="text-white">{isConnected ? 'Loading game...' : 'Connecting...'}</div>
      </div>
    );
  }

  const currentPhase = gameState.self_player.phase;
  const shouldBlockGuidesForResolution = shouldBlockGuidesForBattleResolution({
    activeBattleResolutionId,
    battleResolutionId: gameState.battle_resolution?.resolution_id,
    hasCachedBattle: cachedBattleForResolution !== null,
    selfPhase: currentPhase,
    shownResolutionIds: shownBattleResolutionIds,
  });

  const { self_player, current_battle } = gameState;
  const activeBattleResolution =
    gameState.battle_resolution &&
    (activeBattleResolutionId === battleResolutionId || hasPendingBattleResolution)
      ? gameState.battle_resolution
      : null;
  const displayBattleResolution = !!activeBattleResolution && !!cachedBattleForResolution;
  const battleViewForDisplay = current_battle ?? (displayBattleResolution ? cachedBattleForResolution : null);
  const actionBarPhase = displayBattleResolution ? "battle" : currentPhase;
  const actionBarBattle = battleViewForDisplay;
  const canManipulateOpponent = battleViewForDisplay?.can_manipulate_opponent ?? false;
  const overlaySidebarPadding = usesOverlaySidebar && (currentPhase === "battle" || displayBattleResolution) && battleViewForDisplay
    ? {
        top:
          phaseTimelineHeight +
          battleLifeRailHeight + 2,
        bottom: actionBarHeight,
      }
    : undefined;

  const isEndPhase = currentPhase === "eliminated" || currentPhase === "winner" || currentPhase === "game_over";
  const selfPlacement = gameState.players.find(p => p.name === self_player.name)?.placement ?? 0;
  const isWinner = selfPlacement === 1;

  const shareUrl = gameId
    ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(self_player.name)}`
    : '';
  const shareText = isWinner
    ? 'Just won a game of Crucible! Check out the game:'
    : `Just finished ${getOrdinal(selfPlacement)} in Crucible! Check out the game:`;

  const maxHandSize = self_player.hand_size;
  const handFull = self_player.hand.length === maxHandSize;
  const basicsComplete = selectedBasics.filter(Boolean).length === 3;
  const canReady = basicsComplete && handFull;

  const isStageIncreasing = self_player.is_stage_increasing;
  const needsUpgrade =
    isStageIncreasing && gameState.available_upgrades.length > 0;
  const canContinue = !needsUpgrade || !!selectedUpgradeId;
  const hasPendingBuildUpgrades =
    currentPhase === "build" && self_player.upgrades.some((u) => !u.upgrade_target);
  const hasUnrevealedBattleUpgrades =
    actionBarPhase === "battle" && getUnrevealedAppliedUpgrades(self_player.upgrades).length > 0;
  const {
    upgradedCardIds: battleUpgradedCardIds,
    appliedUpgradesByCardId: battleUpgradesByCardId,
  } = current_battle
    ? buildAppliedUpgradeMap(current_battle.your_zones.upgrades, "revealed_applied")
    : { upgradedCardIds: new Set<string>(), appliedUpgradesByCardId: new Map<string, CardType[]>() };
  const battleHiddenUpgradesByCardId = current_battle
    ? buildHiddenAppliedUpgradeMap(current_battle.your_zones.upgrades)
    : new Map<string, CardType[]>();
  const {
    upgradedCardIds: opponentBattleUpgradedCardIds,
    appliedUpgradesByCardId: opponentBattleUpgradesByCardId,
  } = current_battle
    ? buildAppliedUpgradeMap(current_battle.opponent_zones.upgrades, "revealed_applied")
    : { upgradedCardIds: new Set<string>(), appliedUpgradesByCardId: new Map<string, CardType[]>() };
  const upgradesModalMode: "view" | "apply" | "reveal" =
    upgradesModalOpenMode === "view"
      ? "view"
      : upgradesModalOpenMode === "reveal"
        ? "reveal"
        : hasPendingBuildUpgrades
          ? "apply"
          : "view";

  const openBattleRevealUpgradesModal = (initialRevealIds: string[] = []) => {
    requestGuideCompletion("hint_battle_unrevealed_upgrade", "reveal-upgrade");
    openUpgradesModal(undefined, "reveal", initialRevealIds);
  };

  const renderActionButtons = (): ReactNode => {
    if (isSpectator) {
      return null;
    }

    let left: ReactNode = null;
    let right: ReactNode = null;

    if (actionBarPhase === "eliminated") {
      const hasWatchablePlayers = gameState.players.some(
        (p) =>
          !p.is_puppet &&
          p.phase !== "eliminated" &&
          p.phase !== "awaiting_elimination" &&
          p.phase !== "winner" &&
          p.phase !== "game_over"
      );
      if (hasWatchablePlayers) {
        right = (
          <button onClick={handleSpectateNewTab} className="btn btn-secondary">
            Spectate
          </button>
        );
      }
    } else if (actionBarPhase === "draft") {
      left = (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={actions.draftRoll}
            disabled={
              self_player.treasures <= 0 ||
              (self_player.current_pack?.length ?? 0) === 0
            }
            className="btn bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-guide-target="draft-roll"
          >
            Roll for 1💰
          </button>
          {self_player.upgrades.length > 0 && (
            <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn bg-gray-600 hover:bg-gray-500 text-white">
              View Upgrades
            </button>
          )}
        </div>
      );
      right = (
        <button
          onClick={actions.draftDone}
          className="btn btn-primary"
          data-guide-target="draft-continue"
        >
          Go to Build
        </button>
      );
    } else if (actionBarPhase === "build") {
      if (self_player.build_ready) {
        left = self_player.upgrades.length > 0 ? (
          hasPendingBuildUpgrades ? (
            <button
              onClick={() => openUpgradesModal(undefined, 'auto')}
              className="btn bg-purple-600 hover:bg-purple-500 text-white"
              data-guide-target="build-apply-upgrade"
            >
              Apply Upgrade
            </button>
          ) : (
            <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn bg-gray-600 hover:bg-gray-500 text-white">
              View Upgrades
            </button>
          )
        ) : null;
        right = (
          <div className="flex items-center gap-1.5 sm:gap-2" data-guide-target="build-submit">
            <span className="text-amber-400 text-sm">Waiting...</span>
            <button
              onClick={actions.buildUnready}
              className="btn bg-gray-600 hover:bg-gray-500 text-white"
            >
              Change
            </button>
          </div>
        );
      } else {
        left = self_player.upgrades.length > 0 ? (
          hasPendingBuildUpgrades ? (
            <button
              onClick={() => openUpgradesModal(undefined, 'auto')}
              className="btn bg-purple-600 hover:bg-purple-500 text-white"
              data-guide-target="build-apply-upgrade"
            >
              Apply Upgrade
            </button>
          ) : (
            <button
              onClick={() => openUpgradesModal(undefined, 'view')}
              className="btn bg-gray-600 hover:bg-gray-500 text-white"
            >
              View Upgrades
            </button>
          )
        ) : null;
        right = (
          <div className="relative flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={toggleBuildSubmitPopover}
              disabled={!canReady || buildReadyPending}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              data-guide-target="build-submit"
            >
              {buildReadyPending ? "Submitting..." : "Submit Hand"}
            </button>
            {showSubmitHandPopover && canReady && (
              <SubmitPopover
                options={[
                  {
                    label: "Play",
                    onClick: () => handleBuildReadySubmit('play'),
                    className: "btn bg-green-600 hover:bg-green-500 text-white text-sm py-1.5",
                  },
                  {
                    label: "Draw",
                    onClick: () => handleBuildReadySubmit('draw'),
                    className: "btn bg-green-600 hover:bg-green-500 text-white text-sm py-1.5",
                  },
                ]}
                onClose={() => setShowSubmitHandPopover(false)}
                guideTarget="build-submit-popover"
                closeOnOutsideClick
                ignoreOutsideClickSelector={buildSubmitGuideActive ? "[data-guided-tooltip='true']" : undefined}
              />
            )}
          </div>
        );
      }
    } else if (actionBarPhase === "battle") {
      if (!actionBarBattle) return null;
      const { opponent_name, result_submissions } = actionBarBattle;
      const mySubmission = result_submissions[self_player.name];
      const opponentSubmission = result_submissions[opponent_name];

      left = (
        <div className="flex items-center gap-1.5 sm:gap-2">
          {hasUnrevealedBattleUpgrades && (
            <button
              onClick={() => openBattleRevealUpgradesModal()}
              className="btn bg-purple-600 hover:bg-purple-500 text-white"
              data-guide-target="battle-reveal-upgrade"
            >
              Reveal Upgrade
            </button>
          )}
          <button
            onClick={openActionMenu}
            className="btn btn-secondary"
            data-guide-target="battle-actions"
          >
            Actions
          </button>
        </div>
      );

      if (mySubmission && !isChangingResult) {
        const resultsConflict =
          opponentSubmission && mySubmission !== opponentSubmission;
        right = (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-sm ${resultsConflict ? "text-red-400" : "text-amber-400"}`}
            >
              {resultsConflict ? "Results conflict!" : "Waiting..."}
            </span>
            <button
              onClick={() => setIsChangingResult(true)}
              className="btn bg-gray-600 hover:bg-gray-500 text-white"
            >
              Change
            </button>
          </div>
        );
      } else {
        right = (
          <div className="relative flex items-center gap-1.5 sm:gap-2">
            {isChangingResult && (
              <button
                onClick={() => { setIsChangingResult(false); setShowSubmitResultPopover(false); }}
                className="text-gray-400 text-sm hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              onClick={toggleBattleSubmitPopover}
              className="btn btn-primary"
              data-guide-target="battle-submit"
            >
              Submit Result
            </button>
            {showSubmitResultPopover && (
              <SubmitPopover
                options={[
                  {
                    label: "I Won",
                    onClick: () => {
                      handleBattleResultSubmit(self_player.name);
                    },
                    className: "btn bg-green-600 hover:bg-green-500 text-white text-sm py-1.5",
                  },
                  {
                    label: "Draw",
                    onClick: () => {
                      handleBattleResultSubmit("draw");
                    },
                    className: "btn btn-danger text-sm py-1.5",
                  },
                  {
                    label: "I Lost",
                    onClick: () => {
                      handleBattleResultSubmit(opponent_name);
                    },
                    className: "btn btn-danger text-sm py-1.5",
                  },
                ]}
                onClose={() => setShowSubmitResultPopover(false)}
                guideTarget="battle-submit-popover"
                closeOnOutsideClick
                ignoreOutsideClickSelector={battleSubmitGuideActive ? "[data-guided-tooltip='true']" : undefined}
              />
            )}
          </div>
        );
      }
    } else if (actionBarPhase === "reward") {
      const buttonLabel = needsUpgrade
        ? selectedUpgradeId
          ? "Claim & Continue"
          : "Select Upgrade"
        : "Continue";
      right = (
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          data-guide-target="reward-continue"
        >
          {buttonLabel}
        </button>
      );
    } else {
      return null;
    }

    if (!left && !right) return null;

    return (
      <>
        <div className="flex items-center gap-1.5 sm:gap-2">{left}</div>
        <div className="flex items-center gap-1.5 sm:gap-2">{right}</div>
      </>
    );
  };

  const handleCreateTreasure = () => {
    actions.battleUpdateCardState("create_treasure", "", {});
  };

  const handleCreateOpponentTreasure = () => {
    actions.battleUpdateCardState("create_treasure", "", { for_opponent: true });
  };

  const handleDrawLibrary = () => {
    actions.battleUpdateCardState("draw_library", "", {});
  };

  const handleShuffleLibrary = () => {
    actions.battleUpdateCardState("shuffle_library", "", {});
  };

  const handleDrawOpponentLibrary = () => {
    actions.battleUpdateCardState("draw_library", "", { for_opponent: true });
  };

  const handleShuffleOpponentLibrary = () => {
    actions.battleUpdateCardState("shuffle_library", "", { for_opponent: true });
  };

  const handlePassTurn = () => {
    actions.battlePassTurn();
  };

  const handleRollDie = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    addToast(`Rolled a d${sides}: ${result}`, "info");
  };

  const handleUntapAll = () => {
    if (!current_battle) return;
    const battlefieldIds = new Set(current_battle.your_zones.battlefield.map(c => c.id));
    for (const cardId of current_battle.your_zones.tapped_card_ids || []) {
      if (battlefieldIds.has(cardId)) {
        actions.battleUpdateCardState('untap', cardId);
      }
    }
  };

  const handleUntapOpponentAll = () => {
    if (!current_battle) return;
    const battlefieldIds = new Set(current_battle.opponent_zones.battlefield.map(c => c.id));
    for (const cardId of current_battle.opponent_zones.tapped_card_ids || []) {
      if (battlefieldIds.has(cardId)) {
        actions.battleUpdateCardState('untap', cardId);
      }
    }
  };


  const handlePanelClickToMove = (e: React.MouseEvent, toZone: ZoneName, toOwner: ZoneOwner) => {
    if ((e.target as HTMLElement).closest('.card') || (e.target as HTMLElement).closest('button')) return
    if (battleSelectedCard && (toZone !== battleSelectedCard.zone || toOwner !== battleSelectedCard.owner)) {
      actions.battleMove(battleSelectedCard.card.id, battleSelectedCard.zone, toZone, battleSelectedCard.owner, toOwner)
      setBattleSelectedCard(null)
    }
  }

  const allFaceDownIds = (() => {
    if (!battleViewForDisplay) return new Set<string>()
    const ids = new Set<string>()
    for (const id of battleViewForDisplay.your_zones.face_down_card_ids ?? []) ids.add(id)
    for (const id of battleViewForDisplay.opponent_zones.face_down_card_ids ?? []) ids.add(id)
    return ids
  })()

  const renderPhaseContent = (): ReactNode => {
    if ((currentPhase === "battle" || displayBattleResolution) && battleViewForDisplay) {
      return (
        <BattleSidebarContent
          currentBattle={battleViewForDisplay}
          selfUpgrades={getRevealedAppliedUpgrades(self_player.upgrades)}
          yourLife={battleViewForDisplay.your_life}
          opponentLife={battleViewForDisplay.opponent_life}
          onYourLifeChange={handleYourLifeChange}
          onOpponentLifeChange={handleOpponentLifeChange}
          playerName={self_player.name}
          onCreateTreasure={handleCreateTreasure}
          onUntapAll={handleUntapAll}
          onPassTurn={handlePassTurn}
          canManipulateOpponent={canManipulateOpponent}
          onCreateOpponentTreasure={handleCreateOpponentTreasure}
          onUntapOpponentAll={handleUntapOpponentAll}
          onPassOpponentTurn={handlePassTurn}
          voiceChat={!canManipulateOpponent && voiceTargetsAvailable ? {
            state: voiceChat.state,
            toggleSelfMute: voiceChat.toggleSelfMute,
            togglePeerMute: voiceChat.togglePeerMute,
          } : undefined}
          topSectionHeight={battleSidebarLayout?.topSectionHeight ?? null}
          middleLaneHeight={battleSidebarLayout?.middleLaneHeight ?? null}
          overlayTopInset={overlaySidebarPadding?.top ?? 0}
        />
      );
    }
    return null;
  };

  const serverNoticeHidden = !!serverNotice && dismissedServerNoticeAt === serverNotice.updated_at;

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
      <div className="game-table h-dvh overflow-hidden flex flex-col">
        {!isConnected && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="modal-chrome border gold-border rounded-lg shadow-xl px-5 py-3 flex items-center gap-3">
              <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm text-gray-100">Reconnecting...</span>
            </div>
          </div>
        )}
        {serverNotice && serverNotice.mode !== "normal" && (
          <ServerStatusWindow
            status={serverNotice}
            hidden={serverNoticeHidden}
            onDismiss={() => setDismissedServerNoticeAt(serverNotice.updated_at)}
            inGame
          />
        )}
        {/* Spectator Banner */}
        {isSpectator && spectatingPlayer && (
          <div className="bg-purple-900/80 text-purple-200 text-center py-2">
            Watching {spectatingPlayer}'s game (spectator mode)
          </div>
        )}
        <div ref={guideRootRef} className="relative flex flex-col flex-1 min-h-0">
        <GuideProvider
          gameId={gameId}
          playerId={session?.playerId}
          playerName={self_player.name}
          selfPhase={selfPhase}
          guideContext={guideContext!}
          isSpectator={isSpectator}
          hasOverlayOpen={
            rulesPanelOpen ||
            showUpgradesModal ||
            shareOpen ||
            actionMenuOpen ||
            shouldBlockGuidesForResolution ||
            activeBuildUpgradeAnimation !== null
          }
          closeGameplayOverlays={closeGameplayOverlays}
        >
        {/* Header - Phase Timeline aligned to the center lane between left rail and right sidebar */}
        <div ref={phaseTimelineRef} className="relative">
          <PhaseTimeline
            currentPhase={currentPhase}
            stage={self_player.stage}
            round={self_player.round}
            nextStage={isStageIncreasing ? self_player.stage + 1 : self_player.stage}
            nextRound={isStageIncreasing ? 1 : self_player.round + 1}
            useUpgrades={gameState.use_upgrades}
            headerClassName={phaseTimelineHeaderClassName}
            rightActionsClassName={phaseTimelineRightActionsClassName}
            onOpenRules={openRulesPanel}
            hamburger={usesOverlaySidebar ? (
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="btn btn-secondary text-xs sm:text-sm"
                data-guide-target="sidebar-toggle"
              >
                ☰
              </button>
            ) : undefined}
            title={isEndPhase ? (
              <span className={`font-bold ${isWinner ? 'text-amber-400' : 'text-gray-300'}`}>
                {getOrdinal(selfPlacement)} Place
              </span>
            ) : undefined}
          />
        </div>

        {/* Main content */}
        {(currentPhase === "battle" || displayBattleResolution) && battleViewForDisplay ? (
          <FaceDownProvider value={{ faceDownCardIds: allFaceDownIds }}>
          <GameDndProvider
            onCardMove={handleCardMove}
            validDropZones={getValidDropZones}
          >
            <div className="flex-1 flex min-h-0 game-surface">
              {shellMode === "mobile" && (
                <div className="w-[4px] shrink-0 frame-chrome" />
              )}
              <main className="flex-1 flex flex-col min-h-0 min-w-0" data-guide-target="game-content">
                <div className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col">
                  {usesOverlaySidebar && battleViewForDisplay && (
                    <div
                      ref={battleLifeRailRef}
                      className="shrink-0 flex items-center justify-between top-attached-rail-pad mobile-life-bar text-[11px] leading-tight"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-gray-300 truncate max-w-[60px] leading-tight">{battleViewForDisplay.opponent_name}</span>
                        {!canManipulateOpponent && voiceTargetsAvailable && (() => {
                          const oppPeer = voiceChat.state.peers.find(p => p.name === battleViewForDisplay.opponent_name)
                          return oppPeer ? (
                            <MicToggle
                              muted={voiceChat.state.mutedPeers.has(battleViewForDisplay.opponent_name)}
                              connectionState={oppPeer.connectionState}
                              audioLevelKey={battleViewForDisplay.opponent_name}
                              remoteMuted={voiceChat.state.remoteMutedPeers.has(battleViewForDisplay.opponent_name)}
                              onClick={() => voiceChat.togglePeerMute(battleViewForDisplay.opponent_name)}
                            />
                          ) : null
                        })()}
                        <div className="mobile-life-chip flex items-center gap-0.5 rounded px-1 py-px leading-none">
                          <button onClick={() => handleOpponentLifeChange(battleViewForDisplay.opponent_life - 1)} className="text-gray-400 hover:text-white px-1 leading-none">-</button>
                          <span className="text-white font-bold">{battleViewForDisplay.opponent_life}</span>
                          <button onClick={() => handleOpponentLifeChange(battleViewForDisplay.opponent_life + 1)} className="text-gray-400 hover:text-white px-1 leading-none">+</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 leading-tight">
                        <div className="text-center">
                          {battleViewForDisplay.current_turn_name === self_player.name ? (
                            <span className="text-green-400 font-medium">Your turn</span>
                          ) : (
                            <span className="text-amber-400 font-medium">Opp's turn</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="mobile-life-chip flex items-center gap-0.5 rounded px-1 py-px leading-none">
                          <button onClick={() => handleYourLifeChange(battleViewForDisplay.your_life - 1)} className="text-gray-400 hover:text-white px-1 leading-none">-</button>
                          <span className="text-white font-bold">{battleViewForDisplay.your_life}</span>
                          <button onClick={() => handleYourLifeChange(battleViewForDisplay.your_life + 1)} className="text-gray-400 hover:text-white px-1 leading-none">+</button>
                        </div>
                        {!canManipulateOpponent && voiceTargetsAvailable && voiceChat.state.peers.length > 0 && (
                          <MicToggle
                            muted={voiceChat.state.isMuted}
                            audioLevelKey="__self__"
                            onClick={() => voiceChat.toggleSelfMute()}
                          />
                        )}
                        <span className="text-gray-300 truncate max-w-[60px] leading-tight">{self_player.name}</span>
                      </div>
                    </div>
                  )}
                  {usesOverlaySidebar && battleViewForDisplay && (
                    <ZoneDivider
                      orientation="horizontal"
                      interactive={false}
                      {...STATIC_DIVIDER_CALLBACKS}
                    />
                  )}
                    <BattlePhase
                      gameState={gameState}
                      battleOverride={displayBattleResolution ? battleViewForDisplay : undefined}
                      actions={actions}
                      onRevealHiddenUpgrades={openBattleRevealUpgradesModal}
                      isMobile={sizes.isMobile}
                      selectedCard={battleSelectedCard}
                      onSelectedCardChange={setBattleSelectedCard}
                      onCardHover={handleCardHover}
                      onOpponentCardHover={handleOpponentCardHover}
                      onCardHoverEnd={handleCardHoverEnd}
                      activeZoneModal={activeBattleZoneModal}
                      onZoneModalOpenChange={setBattleZoneModalOpen}
                      onLayoutMetricsChange={setBattleSidebarLayout}
                    />
                    {displayBattleResolution && activeBattleResolution && (
                      <BattleResolutionOverlay
                        battle={battleViewForDisplay}
                        resolution={activeBattleResolution}
                        onComplete={() => {
                          setActiveBattleResolutionId(null)
                          setCachedBattleForResolution(null)
                        }}
                      />
                    )}
                  </div>
              </main>
              {usesOverlaySidebar ? (
                <>
                  {overlaySidebarOpen && (
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
                  )}
                  <div className={`fixed inset-y-0 right-0 z-50 w-[var(--sidebar-width)] border-l border-[var(--gold-border-opaque)] transition-transform duration-300 ${overlaySidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <Sidebar
                      players={gameState.players}
                      currentPlayer={self_player}
                      phaseContent={renderPhaseContent()}
                      useUpgrades={gameState.use_upgrades}
                      isMobile
                      renderMicToggle={renderMicToggle}
                    />
                  </div>
                </>
              ) : (
                <Sidebar
                  players={gameState.players}
                  currentPlayer={self_player}
                  phaseContent={renderPhaseContent()}
                  useUpgrades={gameState.use_upgrades}
                  renderMicToggle={renderMicToggle}
                />
              )}
              {shellMode === "mobile" && (
                <div className="w-[4px] shrink-0 frame-chrome" />
              )}
              {isSmallShell && (
                <div className="w-10 shrink-0 frame-chrome" />
              )}
            </div>
            {activeDndPanel === 'sideboard' && current_battle && (
              <div onClick={(e) => handlePanelClickToMove(e, 'sideboard', 'player')}>
                <DndPanel
                  title="Your Sideboard"
                  count={current_battle.your_zones.sideboard.length}
                  onClose={() => setActiveDndPanel(null)}
                  tone="battle"
                  zone="sideboard"
                  zoneOwner="player"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
                >
                  {(dims) =>
                    current_battle.your_zones.sideboard.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        zone="sideboard"
                        dimensions={dims}
                        onCardHover={handleCardHover}
                        onCardHoverEnd={handleCardHoverEnd}
                        selected={battleSelectedCard?.card.id === card.id}
                        onClick={() => setBattleSelectedCard({ card, zone: 'sideboard', owner: 'player' })}
                        upgraded={battleUpgradedCardIds.has(card.id)}
                        appliedUpgrades={battleUpgradesByCardId.get(card.id)}
                        hiddenUpgradeCount={(battleHiddenUpgradesByCardId.get(card.id) ?? []).length}
                        onRevealHiddenUpgrades={() => openBattleRevealUpgradesModal(
                          (battleHiddenUpgradesByCardId.get(card.id) ?? []).map((upgrade) => upgrade.id),
                        )}
                      />
                    ))
                  }
                </DndPanel>
              </div>
            )}
            {activeDndPanel === 'opponentSideboard' && current_battle && current_battle.opponent_full_sideboard && (
              <div onClick={(e) => handlePanelClickToMove(e, 'sideboard', 'opponent')}>
                <DndPanel
                  title={`${current_battle.opponent_name}'s Sideboard`}
                  count={current_battle.opponent_full_sideboard.length}
                  onClose={() => setActiveDndPanel(null)}
                  tone="battle"
                  zone="sideboard"
                  zoneOwner="opponent"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
                >
                  {(dims) =>
                    current_battle.opponent_full_sideboard!.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        zone="sideboard"
                        zoneOwner="opponent"
                        dimensions={dims}
                        isOpponent
                        onCardHover={handleOpponentCardHover}
                        onCardHoverEnd={handleCardHoverEnd}
                        selected={battleSelectedCard?.card.id === card.id}
                        onClick={() => setBattleSelectedCard({ card, zone: 'sideboard', owner: 'opponent' })}
                        upgraded={opponentBattleUpgradedCardIds.has(card.id)}
                        appliedUpgrades={opponentBattleUpgradesByCardId.get(card.id)}
                      />
                    ))
                  }
                </DndPanel>
              </div>
            )}
            {activeDndPanel === 'graveyard' && current_battle && (
              <div onClick={(e) => handlePanelClickToMove(e, 'graveyard', 'player')}>
                <DndPanel
                  title="Graveyard"
                  count={current_battle.your_zones.graveyard.length}
                  onClose={() => setActiveDndPanel(null)}
                  tone="battle"
                  zone="graveyard"
                  zoneOwner="player"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
                >
                  {(dims) =>
                    current_battle.your_zones.graveyard.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        zone="graveyard"
                        dimensions={dims}
                        onCardHover={handleCardHover}
                        onCardHoverEnd={handleCardHoverEnd}
                        selected={battleSelectedCard?.card.id === card.id}
                        onClick={() => setBattleSelectedCard({ card, zone: 'graveyard', owner: 'player' })}
                        upgraded={battleUpgradedCardIds.has(card.id)}
                        appliedUpgrades={battleUpgradesByCardId.get(card.id)}
                        hiddenUpgradeCount={(battleHiddenUpgradesByCardId.get(card.id) ?? []).length}
                        onRevealHiddenUpgrades={() => openBattleRevealUpgradesModal(
                          (battleHiddenUpgradesByCardId.get(card.id) ?? []).map((upgrade) => upgrade.id),
                        )}
                      />
                    ))
                  }
                </DndPanel>
              </div>
            )}
            {activeDndPanel === 'exile' && current_battle && (
              <div onClick={(e) => handlePanelClickToMove(e, 'exile', 'player')}>
                <DndPanel
                  title="Exile"
                  count={current_battle.your_zones.exile.length}
                  onClose={() => setActiveDndPanel(null)}
                  tone="battle"
                  zone="exile"
                  zoneOwner="player"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
                >
                  {(dims) =>
                    current_battle.your_zones.exile.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        zone="exile"
                        dimensions={dims}
                        onCardHover={handleCardHover}
                        onCardHoverEnd={handleCardHoverEnd}
                        selected={battleSelectedCard?.card.id === card.id}
                        onClick={() => setBattleSelectedCard({ card, zone: 'exile', owner: 'player' })}
                        upgraded={battleUpgradedCardIds.has(card.id)}
                        appliedUpgrades={battleUpgradesByCardId.get(card.id)}
                        hiddenUpgradeCount={(battleHiddenUpgradesByCardId.get(card.id) ?? []).length}
                        onRevealHiddenUpgrades={() => openBattleRevealUpgradesModal(
                          (battleHiddenUpgradesByCardId.get(card.id) ?? []).map((upgrade) => upgrade.id),
                        )}
                      />
                    ))
                  }
                </DndPanel>
              </div>
            )}
          </GameDndProvider>
          </FaceDownProvider>
        ) : (
          <div className="flex-1 flex min-h-0 game-surface">
            {shellMode === "mobile" && (
              <div className="w-[4px] shrink-0 frame-chrome" />
            )}
            <main className="flex-1 flex flex-col min-h-0 min-w-0" data-guide-target="game-content">
              {currentPhase === "draft" && (
                <DraftPhase
                  gameState={gameState}
                  actions={actions}
                  isMobile={sizes.isMobile}
                  showDesktopUpgradeRail={shellMode === "big"}
                />
              )}
              {currentPhase === "build" && (
                <BuildPhase
                  gameState={gameState}
                  actions={actions}
                  selectedBasics={selectedBasics}
                  onBasicsChange={setSelectedBasics}
                  onHandSlotsChange={(slots) => { handSlotsRef.current = slots; }}
                  onCardHover={handleCardHover}
                  onCardHoverEnd={handleCardHoverEnd}
                  onQuickUpgrade={(targetCardId) =>
                    openBuildApplyUpgradeModal({ targetCardId })
                  }
                  onQuickApplyUpgrade={(upgradeId) =>
                    openBuildApplyUpgradeModal({ upgradeId })
                  }
                  isMobile={sizes.isMobile}
                  showDesktopUpgradeRail={shellMode === "big"}
                />
              )}
              {currentPhase === "reward" && (
                <RewardPhase
                  gameState={gameState}
                  actions={actions}
                  selectedUpgradeId={selectedUpgradeId}
                  onUpgradeSelect={setSelectedUpgradeId}
                  selectedPoolCardId={selectedPoolCardId}
                  onPoolCardSelect={setSelectedPoolCardId}
                  isMobile={sizes.isMobile}
                />
              )}
              {currentPhase === "awaiting_elimination" && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <h2 className="text-2xl text-red-400 mb-4">
                      You Have Been Eliminated
                    </h2>
                    <p className="text-gray-300 mb-6">
                      Waiting until all battles are complete to determine if you
                      will compete in sudden death to stay alive.
                    </p>
                    <div className="bg-black/40 rounded-lg p-4 text-left">
                      <h3 className="text-amber-400 font-medium mb-2">
                        Sudden Death Rules
                      </h3>
                      <ul className="text-gray-400 text-sm space-y-1">
                        <li>
                          Triggers when 2+ players eliminated with fewer than 2
                          survivors
                        </li>
                        <li>
                          2 players with lowest poison fight (ties broken
                          randomly)
                        </li>
                        <li>Other eliminated players are out immediately</li>
                        <li>Poison resets to 9 for the sudden death battle</li>
                        <li>Winner survives, loser is eliminated</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {(currentPhase === "eliminated" ||
                currentPhase === "winner" ||
                currentPhase === "game_over") && (
                <GameSummary
                  player={self_player}
                  useUpgrades={gameState.use_upgrades}
                  enableResize
                  isMobile={sizes.isMobile}
                  layoutStateKey={`${currentPhase}:${self_player.stage}:${self_player.round}`}
                  showLayoutReset
                />
              )}
            </main>
            {usesOverlaySidebar ? (
              <>
                {overlaySidebarOpen && (
                  <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
                )}
                <div className={`fixed inset-y-0 right-0 z-50 w-[var(--sidebar-width)] border-l border-[var(--gold-border-opaque)] transition-transform duration-300 ${overlaySidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                  <Sidebar
                    players={gameState.players}
                    currentPlayer={self_player}
                    phaseContent={renderPhaseContent()}
                    useUpgrades={gameState.use_upgrades}
                    isMobile
                    renderMicToggle={renderMicToggle}
                  />
                </div>
              </>
            ) : (
              <Sidebar
                players={gameState.players}
                currentPlayer={self_player}
                phaseContent={renderPhaseContent()}
                useUpgrades={gameState.use_upgrades}
                renderMicToggle={renderMicToggle}
              />
            )}
            {shellMode === "mobile" && (
              <div className="w-[4px] shrink-0 frame-chrome" />
            )}
            {isSmallShell && (
              <div className="w-10 shrink-0 frame-chrome" />
            )}
          </div>
        )}
        {/* Bottom Action Bar */}
        {!isSpectator && (
          <div ref={actionBarRef} className="shrink-0 relative frame-chrome z-40">
            <div
              className={`flex items-center justify-between gap-1.5 sm:gap-2 py-1.5 ${actionBarPaddingClass} timeline-actions`}
              data-guide-target="phase-action-bar"
            >
              {isEndPhase && gameId ? (
                <>
                  <div className="flex items-center gap-1.5 sm:gap-2 py-1">
                    <button
                      className="btn bg-slate-700 hover:bg-slate-600 text-white"
                      onClick={() =>
                        window.open(shareUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      Review
                    </button>
                    <button
                      className="btn bg-purple-600 hover:bg-purple-500 text-white"
                      onClick={openShareModal}
                    >
                      Share Game
                    </button>
                  </div>
                  <div />
                </>
              ) : renderActionButtons()}
            </div>
          </div>
        )}
        {!isSpectator && (
          <GameGuideLayer
            rootRef={guideRootRef}
            context={guideContext!}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            guideCompletionTrigger={guideCompletionTrigger}
            onVisibleGuideStepChange={setVisibleGuideStep}
          />
        )}
        </GuideProvider>
        </div>
      </div>
      {state.previewCard && (
        <CardPreviewModal
          card={state.previewCard}
          appliedUpgrades={state.previewAppliedUpgrades}
          onClose={() => setPreviewCard(null)}
        />
      )}
      {actionMenuOpen && currentPhase === "battle" && current_battle && (
        <ActionMenu
          selectedCard={battleSelectedCard}
          battle={current_battle}
          playerName={self_player.name}
          sideboardCount={current_battle.your_zones.sideboard.length}
          opponentSideboardCount={current_battle.opponent_full_sideboard?.length ?? 0}
          onAction={(action, cardId, data) => actions.battleUpdateCardState(action, cardId, data)}
          onMove={(cardId, fromZone, toZone, fromOwner, toOwner) => actions.battleMove(cardId, fromZone, toZone, fromOwner, toOwner)}
          onUntapAll={handleUntapAll}
          onUntapOpponentAll={handleUntapOpponentAll}
          onShowSideboard={() => toggleBattlePanel('sideboard')}
          onShowOpponentSideboard={() => toggleBattlePanel('opponentSideboard')}
          onCreateTreasure={handleCreateTreasure}
          onDrawLibrary={handleDrawLibrary}
          onShuffleLibrary={handleShuffleLibrary}
          onDrawOpponentLibrary={handleDrawOpponentLibrary}
          onShuffleOpponentLibrary={handleShuffleOpponentLibrary}
          onPassTurn={handlePassTurn}
          onRollDie={handleRollDie}
          onClose={() => setActionMenuOpen(false)}
        />
      )}
      {pendingSpectateRequest && (
        <SpectateRequestModal
          spectatorName={pendingSpectateRequest.spectator_name}
          requestId={pendingSpectateRequest.request_id}
          onRespond={actions.spectateResponse}
        />
      )}
      {showUpgradesModal && (
        <UpgradesModal
          upgrades={self_player.upgrades}
          mode={upgradesModalMode}
          targets={[...self_player.hand, ...self_player.sideboard]}
          onApply={(upgradeId, targetId) => {
            setPendingBuildUpgradeAnimation({ upgradeId, targetId });
            actions.buildApplyUpgrade(upgradeId, targetId);
          }}
          onReveal={(upgradeIds) => {
            upgradeIds.forEach((upgradeId) => {
              actions.battleRevealUpgrade(upgradeId);
            });
          }}
          onClose={closeUpgradesModal}
          initialTargetId={upgradeInitialTargetId}
          initialUpgradeId={upgradeInitialId}
          initialRevealUpgradeIds={upgradeInitialRevealIds}
        />
      )}
      {pendingBattleResult && (
        <RevealBeforeSubmitModal
          upgrades={getUnrevealedAppliedUpgrades(self_player.upgrades)}
          onRevealAndSubmit={handleRevealAndSubmit}
          onSkip={handleSkipAndSubmit}
          onClose={() => setPendingBattleResult(null)}
        />
      )}
      {activeBuildUpgradeAnimation && (
        <BuildUpgradeOverlay
          upgrade={activeBuildUpgradeAnimation.upgrade}
          target={activeBuildUpgradeAnimation.target}
          onComplete={() => setActiveBuildUpgradeAnimation(null)}
        />
      )}
      {activeRevealAnimation && (
        <BattleRevealOverlay
          upgrade={activeRevealAnimation.upgrade}
          target={activeRevealAnimation.target}
          playerName={activeRevealAnimation.player_name}
          selfName={self_player.name}
          onComplete={() => {
            setActiveRevealAnimation(null);
            if (pendingPostRevealSubmit) {
              actions.battleSubmitResult(pendingPostRevealSubmit);
              setPendingPostRevealSubmit(null);
            }
          }}
        />
      )}
      {shareOpen && (
        <ShareModal url={shareUrl} shareText={shareText} onClose={() => setShareOpen(false)} />
      )}
      {rulesPanelOpen && (
        <RulesPanel
          onClose={() => setRulesPanelOpen(false)}
          initialDocId={rulesPanelTarget?.docId}
          initialTab={rulesPanelTarget?.tab}
          gameId={gameId}
          playerName={gameState?.self_player.name}
          useUpgrades={gameState.use_upgrades}
        />
      )}
    </CardPreviewContext.Provider>
  );
}

export function Game() {
  return (
    <ContextStripProvider>
      <GameContent />
    </ContextStripProvider>
  );
}

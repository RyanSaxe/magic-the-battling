import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import {
  rejoinGame,
  getGameStatus,
  createSpectateRequest,
  getSpectateRequestStatus,
} from "../api/client";
import type { GameStatusResponse, PlayerView, ZoneName } from "../types";
import { DraftPhase } from "./phases/Draft";
import { BuildPhase } from "./phases/Build";
import { BattlePhase, type BattleSelectedCard, type BattleZoneModalState } from "./phases/Battle";
import { RewardPhase } from "./phases/Reward";
import { Sidebar } from "../components/sidebar";
import { BattleSidebarContent } from "../components/sidebar/BattleSidebarContent";
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
import { UpgradesModal } from "../components/common/UpgradesModal";
import { DndPanel } from "../components/common/DndPanel";
import { SubmitPopover } from "../components/common/SubmitPopover";
import { ZoneDivider } from "../components/common/ZoneDivider";
import { useHotkeys } from "../hooks/useHotkeys";
import { shouldClearSessionOnInvalidEvent } from "../utils/sessionRecovery";
import type { Phase } from "../constants/phases";
import type {
  GuidedWalkthroughContext,
  SidebarGuideTab,
} from "../guided/types";
import {
  getRememberedPlayerForGame,
  pickAutoReconnectPlayer,
  rememberPlayerForGame,
} from "../utils/deviceIdentity";

interface SpectatorConfig {
  spectatePlayer: string;
  requestId: string;
}

const SCHEDULED_UTC_RE = /scheduled for (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC/i;
const TOP_NOTICE_Z_INDEX = 2147483647;
const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

type ActiveDndPanel = "sideboard" | "opponentSideboard" | "graveyard" | "exile" | null;
type BattleZoneModal = BattleZoneModalState | null;
type OverlayKey =
  | "rules"
  | "upgrades"
  | "actionMenu"
  | "share"
  | "buildSubmit"
  | "battleSubmit"
  | "battlePanel"
  | "battleZoneModal";

function scheduledEasternFromNotice(message: string): string | null {
  const match = SCHEDULED_UTC_RE.exec(message);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const asDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  );
  if (Number.isNaN(asDate.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(asDate);
}

function drainingMessageWithEasternTime(message: string, easternTime: string | null): string {
  if (!message) return "";
  if (!easternTime) return message;
  return message.replace(SCHEDULED_UTC_RE, `scheduled for ${easternTime}`);
}

function isTimelinePhase(phase: string | undefined): phase is Phase {
  return phase === "draft" || phase === "build" || phase === "battle" || phase === "reward";
}

function sortPlayersForSidebar(a: PlayerView, b: PlayerView): number {
  if (a.placement === 0 && b.placement === 0) {
    const poisonDiff = a.poison - b.poison;
    if (poisonDiff !== 0) return poisonDiff;
    return a.name.localeCompare(b.name);
  }
  if (a.placement === 0) return -1;
  if (b.placement === 0) return 1;
  if (a.placement !== b.placement) return a.placement - b.placement;
  return a.name.localeCompare(b.name);
}

function selectDraftGuideOpponent(
  players: PlayerView[],
  currentPlayerName: string,
): {
  name: string | null;
  tab: SidebarGuideTab;
  revealedCount: number;
} {
  const nonSelfPlayers = players.filter((player) => player.name !== currentPlayerName);
  const showOthersTab = players.length > 4;
  const opponents = showOthersTab
    ? nonSelfPlayers.filter(
        (player) => player.pairing_probability !== null && player.pairing_probability > 0,
      )
    : nonSelfPlayers;
  const fallbackPool = opponents.length > 0 ? opponents : nonSelfPlayers;
  const tab: SidebarGuideTab =
    opponents.length > 0 ? "opponents" : showOthersTab ? "others" : "opponents";

  const bestOpponent = [...fallbackPool].sort((a, b) => {
    const revealedDiff =
      b.most_recently_revealed_cards.length - a.most_recently_revealed_cards.length;
    if (revealedDiff !== 0) return revealedDiff;
    const pairingDiff = (b.pairing_probability ?? -1) - (a.pairing_probability ?? -1);
    if (pairingDiff !== 0) return pairingDiff;
    return sortPlayersForSidebar(a, b);
  })[0] ?? null;

  return {
    name: bestOpponent?.name ?? null,
    tab,
    revealedCount: bestOpponent?.most_recently_revealed_cards.length ?? 0,
  };
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

  useEffect(() => {
    const fetchStatus = () => {
      getGameStatus(gameId).then(setStatus).catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);
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
          setError(err instanceof Error ? err.message : "Failed to reconnect");
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
      setError(err instanceof Error ? err.message : "Failed to send watch request");
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
        setError(err instanceof Error ? err.message : "Failed to check request status");
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
      setError(err instanceof Error ? err.message : "Failed to start spectating");
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
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  context: GuidedWalkthroughContext;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const { state, setRevealedPlayerName, setRevealedPlayerTab } = useContextStrip();
  const { guideRequest, finishGuide, skipTutorial, updateGuideStep } = useGuideContext();
  const [activeStepState, setActiveStepState] = useState<{
    nonce: number | null;
    stepIndex: number;
  }>({
    nonce: guideRequest?.nonce ?? null,
    stepIndex: guideRequest?.stepIndex ?? 0,
  });
  const sidebarRestoreRef = useRef<{
    sidebarOpen: boolean;
    revealedPlayerName: string | null;
    revealedPlayerTab: SidebarGuideTab;
  } | null>(null);
  const activeStepIndex =
    guideRequest && activeStepState.nonce === guideRequest.nonce
      ? activeStepState.stepIndex
      : (guideRequest?.stepIndex ?? 0);

  const guide = useMemo(
    () => (guideRequest ? buildGuideDefinition(guideRequest.guideId, context) : null),
    [context, guideRequest],
  );
  const activeStep = guide?.steps[activeStepIndex] ?? null;

  const restoreSidebarState = useCallback(() => {
    const snapshot = sidebarRestoreRef.current;
    if (!snapshot) {
      return;
    }

    sidebarRestoreRef.current = null;
    if (context.isMobile && sidebarOpen !== snapshot.sidebarOpen) {
      setSidebarOpen(snapshot.sidebarOpen);
    }
    if (state.revealedPlayerTab !== snapshot.revealedPlayerTab) {
      setRevealedPlayerTab(snapshot.revealedPlayerTab);
    }
    if (state.revealedPlayerName !== snapshot.revealedPlayerName) {
      setRevealedPlayerName(snapshot.revealedPlayerName);
    }
  }, [
    context.isMobile,
    setRevealedPlayerName,
    setRevealedPlayerTab,
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
      tab: resolveValue(sidebarState.tab),
      playerName: resolveValue(sidebarState.playerName),
    };
  }, [activeStep?.sidebarState, context]);

  useEffect(() => {
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

    if (context.isMobile && resolvedSidebarState.openOnMobile && !sidebarOpen) {
      setSidebarOpen(true);
    }
    if (resolvedSidebarState.tab && state.revealedPlayerTab !== resolvedSidebarState.tab) {
      setRevealedPlayerTab(resolvedSidebarState.tab);
    }
    if (
      resolvedSidebarState.playerName !== undefined
      && state.revealedPlayerName !== resolvedSidebarState.playerName
    ) {
      setRevealedPlayerName(resolvedSidebarState.playerName);
    }
  }, [
    context.isMobile,
    guideRequest,
    resolvedSidebarState,
    restoreSidebarState,
    setRevealedPlayerName,
    setRevealedPlayerTab,
    setSidebarOpen,
    sidebarOpen,
    state.revealedPlayerName,
    state.revealedPlayerTab,
  ]);

  useEffect(() => restoreSidebarState, [restoreSidebarState]);

  if (!guideRequest) return null;
  return (
    <GuidedWalkthrough
      key={guideRequest.nonce}
      rootRef={rootRef}
      request={guideRequest}
      context={context}
      onClose={finishGuide}
      onSkipAll={skipTutorial}
      onStepChange={(guideId, stepIndex) => {
        setActiveStepState({
          nonce: guideRequest.nonce,
          stepIndex,
        });
        updateGuideStep(guideId, stepIndex);
      }}
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSpectateMode = searchParams.get("spectate") === "true";
  const { addToast } = useToast();
  const buildReadyPendingRef = useRef(false);
  const [buildReadyPending, setBuildReadyPending] = useState(false);
  const handleServerError = useCallback((message: string) => {
    if (buildReadyPendingRef.current) {
      buildReadyPendingRef.current = false;
      setBuildReadyPending(false);
    }
    addToast(message, "error");
  }, [addToast]);

  const { gameState, isConnected, actions, pendingSpectateRequest, serverNotice, invalidSession } = useGame(
    gameId ?? null,
    isSpectateMode ? null : session?.sessionId ?? null,
    spectatorConfig,
    handleServerError,
  );
  const { state, setPreviewCard } = useContextStrip();

  const isSpectator = !!spectatorConfig;
  const wasInvalidSessionRef = useRef(false);
  const guideRootRef = useRef<HTMLDivElement>(null);
  const selfPhase = gameState?.self_player.phase;
  const canManipulateOpponent = gameState?.current_battle?.can_manipulate_opponent ?? false;

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
  type UpgradesModalOpenMode = 'auto' | 'view';
  const [selectedBasics, setSelectedBasics] = useState<string[]>([]);
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [upgradesModalOpenMode, setUpgradesModalOpenMode] =
    useState<UpgradesModalOpenMode>('auto');
  const [upgradeInitialTargetId, setUpgradeInitialTargetId] = useState<string | undefined>(undefined);
  const handSlotsRef = useRef<(string | null)[]>([]);

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
  const [dismissedServerNoticeAt, setDismissedServerNoticeAt] = useState<string | null>(null);

  const prevPhaseRef = useRef(gameState?.self_player.phase);
  if (gameState?.self_player.phase !== prevPhaseRef.current) {
    prevPhaseRef.current = gameState?.self_player.phase;
    if (gameState?.self_player.phase !== 'battle' && battleSelectedCard !== null) {
      setBattleSelectedCard(null);
    }
  }

  useEffect(() => {
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
  }, [selfPhase]);

  // Rules panel state
  const [rulesPanelOpen, setRulesPanelOpen] = useState(false);
  const [rulesPanelTarget, setRulesPanelTarget] = useState<RulesPanelTarget | undefined>(undefined);

  // Share modal state (game-over header)
  const [shareOpen, setShareOpen] = useState(false);

  // Hover tracking for hotkeys
  const [hoveredCard, setHoveredCard] = useState<{ id: string; zone: ZoneName; owner: 'player' | 'opponent' } | null>(null);
  const handleCardHover = (cardId: string, zone: ZoneName) => {
    setHoveredCard({ id: cardId, zone, owner: 'player' });
  };
  const handleOpponentCardHover = (cardId: string, zone: ZoneName) => {
    setHoveredCard({ id: cardId, zone, owner: 'opponent' });
  };
  const handleCardHoverEnd = () => setHoveredCard(null);

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

  const openRulesPanel = useCallback((target?: RulesPanelTarget) => {
    closeGameplayOverlays("rules");
    setRulesPanelTarget(target);
    setRulesPanelOpen(true);
  }, [closeGameplayOverlays]);

  const openUpgradesModal = useCallback((
    targetCardId?: string,
    mode: UpgradesModalOpenMode = 'auto',
  ) => {
    closeGameplayOverlays("upgrades");
    setUpgradeInitialTargetId(targetCardId);
    setUpgradesModalOpenMode(mode);
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
    closeGameplayOverlays();
    actions.buildReady(
      selectedBasics,
      playDrawPreference,
      handSlotsRef.current.filter((id): id is string => id !== null),
    );
  }, [actions, closeGameplayOverlays, gameState, selectedBasics]);

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

  const toggleBattleZoneModal = useCallback((
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
  ) => {
    const isSameModal =
      activeBattleZoneModal?.zone === zone &&
      activeBattleZoneModal.owner === owner;
    if (isSameModal) {
      setActiveBattleZoneModal(null);
      return;
    }
    closeGameplayOverlays("battleZoneModal");
    setActiveBattleZoneModal({ zone, owner });
  }, [activeBattleZoneModal, closeGameplayOverlays]);

  const openShareModal = useCallback(() => {
    closeGameplayOverlays("share");
    setShareOpen(true);
  }, [closeGameplayOverlays]);

  // Hotkeys — must be before early returns to satisfy rules-of-hooks
  const modalOpen =
    rulesPanelOpen ||
    showUpgradesModal ||
    actionMenuOpen ||
    activeDndPanel !== null ||
    activeBattleZoneModal !== null ||
    shareOpen;
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
    if (!gameState || isSpectator || modalOpen) return map;

    const { self_player: sp, current_battle: cb } = gameState;
    const phase = sp.phase;

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
          actions.battleSubmitResult(sp.name);
          setIsChangingResult(false);
          setShowSubmitResultPopover(false);
        };
        map['d'] = () => {
          actions.battleSubmitResult("draw");
          setIsChangingResult(false);
          setShowSubmitResultPopover(false);
        };
        map['l'] = () => {
          actions.battleSubmitResult(cb.opponent_name);
          setIsChangingResult(false);
          setShowSubmitResultPopover(false);
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
            if (hoveredCard.owner === 'opponent' && !cb.can_manipulate_opponent) return;
            const ownerZones = hoveredCard.owner === 'player' ? cb.your_zones : cb.opponent_zones;
            const isFaceDown = ownerZones.face_down_card_ids?.includes(hoveredCard.id);
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
          const moveZones = { g: 'graveyard', h: 'hand', b: 'battlefield', e: 'exile', l: 'command_zone' } as const;
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
          actions.rewardDone(selectedUpgradeId ?? undefined);
          setSelectedUpgradeId(null);
          setSelectedPoolCardId(null);
        }
      };
    }

    return map;
  })();

  useHotkeys(hotkeyMap, !modalOpen);

  if (!session || isSpectateMode) {
    return (
      <PlayerSelectionModal
        gameId={gameId!}
        onSessionCreated={handleSessionCreated}
      />
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

  const { self_player, current_battle } = gameState;

  const isEndPhase = currentPhase === "eliminated" || currentPhase === "winner" || currentPhase === "game_over";
  const selfPlacement = gameState.players.find(p => p.name === self_player.name)?.placement ?? 0;
  const isWinner = selfPlacement === 1;

  const shareUrl = gameId
    ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(self_player.name)}`
    : '';
  const shareText = isWinner
    ? 'Just won a game of Magic: The Battling! Check out the game:'
    : `Just finished ${getOrdinal(selfPlacement)} in Magic: The Battling! Check out the game:`;

  const maxHandSize = self_player.hand_size;
  const handFull = self_player.hand.length === maxHandSize;
  const basicsComplete = selectedBasics.filter(Boolean).length === 3;
  const canReady = basicsComplete && handFull;

  const isStageIncreasing = self_player.is_stage_increasing;
  const needsUpgrade =
    isStageIncreasing && gameState.available_upgrades.length > 0;
  const canContinue = !needsUpgrade || !!selectedUpgradeId;
  const draftGuideOpponent = selectDraftGuideOpponent(
    gameState.players,
    self_player.name,
  );
  const hasPendingBuildUpgrades =
    currentPhase === "build" && self_player.upgrades.some((u) => !u.upgrade_target);
  const upgradesModalMode: "view" | "apply" =
    upgradesModalOpenMode === "view"
      ? "view"
      : hasPendingBuildUpgrades
        ? "apply"
        : "view";

  const guideContext: GuidedWalkthroughContext = {
    currentPhase: isTimelinePhase(currentPhase) ? currentPhase : null,
    selfPlayer: self_player,
    currentBattle: current_battle,
    isMobile: sizes.isMobile,
    sidebarOpen,
    revealedPlayerName: state.revealedPlayerName,
    revealedPlayerTab: state.revealedPlayerTab,
    useUpgrades: gameState.use_upgrades,
    hasRewardUpgradeChoice: needsUpgrade,
    showBuildSubmitPopover: showSubmitHandPopover,
    availableRewardUpgrades: gameState.available_upgrades,
    draftGuideOpponentName: draftGuideOpponent.name,
    draftGuideOpponentTab: draftGuideOpponent.tab,
    draftGuideOpponentRevealedCount: draftGuideOpponent.revealedCount,
    isStageEnd: self_player.is_stage_increasing,
  };

  const handleContinue = () => {
    actions.rewardDone(selectedUpgradeId ?? undefined);
    setSelectedUpgradeId(null);
    setSelectedPoolCardId(null);
  };

  const renderActionButtons = (): ReactNode => {
    if (isSpectator) {
      return null;
    }

    let left: ReactNode = null;
    let right: ReactNode = null;

    if (currentPhase === "eliminated") {
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
    } else if (currentPhase === "draft") {
      left = (
        <div className="flex items-center gap-1.5 sm:gap-2">
          {self_player.upgrades.length > 0 && (
            <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn bg-gray-600 hover:bg-gray-500 text-white">
              View Upgrades
            </button>
          )}
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
        </div>
      );
      right = (
        <button onClick={actions.draftDone} className="btn btn-primary">
          Go to Build
        </button>
      );
    } else if (currentPhase === "build") {
      if (self_player.build_ready) {
        left = self_player.upgrades.length > 0 ? (
          <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn bg-gray-600 hover:bg-gray-500 text-white">
            View Upgrades
          </button>
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
          <button
            onClick={() => openUpgradesModal(undefined, 'view')}
            className="btn bg-gray-600 hover:bg-gray-500 text-white"
          >
            View Upgrades
          </button>
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
                closeOnOutsideClick={false}
              />
            )}
          </div>
        );
      }
    } else if (currentPhase === "battle") {
      if (!current_battle) return null;
      const { opponent_name, result_submissions } = current_battle;
      const mySubmission = result_submissions[self_player.name];
      const opponentSubmission = result_submissions[opponent_name];

      left = (
        <button
          onClick={openActionMenu}
          className="btn btn-secondary"
          data-guide-target="battle-actions"
        >
          Actions
        </button>
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
                      actions.battleSubmitResult(self_player.name);
                      setIsChangingResult(false);
                      setShowSubmitResultPopover(false);
                    },
                    className: "btn bg-green-600 hover:bg-green-500 text-white text-sm py-1.5",
                  },
                  {
                    label: "Draw",
                    onClick: () => {
                      actions.battleSubmitResult("draw");
                      setIsChangingResult(false);
                      setShowSubmitResultPopover(false);
                    },
                    className: "btn btn-danger text-sm py-1.5",
                  },
                  {
                    label: "I Lost",
                    onClick: () => {
                      actions.battleSubmitResult(opponent_name);
                      setIsChangingResult(false);
                      setShowSubmitResultPopover(false);
                    },
                    className: "btn btn-danger text-sm py-1.5",
                  },
                ]}
                onClose={() => setShowSubmitResultPopover(false)}
                guideTarget="battle-submit-popover"
              />
            )}
          </div>
        );
      }
    } else if (currentPhase === "reward") {
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
    if (!current_battle) return new Set<string>()
    const ids = new Set<string>()
    for (const id of current_battle.your_zones.face_down_card_ids ?? []) ids.add(id)
    for (const id of current_battle.opponent_zones.face_down_card_ids ?? []) ids.add(id)
    return ids
  })()

  const renderPhaseContent = (): ReactNode => {
    if (currentPhase === "battle" && current_battle) {
      return (
        <BattleSidebarContent
          currentBattle={current_battle}
          selfUpgrades={self_player.upgrades}
          yourLife={current_battle.your_life}
          opponentLife={current_battle.opponent_life}
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
        />
      );
    }
    return null;
  };

  const serverNoticeHidden = !!serverNotice && dismissedServerNoticeAt === serverNotice.updated_at;
  const drainingScheduledEt = serverNotice?.mode === "draining"
    ? scheduledEasternFromNotice(serverNotice.message || "")
    : null;
  const drainingMessage = serverNotice?.mode === "draining"
    ? drainingMessageWithEasternTime(serverNotice.message || "", drainingScheduledEt)
    : "";
  const recoveryHint = serverNotice?.estimated_recovery_minutes
    ? `Estimated recovery: about ${serverNotice.estimated_recovery_minutes} minute${serverNotice.estimated_recovery_minutes === 1 ? "" : "s"}.`
    : null;

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
        {serverNotice && serverNotice.mode !== "normal" && serverNoticeHidden && (
          <div className="fixed top-3 right-3 pointer-events-none" style={{ zIndex: TOP_NOTICE_Z_INDEX }}>
            <button
              type="button"
              onClick={() => setDismissedServerNoticeAt(null)}
              className="pointer-events-auto modal-chrome border gold-border rounded-md px-3 py-1 text-xs text-amber-100 hover:text-white"
            >
              Show Server Notice
            </button>
          </div>
        )}
        {serverNotice?.mode === "draining" && !serverNoticeHidden && (
          <div className="fixed top-0 inset-x-0 px-3 pt-3 pointer-events-none" style={{ zIndex: TOP_NOTICE_Z_INDEX }}>
            <div className="mx-auto max-w-3xl pointer-events-auto modal-chrome border gold-border rounded-lg shadow-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center rounded-full border gold-border text-amber-200 text-[10px] uppercase tracking-wide px-2 py-0.5 shrink-0">
                  Update
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-amber-200">Scheduled Server Update</h2>
                  </div>
                  <p className="text-sm text-gray-100 mt-1 leading-snug">
                    {drainingMessage || "A server update is scheduled soon."}
                  </p>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    New games are paused temporarily. Your current game can continue and reconnect automatically if needed.
                  </p>
                  {recoveryHint && (
                    <p className="text-xs text-amber-200/90 mt-1">{recoveryHint}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedServerNoticeAt(serverNotice.updated_at)}
                  className="text-amber-100/70 hover:text-amber-100 text-xs px-1 shrink-0"
                  aria-label="Dismiss server notice"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
        {serverNotice?.mode === "maintenance" && !serverNoticeHidden && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center" style={{ zIndex: TOP_NOTICE_Z_INDEX }}>
            <div className="modal-chrome border gold-border rounded-xl shadow-2xl p-6 max-w-md mx-4 w-full">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center justify-center rounded-full border gold-border text-amber-200 text-[10px] uppercase tracking-wide px-2 py-0.5">
                  Maintenance
                </span>
                <button
                  type="button"
                  onClick={() => setDismissedServerNoticeAt(serverNotice.updated_at)}
                  className="ml-auto text-amber-100/70 hover:text-amber-100 text-sm px-1"
                  aria-label="Dismiss server maintenance notice"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
              <h2 className="text-xl font-semibold text-amber-300 mb-2">Server Maintenance</h2>
              <p className="text-sm text-gray-100 mb-2 leading-snug">
                {serverNotice.message || "The server is temporarily unavailable while maintenance is in progress."}
              </p>
              <p className="text-xs text-gray-300 leading-snug">
                Keep this tab open and we’ll reconnect automatically when service returns.
              </p>
              {recoveryHint && (
                <p className="text-xs text-amber-200/90 mt-2">{recoveryHint}</p>
              )}
            </div>
          </div>
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
          guideContext={guideContext}
          isSpectator={isSpectator}
          hasOverlayOpen={rulesPanelOpen || showUpgradesModal || shareOpen || actionMenuOpen}
          closeGameplayOverlays={closeGameplayOverlays}
        >
        {/* Header - Phase Timeline aligned to the center lane between left rail and right sidebar */}
        <div className="relative">
          <PhaseTimeline
            currentPhase={currentPhase}
            stage={self_player.stage}
            round={self_player.round}
            nextStage={isStageIncreasing ? self_player.stage + 1 : self_player.stage}
            nextRound={isStageIncreasing ? 1 : self_player.round + 1}
            useUpgrades={gameState.use_upgrades}
            headerClassName="py-1.5 bar-pad-left"
            onOpenRules={openRulesPanel}
            hamburger={sizes.isMobile ? (
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
        {currentPhase === "battle" ? (
          <FaceDownProvider value={{ faceDownCardIds: allFaceDownIds }}>
          <GameDndProvider
            onCardMove={handleCardMove}
            validDropZones={getValidDropZones}
          >
            <div className="flex-1 flex min-h-0 game-surface">
              <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
              <main className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col">
                {sizes.isMobile && current_battle && (
                  <div className="shrink-0 flex items-center justify-between top-attached-rail-pad mobile-life-bar text-[11px] leading-tight">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-300 truncate max-w-[60px] leading-tight">{current_battle.opponent_name}</span>
                      <div className="mobile-life-chip flex items-center gap-0.5 rounded px-1 py-px leading-none">
                        <button onClick={() => handleOpponentLifeChange(current_battle.opponent_life - 1)} className="text-gray-400 hover:text-white px-1 leading-none">-</button>
                        <span className="text-white font-bold">{current_battle.opponent_life}</span>
                        <button onClick={() => handleOpponentLifeChange(current_battle.opponent_life + 1)} className="text-gray-400 hover:text-white px-1 leading-none">+</button>
                      </div>
                    </div>
                    <div className="text-center leading-tight">
                      {current_battle.current_turn_name === self_player.name ? (
                        <span className="text-green-400 font-medium">Your turn</span>
                      ) : (
                        <span className="text-amber-400 font-medium">Opp's turn</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="mobile-life-chip flex items-center gap-0.5 rounded px-1 py-px leading-none">
                        <button onClick={() => handleYourLifeChange(current_battle.your_life - 1)} className="text-gray-400 hover:text-white px-1 leading-none">-</button>
                        <span className="text-white font-bold">{current_battle.your_life}</span>
                        <button onClick={() => handleYourLifeChange(current_battle.your_life + 1)} className="text-gray-400 hover:text-white px-1 leading-none">+</button>
                      </div>
                      <span className="text-gray-300 truncate max-w-[60px] leading-tight">{self_player.name}</span>
                    </div>
                  </div>
                )}
                {sizes.isMobile && current_battle && (
                  <ZoneDivider
                    orientation="horizontal"
                    interactive={false}
                    {...STATIC_DIVIDER_CALLBACKS}
                  />
                )}
                  <BattlePhase
                    gameState={gameState}
                    actions={actions}
                    isMobile={sizes.isMobile}
                    selectedCard={battleSelectedCard}
                    onSelectedCardChange={setBattleSelectedCard}
                    onCardHover={handleCardHover}
                    onOpponentCardHover={handleOpponentCardHover}
                    onCardHoverEnd={handleCardHoverEnd}
                    activeZoneModal={activeBattleZoneModal}
                    onZoneModalToggle={toggleBattleZoneModal}
                  />
                </div>
              </main>
              {sizes.isMobile ? (
                <>
                  {sidebarOpen && (
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
                  )}
                  <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <Sidebar
                      players={gameState.players}
                      currentPlayer={self_player}
                      phaseContent={renderPhaseContent()}

                      useUpgrades={gameState.use_upgrades}
                    />
                  </div>
                </>
              ) : (
                <Sidebar
                  players={gameState.players}
                  currentPlayer={self_player}
                  phaseContent={renderPhaseContent()}
                  useUpgrades={gameState.use_upgrades}
                />
              )}
              <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
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
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
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
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
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
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
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
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
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
            <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
            <main className="flex-1 flex flex-col min-h-0 min-w-0">
              {currentPhase === "draft" && (
                <DraftPhase gameState={gameState} actions={actions} isMobile={sizes.isMobile} />
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
                  onQuickUpgrade={openUpgradesModal}
                  isMobile={sizes.isMobile}
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
            {sizes.isMobile ? (
              <>
                {sidebarOpen && (
                  <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
                )}
                <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                  <Sidebar
                    players={gameState.players}
                    currentPlayer={self_player}
                    phaseContent={renderPhaseContent()}
                    useUpgrades={gameState.use_upgrades}
                  />
                </div>
              </>
            ) : (
              <Sidebar
                players={gameState.players}
                currentPlayer={self_player}
                phaseContent={renderPhaseContent()}
                useUpgrades={gameState.use_upgrades}
              />
            )}
            <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />
          </div>
        )}
        {/* Bottom Action Bar */}
        {!isSpectator && (
          <div className="shrink-0 relative z-40 frame-chrome">
            <div
              className="flex items-center justify-between gap-1.5 sm:gap-2 py-1.5 bar-pad-main timeline-actions"
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
            context={guideContext}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
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
          onApply={(upgradeId, targetId) => actions.buildApplyUpgrade(upgradeId, targetId)}
          onClose={() => {
            setShowUpgradesModal(false);
            setUpgradeInitialTargetId(undefined);
            setUpgradesModalOpenMode('auto');
          }}
          initialTargetId={upgradeInitialTargetId}
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

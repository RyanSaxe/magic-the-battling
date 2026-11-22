import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useReducer, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useGameSeat } from "../hooks/useGameSeat";
import { useAuth } from "../contexts/authState";
import { NoticeFrame } from "../components/common/NoticeFrame";
import { Banner } from "../components/common/Banner";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { FrameFelt, FrameSidebar } from "../components/common/PageFrame";
import { GuideButton, HomeButton } from "../components/common/AppHeader";
import { BottomBar, BrandMark, TopBar } from "../components/common/FrameBar";
import { BusyNotice, StatusNotice } from "../components/common/StatusNotice";
import { useGame } from "../hooks/useGame";
import { useVoiceChat } from "../hooks/useVoiceChat";
import type { VoiceSignalPayload } from "../hooks/useWebSocket";
import { type SpectateRequestControls, useSpectateRequest } from "../hooks/useSpectateRequest";
import { getGameStatus } from "../api/client";
import { SpectateRequestModal } from "../components/SpectateRequestModal";
import type { BattleView, Card as CardType, GameStatusResponse, PlayerView, RevealAnimation, ZoneName } from "../types";
import { DraftPhase } from "./phases/Draft";
import { BuildPhase } from "./phases/Build";
import { BattlePhase, type BattleSelectedCard, type BattleZoneModalState } from "./phases/Battle";
import { RewardPhase } from "./phases/Reward";
import { Sidebar, type FightSidebarView, type Scouting } from "../components/sidebar";
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
import { RotatePrompt } from "../components/common/RotatePrompt";
import { ServerStatusWindow } from "../components/common/ServerStatusWindow";
import { UpgradesModal } from "../components/common/UpgradesModal";
import { DndPanel } from "../components/common/DndPanel";
import { SIDE_PANEL_HEADER_HEIGHT, SidePanel, SidePanelFrame } from "../components/common/SidePanel";
import { SidePanelHostContext } from "../components/common/sidePanelHost";
import { SubmitPopover } from "../components/common/SubmitPopover";
import { ZoneDivider } from "../components/common/ZoneDivider";
import { useHotkeys } from "../hooks/useHotkeys";
import {
  comparePlayersForSidebar,
  getSidebarPlayerOrder,
  suddenDeathDecidesGame,
} from "../utils/playerPlacement";
import {
  buildAppliedUpgradeMap,
  buildHiddenAppliedUpgradeMap,
  getRevealedAppliedUpgrades,
  getUnrevealedAppliedUpgrades,
} from "../utils/upgrades";
import {
  BATTLE_SUBMIT_BUTTON_LABEL,
  BUILD_SUBMIT_BUTTON_LABEL,
  DRAFT_DONE_BUTTON_LABEL,
  REWARD_CONTINUE_BUTTON_LABEL,
  type Phase,
} from "../constants/phases";
import type {
  GuideRequest,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "../guided/types";
import {
  getRememberedSeat,
  getRememberedSpectatorName,
  rememberPlayerForGame,
  rememberSpectatorName,
} from "../utils/deviceIdentity";
import {
  isSubmitPopoverGuideStepActive,
  matchesGuideCompletionTrigger,
  shouldDisableGameplayHotkeys,
  shouldBlockGuidesForBattleResolution,
  type VisibleGuideStep,
} from "./gameGuideState";
import {
  initialPhaseActionState,
  isPhaseActionPending,
  reducePhaseAction,
  type PhaseAction,
} from "./pendingPhaseAction";
import { buildCardMoveHotkeys, buildPanelHotkeys, findBattleCard } from "./gameHotkeys";
import {
  isDrawerOpen,
  isZonePanelOpen,
  reduceGameSurface,
  type GameSurface,
  type GameSurfaceKind,
  type PanelZone,
  type ScoutingTab,
  type UpgradesWindowMode,
} from "./gameSurfaces";
import {
  canUseBattleFaceDownAction,
  canUseBattleFlipAction,
  hasBattleResultConflict,
} from "../utils/battleInteraction";
import { getVoicePeerNames } from "../utils/voiceChat";
import { DIALOG_BACKDROP, LINK, OPTION_BOX, TEXT_INPUT } from "../components/common/styles";

// Each area stops 3px into the life number, short of its middle even for one digit, so - and + never overlap.
const LIFE_MINUS_TOUCH_AREA = "touch-area [--touch-area-left:calc(100%_+_5px_-_44px)]";
const LIFE_PLUS_TOUCH_AREA = "touch-area [--touch-area-left:-5px]";

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

type BattleSidebarLayout = {
  topSectionHeight: number;
  middleLaneHeight: number;
} | null;
type PendingBuildUpgradeAnimation = {
  upgradeId: string;
  targetId: string;
};
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

// A seat lost for these reasons has no way back from this tab, so the page offers to watch instead.
const SEAT_GONE_CODES = new Set(["INVALID_SESSION", "PLAYER_NOT_IN_GAME"]);

function GameGoneNotice({ gameId }: { gameId: string }) {
  const navigate = useNavigate();
  const remembered = getRememberedSeat(gameId);
  const newGame = (
    <button onClick={() => navigate("/play")} className="btn btn-secondary flex-1 py-2">
      New Game
    </button>
  );
  const home = (
    <button onClick={() => navigate("/")} className="btn btn-secondary flex-1 py-2">
      Home
    </button>
  );
  if (remembered) {
    return (
      <StatusNotice
        title="This game has ended"
        actions={
          <>
            <button
              onClick={() => navigate(`/game/${gameId}/share/${encodeURIComponent(remembered.name)}`)}
              className="btn btn-primary w-full py-2"
            >
              See Results
            </button>
            {newGame}
            {home}
          </>
        }
      >
        Your final results as {remembered.name} are on the game&apos;s share page.
      </StatusNotice>
    );
  }
  return (
    <StatusNotice
      title="Game not found"
      actions={
        <>
          <button onClick={() => navigate("/play")} className="btn btn-primary flex-1 py-2">
            New Game
          </button>
          {home}
        </>
      }
    >
      This game has ended or the link is wrong. Check the link, or start a new game.
    </StatusNotice>
  );
}

function PlayerSelectionModal({
  gameId,
  reconnectRefused,
  spectate,
  onReconnect,
  spectateOnly = false,
}: {
  gameId: string;
  reconnectRefused?: AppError;
  spectate: SpectateRequestControls;
  onReconnect: (playerName: string) => void;
  spectateOnly?: boolean;
}) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<AppError | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [typedSpectatorName, setTypedSpectatorName] = useState(() => getRememberedSpectatorName() ?? "");
  const spectatorName = user ? user.username : typedSpectatorName;
  const [error, setError] = useState("");
  const requestError = spectate.state.kind === "choosing" ? spectate.state.error : undefined;
  const shownError =
    error ||
    requestError?.message ||
    (reconnectRefused ? getAppErrorMessage(reconnectRefused, "rejoin-game", "Could not reconnect.") : "");

  useEffect(() => {
    let interval: number | null = null;
    let failures = 0;
    let cancelled = false;
    const stopPolling = () => {
      if (interval != null) clearInterval(interval);
      interval = null;
    };

    const fetchStatus = () => {
      getGameStatus(gameId)
        .then((data) => {
          failures = 0;
          if (!cancelled) setStatus(data);
        })
        .catch((err) => {
          const statusFailure = unknownToAppError(err, "game-status", "Failed to load the game");
          failures += 1;
          if (statusFailure.code === "GAME_NOT_FOUND" || failures >= 3) {
            stopPolling();
            if (!cancelled) setStatusError(statusFailure);
          }
        });
    };

    fetchStatus();
    interval = window.setInterval(fetchStatus, 3000);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [gameId, statusAttempt]);

  const handleWatchRequest = () => {
    if (!selectedPlayer || !spectatorName.trim()) {
      setError("Please enter your name");
      return;
    }
    setError("");
    if (!user) rememberSpectatorName(spectatorName.trim());
    void spectate.request(selectedPlayer, spectatorName);
  };

  const handleQuickWatch = (playerName: string) => {
    setError("");
    void spectate.request(playerName, "Spectator");
  };

  const backToPlayers = (leaveRequest: () => void) => {
    leaveRequest();
    setSelectedPlayer(null);
  };

  if (statusError?.code === "GAME_NOT_FOUND") {
    return (
      <NoticeFrame>
        <GameGoneNotice gameId={gameId} />
      </NoticeFrame>
    );
  }

  if (statusError) {
    return (
      <NoticeFrame>
        <StatusNotice
          title="Can't reach the server"
          actions={
            <>
              <button
                onClick={() => {
                  setStatusError(null);
                  setStatusAttempt((attempt) => attempt + 1);
                }}
                className="btn btn-primary flex-1 py-2"
              >
                Try again
              </button>
              <button onClick={() => navigate("/")} className="btn btn-secondary flex-1 py-2">
                Home
              </button>
            </>
          }
        >
          {getAppErrorMessage(statusError, "game-status", "The game could not be loaded. Check your connection.")}
        </StatusNotice>
      </NoticeFrame>
    );
  }

  const request = spectate.state;
  if (request.kind === "sending") {
    return (
      <NoticeFrame>
        <BusyNotice label={`Asking to watch ${request.target}...`} />
      </NoticeFrame>
    );
  }

  if (request.kind === "waiting") {
    return (
      <NoticeFrame home={<HomeButton onHome={spectate.cancel} />}>
        <StatusNotice
          title={`Waiting for ${request.target}`}
          actions={
            <button onClick={() => backToPlayers(spectate.cancel)} className="btn btn-secondary flex-1 py-2">
              Cancel
            </button>
          }
        >
          {request.target} has been asked to let you watch. You&apos;ll start watching as soon as they allow it.
        </StatusNotice>
      </NoticeFrame>
    );
  }

  if (request.kind === "denied" || request.kind === "expired") {
    return (
      <NoticeFrame>
        <StatusNotice
          title={request.kind === "denied" ? "Request denied" : "Request expired"}
          actions={
            <button onClick={() => backToPlayers(spectate.dismiss)} className="btn btn-secondary flex-1 py-2">
              Try Again
            </button>
          }
        >
          {request.kind === "denied"
            ? `${request.target} denied your request to watch.`
            : `${request.target} didn't answer your request to watch in time.`}
        </StatusNotice>
      </NoticeFrame>
    );
  }

  if (!status || authLoading) {
    return (
      <NoticeFrame>
        <BusyNotice label="Loading game..." />
      </NoticeFrame>
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
  const accountSeatName =
    !spectateOnly && user && humanPlayers.some((p) => p.name === user.username) ? user.username : null;

  return (
    <NoticeFrame>
      <SurfaceCard>
        <h2 className="text-xl font-bold text-white mb-5">{accountSeatName ? "Join Game" : "Watch a game"}</h2>

        {shownError && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {shownError}
          </div>
        )}

        {!selectedPlayer && (
          <>
            <p className="text-[var(--ivory-muted)] mb-4">
              {accountSeatName ? "Reconnect to your seat or watch a player" : "Select a player to watch"}
            </p>
            <div className="space-y-3 mb-6">
              {humanPlayers.map((player) => (
                <div
                  key={player.name}
                  className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${OPTION_BOX} p-3`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`w-2 h-2 shrink-0 rounded-full ${
                        player.is_connected ? "bg-green-500" : "bg-[var(--ivory-faint)]"
                      }`}
                    />
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3">
                      <span className="min-w-0 break-words text-white">{player.name}</span>
                      <span className="min-w-0 break-words text-[var(--ivory-muted)] text-sm">
                        ({player.phase})
                      </span>
                    </div>
                  </div>
                  <div className="ml-auto flex gap-2 empty:hidden">
                    {player.name === accountSeatName ? (
                      <button
                        onClick={() => onReconnect(player.name)}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        Reconnect
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
            {!spectateOnly && !accountSeatName && (
              <div className={`${OPTION_BOX} px-3 py-2.5 mb-4 text-[13px] leading-snug text-[var(--ivory-muted)]`}>
                To take your seat back, open this link in the browser you joined from. If you played with an account,{" "}
                <button
                  onClick={() => navigate(`/login?returnTo=${encodeURIComponent(`/game/${gameId}/play`)}`)}
                  className={`${LINK} underline`}
                >
                  log in
                </button>
                .
              </div>
            )}
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </>
        )}

        {selectedPlayer && (
          <div className="space-y-4">
            <p className="text-[var(--ivory-muted)] break-words">
              Request to watch <strong>{selectedPlayer}</strong>'s game
            </p>
            <div>
              <label className="block text-[var(--ivory-muted)] mb-1">Your Name</label>
              <input
                type="text"
                value={spectatorName}
                onChange={(e) => !user && setTypedSpectatorName(e.target.value)}
                disabled={!!user}
                className={`${TEXT_INPUT} disabled:opacity-50`}
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
      </SurfaceCard>
    </NoticeFrame>
  );
}

function GameGuideLayer({
  rootRef,
  context,
  sidebarOpen,
  setSidebarOpen,
  scouting,
  setScouting,
  guideCompletionTrigger,
  onVisibleGuideStepChange,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  context: GuidedWalkthroughContext;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  scouting: Scouting | null;
  setScouting: (player: string | null, tab?: ScoutingTab) => void;
  guideCompletionTrigger: {
    guideId: GuidedGuideId;
    stepId: string;
    nonce: number;
  } | null;
  onVisibleGuideStepChange: (step: VisibleGuideStep | null) => void;
}) {
  const GUIDE_HANDOFF_LINGER_MS = 450;
  const scoutedPlayerName = scouting?.player ?? null;
  const scoutingTab = scouting?.tab ?? "seen";
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
    revealedPlayerTab: ScoutingTab;
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
      scoutedPlayerName !== snapshot.revealedPlayerName
      || scoutingTab !== snapshot.revealedPlayerTab
    ) {
      setScouting(snapshot.revealedPlayerName, snapshot.revealedPlayerTab);
    }
  }, [
    context.isMobile,
    scoutedPlayerName,
    scoutingTab,
    setScouting,
    setSidebarOpen,
    sidebarOpen,
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
        revealedPlayerName: scoutedPlayerName,
        revealedPlayerTab: scoutingTab,
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
        scoutedPlayerName !== resolvedSidebarState.playerName
        || (
          resolvedSidebarState.detailTab !== undefined
          && scoutingTab !== resolvedSidebarState.detailTab
        )
      )
    ) {
      setScouting(
        resolvedSidebarState.playerName,
        resolvedSidebarState.detailTab ?? scoutingTab,
      );
    }
  }, [
    context.isMobile,
    guideRequest,
    resolvedSidebarState,
    restoreSidebarState,
    scoutedPlayerName,
    scoutingTab,
    setScouting,
    setSidebarOpen,
    sidebarOpen,
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
  const { gameId = "" } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const isSpectateMode = searchParams.get("spectate") === "true";
  const { seat, claim, connectionOpened, connectionEnded, takeBack } = useGameSeat(gameId, {
    claimAutomatically: !isSpectateMode,
  });
  const session = seat.kind === "held" ? seat.session : null;

  const spectate = useSpectateRequest(gameId);
  // A tab with a seat here, held or being reclaimed, plays it, even if it watched the game before joining.
  const watching =
    spectate.state.kind === "watching" && (seat.kind === "none" || isSpectateMode) ? spectate.state : null;
  const spectatePlayer = watching?.target ?? null;
  const spectateRequestId = watching?.requestId ?? null;
  const spectatorConfig = useMemo(
    () => (spectatePlayer && spectateRequestId ? { spectatePlayer, requestId: spectateRequestId } : null),
    [spectatePlayer, spectateRequestId],
  );

  const sizes = useViewportCardSizes();
  const shellMode = useGameShellMode();
  const [openSurface, dispatchSurface] = useReducer(reduceGameSurface, null);
  const sidebarOpen = isDrawerOpen(openSurface);
  const setSidebarOpen = useCallback((open: boolean) => {
    dispatchSurface(open ? { type: "open", surface: { kind: "players" } } : { type: "close", kind: "players" });
  }, []);
  const scouting = useMemo<Scouting | null>(
    () => (openSurface?.kind === "scouting" ? { player: openSurface.player, tab: openSurface.tab } : null),
    [openSurface],
  );
  const setScouting = useCallback((player: string | null, tab: ScoutingTab = "seen") => {
    dispatchSurface(player ? { type: "scout", player, tab } : { type: "close", kind: "scouting" });
  }, []);
  const [fightSidebarView, setFightSidebarView] = useState<FightSidebarView>("fight");
  const [battleSidebarLayout, setBattleSidebarLayout] = useState<BattleSidebarLayout>(null);
  const [battleLifeRailRef, battleLifeRailHeight] = useElementHeight();
  const [sidePanelHost, setSidePanelHost] = useState<HTMLElement | null>(null);
  const usesOverlaySidebar = shellMode !== "big";
  const overlaySidebarOpen = usesOverlaySidebar && sidebarOpen;

  const { addToast } = useToast();
  const [phaseActionState, dispatchPhaseAction] = useReducer(
    reducePhaseAction,
    { phase: null, buildReady: false, connected: false },
    initialPhaseActionState,
  );
  const pendingPhaseAction = phaseActionState.pending;
  const handleServerError = useCallback((error: AppError) => {
    dispatchPhaseAction({ type: "failed" });
    addToast(getAppErrorMessage(error, "game-action", "That action could not be completed."), "error");
  }, [addToast]);

  const voiceSignalRef = useRef<((payload: VoiceSignalPayload) => void) | null>(null);
  const handleVoiceSignal = useCallback((payload: VoiceSignalPayload) => {
    voiceSignalRef.current?.(payload);
  }, []);

  const navigate = useNavigate();
  const { status, gameState, isConnected, send, actions, spectateRequests, serverNotice } = useGame(
    gameId || null,
    watching ? watching.sessionId : isSpectateMode ? null : session?.sessionId ?? null,
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

  const { state, setPreviewCard } = useContextStrip();

  const isSpectator = !!spectatorConfig;
  const guideRootRef = useRef<HTMLDivElement>(null);
  const selfPhase = gameState?.self_player.phase;

  useEffect(() => {
    if (!session || isSpectator) return;
    if (status.kind === "open") connectionOpened(session.sessionId);
    if (status.kind === "ended") connectionEnded(session.sessionId, status.error);
  }, [status, session, isSpectator, connectionOpened, connectionEnded]);

  const spectatorConnectionEnded = spectate.connectionEnded;
  useEffect(() => {
    if (isSpectator && status.kind === "ended") spectatorConnectionEnded(status.error);
  }, [status, isSpectator, spectatorConnectionEnded]);

  useEffect(() => {
    const playerName = gameState?.self_player.name;
    if (!gameId || !playerName || isSpectator) {
      return;
    }
    rememberPlayerForGame(gameId, playerName);
  }, [gameId, gameState?.self_player.name, isSpectator]);

  const selfBuildReady = gameState?.self_player.build_ready ?? false;
  useEffect(() => {
    dispatchPhaseAction({
      type: "server_state",
      server: { phase: selfPhase ?? null, buildReady: selfBuildReady, connected: isConnected },
    });
  }, [selfPhase, selfBuildReady, isConnected]);

  const sendPhaseAction = useCallback((action: PhaseAction, send: () => void) => {
    if (pendingPhaseAction) return false;
    dispatchPhaseAction({ type: "sent", action });
    send();
    return true;
  }, [pendingPhaseAction]);
  const buildReadyPending = isPhaseActionPending(pendingPhaseAction, "build_ready");

  // Lifted state from Build phase
  const [selectedBasics, setSelectedBasics] = useState<string[]>([]);
  const upgradesWindow = openSurface?.kind === "upgrades" ? openSurface : null;
  const showUpgradesModal = upgradesWindow !== null;
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
  const actionMenuOpen = openSurface?.kind === "actions";
  const showSubmitHandPopover = openSurface?.kind === "submitHand";
  const showSubmitResultPopover = openSurface?.kind === "submitResult";
  const closeSurface = useCallback((kind: GameSurfaceKind) => dispatchSurface({ type: "close", kind }), []);
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
    queueMicrotask(() => {
      dispatchSurface({ type: "phaseChanged", phase: selfPhase });
      setFightSidebarView("fight");
      if (selfPhase !== "battle") setIsChangingResult(false);
    });
  }, [selfPhase]);

  const rulesPanel = openSurface?.kind === "guide" ? openSurface : null;
  const rulesPanelOpen = rulesPanel !== null;
  const shareOpen = openSurface?.kind === "share";

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

  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const trackPointer = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const forgetPointer = () => {
      pointerRef.current = null;
    };
    window.addEventListener("mousemove", trackPointer);
    document.documentElement.addEventListener("mouseleave", forgetPointer);
    return () => {
      window.removeEventListener("mousemove", trackPointer);
      document.documentElement.removeEventListener("mouseleave", forgetPointer);
    };
  }, []);

  const currentBattle = gameState?.current_battle;
  useEffect(() => {
    const pointer = pointerRef.current;
    if (!currentBattle || !pointer) return;
    // A card that slides under a resting pointer gets no mouseenter, so after
    // each battle update the hover is re-read from what the pointer is on.
    const cardId = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest("[data-guide-card-id]")
      ?.getAttribute("data-guide-card-id");
    const card = cardId ? findBattleCard(currentBattle, cardId) : null;
    queueMicrotask(() => setHoveredCard(card));
  }, [currentBattle]);

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

  const handleSpectateNewTab = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("spectate", "true");
    // noopener keeps the player's per-tab session out of the watching tab, and ?spectate=true stays in its URL,
    // so reloading that tab can never take the player's seat.
    window.open(url.toString(), "_blank", "noopener");
  };

  // Changing a submitted result is given up whenever a menu, panel or window other than its choices opens.
  const openGameSurface = useCallback((surface: GameSurface) => {
    if (surface.kind !== "submitResult") setIsChangingResult(false);
    dispatchSurface({ type: "open", surface });
  }, []);

  const closeGameplayOverlays = useCallback((except?: GameSurfaceKind) => {
    if (except !== "submitResult") setIsChangingResult(false);
    dispatchSurface({ type: "closeOverlays", except });
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
    openGameSurface({ kind: "guide", target });
  }, [openGameSurface]);

  const closeUpgradesModal = useCallback(() => closeSurface("upgrades"), [closeSurface]);

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
    mode: UpgradesWindowMode = 'auto',
    initialRevealIds: string[] = [],
  ) => {
    openGameSurface({ kind: "upgrades", mode, targetId: targetCardId, revealIds: initialRevealIds });
  }, [openGameSurface]);

  const openBuildApplyUpgradeModal = useCallback((options: {
    targetCardId?: string;
    upgradeId?: string;
  } = {}) => {
    openGameSurface({
      kind: "upgrades",
      mode: "auto",
      targetId: options.targetCardId,
      upgradeId: options.upgradeId,
      revealIds: [],
    });
  }, [openGameSurface]);

  const handleBuildReadySubmit = useCallback((
    playDrawPreference: "play" | "draw",
  ) => {
    if (!gameState || gameState.self_player.phase !== "build") {
      return;
    }
    const sent = sendPhaseAction("build_ready", () => actions.buildReady(
      selectedBasics,
      playDrawPreference,
      handSlotsRef.current.filter((id): id is string => id !== null),
    ));
    if (!sent) return;
    requestGuideCompletion("build_play_draw", "play-draw");
    closeGameplayOverlays();
  }, [actions, closeGameplayOverlays, gameState, requestGuideCompletion, selectedBasics, sendPhaseAction]);

  const toggleBuildSubmitPopover = useCallback(() => {
    if (showSubmitHandPopover || buildReadyPending) {
      closeSurface("submitHand");
      return;
    }
    openGameSurface({ kind: "submitHand" });
  }, [buildReadyPending, closeSurface, openGameSurface, showSubmitHandPopover]);

  const openActionMenu = useCallback(() => {
    openGameSurface({ kind: "actions" });
  }, [openGameSurface]);

  const toggleBattleSubmitPopover = useCallback(() => {
    if (showSubmitResultPopover) {
      closeSurface("submitResult");
      return;
    }
    openGameSurface({ kind: "submitResult" });
  }, [closeSurface, openGameSurface, showSubmitResultPopover]);

  const toggleZonePanel = useCallback((zone: PanelZone, owner: ZoneOwner) => {
    if (isZonePanelOpen(openSurface, zone, owner)) {
      closeSurface("zone");
      return;
    }
    openGameSurface({ kind: "zone", zone, owner });
  }, [closeSurface, openGameSurface, openSurface]);

  const setBattleZoneModalOpen = useCallback((
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => {
    const isSamePanel = isZonePanelOpen(openSurface, zone, owner);
    if (!open) {
      if (isSamePanel) closeSurface("zone");
      return;
    }
    if (!isSamePanel) openGameSurface({ kind: "zone", zone, owner });
  }, [closeSurface, openGameSurface, openSurface]);

  const openShareModal = useCallback(() => {
    openGameSurface({ kind: "share" });
  }, [openGameSurface]);

  const handleBattleResultSubmit = useCallback((result: string) => {
    requestGuideCompletion("battle_result_submit", "result-submit");
    setIsChangingResult(false);
    closeSurface("submitResult");

    const isLoss = result !== gameState?.self_player.name && result !== "draw";
    const unrevealed = gameState
      ? getUnrevealedAppliedUpgrades(gameState.self_player.upgrades)
      : [];

    if (!isLoss && unrevealed.length > 0) {
      setPendingBattleResult(result);
      return;
    }

    actions.battleSubmitResult(result);
  }, [actions, closeSurface, gameState, requestGuideCompletion]);

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
    if (!sendPhaseAction("reward_done", () => actions.rewardDone(selectedUpgradeId ?? undefined))) return;
    requestGuideCompletion("reward", "continue");
  }, [actions, requestGuideCompletion, selectedUpgradeId, sendPhaseAction]);

  const handleGoToBuild = useCallback(() => {
    sendPhaseAction("draft_done", actions.draftDone);
  }, [actions, sendPhaseAction]);

  useEffect(() => {
    if (selfPhase === "reward") return;
    queueMicrotask(() => {
      setSelectedUpgradeId(null);
      setSelectedPoolCardId(null);
    });
  }, [selfPhase]);

  const hasPendingBattleResolution =
    !!battleResolutionId &&
    gameState?.self_player.phase !== "battle" &&
    cachedBattleForResolution !== null &&
    !shownBattleResolutionIds.has(battleResolutionId);
  const buildSubmitGuideActive = isSubmitPopoverGuideStepActive(visibleGuideStep, "build");
  const battleSubmitGuideActive = isSubmitPopoverGuideStepActive(visibleGuideStep, "battle");

  // Hotkeys — must be before early returns to satisfy rules-of-hooks
  // A zone panel sits beside the board rather than over it, so the Fight's hotkeys keep working while one is open.
  const modalOpen =
    rulesPanelOpen ||
    showUpgradesModal ||
    actionMenuOpen ||
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
    const map = buildPanelHotkeys({
      guideOpen: rulesPanelOpen,
      gameplayHotkeysDisabled,
      openGuide: () => {
        openRulesPanel(
          currentPhaseId && ['draft', 'build', 'battle', 'reward'].includes(currentPhaseId)
            ? { docId: currentPhaseId, tab: 'controls' }
            : undefined,
        );
      },
      closeGuide: () => closeSurface("guide"),
      closeMenu: actionMenuOpen ? () => closeSurface("actions") : null,
      closeUpgrades: showUpgradesModal
        ? { key: currentPhaseId === "battle" ? "v" : "u", close: closeUpgradesModal }
        : null,
    });
    if (!gameState || isSpectator || gameplayHotkeysDisabled) return map;

    const { self_player: sp, current_battle: cb } = gameState;
    const phase = sp.phase;

    if (!usesOverlaySidebar && phase !== "battle") {
      sidebarPlayers.slice(0, 8).forEach((player, index) => {
        map[String(index + 1)] = () => {
          setScouting(player.name, "seen");
        };
      });
    }

    if (phase === 'draft') {
      map['r'] = () => {
        if (sp.treasures > 0 && (sp.current_pack?.length ?? 0) > 0) {
          actions.draftRoll();
        }
      };
      map['Enter'] = handleGoToBuild;
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
        map['Enter'] = () => closeSurface("submitHand");
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
        map['Enter'] = () => closeSurface("submitResult");
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
          const moveHotkeys = buildCardMoveHotkeys({
            hoveredCard,
            moveCard: (card, toZone) => actions.battleMove(card.id, card.zone, toZone, card.owner, card.owner),
            clearHoveredCard: () => setHoveredCard(null),
          });
          for (const [key, action] of Object.entries(moveHotkeys)) {
            map[key] = action;
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
          map['g'] = () => toggleZonePanel('graveyard', 'player');
          map['e'] = () => toggleZonePanel('exile', 'player');
          map['s'] = () => toggleZonePanel('sideboard', 'player');
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

  useHotkeys(hotkeyMap);

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
      revealedPlayerName: scouting?.player ?? null,
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
    scouting,
    showSubmitHandPopover, showSubmitResultPopover,
  ]);

  if (spectate.state.kind === "ended") {
    const ended = spectate.state.error;
    return (
      <NoticeFrame>
        {ended.code === "GAME_NOT_FOUND" ? (
          <GameGoneNotice gameId={gameId} />
        ) : (
          <StatusNotice
            title={ended.code === "SPECTATE_TARGET_NOT_FOUND" ? "Spectate Unavailable" : "Game Unavailable"}
            actions={
              <>
                <button onClick={() => navigate("/play")} className="btn btn-primary flex-1 py-2">
                  New Game
                </button>
                <button onClick={() => navigate("/")} className="btn btn-secondary flex-1 py-2">
                  Home
                </button>
              </>
            }
          >
            {getAppErrorMessage(ended, "game-connection", "This game is not available right now.")}
          </StatusNotice>
        )}
      </NoticeFrame>
    );
  }

  if (!isSpectator) {
    if (seat.kind === "claiming") {
      return (
        <NoticeFrame>
          <BusyNotice label="Reconnecting to your seat..." />
        </NoticeFrame>
      );
    }
    if (seat.kind === "lost" && seat.error.code === "SEAT_MOVED") {
      return (
        <NoticeFrame>
          <StatusNotice
            title="Open in another tab"
            actions={
              <>
                <button onClick={takeBack} className="btn btn-primary flex-1 py-2">
                  Play here
                </button>
                <button onClick={() => navigate("/")} className="btn btn-secondary flex-1 py-2">
                  Home
                </button>
              </>
            }
          >
            This game is now open in another tab or window. Only one can play your seat at a time.
          </StatusNotice>
        </NoticeFrame>
      );
    }
    if (seat.kind === "lost" && seat.error.code === "GAME_NOT_FOUND") {
      return (
        <NoticeFrame>
          <GameGoneNotice gameId={gameId} />
        </NoticeFrame>
      );
    }
    if (seat.kind === "lost" && !SEAT_GONE_CODES.has(seat.error.code)) {
      return (
        <NoticeFrame>
          <StatusNotice
            title="Game Unavailable"
            actions={
              <>
                <button onClick={takeBack} className="btn btn-primary flex-1 py-2">
                  Try again
                </button>
                <button onClick={() => navigate("/")} className="btn btn-secondary flex-1 py-2">
                  Home
                </button>
              </>
            }
          >
            {getAppErrorMessage(seat.error, "game-connection", "This game is not available right now.")}
          </StatusNotice>
        </NoticeFrame>
      );
    }
    if (seat.kind !== "held" || isSpectateMode) {
      return (
        <PlayerSelectionModal
          gameId={gameId}
          reconnectRefused={seat.kind === "none" ? seat.refused : undefined}
          spectate={spectate}
          onReconnect={(playerName) => void claim(playerName)}
          spectateOnly={isSpectateMode}
        />
      );
    }
  }

  if (!gameState) {
    if (watching) {
      // A game still in its lobby sends spectators nothing until it starts.
      return (
        <NoticeFrame>
          <BusyNotice label={isConnected ? `Waiting for ${watching.target}'s game to start...` : "Connecting..."} />
        </NoticeFrame>
      );
    }
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
  const showsBattle = (currentPhase === "battle" || displayBattleResolution) && !!battleViewForDisplay;
  const inSuddenDeath = showsBattle
    ? !!battleViewForDisplay?.is_sudden_death
    : currentPhase === "build" && self_player.in_sudden_death;
  const banner = isSpectator && spectatePlayer ? (
    <Banner
      title={`Watching ${spectatePlayer}`}
      tone={inSuddenDeath ? "sudden-death" : "gold"}
      note={inSuddenDeath ? "Sudden Death" : undefined}
    />
  ) : inSuddenDeath ? (
    <Banner
      tone="sudden-death"
      title="Sudden Death"
      note="Loser is eliminated"
      info="Multiple players reached lethal poison. The two with the lowest poison are reset to 9 and face off. A draw causes both players to rebuild. Play continues until one is eliminated."
    />
  ) : null;
  // The drawer's lanes line up with the board's rows, which start under the life bar while the drawer's start under
  // its header.
  const overlaySidebarTopInset = usesOverlaySidebar && showsBattle
    ? battleLifeRailHeight - SIDE_PANEL_HEADER_HEIGHT
    : 0;

  const timelinePhase = displayBattleResolution ? "battle" : currentPhase;
  const isEndPhase = currentPhase === "eliminated" || currentPhase === "winner" || currentPhase === "game_over";
  const canSpectate = currentPhase === "eliminated" && gameState.players.some(
    (p) =>
      !p.is_puppet &&
      p.phase !== "eliminated" &&
      p.phase !== "awaiting_elimination" &&
      p.phase !== "winner" &&
      p.phase !== "game_over"
  );
  const selfPlacement = gameState.players.find(p => p.name === self_player.name)?.placement ?? 0;
  const isWinner = selfPlacement === 1;

  const shareUrl = gameId
    ? `${window.location.origin}/game/${gameId}/share/${encodeURIComponent(self_player.name)}`
    : '';
  const shareText = isWinner
    ? 'Just won a game of Pitfight! Check out the game:'
    : `Just finished ${getOrdinal(selfPlacement)} in Pitfight! Check out the game:`;

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
    upgradesWindow?.mode === "view"
      ? "view"
      : upgradesWindow?.mode === "reveal"
        ? "reveal"
        : hasPendingBuildUpgrades
          ? "apply"
          : "view";

  const openBattleRevealUpgradesModal = (initialRevealIds: string[] = []) => {
    requestGuideCompletion("hint_battle_unrevealed_upgrade", "reveal-upgrade");
    openUpgradesModal(undefined, "reveal", initialRevealIds);
  };

  const renderActionButtons = (): { left: ReactNode; right: ReactNode } | null => {
    let left: ReactNode = null;
    let right: ReactNode = null;

    if (actionBarPhase === "draft") {
      left = (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={actions.draftRoll}
            disabled={
              self_player.treasures <= 0 ||
              (self_player.current_pack?.length ?? 0) === 0
            }
            className="btn btn-game"
            data-guide-target="draft-roll"
          >
            Roll for 1💰
          </button>
          {self_player.upgrades.length > 0 && (
            <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn btn-secondary">
              View Upgrades
            </button>
          )}
        </div>
      );
      right = (
        <button
          onClick={handleGoToBuild}
          disabled={isPhaseActionPending(pendingPhaseAction, "draft_done")}
          className="btn btn-primary"
          data-guide-target="draft-continue"
        >
          {DRAFT_DONE_BUTTON_LABEL}
        </button>
      );
    } else if (actionBarPhase === "build") {
      if (self_player.build_ready) {
        left = self_player.upgrades.length > 0 ? (
          hasPendingBuildUpgrades ? (
            <button
              onClick={() => openUpgradesModal(undefined, 'auto')}
              className="btn btn-game btn-pending"
              data-guide-target="build-apply-upgrade"
            >
              Apply Upgrade
            </button>
          ) : (
            <button onClick={() => openUpgradesModal(undefined, 'view')} className="btn btn-secondary">
              View Upgrades
            </button>
          )
        ) : null;
        right = (
          <div className="flex items-center gap-1.5 sm:gap-2" data-guide-target="build-submit">
            <span className="text-amber-400 text-sm">Waiting...</span>
            <button
              onClick={actions.buildUnready}
              className="btn btn-secondary"
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
              className="btn btn-game btn-pending"
              data-guide-target="build-apply-upgrade"
            >
              Apply Upgrade
            </button>
          ) : (
            <button
              onClick={() => openUpgradesModal(undefined, 'view')}
              className="btn btn-secondary"
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
              {buildReadyPending ? "Submitting..." : BUILD_SUBMIT_BUTTON_LABEL}
            </button>
            {showSubmitHandPopover && canReady && (
              <SubmitPopover
                options={[
                  {
                    label: "Play",
                    onClick: () => handleBuildReadySubmit('play'),
                    className: "btn btn-success text-sm py-1.5",
                  },
                  {
                    label: "Draw",
                    onClick: () => handleBuildReadySubmit('draw'),
                    className: "btn btn-success text-sm py-1.5",
                  },
                ]}
                onClose={() => closeSurface("submitHand")}
                guideTarget="build-submit-popover"
                closeOnOutsideClick
                ignoreOutsideClickSelector={buildSubmitGuideActive ? "[data-guided-tooltip='true']" : "[data-guide-target='build-submit']"}
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
              className="btn btn-game btn-pending"
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
        const resultsConflict = hasBattleResultConflict({
          mySubmission,
          opponentSubmission,
          isResolved: displayBattleResolution,
        });
        right = (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-sm ${resultsConflict ? "text-red-400" : "text-amber-400"}`}
            >
              {resultsConflict ? "Results conflict!" : "Waiting..."}
            </span>
            <button
              onClick={() => setIsChangingResult(true)}
              className="btn btn-secondary"
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
                onClick={() => { setIsChangingResult(false); closeSurface("submitResult"); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            )}
            <button
              onClick={toggleBattleSubmitPopover}
              className="btn btn-primary"
              data-guide-target="battle-submit"
            >
              {BATTLE_SUBMIT_BUTTON_LABEL}
            </button>
            {showSubmitResultPopover && (
              <SubmitPopover
                options={[
                  {
                    label: "I Won",
                    onClick: () => {
                      handleBattleResultSubmit(self_player.name);
                    },
                    className: "btn btn-success text-sm py-1.5",
                  },
                  {
                    label: "Draw",
                    onClick: () => {
                      handleBattleResultSubmit("draw");
                    },
                    className: "btn btn-secondary text-sm py-1.5",
                  },
                  {
                    label: "I Lost",
                    onClick: () => {
                      handleBattleResultSubmit(opponent_name);
                    },
                    className: "btn btn-danger text-sm py-1.5",
                  },
                ]}
                onClose={() => closeSurface("submitResult")}
                guideTarget="battle-submit-popover"
                closeOnOutsideClick
                ignoreOutsideClickSelector={battleSubmitGuideActive ? "[data-guided-tooltip='true']" : "[data-guide-target='battle-submit']"}
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
        : REWARD_CONTINUE_BUTTON_LABEL;
      right = (
        <button
          onClick={handleContinue}
          disabled={!canContinue || isPhaseActionPending(pendingPhaseAction, "reward_done")}
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

    return { left, right };
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


  const moveSelectedBattleCard = (toZone: ZoneName, toOwner: ZoneOwner) => {
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

  const inFight = (currentPhase === "battle" || displayBattleResolution) && !!battleViewForDisplay;
  const renderFight = (viewSwitch: ReactNode): ReactNode => {
    if (battleViewForDisplay) {
      return (
        <BattleSidebarContent
          header={viewSwitch}
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
          overlayTopInset={overlaySidebarTopInset}
        />
      );
    }
    return null;
  };

  const renderSidebar = (): ReactNode => {
    const sidebar = (
      <Sidebar
        players={gameState.players}
        currentPlayer={self_player}
        renderFight={inFight ? renderFight : undefined}
        fightView={fightSidebarView}
        onFightViewChange={setFightSidebarView}
        useUpgrades={gameState.use_upgrades}
        isMobile={usesOverlaySidebar}
        scoutInline={shellMode === "mobile"}
        scouting={scouting}
        onScout={setScouting}
        onStopScouting={() => setScouting(null)}
        renderMicToggle={renderMicToggle}
      />
    );
    if (!usesOverlaySidebar) return <FrameSidebar>{sidebar}</FrameSidebar>;
    return (
      <SidePanel
        open={overlaySidebarOpen}
        title={
          scouting && shellMode === "mobile" ? "Scouting"
          : inFight && fightSidebarView === "fight" ? "Fight"
          : "Players"
        }
        onClose={() => setSidebarOpen(false)}
        closeOnBoardTap
      >
        {sidebar}
      </SidePanel>
    );
  };

  const serverNoticeHidden = !!serverNotice && dismissedServerNoticeAt === serverNotice.updated_at;

  return (
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
      <SidePanelHostContext.Provider value={sidePanelHost}>
      <div className="game-table h-dvh overflow-hidden flex flex-col">
        {!isConnected && (
          <div className={`fixed inset-0 z-50 ${DIALOG_BACKDROP} flex items-center justify-center`}>
            <div className="modal-chrome border gold-border rounded-lg shadow-xl px-5 py-3 flex items-center gap-3">
              <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm text-[var(--ivory)]">Reconnecting...</span>
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
        <div className="relative">
          <TopBar
            lead={
              <>
                <BrandMark className="hidden sm:block mr-2" />
                <PhaseTimeline
                  currentPhase={timelinePhase}
                  stage={self_player.stage}
                  round={self_player.round}
                  nextStage={isStageIncreasing ? self_player.stage + 1 : self_player.stage}
                  nextRound={isStageIncreasing ? 1 : self_player.round + 1}
                  inSuddenDeath={self_player.in_sudden_death}
                  suddenDeathDecidesGame={suddenDeathDecidesGame(gameState.players)}
                  useUpgrades={gameState.use_upgrades}
                  onOpenRules={openRulesPanel}
                  title={isEndPhase && !displayBattleResolution ? `${getOrdinal(selfPlacement)} Place` : undefined}
                />
              </>
            }
            helpers={<GuideButton onClick={() => openRulesPanel()} className={isEndPhase ? "hidden sm:inline-block" : ""} />}
            home={<HomeButton className={isEndPhase ? "" : "hidden sm:inline-block"} />}
            account={usesOverlaySidebar ? (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="btn btn-secondary btn-icon"
                data-guide-target="sidebar-toggle"
              >
                ☰
              </button>
            ) : undefined}
          />
        </div>

        {/* Main content */}
        {showsBattle ? (
          <FaceDownProvider value={{ faceDownCardIds: allFaceDownIds }}>
          <GameDndProvider
            onCardMove={handleCardMove}
            validDropZones={getValidDropZones}
          >
            <FrameFelt banner={banner} sidePanels={<SidePanelFrame ref={setSidePanelHost} />}>
              <main className="flex-1 flex flex-col min-h-0 min-w-0" data-guide-target="game-content">
                <div className="zone-divider-bg p-[2px] flex-1 min-h-0 flex flex-col">
                  {usesOverlaySidebar && battleViewForDisplay && (
                    <div
                      ref={battleLifeRailRef}
                      className="shrink-0 flex items-center justify-between top-attached-rail-pad mobile-life-bar text-[11px] leading-tight"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--ivory-muted)] truncate max-w-[60px] leading-tight">{battleViewForDisplay.opponent_name}</span>
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
                          <button onClick={() => handleOpponentLifeChange(battleViewForDisplay.opponent_life - 1)} className={`${LIFE_MINUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none`}>-</button>
                          <span className="text-white font-bold">{battleViewForDisplay.opponent_life}</span>
                          <button onClick={() => handleOpponentLifeChange(battleViewForDisplay.opponent_life + 1)} className={`${LIFE_PLUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none`}>+</button>
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
                          <button onClick={() => handleYourLifeChange(battleViewForDisplay.your_life - 1)} className={`${LIFE_MINUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none`}>-</button>
                          <span className="text-white font-bold">{battleViewForDisplay.your_life}</span>
                          <button onClick={() => handleYourLifeChange(battleViewForDisplay.your_life + 1)} className={`${LIFE_PLUS_TOUCH_AREA} text-[var(--ivory-muted)] hover:text-white px-1 leading-none`}>+</button>
                        </div>
                        {!canManipulateOpponent && voiceTargetsAvailable && voiceChat.state.peers.length > 0 && (
                          <MicToggle
                            muted={voiceChat.state.isMuted}
                            audioLevelKey="__self__"
                            onClick={() => voiceChat.toggleSelfMute()}
                          />
                        )}
                        <span className="text-[var(--ivory-muted)] truncate max-w-[60px] leading-tight">{self_player.name}</span>
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
                      activeZoneModal={openSurface?.kind === "zone" && openSurface.zone !== "sideboard" ? { zone: openSurface.zone, owner: openSurface.owner } : null}
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
              {renderSidebar()}
            </FrameFelt>
            {current_battle && (
              <>
                <DndPanel
                  open={isZonePanelOpen(openSurface, 'sideboard', 'player')}
                  title="Your Sideboard"
                  count={current_battle.your_zones.sideboard.length}
                  onClose={() => closeSurface("zone")}
                  onEmptyClick={() => moveSelectedBattleCard('sideboard', 'player')}
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
                <DndPanel
                  open={isZonePanelOpen(openSurface, 'sideboard', 'opponent') && !!current_battle.opponent_full_sideboard}
                  title={`${current_battle.opponent_name}'s Sideboard`}
                  count={current_battle.opponent_full_sideboard?.length ?? 0}
                  onClose={() => closeSurface("zone")}
                  onEmptyClick={() => moveSelectedBattleCard('sideboard', 'opponent')}
                  tone="battle"
                  zone="sideboard"
                  zoneOwner="opponent"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
                >
                  {(dims) =>
                    (current_battle.opponent_full_sideboard ?? []).map((card) => (
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
              </>
            )}
          </GameDndProvider>
          </FaceDownProvider>
        ) : (
          <FrameFelt banner={banner} sidePanels={<SidePanelFrame ref={setSidePanelHost} />}>
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
                  isDesktop={shellMode === "big"}
                />
              )}
              {currentPhase === "awaiting_elimination" && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <h2 className="text-2xl text-red-400 mb-4">
                      You Have Been Eliminated
                    </h2>
                    <p className="text-[var(--ivory-muted)] mb-6">
                      Waiting until all fights are complete to determine if you
                      will compete in sudden death to stay alive.
                    </p>
                    <div className="bg-black/40 rounded-lg p-4 text-left">
                      <h3 className="text-amber-400 font-medium mb-2">
                        Sudden Death Rules
                      </h3>
                      <ul className="text-[var(--ivory-muted)] text-sm space-y-1">
                        <li>
                          Triggers when 2+ players eliminated with fewer than 2
                          survivors
                        </li>
                        <li>
                          2 players with lowest poison fight (ties broken
                          randomly)
                        </li>
                        <li>Other eliminated players are out immediately</li>
                        <li>Poison resets to 9 for the sudden death fight</li>
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
            {renderSidebar()}
          </FrameFelt>
        )}
        {/* Bottom Action Bar */}
        {(() => {
          const endOfGame = isEndPhase && gameId && !displayBattleResolution;
          const groups = endOfGame ? null : renderActionButtons();
          // Above the docked sidebar's z-[45], so the popovers over Submit Hand and Submit Result show over it.
          return (
            <BottomBar
              className="relative z-[46]"
              guideTarget="phase-action-bar"
              // A spectator watches the player's screen, so sees the player's bar without being able to use it.
              inert={isSpectator}
              secondary={endOfGame ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      window.open(shareUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    Review
                  </button>
                  {canSpectate && (
                    <button onClick={handleSpectateNewTab} className="btn btn-secondary">
                      Spectate
                    </button>
                  )}
                </>
              ) : groups?.left}
              main={endOfGame ? (
                <button
                  className="btn btn-primary"
                  onClick={openShareModal}
                >
                  Share Game
                </button>
              ) : groups?.right}
            />
          );
        })()}
        {!isSpectator && (
          <GameGuideLayer
            rootRef={guideRootRef}
            context={guideContext!}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            scouting={scouting}
            setScouting={setScouting}
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
          onMove={(cardId, fromZone, toZone, fromOwner, toOwner) => {
            actions.battleMove(cardId, fromZone, toZone, fromOwner, toOwner)
            setBattleSelectedCard(null)
          }}
          onUntapAll={handleUntapAll}
          onUntapOpponentAll={handleUntapOpponentAll}
          onShowSideboard={() => toggleZonePanel('sideboard', 'player')}
          onShowOpponentSideboard={() => toggleZonePanel('sideboard', 'opponent')}
          onCreateTreasure={handleCreateTreasure}
          onDrawLibrary={handleDrawLibrary}
          onShuffleLibrary={handleShuffleLibrary}
          onDrawOpponentLibrary={handleDrawOpponentLibrary}
          onShuffleOpponentLibrary={handleShuffleOpponentLibrary}
          onPassTurn={handlePassTurn}
          onRollDie={handleRollDie}
          onClose={() => closeSurface("actions")}
        />
      )}
      {spectateRequests[0] && (
        <SpectateRequestModal request={spectateRequests[0]} onRespond={actions.spectateResponse} />
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
          initialTargetId={upgradesWindow?.targetId}
          initialUpgradeId={upgradesWindow?.upgradeId}
          initialRevealUpgradeIds={upgradesWindow?.revealIds}
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
        <ShareModal url={shareUrl} shareText={shareText} onClose={() => closeSurface("share")} />
      )}
      {rulesPanel && (
        <RulesPanel
          onClose={() => closeSurface("guide")}
          initialDocId={rulesPanel.target?.docId}
          initialTab={rulesPanel.target?.tab}
          gameId={gameId}
          playerName={gameState?.self_player.name}
          useUpgrades={gameState.use_upgrades}
        />
      )}
      <RotatePrompt />
      </SidePanelHostContext.Provider>
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

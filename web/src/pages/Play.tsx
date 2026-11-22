import { startTransition, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createGame, warmCubeCache } from "../api/client";
import { useGame } from "../hooks/useGame";
import { useToast } from "../contexts";
import { useAuth } from "../contexts/authState";
import { useCubeLook } from "../hooks/useCubeLook";
import { useHotkeys } from "../hooks/useHotkeys";
import { GoldfishIcon } from "../components/icons/GoldfishIcon";
import { Spinner } from "../components/icons/Spinner";
import { AppHeader, HomeButton } from "../components/common/AppHeader";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { PageFrame } from "../components/common/PageFrame";
import { CloseSeatDialog, ResumeList, ResumeShelf } from "../components/ResumeGame";
import { useResumableGames, type ResumableSeat } from "../hooks/useResumableGames";
import { SurfaceCard } from "../components/common/SurfaceCard";
import { Switch } from "../components/common/Switch";
import { CubeBanner } from "../components/setup/CubeBanner";
import { GuidedSwitch } from "../components/setup/GuidedSwitch";
import { SegmentedFilter } from "../components/dashboard/SegmentedFilter";
import { getLegendaryName } from "../utils/prefetchName";
import { saveTabSession } from "../utils/tabSession";
import {
  forgetSeatForGame,
  getDefaultNewPlayerPreference,
  getRememberedGuestName,
  rememberGuestName,
  rememberPlayerForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import type { LobbyState, PlayMode } from "../types";
import { type AppError, getAppErrorMessage, unknownToAppError } from "../utils/appError";
import { DIALOG_BACKDROP } from "../components/common/styles";

type SoloPhase =
  | "idle"
  | "loading"
  | "not-enough-puppets"
  | "starting"
  | "navigating";
type OpponentCount = 1 | 3 | 5 | 7;
type ActiveMode = "friends" | "solo";
type PlayView = "setup" | "options" | "resume";
const OPPONENT_OPTIONS: OpponentCount[] = [1, 3, 5, 7];

function normalizeCreateGameError(error: unknown): string {
  return unknownToAppError(error, "create-game", "Failed to create game").message;
}

function useSoloLobbyWatcher(
  lobbyState: LobbyState | null,
  pendingGameId: string | null,
  soloPhaseRef: React.RefObject<SoloPhase>,
  autoStartEnabled: boolean,
  opponents: OpponentCount,
  actions: { setReady: (r: boolean) => void; startGame: () => void },
  onNotEnoughPuppets: (available: number) => void,
  onStarting: () => void,
  onNavigating: () => void,
) {
  const hasAutoStarted = useRef(false);
  const prevCubeStatus = useRef<string | null>(null);
  const prevCanStart = useRef(false);

  const reset = useCallback(() => {
    hasAutoStarted.current = false;
    prevCubeStatus.current = null;
    prevCanStart.current = false;
  }, []);

  useEffect(() => {
    if (
      !autoStartEnabled ||
      !pendingGameId ||
      !lobbyState ||
      lobbyState.game_id !== pendingGameId
    ) {
      return;
    }

    const cubeJustReady =
      lobbyState.cube_loading_status === "ready" &&
      prevCubeStatus.current !== "ready";
    prevCubeStatus.current = lobbyState.cube_loading_status;

    if (soloPhaseRef.current === "loading" && cubeJustReady) {
      const available = lobbyState.available_puppet_count ?? 0;
      if (available >= opponents) {
        onStarting();
        actions.setReady(true);
      } else {
        onNotEnoughPuppets(available);
      }
    }

    const canStartJustBecameTrue =
      lobbyState.can_start && !prevCanStart.current;
    prevCanStart.current = lobbyState.can_start;

    if (
      soloPhaseRef.current === "starting" &&
      canStartJustBecameTrue &&
      !hasAutoStarted.current
    ) {
      hasAutoStarted.current = true;
      onNavigating();
      actions.startGame();
    }
  }, [actions, autoStartEnabled, lobbyState, onNavigating, onNotEnoughPuppets, onStarting, opponents, pendingGameId, soloPhaseRef]);

  return { reset };
}

function useGuestName(): [string, (v: string) => void, boolean] {
  const [rememberedName] = useState(getRememberedGuestName);
  const [name, setName] = useState(rememberedName ?? "");
  const [loading, setLoading] = useState(rememberedName === null);

  useEffect(() => {
    if (rememberedName !== null) return;
    let cancelled = false;
    getLegendaryName().then((n) => {
      if (!cancelled) {
        setName(n);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rememberedName]);

  return [name, setName, loading];
}

function FriendsIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

const MODE_OPTIONS = [
  { value: "solo" as const, label: <><GoldfishIcon className="setup-mode-icon" />Goldfish</> },
  { value: "friends" as const, label: <><FriendsIcon className="setup-mode-icon" />Play with Friends</> },
];

const PLAY_MODE_OPTIONS = [
  { value: "limited" as const, label: "Limited" },
  { value: "constructed" as const, label: "Constructed" },
];

const PITCHES: Record<ActiveMode, string> = {
  solo: "Fight historically winning hands, played face up. Move their cards and decide who would have won.",
  friends: "See who is the best drafter. Everybody starts with trash, and it's up to you to turn it into treasure!",
};

/** Both modes' pitches share one space, so switching between them moves nothing. */
function ModePitch({ mode }: { mode: ActiveMode }) {
  return (
    <div className="setup-pitch">
      {MODE_OPTIONS.map(({ value }) => (
        <p key={value} className={value === mode ? "" : "invisible"} aria-hidden={value !== mode}>
          {PITCHES[value]}
        </p>
      ))}
    </div>
  );
}

export function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const resumableGames = useResumableGames();

  const { user } = useAuth();
  const [guestName, setGuestName, nameLoading] = useGuestName();
  const playerName = user ? user.username : guestName;
  const setPlayerName = user ? () => {} : setGuestName;
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [view, setView] = useState<PlayView>("setup");
  const [seatToClose, setSeatToClose] = useState<ResumableSeat | null>(null);
  const [closedIds, setClosedIds] = useState<string[]>([]);
  const stripButtonRef = useRef<HTMLButtonElement>(null);
  const [cubeId, setCubeId] = useState(() => searchParams.get("cubeId") || "auto");
  // The banner follows the ID when Change cube closes, rather than asking the server about each key typed.
  const [bannerCubeId, setBannerCubeId] = useState(() => cubeId.trim());
  const [useUpgrades, setUseUpgrades] = useState(() => searchParams.get("useUpgrades") !== "false");
  const [playMode, setPlayMode] = useState<PlayMode>(() => (searchParams.get("playMode") === "constructed" ? "constructed" : "limited"));
  const [opponents, setOpponents] = useState<OpponentCount>(() => {
    const p = Number(searchParams.get("puppetCount"));
    return OPPONENT_OPTIONS.includes(p as OpponentCount) ? (p as OpponentCount) : 3;
  });
  const [autoApproveSpectators, setAutoApproveSpectators] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>("solo");
  const [isGuidedMode, setIsGuidedMode] = useState(() =>
    getDefaultNewPlayerPreference(),
  );

  const [friendsLoading, setFriendsLoading] = useState(false);

  const [soloPhase, setSoloPhase] = useState<SoloPhase>("idle");
  const soloPhaseRef = useRef<SoloPhase>("idle");
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [maxAvailablePuppets, setMaxAvailablePuppets] = useState<number | null>(
    null,
  );

  const updateSoloPhase = useCallback((phase: SoloPhase) => {
    soloPhaseRef.current = phase;
    setSoloPhase(phase);
  }, []);

  const [soloStartEnded, setSoloStartEnded] = useState(false);
  const handleServerError = useCallback((error: AppError) => {
    addToast(getAppErrorMessage(error, "play-connection", "Something went wrong."), "error");
    if (soloPhaseRef.current === "navigating") setSoloStartEnded(true);
  }, [addToast]);

  const { lobbyState, gameState, actions, connectionError } = useGame(
    pendingGameId,
    pendingSessionId,
    null,
    handleServerError,
  );
  const lastLobbyErrorRef = useRef<string | null>(null);

  const { reset: resetWatcher } = useSoloLobbyWatcher(
    lobbyState,
    pendingGameId,
    soloPhaseRef,
    true,
    opponents,
    actions,
    (available) => {
      setMaxAvailablePuppets(available);
      updateSoloPhase("not-enough-puppets");
    },
    () => updateSoloPhase("starting"),
    () => updateSoloPhase("navigating"),
  );

  useEffect(() => {
    if (gameState?.game_id === pendingGameId && pendingGameId) {
      navigate(`/game/${pendingGameId}/play`);
    }
  }, [gameState?.game_id, navigate, pendingGameId]);

  useEffect(() => {
    if (
      friendsLoading &&
      pendingGameId &&
      lobbyState?.game_id === pendingGameId &&
      lobbyState.cube_loading_status === "ready"
    ) {
      navigate(`/game/${pendingGameId}/lobby`);
    }
  }, [friendsLoading, lobbyState?.cube_loading_status, lobbyState?.game_id, navigate, pendingGameId]);

  useEffect(() => {
    const nextError =
      lobbyState?.game_id === pendingGameId && lobbyState.cube_loading_status === "error"
        ? lobbyState.cube_loading_error
        : null;
    if (!nextError || nextError === lastLobbyErrorRef.current) {
      if (!nextError) {
        lastLobbyErrorRef.current = null;
      }
      return;
    }
    lastLobbyErrorRef.current = nextError;
    addToast(nextError, "error");
    startTransition(() => {
      if (friendsLoading) {
        setFriendsLoading(false);
      }
      if (soloPhase === "loading") {
        updateSoloPhase("idle");
        setMaxAvailablePuppets(null);
        resetWatcher();
      }
      if (pendingGameId) forgetSeatForGame(pendingGameId);
      setPendingGameId(null);
      setPendingSessionId(null);
    });
  }, [
    addToast,
    friendsLoading,
    lobbyState?.cube_loading_error,
    lobbyState?.cube_loading_status,
    lobbyState?.game_id,
    pendingGameId,
    resetWatcher,
    soloPhase,
    updateSoloPhase,
  ]);

  useEffect(() => {
    if (!pendingGameId) {
      lastLobbyErrorRef.current = null;
    }
  }, [pendingGameId]);

  useEffect(() => {
    if (connectionError && pendingGameId) {
      addToast(
        getAppErrorMessage(connectionError, "play-connection", "That game is no longer available. Please start a new one."),
        "error",
      );
      forgetSeatForGame(pendingGameId);
      startTransition(() => {
        setPendingGameId(null);
        setPendingSessionId(null);
        setFriendsLoading(false);
        updateSoloPhase("idle");
        resetWatcher();
      });
    }
  }, [connectionError, pendingGameId, addToast, updateSoloPhase, resetWatcher]);

  // The server refused or failed the start, and either way said why.
  useEffect(() => {
    if (!soloStartEnded) return;
    if (pendingGameId) forgetSeatForGame(pendingGameId);
    startTransition(() => {
      setSoloStartEnded(false);
      setPendingGameId(null);
      setPendingSessionId(null);
      updateSoloPhase("idle");
      resetWatcher();
    });
  }, [pendingGameId, resetWatcher, soloStartEnded, updateSoloPhase]);

  useEffect(() => {
    if (!cubeId) return;
    const timer = setTimeout(() => warmCubeCache(cubeId), 2000);
    return () => clearTimeout(timer);
  }, [cubeId]);

  const handleGuidedModeToggle = useCallback((nextValue: boolean) => {
    setIsGuidedMode(nextValue);
    setGlobalGuidedModePreference(nextValue);
  }, []);

  const handleCreateLobby = async () => {
    const name = playerName.trim();
    if (!name) {
      addToast("Please enter your name", "error");
      return;
    }
    const submittedCubeId = cubeId.trim();
    if (playMode === "constructed" && !submittedCubeId) {
      addToast("Please enter a CubeCobra ID", "error");
      return;
    }
    lastLobbyErrorRef.current = null;
    setFriendsLoading(true);
    try {
      const response = await createGame(name, {
        cubeId: submittedCubeId || "auto",
        useUpgrades,
        autoApproveSpectators,
        guidedModeDefault: isGuidedMode,
        playMode,
      });
      saveTabSession(response.game_id, { sessionId: response.session_id, playerId: response.player_id });
      if (!user) rememberGuestName(name);
      rememberPlayerForGame(response.game_id, name, {
        seatToken: response.seat_token,
        joinCode: response.join_code,
      });
      setNewPlayerPreferenceForGame(
        response.game_id,
        isGuidedMode,
        response.player_id,
      );
      setPendingGameId(response.game_id);
      setPendingSessionId(response.session_id);
    } catch (err) {
      addToast(normalizeCreateGameError(err), "error");
      setFriendsLoading(false);
    }
  };

  const handleStartSolo = async (opponentOverride?: OpponentCount) => {
    const count = opponentOverride ?? opponents;
    const name = playerName.trim();
    if (!name) {
      addToast("Please enter your name", "error");
      return;
    }
    const submittedCubeId = cubeId.trim();
    if (playMode === "constructed" && !submittedCubeId) {
      addToast("Please enter a CubeCobra ID", "error");
      return;
    }
    lastLobbyErrorRef.current = null;
    updateSoloPhase("loading");
    resetWatcher();
    try {
      const targetCount = count + 1;
      const response = await createGame(name, {
        cubeId: submittedCubeId || "auto",
        useUpgrades,
        targetPlayerCount: targetCount,
        puppetCount: count,
        guidedModeDefault: isGuidedMode,
        playMode,
      });
      saveTabSession(response.game_id, { sessionId: response.session_id, playerId: response.player_id });
      if (!user) rememberGuestName(name);
      rememberPlayerForGame(response.game_id, name, {
        seatToken: response.seat_token,
        joinCode: response.join_code,
      });
      setNewPlayerPreferenceForGame(
        response.game_id,
        isGuidedMode,
        response.player_id,
      );
      setPendingGameId(response.game_id);
      setPendingSessionId(response.session_id);
    } catch (err) {
      addToast(normalizeCreateGameError(err), "error");
      updateSoloPhase("idle");
    }
  };

  const handleCancelFriends = () => {
    if (pendingGameId) forgetSeatForGame(pendingGameId);
    setFriendsLoading(false);
    setPendingGameId(null);
    setPendingSessionId(null);
    lastLobbyErrorRef.current = null;
  };

  const handleCancelSolo = () => {
    if (pendingGameId) forgetSeatForGame(pendingGameId);
    updateSoloPhase("idle");
    setPendingGameId(null);
    setPendingSessionId(null);
    setMaxAvailablePuppets(null);
    resetWatcher();
    lastLobbyErrorRef.current = null;
  };

  const validRecoveryCounts = OPPONENT_OPTIONS.filter(
    (n) => maxAvailablePuppets !== null && n <= maxAvailablePuppets,
  );

  const nameValid = playerName.trim().length > 0;

  const soloLoading =
    soloPhase !== "idle" && soloPhase !== "not-enough-puppets";

  const handleNameEnter = () => {
    if (!nameValid) return;
    if (activeMode === "friends") {
      if (!friendsLoading) void handleCreateLobby();
    } else if (soloPhase === "idle") {
      void handleStartSolo();
    }
  };

  const cubeLook = useCubeLook(bannerCubeId || (playMode === "limited" ? "auto" : null));

  const seats = resumableGames.filter((seat) => !closedIds.includes(seat.gameId));
  // Closing the last game in the list leaves nothing to list.
  const shownView = view === "resume" && seats.length === 0 ? "setup" : view;

  const showView = (next: PlayView, byKeyboard = false) => {
    if (view === "options") setBannerCubeId(cubeId.trim());
    setView(next);
    // The button a key pressed can leave with its view, and the strip's button is in all of them.
    if (byKeyboard) stripButtonRef.current?.focus({ preventScroll: true });
  };
  useHotkeys(
    { escape: () => showView("setup", true) },
    shownView !== "setup" && !showJoinModal && !seatToClose,
  );

  const stripLabel = {
    setup: [
      playMode === "constructed" ? "Constructed" : "Limited",
      ...(activeMode === "solo" ? [`${opponents} ${opponents === 1 ? "opponent" : "opponents"}`] : []),
      `Upgrades\u00a0${useUpgrades ? "On" : "Off"}`,
    ].join(" · "),
    options: activeMode === "solo" ? "Goldfish options" : "Friends options",
    resume: `${seats.length} ${seats.length === 1 ? "game" : "games"} to resume`,
  }[shownView];

  const startLoading = activeMode === "solo" ? soloLoading : friendsLoading;
  const startNewGame = () => {
    if (activeMode === "solo") void handleStartSolo();
    else void handleCreateLobby();
  };

  return (
    <>
      <PageFrame
        header={<AppHeader
          helpers={
            <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary hidden sm:inline-block">
              Join Game
            </button>
          }
          home={<HomeButton />}
        />}
        scroll={false}
        contentClassName="setup-page"
        hints="play"
      >
        <CubeBanner look={cubeLook} playMode={playMode}>
          <p className="setup-summary">{stripLabel}</p>
          <button
            ref={stripButtonRef}
            type="button"
            onClick={() => showView(shownView === "setup" ? "options" : "setup")}
            className="btn btn-secondary btn-pill"
          >
            {shownView === "setup" ? "Change cube" : "Back"}
          </button>
        </CubeBanner>

        {shownView === "setup" && (
          <>
            <div className="setup-felt play-felt">
              <SegmentedFilter
                label="How to play"
                options={MODE_OPTIONS}
                value={activeMode}
                onChange={setActiveMode}
                variant="field"
              />
              <ModePitch mode={activeMode} />
              <div className="setup-row">
                {user ? (
                  <div className="setup-field">
                    <span className="setup-caption">Your name</span>
                    <span className="setup-value">{playerName}</span>
                  </div>
                ) : (
                  <label className="setup-field">
                    <span className="setup-caption">Your name</span>
                    <input
                      id="player-name"
                      type="text"
                      value={nameLoading ? "" : playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNameEnter()}
                      disabled={nameLoading}
                      placeholder={nameLoading ? "Generating name..." : "Enter your name"}
                      className="setup-input"
                    />
                  </label>
                )}
                <GuidedSwitch enabled={isGuidedMode} setEnabled={handleGuidedModeToggle} />
              </div>
              {startLoading ? (
                <button
                  onClick={soloLoading ? handleCancelSolo : handleCancelFriends}
                  className="btn btn-secondary setup-next"
                >
                  <Spinner className="h-4 w-4" />
                  Loading...
                </button>
              ) : (
                <button onClick={startNewGame} disabled={!nameValid} className="btn btn-primary setup-next">
                  {activeMode === "solo" ? "Start Game" : "Create Lobby"}
                </button>
              )}
            </div>
            <ResumeShelf
              seats={seats}
              onClose={setSeatToClose}
              onShowAll={(byKeyboard) => showView("resume", byKeyboard)}
            />
          </>
        )}

        {shownView === "options" && (
          <div className="setup-felt play-felt">
            <label className="setup-field">
              <span className="setup-caption">CubeCobra ID</span>
              <input
                type="text"
                value={cubeId}
                onChange={(e) => setCubeId(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && showView("setup", true)}
                placeholder="auto"
                className="setup-input"
              />
            </label>
            <SegmentedFilter
              label="Limited or Constructed"
              options={PLAY_MODE_OPTIONS}
              value={playMode}
              onChange={setPlayMode}
              variant="field"
            />
            {activeMode === "solo" ? (
              <div className="setup-row">
                <span className="setup-row-label">Opponents</span>
                <SegmentedFilter
                  label="Opponents"
                  options={OPPONENT_OPTIONS.map((n) => ({ value: String(n), label: n }))}
                  value={String(opponents)}
                  onChange={(value) => setOpponents(Number(value) as OpponentCount)}
                  variant="field"
                />
              </div>
            ) : (
              <Switch spread checked={autoApproveSpectators} onChange={setAutoApproveSpectators}>
                Open Spectating · let anyone watch
              </Switch>
            )}
            <Switch spread checked={useUpgrades} onChange={setUseUpgrades}>
              Upgrades · upgrade a card every 3 rounds
            </Switch>
            <button
              onClick={(event) => showView("setup", event.detail === 0)}
              className="btn btn-primary setup-next"
            >
              Done
            </button>
          </div>
        )}

        {shownView === "resume" && <ResumeList seats={seats} onClose={setSeatToClose} />}
      </PageFrame>

      {showJoinModal && <JoinGameModal onClose={() => setShowJoinModal(false)} />}

      {seatToClose && (
        <CloseSeatDialog
          seat={seatToClose}
          onKeep={() => setSeatToClose(null)}
          onClosed={() => {
            setClosedIds((ids) => [...ids, seatToClose.gameId]);
            setSeatToClose(null);
          }}
        />
      )}

      {(soloLoading || friendsLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[1px]"
          onClick={soloLoading ? handleCancelSolo : handleCancelFriends}
        />
      )}

      {soloPhase === "not-enough-puppets" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 ${DIALOG_BACKDROP}`}
            onClick={handleCancelSolo}
          />
          <SurfaceCard className="relative text-center">
            <h2 className="text-xl font-bold text-white mb-4">
              Not enough puppet data
            </h2>
            <p className="text-[var(--ivory-muted)] mb-6">
              You requested {opponents} opponent{opponents > 1 && "s"}, but only{" "}
              {maxAvailablePuppets} {maxAvailablePuppets === 1 ? "is" : "are"}{" "}
              available for this cube.
            </p>
            {validRecoveryCounts.length > 0 ? (
              <>
                <p className="text-[var(--ivory-muted)] text-sm mb-3">Play with:</p>
                <RecoveryOpponentPicker
                  counts={validRecoveryCounts}
                  onSelect={(count) => {
                    if (pendingGameId) forgetSeatForGame(pendingGameId);
                    updateSoloPhase("idle");
                    setPendingGameId(null);
                    setPendingSessionId(null);
                    handleStartSolo(count);
                  }}
                />
              </>
            ) : (
              <p className="text-[var(--ivory-muted)] text-sm mb-4">
                No puppet data exists for this cube yet. Play with friends to
                generate data.
              </p>
            )}
            <button
              onClick={handleCancelSolo}
              className="btn btn-secondary py-2 px-6 mt-4"
            >
              Cancel
            </button>
          </SurfaceCard>
        </div>
      )}
    </>
  );
}

function RecoveryOpponentPicker({
  counts,
  onSelect,
}: {
  counts: OpponentCount[];
  onSelect: (count: OpponentCount) => void;
}) {
  const [selected, setSelected] = useState<OpponentCount | null>(null);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {counts.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`btn ${selected === n ? "btn-primary" : "btn-secondary"} text-sm font-medium`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-[var(--ivory-muted)] text-xs">opponents</span>
      {selected !== null && (
        <button
          onClick={() => onSelect(selected)}
          className="btn btn-primary py-2 px-6"
        >
          Start
        </button>
      )}
    </div>
  );
}

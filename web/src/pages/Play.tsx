import { startTransition, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createGame, warmCubeCache } from "../api/client";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { useToast } from "../contexts";
import { useAuth } from "../contexts/authState";
import { GoldfishIcon } from "../components/icons/GoldfishIcon";
import { InfoIcon } from "../components/icons/InfoIcon";
import { HintsBanner } from "../components/common/HintsBanner";
import { CubeCobraPrimerLink } from "../components/common/CubeCobraPrimerLink";
import { getLegendaryName } from "../utils/prefetchName";
import {
  getDefaultNewPlayerPreference,
  rememberPlayerForGame,
  setGlobalGuidedModePreference,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import { FaDiscord } from "react-icons/fa6";
import type { LobbyState, PlayMode } from "../types";
import { type AppError, getAppErrorMessage, unknownToAppError } from "../utils/appError";

type SoloPhase =
  | "idle"
  | "loading"
  | "not-enough-puppets"
  | "starting"
  | "navigating";
type OpponentCount = 1 | 3 | 5 | 7;
type ActiveMode = "friends" | "solo";
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

function useRandomMtgName(): [string, (v: string) => void, boolean] {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return [name, setName, loading];
}

function FriendsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-7 h-7 text-amber-400"}
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

function AdvancedOptionsModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative modal-chrome border gold-border rounded-lg p-5 w-full max-w-sm felt-raised-panel">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/40">
          <h3 className="text-white font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/35 btn-dark-border text-gray-300 hover:bg-black/20 hover:text-white transition-all text-sm flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        <button
          onClick={onClose}
          className="btn btn-primary play-action-btn w-full py-2 mt-4"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CubeIdInput({
  cubeId,
  setCubeId,
}: {
  cubeId: string;
  setCubeId: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-white text-sm mb-1">CubeCobra ID</label>
      <input
        type="text"
        value={cubeId}
        onChange={(e) => setCubeId(e.target.value)}
        className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
        placeholder="auto"
      />
    </div>
  );
}

function UpgradesCheckbox({
  useUpgrades,
  setUseUpgrades,
}: {
  useUpgrades: boolean;
  setUseUpgrades: (v: boolean) => void;
}) {
  return (
    <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={useUpgrades}
        onChange={(e) => setUseUpgrades(e.target.checked)}
        className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
      />
      <span className="text-white text-sm">Upgrades</span>
      <span className="text-gray-500 text-xs">
        — upgrade a card every 3 rounds
      </span>
    </label>
  );
}

function ConstructedCheckbox({
  playMode,
  setPlayMode,
}: {
  playMode: PlayMode;
  setPlayMode: (mode: PlayMode) => void;
}) {
  const isConstructed = playMode === "constructed";
  return (
    <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={isConstructed}
        onChange={(e) => setPlayMode(e.target.checked ? "constructed" : "limited")}
        className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
      />
      <span className="text-white text-sm">Constructed</span>
      <span className="text-gray-500 text-xs">
        — bring your own deck
      </span>
    </label>
  );
}

function GuidedModeField({
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

  return (
    <div className="bg-black/40 border border-black/40 text-white rounded px-3 h-[42px] min-w-[118px] sm:min-w-[132px] flex items-center justify-end gap-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="sr-only peer"
          aria-label="Guided mode"
        />
        <span
          className={`text-xs font-medium uppercase tracking-wide ${enabled ? "text-amber-300" : "text-gray-500"
            }`}
        >
          {enabled ? "On" : "Off"}
        </span>
        <span className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors bg-gray-700 peer-checked:bg-amber-500">
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-1"
              }`}
          />
        </span>
      </label>
      <div ref={guidedModeHelpRef} className="relative group shrink-0">
        <button
          type="button"
          className="text-gray-400 hover:text-gray-200"
          aria-label="What guided mode does"
          aria-expanded={showGuidedModeHelp}
          onClick={() => setShowGuidedModeHelp((v) => !v)}
        >
          <InfoIcon size="sm" />
        </button>
        <span
          className={`absolute right-0 top-full mt-2 w-64 rounded-lg modal-chrome border gold-border shadow-xl p-2 text-left text-[11px] text-gray-100 transition-opacity z-50 ${showGuidedModeHelp
            ? "opacity-100"
            : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
        >
          {guidedModeHelpText}
        </span>
      </div>
    </div>
  );
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-[42px] w-[42px] shrink-0 rounded-lg bg-white/20 btn-dark-border text-gray-300 hover:bg-white/30 hover:text-white transition-all flex items-center justify-center text-base"
      title="Advanced Options"
    >
      ⚙
    </button>
  );
}

export function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { saveSession } = useSession();
  const { addToast } = useToast();

  const { user } = useAuth();
  const [randomName, setRandomName, nameLoading] = useRandomMtgName();
  const playerName = user ? user.username : randomName;
  const setPlayerName = user ? () => {} : setRandomName;
  const [showFriendsAdvanced, setShowFriendsAdvanced] = useState(false);
  const [showSoloAdvanced, setShowSoloAdvanced] = useState(false);
  const [cubeId, setCubeId] = useState(() => searchParams.get("cubeId") || "auto");
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

  const handleServerError = useCallback((error: AppError) => {
    addToast(getAppErrorMessage(error, "solo-action", "Something went wrong."), "error");
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
      startTransition(() => {
        setPendingGameId(null);
        setPendingSessionId(null);
        setFriendsLoading(false);
        updateSoloPhase("idle");
        resetWatcher();
      });
    }
  }, [connectionError, pendingGameId, addToast, updateSoloPhase, resetWatcher]);

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
    if (!playerName.trim()) {
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
      const response = await createGame(playerName, {
        cubeId: submittedCubeId || "auto",
        useUpgrades,
        autoApproveSpectators,
        guidedModeDefault: isGuidedMode,
        playMode,
      });
      saveSession(response.session_id, response.player_id);
      rememberPlayerForGame(response.game_id, playerName.trim());
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
    if (!playerName.trim()) {
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
      const response = await createGame(playerName, {
        cubeId: submittedCubeId || "auto",
        useUpgrades,
        targetPlayerCount: targetCount,
        puppetCount: count,
        guidedModeDefault: isGuidedMode,
        playMode,
      });
      saveSession(response.session_id, response.player_id);
      rememberPlayerForGame(response.game_id, playerName.trim());
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
    setFriendsLoading(false);
    setPendingGameId(null);
    setPendingSessionId(null);
    lastLobbyErrorRef.current = null;
  };

  const handleCancelSolo = () => {
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

  const inactiveCard = (
    mode: ActiveMode,
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      onClick={() => setActiveMode(mode)}
      className="shrink-0 bg-black/35 rounded-lg px-4 py-3 border border-black/40 flex items-center gap-3 w-full text-left hover:bg-black/30 transition-colors"
    >
      {icon}
      <span className="text-white font-medium text-sm">{label}</span>
      <span className="ml-auto text-gray-500 text-xs">▶</span>
    </button>
  );

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 py-3 frame-chrome bar-pad-both">
        <div className="hidden sm:flex items-center justify-between">
          <div>
            <div className="flex items-baseline">
              <h1 className="hero-title text-[32px] font-bold tracking-wide leading-tight">
                Crucible
              </h1>
              <span className="hero-sep mx-2.5">—</span>
              <span className="hero-subtitle text-base font-normal tracking-widest">
                an MtG format
              </span>
            </div>
            <p className="hero-tagline">
              Inspired by Roguelikes and Autobattlers
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary py-2 px-4"
            >
              Home
            </button>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline whitespace-nowrap">
                <h1 className="hero-title text-lg font-bold tracking-wide leading-tight">
                  Crucible
                </h1>
                <span className="hero-sep mx-1 text-xs">—</span>
                <span className="hero-subtitle text-[11px] font-normal tracking-wider">
                  an MtG format
                </span>
              </div>
              <p className="hero-tagline !text-[9px] !tracking-[0.04em]">
                Inspired by Roguelikes and Autobattlers
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary py-1.5 px-3 text-sm shrink-0"
            >
              Home
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-h-0 flex flex-col px-4 py-4 sm:py-2 sm:items-center sm:justify-center overflow-auto">
            <section className="w-full max-w-md mx-auto modal-chrome border gold-border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col sm:flex-none felt-raised-panel">
              <div className="p-4 sm:p-5 flex-1 min-h-0 flex flex-col sm:flex-none">
                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label htmlFor="player-name" className="block text-gray-300 text-sm">
                      Your Name
                    </label>
                    <span className="block text-gray-300 text-sm text-right shrink-0">
                      Guided Mode
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 sm:gap-3">
                    {user ? (
                      <div className="w-full h-[42px] bg-black/20 border border-black/30 text-amber-100 rounded px-3 py-2 text-base flex items-center">
                        {playerName}
                      </div>
                    ) : (
                      <input
                        id="player-name"
                        type="text"
                        value={nameLoading ? "" : playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && nameValid && handleCreateLobby()
                        }
                        disabled={nameLoading}
                        placeholder={nameLoading ? "Generating name..." : "Enter your name"}
                        className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                      />
                    )}
                    <GuidedModeField enabled={isGuidedMode} setEnabled={handleGuidedModeToggle} />
                  </div>
                </div>

                {/* Single active-mode card for all breakpoints */}
                <div className="w-full max-w-md mx-auto flex-1 min-h-0 sm:flex-none flex flex-col gap-3">
                  {activeMode === "solo" ? (
                    <>
                      {inactiveCard(
                        "friends",
                        <FriendsIcon className="w-5 h-5 text-amber-400 shrink-0" />,
                        "Play with Friends",
                      )}
                      <div className="bg-black/35 rounded-lg p-5 border border-black/40 flex flex-col flex-1 min-h-0">
                        <div className="flex items-center gap-3 mb-2">
                          <GoldfishIcon className="w-8 h-8 text-amber-400" />
                          <h2 className="text-lg font-semibold text-white">Goldfish</h2>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                          <p className="description-panel italic text-gray-200 text-base leading-relaxed px-4 py-3">
                            <span className="block text-amber-400/70">
                              Battle historically winning hands!
                            </span>
                            <span className="block">
                              Their cards are face up in battle. You can move them around to simulate the game and decide who would have won.
                            </span>
                          </p>
                        </div>
                        <div className="mt-auto flex gap-2 pt-4">
                          <button
                            onClick={soloLoading ? handleCancelSolo : () => handleStartSolo()}
                            disabled={soloLoading ? false : !nameValid}
                            className={`play-action-btn flex-1 py-2 flex items-center justify-center gap-2 ${soloLoading ? "btn btn-secondary" : "btn btn-primary"}`}
                          >
                            {soloLoading ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Loading...
                              </>
                            ) : (
                              "Start Game"
                            )}
                          </button>
                          <GearButton onClick={() => setShowSoloAdvanced(true)} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {inactiveCard(
                        "solo",
                        <GoldfishIcon className="w-5 h-5 text-amber-400 shrink-0" />,
                        "Goldfish",
                      )}
                      <div className="bg-black/35 rounded-lg p-5 border border-black/40 flex flex-col flex-1 min-h-0">
                        <div className="flex items-center gap-3 mb-2">
                          <FriendsIcon className="w-8 h-8 text-amber-400" />
                          <h2 className="text-lg font-semibold text-white">
                            Play with Friends
                          </h2>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                          <p className="description-panel italic text-gray-200 text-base leading-relaxed px-4 py-3">
                            <span className="block text-amber-400/70">
                              Draft an unbeatable hand!
                            </span>
                            <span className="block">
                              See who is the best drafter. Everybody starts with trash, and it's up to you to turn it into treasure!
                            </span>
                          </p>
                        </div>
                        <div className="mt-auto flex gap-2 pt-4">
                          <button
                            onClick={friendsLoading ? handleCancelFriends : handleCreateLobby}
                            disabled={friendsLoading ? false : !nameValid}
                            className={`play-action-btn flex-1 py-2 flex items-center justify-center gap-2 ${friendsLoading ? "btn btn-secondary" : "btn btn-primary"}`}
                          >
                            {friendsLoading ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Loading...
                              </>
                            ) : (
                              "Create Lobby"
                            )}
                          </button>
                          <GearButton onClick={() => setShowFriendsAdvanced(true)} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
          <HintsBanner variant="rail" />
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a
            href="https://discord.gg/2NAjcWXNKn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
          >
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>

      {showFriendsAdvanced && (
        <AdvancedOptionsModal
          title="Friends Options"
          onClose={() => setShowFriendsAdvanced(false)}
        >
          <CubeIdInput cubeId={cubeId} setCubeId={setCubeId} />
          <ConstructedCheckbox playMode={playMode} setPlayMode={setPlayMode} />
          <UpgradesCheckbox
            useUpgrades={useUpgrades}
            setUseUpgrades={setUseUpgrades}
          />
          <label className="bg-black/35 border border-black/40 rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApproveSpectators}
              onChange={(e) => setAutoApproveSpectators(e.target.checked)}
              className="w-4 h-4 rounded bg-black/40 border-black/40 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-white text-sm">Open Spectating</span>
            <span className="text-gray-500 text-xs">— let anyone watch</span>
          </label>
        </AdvancedOptionsModal>
      )}

      {showSoloAdvanced && (
        <AdvancedOptionsModal
          title="Solo Options"
          onClose={() => setShowSoloAdvanced(false)}
        >
          <CubeIdInput cubeId={cubeId} setCubeId={setCubeId} />
          <ConstructedCheckbox playMode={playMode} setPlayMode={setPlayMode} />
          <UpgradesCheckbox
            useUpgrades={useUpgrades}
            setUseUpgrades={setUseUpgrades}
          />
          <div className="bg-black/35 border border-black/40 rounded-lg p-3">
            <label className="block text-gray-300 text-sm mb-2">
              Opponents
            </label>
            <div className="flex gap-1.5">
              {OPPONENT_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => setOpponents(count)}
                  className={`px-3 py-1.5 rounded text-sm font-medium btn-dark-border transition-colors ${opponents === count
                    ? "bg-amber-500 text-black"
                    : "bg-black/40 text-gray-300 hover:bg-black/30"
                    }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </AdvancedOptionsModal>
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCancelSolo}
          />
          <div className="relative modal-chrome border gold-border rounded-lg p-8 w-full max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-4">
              Not enough puppet data
            </h2>
            <p className="text-gray-300 mb-6">
              You requested {opponents} opponent{opponents > 1 && "s"}, but only{" "}
              {maxAvailablePuppets} {maxAvailablePuppets === 1 ? "is" : "are"}{" "}
              available for this cube.
            </p>
            {validRecoveryCounts.length > 0 ? (
              <>
                <p className="text-gray-400 text-sm mb-3">Play with:</p>
                <RecoveryOpponentPicker
                  counts={validRecoveryCounts}
                  onSelect={(count) => {
                    updateSoloPhase("idle");
                    setPendingGameId(null);
                    setPendingSessionId(null);
                    handleStartSolo(count);
                  }}
                />
              </>
            ) : (
              <p className="text-gray-400 text-sm mb-4">
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
          </div>
        </div>
      )}
    </div>
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
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selected === n
              ? "bg-amber-500 text-black"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-gray-500 text-xs">opponents</span>
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

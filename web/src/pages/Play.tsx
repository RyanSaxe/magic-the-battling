import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createGame, warmCubeCache } from "../api/client";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { useToast } from "../contexts";
import { PuppetIcon } from "../components/icons/PuppetIcon";
import { HintsBanner } from "../components/common/HintsBanner";
import { getLegendaryName } from "../utils/prefetchName";
import type { LobbyState } from "../types";

type SoloPhase =
  | "idle"
  | "loading"
  | "not-enough-puppets"
  | "starting"
  | "navigating";
type OpponentCount = 1 | 3 | 5 | 7;
type ActiveMode = "friends" | "solo";
const OPPONENT_OPTIONS: OpponentCount[] = [1, 3, 5, 7];

function useSoloLobbyWatcher(
  lobbyState: LobbyState | null,
  soloGameId: string | null,
  soloPhaseRef: React.RefObject<SoloPhase>,
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
    if (!soloGameId || !lobbyState) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyState, soloGameId]);

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
      <div className="relative bg-gray-900 border border-white/10 rounded-lg p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white transition-all text-sm flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        <button onClick={onClose} className="btn btn-primary w-full py-2 mt-5">
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
      <label className="block text-gray-300 text-sm mb-1">CubeCobra ID</label>
      <input
        type="text"
        value={cubeId}
        onChange={(e) => setCubeId(e.target.value)}
        className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={useUpgrades}
        onChange={(e) => setUseUpgrades(e.target.checked)}
        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
      />
      <span className="text-white text-sm">Upgrades</span>
      <span className="text-gray-500 text-xs">
        — upgrade a card every 3 rounds
      </span>
    </label>
  );
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 self-stretch shrink-0 rounded-lg bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white transition-all flex items-center justify-center text-lg"
      title="Advanced Options"
    >
      ⚙
    </button>
  );
}

export function Play() {
  const navigate = useNavigate();
  const { saveSession } = useSession();
  const { addToast } = useToast();

  const [playerName, setPlayerName, nameLoading] = useRandomMtgName();
  const [showFriendsAdvanced, setShowFriendsAdvanced] = useState(false);
  const [showSoloAdvanced, setShowSoloAdvanced] = useState(false);
  const [cubeId, setCubeId] = useState("auto");
  const [useUpgrades, setUseUpgrades] = useState(true);
  const [opponents, setOpponents] = useState<OpponentCount>(3);
  const [autoApproveSpectators, setAutoApproveSpectators] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>("solo");

  const [friendsLoading, setFriendsLoading] = useState(false);

  const [soloPhase, setSoloPhase] = useState<SoloPhase>("idle");
  const soloPhaseRef = useRef<SoloPhase>("idle");
  const [soloGameId, setSoloGameId] = useState<string | null>(null);
  const [soloSessionId, setSoloSessionId] = useState<string | null>(null);
  const [maxAvailablePuppets, setMaxAvailablePuppets] = useState<number | null>(
    null,
  );

  const updateSoloPhase = useCallback((phase: SoloPhase) => {
    soloPhaseRef.current = phase;
    setSoloPhase(phase);
  }, []);

  const { lobbyState, gameState, actions } = useGame(
    soloGameId,
    soloSessionId,
    null,
    addToast,
  );

  const { reset: resetWatcher } = useSoloLobbyWatcher(
    lobbyState,
    soloGameId,
    soloPhaseRef,
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
    if (gameState && soloGameId) {
      navigate(`/game/${soloGameId}/play`);
    }
  }, [gameState, soloGameId, navigate]);

  useEffect(() => {
    warmCubeCache(cubeId || "auto");
  }, [cubeId]);

  const handleCreateLobby = async () => {
    if (!playerName.trim()) {
      addToast("Please enter your name", "error");
      return;
    }
    setFriendsLoading(true);
    try {
      const response = await createGame(playerName, {
        cubeId: cubeId || "auto",
        useUpgrades,
        autoApproveSpectators,
      });
      saveSession(response.session_id, response.player_id);
      navigate(`/game/${response.game_id}/lobby`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create game", "error");
      setFriendsLoading(false);
    }
  };

  const handleStartSolo = async (opponentOverride?: OpponentCount) => {
    const count = opponentOverride ?? opponents;
    if (!playerName.trim()) {
      addToast("Please enter your name", "error");
      return;
    }
    updateSoloPhase("loading");
    resetWatcher();
    try {
      const targetCount = count + 1;
      const response = await createGame(playerName, {
        cubeId: cubeId || "auto",
        useUpgrades,
        targetPlayerCount: targetCount,
        puppetCount: count,
      });
      saveSession(response.session_id, response.player_id);
      setSoloGameId(response.game_id);
      setSoloSessionId(response.session_id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create game", "error");
      updateSoloPhase("idle");
    }
  };

  const handleCancelSolo = () => {
    updateSoloPhase("idle");
    setSoloGameId(null);
    setSoloSessionId(null);
    setMaxAvailablePuppets(null);
    resetWatcher();
  };

  const validRecoveryCounts = OPPONENT_OPTIONS.filter(
    (n) => maxAvailablePuppets !== null && n <= maxAvailablePuppets,
  );

  const nameValid = playerName.trim().length > 0;

  const loadingMessage = (() => {
    if (soloPhase === "navigating") return "Starting game...";
    const cubeReady = lobbyState?.cube_loading_status === "ready";
    if (!cubeReady) return "Loading card pool...";
    if (soloPhase === "starting") {
      return `Finding puppet opponents... Found ${lobbyState?.available_puppet_count ?? 0} of ${opponents}`;
    }
    return "Preparing...";
  })();

  const soloLoading = soloPhase !== "idle" && soloPhase !== "not-enough-puppets";

  const inactiveCard = (
    mode: ActiveMode,
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      onClick={() => setActiveMode(mode)}
      className="shrink-0 bg-black/60 backdrop-blur rounded-lg px-4 py-3 border border-white/10 flex items-center gap-3 w-full text-left hover:bg-black/50 transition-colors"
    >
      {icon}
      <span className="text-white font-medium text-sm">{label}</span>
      <span className="ml-auto text-gray-500 text-xs">▶</span>
    </button>
  );

  return (
    <div className="game-table h-dvh flex flex-col sm:justify-center p-4">
      <div className="shrink-0 w-full max-w-5xl mx-auto">
        <div className="mb-2">
          <button
            onClick={() => navigate("/")}
            className="w-7 h-7 rounded-full bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white transition-all text-sm flex items-center justify-center"
            title="Back to Home"
          >
            ←
          </button>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-4">
          How do you want to play?
        </h1>

        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-1">Your Name</label>
          <input
            type="text"
            value={nameLoading ? "" : playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && nameValid && handleCreateLobby()
            }
            disabled={nameLoading}
            placeholder={nameLoading ? "Generating name..." : "Enter your name"}
            className="w-full bg-black/40 border border-white/10 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
        </div>

        <div className="mb-4">
          <HintsBanner />
        </div>
      </div>

      {/* Mobile: stacked cards, inactive always on top */}
      <div className="sm:hidden flex-1 flex flex-col gap-3 w-full max-w-5xl mx-auto min-h-0">
        {activeMode === "solo" ? (
          <>
            {inactiveCard(
              "friends",
              <FriendsIcon className="w-5 h-5 text-amber-400 shrink-0" />,
              "Play with Friends",
            )}
            <div className="flex-1 bg-black/60 backdrop-blur rounded-lg p-5 border border-white/10 border-l-2 border-l-amber-400 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <PuppetIcon size="lg" className="text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">Play Solo</h2>
              </div>
              <div className="text-center px-2">
                <span className="text-2xl text-amber-500/60 leading-none block">{"\u201C"}</span>
                <p className="italic text-gray-300/90 text-sm leading-relaxed">
                  Battle against hands that real players piloted to strong
                  finishes. Their cards are face up, and you decide who would win
                  each battle.
                </p>
              </div>
              <div className="mt-auto flex gap-2 pt-4 relative z-50">
                {soloLoading ? (
                  <button
                    onClick={handleCancelSolo}
                    className="btn btn-secondary flex-1 py-2 flex items-center justify-center gap-2"
                  >
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {loadingMessage}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleStartSolo()}
                      disabled={!nameValid}
                      className="btn btn-primary flex-1 py-2"
                    >
                      Start Game
                    </button>
                    <GearButton onClick={() => setShowSoloAdvanced(true)} />
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {inactiveCard(
              "solo",
              <PuppetIcon size="sm" className="text-cyan-400 shrink-0" />,
              "Play Solo",
            )}
            <div className="flex-1 bg-black/60 backdrop-blur rounded-lg p-5 border border-white/10 border-l-2 border-l-amber-400 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <FriendsIcon className="w-8 h-8 text-amber-400" />
                <h2 className="text-lg font-semibold text-white">
                  Play with Friends
                </h2>
              </div>
              <div className="text-center px-2">
                <span className="text-2xl text-amber-500/60 leading-none block">{"\u201C"}</span>
                <p className="italic text-gray-300/90 text-sm leading-relaxed">
                  Compete head-to-head with your friends to see who can navigate
                  from random cards to a completely unbeatable starting hand.
                </p>
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <button
                  onClick={handleCreateLobby}
                  disabled={!nameValid || friendsLoading}
                  className="btn btn-primary flex-1 py-2"
                >
                  {friendsLoading ? "Creating..." : "Create Lobby"}
                </button>
                <GearButton onClick={() => setShowFriendsAdvanced(true)} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop: side-by-side cards */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-4 w-full max-w-5xl mx-auto">
        <div className="bg-black/60 backdrop-blur rounded-lg p-5 border border-white/10 flex flex-col">
          <div className="text-2xl mb-2">
            <FriendsIcon className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Play with Friends
          </h2>
          <div className="text-center px-2">
            <span className="text-2xl text-amber-500/60 leading-none block">{"\u201C"}</span>
            <p className="italic text-gray-300/90 text-sm leading-relaxed">
              Compete head-to-head with your friends to see who can navigate from
              random cards to a completely unbeatable starting hand.
            </p>
          </div>
          <div className="mt-auto flex gap-2 pt-4">
            <button
              onClick={handleCreateLobby}
              disabled={!nameValid || friendsLoading}
              className="btn btn-primary flex-1 py-2"
            >
              {friendsLoading ? "Creating..." : "Create Lobby"}
            </button>
            <GearButton onClick={() => setShowFriendsAdvanced(true)} />
          </div>
        </div>
        <div className="bg-black/60 backdrop-blur rounded-lg p-5 border border-white/10 flex flex-col">
          <div className="text-2xl mb-2">
            <PuppetIcon size="lg" className="text-cyan-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">Play Solo</h2>
          <div className="text-center px-2">
            <span className="text-2xl text-amber-500/60 leading-none block">{"\u201C"}</span>
            <p className="italic text-gray-300/90 text-sm leading-relaxed">
              Battle against hands that real players piloted to strong finishes.
              Their cards are face up, and you decide who would win each battle.
            </p>
          </div>
          <div className="mt-auto flex gap-2 pt-4 relative z-50">
            {soloLoading ? (
              <button
                onClick={handleCancelSolo}
                className="btn btn-secondary flex-1 py-2 flex items-center justify-center gap-2"
              >
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {loadingMessage}
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStartSolo()}
                  disabled={!nameValid}
                  className="btn btn-primary flex-1 py-2"
                >
                  Start Game
                </button>
                <GearButton onClick={() => setShowSoloAdvanced(true)} />
              </>
            )}
          </div>
        </div>
      </div>

      {showFriendsAdvanced && (
        <AdvancedOptionsModal
          title="Friends Options"
          onClose={() => setShowFriendsAdvanced(false)}
        >
          <CubeIdInput cubeId={cubeId} setCubeId={setCubeId} />
          <UpgradesCheckbox
            useUpgrades={useUpgrades}
            setUseUpgrades={setUseUpgrades}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApproveSpectators}
              onChange={(e) => setAutoApproveSpectators(e.target.checked)}
              className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
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
          <UpgradesCheckbox
            useUpgrades={useUpgrades}
            setUseUpgrades={setUseUpgrades}
          />
          <div>
            <label className="block text-gray-300 text-sm mb-1">
              Opponents
            </label>
            <div className="flex gap-1.5">
              {OPPONENT_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => setOpponents(count)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    opponents === count
                      ? "bg-amber-500 text-black"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </AdvancedOptionsModal>
      )}

      {soloLoading && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={handleCancelSolo}
        />
      )}

      {soloPhase === "not-enough-puppets" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCancelSolo}
          />
          <div className="relative bg-gray-900 border border-white/10 rounded-lg p-8 w-full max-w-md text-center">
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
                    setSoloGameId(null);
                    setSoloSessionId(null);
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
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selected === n
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

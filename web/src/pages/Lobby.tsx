import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { rejoinGame } from "../api/client";
import { useHotkeys } from "../hooks/useHotkeys";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";

export function Lobby() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { session, saveSession } = useSession();
  const { addToast } = useToast();
  const { lobbyState, gameState, isConnected, kicked, actions } = useGame(
    gameId ?? null,
    session?.sessionId ?? null,
    null,
    addToast,
  );

  const [rejoinName, setRejoinName] = useState("");
  const [rejoinError, setRejoinError] = useState("");
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [rulesPanelTarget, setRulesPanelTarget] = useState<
    RulesPanelTarget | undefined
  >(undefined);

  const currentPlayer = lobbyState?.players.find(
    (p) => p.player_id === session?.playerId,
  );
  const lobbyHotkeyMap: Record<string, () => void> = {
    "?": () => {
      setRulesPanelTarget(undefined);
      setShowRulesPanel(true);
    },
  };
  if (lobbyState && currentPlayer && !showRulesPanel) {
    const isHost = currentPlayer.is_host;
    const isReady = currentPlayer.is_ready;
    lobbyHotkeyMap["r"] = () => actions.setReady(!isReady);
    lobbyHotkeyMap["Enter"] = () => {
      if (isHost && lobbyState.can_start && !startingGame) {
        setStartingGame(true);
        actions.startGame();
      } else {
        actions.setReady(!isReady);
      }
    };
  }
  useHotkeys(lobbyHotkeyMap, !!session && !showRulesPanel);

  useEffect(() => {
    if (gameState) {
      navigate(`/game/${gameId}/play`);
    }
  }, [gameState, gameId, navigate]);

  useEffect(() => {
    if (kicked) {
      navigate("/play");
    }
  }, [kicked, navigate]);

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

  const handleRejoin = async () => {
    if (!rejoinName.trim() || !gameId) {
      setRejoinError("Please enter your name");
      return;
    }

    setRejoinLoading(true);
    setRejoinError("");

    try {
      const response = await rejoinGame(gameId, rejoinName);
      saveSession(response.session_id, response.player_id);
    } catch {
      setRejoinError("Could not rejoin. Check your name matches exactly.");
    } finally {
      setRejoinLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white text-center mb-6">
            Rejoin Game
          </h1>

          {rejoinError && (
            <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
              {rejoinError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-1">Your Name</label>
              <input
                type="text"
                value={rejoinName}
                onChange={(e) => setRejoinName(e.target.value)}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Enter your name exactly as before"
              />
            </div>

            <button
              onClick={handleRejoin}
              disabled={rejoinLoading}
              className="btn btn-primary w-full py-2"
            >
              {rejoinLoading ? "Rejoining..." : "Rejoin Game"}
            </button>

            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary w-full py-2"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cubeReady = lobbyState?.cube_loading_status === "ready";

  if (lobbyState && !cubeReady) {
    return (
      <div className="game-table flex items-center justify-center p-4">
        <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md text-center">
          {!isConnected && (
            <div className="bg-amber-900/50 text-amber-200 p-3 rounded mb-4">
              Connecting...
            </div>
          )}
          <div className="flex justify-center mb-4">
            <svg
              className="animate-spin h-8 w-8 text-amber-400"
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
          </div>
          <p className="text-gray-300">Loading card pool...</p>
          {lobbyState.cube_loading_error && (
            <p className="text-red-400 text-sm mt-2">
              {lobbyState.cube_loading_error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg px-6 py-4 w-full max-w-md">
        <div className="flex items-center justify-between mb-1">
          <div className="w-7" />
          <h1 className="text-xl font-bold text-white text-center">
            Game Lobby
          </h1>
          <button
            onClick={() => {
              setRulesPanelTarget(undefined);
              setShowRulesPanel(true);
            }}
            className="w-7 h-7 rounded-full bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white transition-all text-sm flex items-center justify-center"
            title="Game Guide"
          >
            ?
          </button>
        </div>
        {!isConnected && (
          <div className="bg-amber-900/50 text-amber-200 p-3 rounded mb-4">
            Connecting...
          </div>
        )}

        {lobbyState &&
          (() => {
            const isHost = currentPlayer?.is_host ?? false;
            const isReady = currentPlayer?.is_ready ?? false;
            const puppetCount = lobbyState.puppet_count;
            const total = lobbyState.target_player_count;
            const availablePuppets = lobbyState.available_puppet_count;
            const canAddPuppet =
              availablePuppets !== null &&
              puppetCount < availablePuppets &&
              total < 8;

            const openGuide = (target?: RulesPanelTarget) => {
              setRulesPanelTarget(target);
              setShowRulesPanel(true);
            };

            const startMessage = (() => {
              if (startingGame) return null;
              if (total < 2) return "Need at least 2 players";
              if (total % 2 !== 0)
                return `Start requires even number of players (currently ${total} \u2014 add or remove 1)`;
              if (!lobbyState.players.every((p) => p.is_ready))
                return "Waiting for all players to ready";
              if (
                puppetCount > 0 &&
                availablePuppets !== null &&
                availablePuppets < puppetCount
              )
                return "Not enough puppets available";
              return null;
            })();

            return (
              <>
                <div className="bg-black/40 rounded-lg p-3 mb-4 text-center">
                  <p className="text-gray-400 text-xs mb-1">Share this code</p>
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
                </div>

                <div className="mb-4">
                  <h2 className="text-white font-medium mb-2 text-sm">
                    Players ({total})
                  </h2>
                  <div className="grid grid-cols-2 gap-1.5">
                    {lobbyState.players.map((player) => (
                      <div
                        key={player.player_id}
                        className="bg-black/30 px-2.5 py-2 rounded-lg flex items-center gap-1.5 min-w-0"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            player.is_ready ? "bg-green-500" : "bg-gray-500"
                          }`}
                        />
                        <span className="text-white text-sm truncate">
                          {player.name}
                        </span>
                        {player.is_host && (
                          <span className="text-amber-400 text-xs shrink-0 ml-auto">
                            Host
                          </span>
                        )}
                        {isHost &&
                          !player.is_host && (
                            <button
                              onClick={() => actions.kickPlayer(player.player_id)}
                              className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-auto text-xs"
                              title="Remove player"
                            >
                              &times;
                            </button>
                          )}
                      </div>
                    ))}
                    {puppetCount > 0 &&
                      Array.from({ length: puppetCount }).map((_, i) => {
                        const isSearching = availablePuppets === null;
                        const botAvailable =
                          !isSearching && i < availablePuppets;
                        return (
                          <div
                            key={`puppet-${i}`}
                            className={`bg-black/20 px-2.5 py-2 rounded-lg flex items-center gap-1.5 border border-dashed ${
                              isSearching
                                ? "border-amber-600/50"
                                : botAvailable
                                  ? "border-cyan-700"
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
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${botAvailable ? "bg-cyan-600" : "bg-red-700/50"}`}
                              />
                            )}
                            <span
                              className={`text-sm italic ${isSearching ? "text-amber-400" : botAvailable ? "text-cyan-500" : "text-red-400/70"}`}
                            >
                              Puppet {i + 1}
                            </span>
                            {isHost && (
                              <button
                                onClick={() => actions.removePuppet()}
                                className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-auto text-xs"
                                title="Remove puppet"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {isHost && (
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => actions.addPuppet()}
                      disabled={!canAddPuppet}
                      className="text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                      + Add Puppet
                    </button>
                    <button
                      onClick={() =>
                        openGuide({
                          docId: "non-human-players",
                          tab: "puppets",
                        })
                      }
                      className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                    >
                      What are Puppets?
                    </button>
                  </div>
                )}

                {startMessage && (
                  <p className="text-gray-500 text-xs mb-3 text-center">
                    {startMessage}
                  </p>
                )}

                <div className="space-y-2">
                  <button
                    onClick={() => actions.setReady(!isReady)}
                    className={`w-full py-2 rounded font-medium transition-colors ${
                      isReady
                        ? "bg-gray-600 text-white hover:bg-gray-500"
                        : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                  >
                    {isReady ? "Unready" : "Ready"}
                  </button>

                  {isHost && (
                    <button
                      onClick={() => {
                        setStartingGame(true);
                        actions.startGame();
                      }}
                      disabled={!lobbyState.can_start || startingGame}
                      className="btn btn-primary w-full py-2"
                    >
                      {startingGame ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="animate-spin h-5 w-5"
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
                          Starting...
                        </span>
                      ) : (
                        "Start Game"
                      )}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
      </div>
      {showRulesPanel && (
        <RulesPanel
          onClose={() => setShowRulesPanel(false)}
          initialDocId={rulesPanelTarget?.docId}
          initialTab={rulesPanelTarget?.tab}
          gameId={gameId}
        />
      )}
    </div>
  );
}

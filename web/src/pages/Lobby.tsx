import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { rejoinGame } from "../api/client";
import { useHotkeys } from "../hooks/useHotkeys";
import { RulesPanel, type RulesPanelTarget } from "../components/RulesPanel";
import { useToast } from "../contexts";
import { HintsBanner } from "../components/common/HintsBanner";

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

  if (!lobbyState) {
    return <div className="game-table h-dvh" />;
  }

  return (
    <div className="game-table flex items-center justify-center p-4">
      {!isConnected && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gray-950/90 backdrop-blur-sm border border-gray-700/50 border-l-[3px] border-l-amber-500 rounded-lg shadow-xl px-5 py-3 flex items-center gap-3">
            <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-gray-200">Reconnecting...</span>
          </div>
        </div>
      )}
      <div className="bg-black/60 backdrop-blur rounded-lg border border-black/40 p-4 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
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
                return `Odd player count (${total})`;
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
                <div className="description-panel rounded-lg p-3 mb-3 text-center">
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
                  <div className="border-t border-white/5 mt-2 pt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
                    <span>
                      Cube:{" "}
                      <a
                        href={`https://cubecobra.com/cube/overview/${lobbyState.cube_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-500 hover:text-amber-400 transition-colors"
                      >
                        {lobbyState.cube_id}
                      </a>
                    </span>
                    <span>&middot;</span>
                    <span>
                      Upgrades: {lobbyState.use_upgrades ? "On" : "Off"}
                    </span>
                    <span>&middot;</span>
                    <button
                      onClick={() => openGuide({ docId: "__cards__" })}
                      className="text-amber-500/70 hover:text-amber-400 transition-colors"
                    >
                      Browse Cards
                    </button>
                  </div>
                </div>

                <div className="bg-black/20 rounded-lg border border-white/5 p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-white font-medium text-sm">
                      Players ({total})
                    </h2>
                    {isHost ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => actions.addPuppet()}
                          disabled={!canAddPuppet}
                          className="text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                          + Add Puppet
                        </button>
                        {puppetCount > 0 && (
                          <button
                            onClick={() =>
                              openGuide({
                                docId: "non-human-players",
                                tab: "puppets",
                              })
                            }
                            className="w-5 h-5 rounded-full bg-white/10 border border-white/15 text-gray-400 hover:bg-white/20 hover:text-white transition-all text-[10px] flex items-center justify-center"
                            title="What are Puppets?"
                          >
                            ?
                          </button>
                        )}
                      </div>
                    ) : (
                      puppetCount > 0 && (
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
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {lobbyState.players.map((player) => (
                      <div
                        key={player.player_id}
                        className="bg-black/30 border border-white/5 px-3 py-2.5 rounded-lg flex items-center gap-2 min-w-0"
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
                            className={`bg-black/20 px-3 py-2.5 rounded-lg flex items-center gap-2 border border-dashed ${
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

                <div className="space-y-2 mb-3">
                  {startMessage && (
                    <p className="text-gray-500 text-xs mb-1 text-center">
                      {startMessage}
                    </p>
                  )}

                  <button
                    onClick={() => actions.setReady(!isReady)}
                    className={`btn w-full py-2 ${
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

                <HintsBanner />
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

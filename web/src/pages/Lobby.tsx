import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { useGame } from "../hooks/useGame";
import { rejoinGame } from "../api/client";
import { useHotkeys } from "../hooks/useHotkeys";
import { RulesPanel } from "../components/RulesPanel";

export function Lobby() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { session, saveSession } = useSession();
  const { lobbyState, gameState, isConnected, actions, error } = useGame(
    gameId ?? null,
    session?.sessionId ?? null,
  );

  const [rejoinName, setRejoinName] = useState("");
  const [rejoinError, setRejoinError] = useState("");
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showPuppetExplainer, setShowPuppetExplainer] = useState(false);

  const currentPlayer = lobbyState?.players.find(
    (p) => p.player_id === session?.playerId,
  );
  const lobbyHotkeyMap: Record<string, () => void> = {
    "?": () => setShowRulesPanel(true),
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

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg px-6 py-4 w-full max-w-md">
        <h1 className="text-xl font-bold text-white text-center mb-1">
          Game Lobby
        </h1>
        <p className="text-gray-400 text-center text-xs mb-3">
          Draft, Build, Battle!{" "}
          <a
            href={`https://cubecobra.com/cube/list/${lobbyState?.cube_id ?? "auto"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300"
          >
            View card pool
          </a>
          .
        </p>

        {!isConnected && (
          <div className="bg-amber-900/50 text-amber-200 p-3 rounded mb-4">
            Connecting...
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        {lobbyState &&
          (() => {
            const isHost = currentPlayer?.is_host ?? false;
            const isReady = currentPlayer?.is_ready ?? false;
            const botSlots =
              lobbyState.target_player_count - lobbyState.players.length;
            const allReady = lobbyState.players.every((p) => p.is_ready);
            const availablePuppets = lobbyState.available_puppet_count;
            const hasEnoughBots =
              availablePuppets !== null && availablePuppets >= botSlots;

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
                    Players ({lobbyState.players.length}/
                    {lobbyState.target_player_count})
                  </h2>
                  <div className="grid grid-cols-2 gap-1.5">
                    {lobbyState.players.map((player) => (
                      <div
                        key={player.name}
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
                      </div>
                    ))}
                    {botSlots > 0 &&
                      Array.from({ length: botSlots }).map((_, i) => {
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
                          </div>
                        );
                      })}
                  </div>
                  {botSlots > 0 &&
                    availablePuppets !== null &&
                    availablePuppets < botSlots && (
                      <p className="text-gray-500 text-xs mt-1.5 px-1">
                        Not enough games have been played with cubes like this
                        one at these settings to play with this many puppets.
                        Invite human players to join.
                      </p>
                    )}
                  {botSlots > 0 && (
                    <div className="mt-2 px-1">
                      <button
                        onClick={() => setShowPuppetExplainer((v) => !v)}
                        className={`${availablePuppets === null ? "text-amber-400" : hasEnoughBots ? "text-cyan-500" : "text-red-400/70"} hover:text-gray-300 text-xs transition-colors`}
                      >
                        {showPuppetExplainer ? "▾" : "▸"} What are puppets?
                      </button>
                      {showPuppetExplainer && (
                        <p className="text-gray-500 text-xs mt-1 pl-3">
                          Puppets are players built from recordings of past
                          human games. Puppets will have their hand revealed and
                          you will need to decide who would have won in a
                          hypothetical match-up to determine the winner of each
                          battle.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {!isHost && (
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
                  )}

                  {isHost && (
                    <>
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
                        ) : lobbyState.target_player_count < 2 ? (
                          "Need at least 2 players"
                        ) : !allReady ? (
                          "Waiting for all players to ready"
                        ) : availablePuppets === null ? (
                          "Searching for puppets..."
                        ) : !hasEnoughBots ? (
                          `${botSlots - availablePuppets} puppet${botSlots - availablePuppets > 1 ? "s" : ""} not found - invite players`
                        ) : (
                          "Start Game"
                        )}
                      </button>
                    </>
                  )}
                </div>
              </>
            );
          })()}
      </div>
      {showRulesPanel && (
        <RulesPanel onClose={() => setShowRulesPanel(false)} gameId={gameId} />
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame, joinGame } from "../api/client";
import { useSession } from "../hooks/useSession";

export function Home() {
  const navigate = useNavigate();
  const { saveSession } = useSession();

  const [playerName, setPlayerName] = useState("");
  const [cubeId, setCubeId] = useState("auto");
  const [useUpgrades, setUseUpgrades] = useState(true);
  const [useVanguards, setUseVanguards] = useState(false);
  const [autoApproveSpectators, setAutoApproveSpectators] = useState(false);
  const [targetPlayerCount, setTargetPlayerCount] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await createGame(playerName, {
        cubeId: cubeId || "auto",
        useUpgrades,
        useVanguards,
        autoApproveSpectators,
        targetPlayerCount,
      });
      saveSession(response.session_id, response.player_id);
      navigate(`/game/${response.game_id}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!joinCode.trim()) {
      setError("Please enter a join code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await joinGame(joinCode, playerName);
      saveSession(response.session_id, response.player_id);
      navigate(`/game/${response.game_id}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="game-table flex items-center justify-center p-4">
      <div className="bg-black/60 backdrop-blur rounded-lg px-6 py-4 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-1">
          Magic: The Battling
        </h1>
        <p className="text-gray-400 text-center text-xs mb-1.5">
          An MtG format inspired by autobattlers
        </p>
        <div className="flex gap-2 justify-center pt-2 pb-2 border-b border-gray-700">
          <a
            href="https://cubecobra.com/cube/list/auto"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
          >
            Card Pool →
          </a>
          <a
            href="https://discord.gg/MKMacp9JUf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[#5865F2]/20 text-[#7289da] hover:bg-[#5865F2]/30 transition-colors"
          >
            Discord →
          </a>
        </div>
        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-gray-300 mb-1">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Enter your name"
            />
          </div>

          {!isJoining && (
            <>
              <div>
                <label className="block text-gray-300 mb-1">CubeCobra ID</label>
                <input
                  type="text"
                  value={cubeId}
                  onChange={(e) => setCubeId(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="auto"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-700">
                <div className="text-xs text-gray-400 uppercase tracking-wide">
                  Game Options
                </div>

                <div>
                  <label className="block text-white text-sm mb-1">
                    Target Players
                  </label>
                  <div className="flex gap-1.5">
                    {[2, 4, 6, 8].map((count) => (
                      <button
                        key={count}
                        onClick={() => setTargetPlayerCount(count)}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                          targetPlayerCount === count
                            ? "bg-amber-500 text-black"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Bots will fill empty slots.
                  </p>
                </div>

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

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApproveSpectators}
                    onChange={(e) => setAutoApproveSpectators(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-white text-sm">Open Spectating</span>
                  <span className="text-gray-500 text-xs">
                    — let anyone watch
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer opacity-50">
                  <input
                    type="checkbox"
                    checked={useVanguards}
                    onChange={(e) => setUseVanguards(e.target.checked)}
                    disabled
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-white text-sm">Vanguards</span>
                  <span className="text-gray-500 text-xs">(coming soon)</span>
                </label>
              </div>
            </>
          )}

          {isJoining && (
            <div>
              <label className="block text-gray-300 mb-1">Join Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono"
                placeholder="ABC123"
              />
            </div>
          )}

          <div className="flex gap-3">
            {!isJoining ? (
              <>
                <button
                  onClick={handleCreateGame}
                  disabled={loading}
                  className="btn btn-primary flex-1 py-2"
                >
                  {loading ? "Creating..." : "Create Game"}
                </button>
                <button
                  onClick={() => setIsJoining(true)}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Join Game
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleJoinGame}
                  disabled={loading}
                  className="btn btn-primary flex-1 py-2"
                >
                  {loading ? "Joining..." : "Join"}
                </button>
                <button
                  onClick={() => setIsJoining(false)}
                  className="btn btn-secondary flex-1 py-2"
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

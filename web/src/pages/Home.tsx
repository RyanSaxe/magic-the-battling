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
      <div className="bg-black/60 backdrop-blur rounded-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-2">
          Magic: The Battling
        </h1>
        <p className="text-gray-400 text-center text-sm mb-2">
          An MtG format inspired by the autobattler genre
        </p>
        <p className="space-y-3 pt-2 pb-2 border-b border-gray-700">
          <a
            href="https://cubecobra.com/cube/list/auto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300"
          >
            View the default card pool on CubeCobra →
          </a>
        </p>
        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4 pt-2">
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
                <label className="block text-gray-300 mb-1">
                  Cube ID <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={cubeId}
                  onChange={(e) => setCubeId(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="auto"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-700">
                <div className="text-sm text-gray-400 uppercase tracking-wide">
                  Game Options
                </div>

                <div>
                  <label className="block text-white mb-2">
                    Target Players
                  </label>
                  <div className="flex gap-2">
                    {[2, 4, 6, 8].map((count) => (
                      <button
                        key={count}
                        onClick={() => setTargetPlayerCount(count)}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          targetPlayerCount === count
                            ? "bg-amber-500 text-black"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    Bots will fill remaining slots
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useUpgrades}
                    onChange={(e) => setUseUpgrades(e.target.checked)}
                    className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <div className="text-white">Use Upgrades</div>
                    <div className="text-gray-500 text-sm">
                      Gain upgrades at stage boundaries to increase damage
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer opacity-50">
                  <input
                    type="checkbox"
                    checked={useVanguards}
                    onChange={(e) => setUseVanguards(e.target.checked)}
                    disabled
                    className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <div className="text-white">Use Vanguards</div>
                    <div className="text-gray-500 text-sm">
                      Choose a vanguard at game start (coming soon)
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApproveSpectators}
                    onChange={(e) => setAutoApproveSpectators(e.target.checked)}
                    className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <div className="text-white">Allow spectators without approval</div>
                    <div className="text-gray-500 text-sm">
                      Anyone can spectate without player permission
                    </div>
                  </div>
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

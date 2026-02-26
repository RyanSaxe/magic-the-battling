import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import { CardShowcase } from "../components/home/CardShowcase";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { prefetchLegendaryName } from "../utils/prefetchName";

export function Home() {
  const navigate = useNavigate();
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    prefetchLegendaryName();
  }, []);

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 sm:px-6 py-3">
        <div className="hidden sm:flex items-center justify-between">
          <div>
            <h1 className="hero-title text-3xl font-bold tracking-tight leading-tight">
              Magic: The Battling
            </h1>
            <p className="text-gray-400 text-sm">
              A Magic: the Gathering format inspired by the autobattler game
              genre
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/play")}
              className="btn btn-primary py-2 px-4 font-semibold animate-gentle-glow"
            >
              Play Game
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary py-2 px-4"
            >
              Join Game
            </button>
            <a
              href="https://discord.gg/2NAjcWXNKn"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary py-2 px-4 flex items-center gap-2"
            >
              <FaDiscord className="w-4 h-4" />
              Discord
            </a>
          </div>
        </div>
        <div className="sm:hidden text-center">
          <h1 className="hero-title text-2xl font-bold tracking-tight">
            Magic: The Battling
          </h1>
          <p className="text-gray-400 text-xs">
            Inspired by the autobattler game genre
          </p>
          <div className="flex gap-3 mt-2 justify-center">
            <button
              onClick={() => navigate("/play")}
              className="btn btn-primary py-2 px-5 font-semibold animate-gentle-glow"
            >
              Play Game
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary py-2 px-5"
            >
              Join Game
            </button>
            <a
              href="https://discord.gg/2NAjcWXNKn"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary py-2 px-5 flex items-center gap-2"
            >
              <FaDiscord className="w-4 h-4" />
              Discord
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center min-h-0 px-4">
        <CardShowcase />
      </main>

      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

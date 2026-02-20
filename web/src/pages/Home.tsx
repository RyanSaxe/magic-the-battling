import { useState } from "react";
import { CardShowcase } from "../components/home/CardShowcase";
import { CreateGameModal } from "../components/home/CreateGameModal";
import { JoinGameModal } from "../components/home/JoinGameModal";

export function Home() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

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
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary py-2 px-4 font-semibold animate-gentle-glow"
            >
              Create Game
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary py-2 px-4"
            >
              Join Game
            </button>
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
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary py-2 px-5 font-semibold animate-gentle-glow"
            >
              Create Game
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary py-2 px-5"
            >
              Join Game
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center min-h-0 px-4">
        <CardShowcase />
      </main>

      <footer className="shrink-0 flex items-center justify-center gap-4 px-4 sm:px-6 py-3 text-sm">
        <a
          href="https://cubecobra.com/cube/list/auto"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:text-amber-300 transition-colors"
        >
          Card List
        </a>
        <span className="text-gray-600">|</span>
        <a
          href="https://discord.gg/2NAjcWXNKn"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7289da] hover:text-[#99aab5] transition-colors"
        >
          Discord
        </a>
      </footer>

      {showCreateModal && (
        <CreateGameModal onClose={() => setShowCreateModal(false)} />
      )}
      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

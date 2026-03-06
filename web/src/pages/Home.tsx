import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaDiscord } from "react-icons/fa6";
import { CardShowcase } from "../components/home/CardShowcase";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { CubeCobraPrimerLink } from "../components/common/CubeCobraPrimerLink";
import { prefetchLegendaryName } from "../utils/prefetchName";

export function Home() {
  const navigate = useNavigate();
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    prefetchLegendaryName();
  }, []);

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 py-3 frame-chrome bar-pad-both">
        <div className="hidden sm:flex items-center justify-between">
          <div>
            <h1 className="hero-title text-3xl font-bold tracking-tight leading-tight">
              Magic: The Battling
            </h1>
            <p className="text-gray-400 text-sm">
              An MtG format inspired by autobattlers
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary py-2 px-4"
            >
              Join Game
            </button>
            <button
              onClick={() => navigate("/play")}
              className="btn btn-primary py-2 px-4 font-semibold animate-gentle-glow"
            >
              Play Game
            </button>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="hero-title text-xl font-bold tracking-tight leading-tight">
                Magic: The Battling
              </h1>
              <p className="text-gray-400 text-xs">
                An MtG format inspired by autobattlers
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn btn-secondary py-1.5 px-3 text-sm"
              >
                Join
              </button>
              <button
                onClick={() => navigate("/play")}
                className="btn btn-primary py-1.5 px-3 text-sm font-semibold animate-gentle-glow"
              >
                Play
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome"
             style={{ borderRight: '1px solid var(--gold-border)' }} />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
          <div className="zone-pack h-full min-h-0 flex flex-col items-center justify-center px-4">
            <CardShowcase />
          </div>
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome"
             style={{ borderLeft: '1px solid var(--gold-border)' }} />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a
            href="https://discord.gg/2NAjcWXNKn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#5865F2] hover:text-[#7983F5] transition-colors"
          >
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>

      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

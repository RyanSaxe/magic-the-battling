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
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
          <div className="zone-pack h-full min-h-0 flex flex-col items-center justify-center px-4">
            <CardShowcase />
          </div>
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

      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}

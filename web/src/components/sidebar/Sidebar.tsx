import { useEffect, useState, type ReactNode } from "react";
import type { PlayerView } from "../../types";
import { PlayerList } from "../PlayerList";
import { PlayerDetailPanel } from "./PlayerDetailPanel";
import { useContextStrip } from "../../contexts";

interface SidebarProps {
  players: PlayerView[];
  currentPlayer: PlayerView;
  phaseContent?: ReactNode;
  useUpgrades?: boolean;
  isMobile?: boolean;
}

export function Sidebar({
  players,
  currentPlayer,
  phaseContent,
  useUpgrades = true,
  isMobile = false,
}: SidebarProps) {
  const { state, setRevealedPlayerName } = useContextStrip();
  const revealedPlayer = state.revealedPlayerName
    ? players.find((p) => p.name === state.revealedPlayerName)
    : null;
  const shouldRenderDesktopDrawer = !isMobile && !phaseContent;
  const [desktopDrawer, setDesktopDrawer] = useState<{
    playerName: string | null;
    isOpen: boolean;
  }>({
    playerName: null,
    isOpen: false,
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!shouldRenderDesktopDrawer) {
        setDesktopDrawer((prev) => (
          prev.isOpen
            ? { ...prev, isOpen: false }
            : prev
        ));
        return;
      }

      if (!revealedPlayer) {
        setDesktopDrawer((prev) => (
          prev.isOpen
            ? { ...prev, isOpen: false }
            : prev
        ));
        return;
      }

      setDesktopDrawer({
        playerName: revealedPlayer.name,
        isOpen: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [revealedPlayer, shouldRenderDesktopDrawer]);

  const desktopDrawerPlayer = desktopDrawer.playerName
    ? players.find((player) => player.name === desktopDrawer.playerName) ?? null
    : null;

  return (
    <aside
      className={`relative w-[var(--sidebar-width)] h-full frame-chrome flex flex-col ${
        isMobile ? "overflow-hidden" : "overflow-visible"
      }`}
      data-guide-target="sidebar-panel"
    >
      {shouldRenderDesktopDrawer && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-40 frame-chrome"
        />
      )}
      {phaseContent ? (
        <div className="flex flex-col flex-1 min-h-0 py-[2px]">
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            {phaseContent}
          </div>
        </div>
      ) : isMobile && revealedPlayer ? (
        <PlayerDetailPanel
          player={revealedPlayer}
          currentPlayer={currentPlayer}
          useUpgrades={useUpgrades}
          isMobile
          activeTab={state.revealedPlayerTab}
          onTabChange={(tab) => setRevealedPlayerName(revealedPlayer.name, tab)}
          onClose={() => setRevealedPlayerName(null)}
        />
      ) : (
        <div className="relative z-50 px-3 py-3 sm:py-0 overflow-auto flex-1 flex flex-col">
          <PlayerList
            players={players}
            currentPlayerName={currentPlayer.name}
          />
        </div>
      )}
      {shouldRenderDesktopDrawer && desktopDrawerPlayer && (
        <PlayerDetailPanel
          player={desktopDrawerPlayer}
          currentPlayer={currentPlayer}
          useUpgrades={useUpgrades}
          isMobile={false}
          activeTab={state.revealedPlayerTab}
          onTabChange={(tab) => setRevealedPlayerName(desktopDrawerPlayer.name, tab)}
          onClose={() => setRevealedPlayerName(null)}
          isOpen={desktopDrawer.isOpen}
        />
      )}
    </aside>
  );
}

import type { ReactNode } from "react";
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

  return (
    <aside
      className="relative w-[var(--sidebar-width)] h-full frame-chrome flex flex-col overflow-hidden"
      data-guide-target="sidebar-panel"
    >
      {phaseContent ? (
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          {phaseContent}
        </div>
      ) : isMobile && revealedPlayer ? (
        <PlayerDetailPanel
          player={revealedPlayer}
          currentPlayer={currentPlayer}
          players={players}
          useUpgrades={useUpgrades}
          isMobile
          onClose={() => setRevealedPlayerName(null)}
        />
      ) : (
        <div className="pl-4 pr-4 overflow-auto flex-1 flex flex-col">
          <PlayerList
            players={players}
            currentPlayerName={currentPlayer.name}
          />
        </div>
      )}
      {!isMobile && !phaseContent && revealedPlayer && (
        <PlayerDetailPanel
          player={revealedPlayer}
          currentPlayer={currentPlayer}
          players={players}
          useUpgrades={useUpgrades}
          isMobile={false}
          onClose={() => setRevealedPlayerName(null)}
        />
      )}
    </aside>
  );
}

import type { ReactNode } from "react";
import type { PlayerView } from "../../types";
import { PlayerList } from "../PlayerList";
import { ZoneDisplay } from "./ZoneDisplay";
import { useContextStrip } from "../../contexts";

interface SidebarProps {
  players: PlayerView[];
  currentPlayer: PlayerView;
  phaseContent?: ReactNode;
  useUpgrades?: boolean;
}

export function Sidebar({
  players,
  currentPlayer,
  phaseContent,
  useUpgrades = true,
}: SidebarProps) {
  const { state } = useContextStrip();
  const revealedPlayer = state.revealedPlayerName
    ? players.find((p) => p.name === state.revealedPlayerName)
    : null;
  const displayPlayer = revealedPlayer ?? currentPlayer;

  const appliedUpgrades = displayPlayer.upgrades.filter(
    (u) => u.upgrade_target !== null,
  );
  const pendingUpgrades = currentPlayer.upgrades.filter(
    (u) => u.upgrade_target === null,
  );
  const isViewingSelf = displayPlayer.name === currentPlayer.name;

  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades;

  const companionIds = new Set(displayPlayer.command_zone.map((c) => c.id));

  const showCardsSection =
    revealedPlayer && revealedPlayer.name !== currentPlayer.name;

  return (
    <aside className="relative w-64 h-full bg-black/30 flex flex-col overflow-hidden">
      {phaseContent ? (
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          {phaseContent}
        </div>
      ) : (
        <div className="pl-4 pr-4 overflow-auto flex-1 flex flex-col">
          <PlayerList
            players={players}
            currentPlayerName={currentPlayer.name}
            currentPlayer={currentPlayer}
            useUpgrades={useUpgrades}
          />
          {showCardsSection && (
            <div>
              <div className="flex flex-wrap">
                {useUpgrades && allUpgrades.length > 0 && (
                  <ZoneDisplay
                    key={`upgrades-${displayPlayer.name}`}
                    title="Upgrades"
                    cards={allUpgrades}
                    maxThumbnails={6}
                    showUpgradeTargets
                  />
                )}
                <ZoneDisplay
                  key={`revealed-${displayPlayer.name}`}
                  title="Seen in Battle"
                  cards={displayPlayer.most_recently_revealed_cards}
                  maxThumbnails={6}
                  companionIds={companionIds}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

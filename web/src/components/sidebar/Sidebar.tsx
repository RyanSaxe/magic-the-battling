import { useState, type ReactNode } from "react";
import type { PlayerView } from "../../types";
import type { ScoutingTab } from "../../pages/gameSurfaces";
import { PlayerList } from "../PlayerList";
import { SidePanel } from "../common/SidePanel";
import { SegmentedFilter, type SegmentOption } from "../dashboard/SegmentedFilter";
import { PlayerDetailPanel } from "./PlayerDetailPanel";

export type FightSidebarView = "fight" | "players";

const FIGHT_SIDEBAR_VIEWS: SegmentOption<FightSidebarView>[] = [
  { value: "fight", label: "Fight" },
  { value: "players", label: "Players" },
];

export interface Scouting {
  player: string;
  tab: ScoutingTab;
}

interface SidebarProps {
  players: PlayerView[];
  currentPlayer: PlayerView;
  /** A Fight's life totals and controls, given the Fight | Players switch to show at their top. */
  renderFight?: (viewSwitch: ReactNode) => ReactNode;
  /** Whether a Fight's sidebar shows the Fight's controls or the player list. */
  fightView: FightSidebarView;
  onFightViewChange: (view: FightSidebarView) => void;
  useUpgrades?: boolean;
  isMobile?: boolean;
  /** On phones scouting takes the list's place in the drawer; elsewhere it opens beside the list. */
  scoutInline?: boolean;
  scouting: Scouting | null;
  onScout: (player: string, tab: ScoutingTab) => void;
  onStopScouting: () => void;
  renderMicToggle?: (player: PlayerView) => ReactNode;
  /** Shown under the player list. */
  watchLink?: ReactNode;
}

export function Sidebar({
  players,
  currentPlayer,
  renderFight,
  fightView,
  onFightViewChange,
  useUpgrades = true,
  isMobile = false,
  scoutInline = false,
  scouting,
  onScout,
  onStopScouting,
  renderMicToggle,
  watchLink,
}: SidebarProps) {
  // The scouting panel keeps showing the last player while it slides out.
  const [shownScouting, setShownScouting] = useState(scouting);
  if (scouting && (scouting.player !== shownScouting?.player || scouting.tab !== shownScouting.tab)) {
    setShownScouting(scouting);
  }
  const showingFight = !!renderFight && fightView === "fight";
  const findPlayer = (name: string | undefined) => players.find((player) => player.name === name) ?? null;
  const scoutedPlayer = findPlayer(scouting?.player);
  const shownPlayer = findPlayer(shownScouting?.player);

  const changeView = (next: FightSidebarView) => {
    onFightViewChange(next);
    if (next === "fight" && scouting) onStopScouting();
  };
  const viewSwitch = renderFight ? (
    <SegmentedFilter
      label="Sidebar view"
      options={FIGHT_SIDEBAR_VIEWS}
      value={fightView}
      onChange={changeView}
      className="w-full"
    />
  ) : null;

  const scoutingDetails = (player: PlayerView, scoutingTab: ScoutingTab, onBack?: () => void) => (
    <PlayerDetailPanel
      player={player}
      players={players}
      currentPlayer={currentPlayer}
      useUpgrades={useUpgrades}
      activeTab={scoutingTab}
      onTabChange={(tab) => onScout(player.name, tab)}
      onBack={onBack}
    />
  );

  return (
    <aside
      className={`relative h-full frame-chrome flex flex-col ${
        isMobile ? "w-full overflow-hidden" : "w-[var(--sidebar-width)] overflow-visible"
      }`}
      data-guide-target="sidebar-panel"
    >
      {showingFight ? (
        <div className={`flex flex-col flex-1 min-h-0 ${isMobile ? "py-[2px]" : ""}`}>
          <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            {renderFight(viewSwitch)}
          </div>
        </div>
      ) : scoutInline && scouting && scoutedPlayer ? (
        scoutingDetails(scoutedPlayer, scouting.tab, onStopScouting)
      ) : (
        <div className="relative px-3 pt-3 overflow-auto flex-1 flex flex-col">
          {viewSwitch && <div className="mb-3 shrink-0">{viewSwitch}</div>}
          <PlayerList
            players={players}
            currentPlayerName={currentPlayer.name}
            scoutedPlayerName={scouting?.player ?? null}
            onPlayerClick={(player) => (
              scouting?.player === player ? onStopScouting() : onScout(player, "seen")
            )}
            renderMicToggle={renderMicToggle}
          />
          {watchLink}
        </div>
      )}
      {!scoutInline && (
        <SidePanel
          open={!showingFight && !!scoutedPlayer}
          prefix="Scouting"
          title={shownPlayer?.name ?? ""}
          onClose={onStopScouting}
          placement="beside"
          guideTarget="sidebar-detail-drawer"
        >
          {shownScouting && shownPlayer && scoutingDetails(shownPlayer, shownScouting.tab)}
        </SidePanel>
      )}
    </aside>
  );
}

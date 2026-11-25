import { useState, type ReactNode } from "react";
import type { PlayerView } from "../../types";
import type { ScoutingTab } from "../../hooks/useGameSurfaces";
import { PlayerList } from "../PlayerList";
import { SidePanel } from "../common/SidePanel";
import {
  SegmentedFilter,
  type SegmentOption,
} from "../dashboard/SegmentedFilter";
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

function findPlayerByName(
  players: PlayerView[],
  name: string | undefined,
): PlayerView | null {
  return players.find((player) => player.name === name) ?? null;
}

function SidebarMainContent({
  showingFight,
  renderFight,
  viewSwitch,
  isMobile,
  inlineScout,
  players,
  currentPlayer,
  scouting,
  onScout,
  onStopScouting,
  renderMicToggle,
  watchLink,
}: {
  showingFight: boolean;
  renderFight?: (viewSwitch: ReactNode) => ReactNode;
  viewSwitch: ReactNode;
  isMobile: boolean;
  inlineScout: ReactNode;
  players: PlayerView[];
  currentPlayer: PlayerView;
  scouting: Scouting | null;
  onScout: (player: string, tab: ScoutingTab) => void;
  onStopScouting: () => void;
  renderMicToggle?: (player: PlayerView) => ReactNode;
  watchLink?: ReactNode;
}): ReactNode {
  if (showingFight && renderFight) {
    return (
      <div
        className={`flex flex-col flex-1 min-h-0 ${isMobile ? "py-[2px]" : ""}`}
      >
        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {renderFight(viewSwitch)}
        </div>
      </div>
    );
  }
  if (inlineScout) {
    return inlineScout;
  }
  return (
    <div className="relative px-3 pt-3 overflow-auto flex-1 flex flex-col">
      {viewSwitch && <div className="mb-3 shrink-0">{viewSwitch}</div>}
      <PlayerList
        players={players}
        currentPlayerName={currentPlayer.name}
        scoutedPlayerName={scouting?.player ?? null}
        onPlayerClick={(player) =>
          scouting?.player === player
            ? onStopScouting()
            : onScout(player, "seen")
        }
        renderMicToggle={renderMicToggle}
      />
      {watchLink}
    </div>
  );
}

function hasScoutingChanged(
  scouting: Scouting | null,
  shownScouting: Scouting | null,
): boolean {
  if (!scouting) return false;
  return (
    scouting.player !== shownScouting?.player ||
    scouting.tab !== shownScouting.tab
  );
}

function SidebarScoutingDrawer({
  open,
  shownPlayer,
  shownScouting,
  players,
  currentPlayer,
  useUpgrades,
  onScout,
  onStopScouting,
}: {
  open: boolean;
  shownPlayer: PlayerView | null;
  shownScouting: Scouting | null;
  players: PlayerView[];
  currentPlayer: PlayerView;
  useUpgrades: boolean;
  onScout: (player: string, tab: ScoutingTab) => void;
  onStopScouting: () => void;
}): ReactNode {
  return (
    <SidePanel
      open={open}
      prefix="Scouting"
      title={shownPlayer?.name ?? ""}
      onClose={onStopScouting}
      placement="beside"
      guideTarget="sidebar-detail-drawer"
    >
      {shownScouting && shownPlayer && (
        <PlayerDetailPanel
          player={shownPlayer}
          players={players}
          currentPlayer={currentPlayer}
          useUpgrades={useUpgrades}
          activeTab={shownScouting.tab}
          onTabChange={(tab) => onScout(shownPlayer.name, tab)}
        />
      )}
    </SidePanel>
  );
}

function resolveSidebarFlags(props: SidebarProps): {
  useUpgrades: boolean;
  isMobile: boolean;
  scoutInline: boolean;
  showingFight: boolean;
  asideClassName: string;
} {
  const isMobile = props.isMobile ?? false;
  return {
    useUpgrades: props.useUpgrades ?? true,
    isMobile,
    scoutInline: props.scoutInline ?? false,
    showingFight: Boolean(props.renderFight) && props.fightView === "fight",
    asideClassName: isMobile
      ? "w-full overflow-hidden"
      : "w-[var(--sidebar-width)] overflow-visible",
  };
}

function buildInlineScout({
  scoutInline,
  scouting,
  scoutedPlayer,
  players,
  currentPlayer,
  useUpgrades,
  onScout,
  onStopScouting,
}: {
  scoutInline: boolean;
  scouting: Scouting | null;
  scoutedPlayer: PlayerView | null;
  players: PlayerView[];
  currentPlayer: PlayerView;
  useUpgrades: boolean;
  onScout: (player: string, tab: ScoutingTab) => void;
  onStopScouting: () => void;
}): ReactNode {
  if (!scoutInline || !scouting || !scoutedPlayer) return null;
  return (
    <PlayerDetailPanel
      player={scoutedPlayer}
      players={players}
      currentPlayer={currentPlayer}
      useUpgrades={useUpgrades}
      activeTab={scouting.tab}
      onTabChange={(tab) => onScout(scoutedPlayer.name, tab)}
      onBack={onStopScouting}
    />
  );
}

export function Sidebar(props: SidebarProps): ReactNode {
  const {
    players,
    currentPlayer,
    renderFight,
    fightView,
    onFightViewChange,
    scouting,
    onScout,
    onStopScouting,
    renderMicToggle,
    watchLink,
  } = props;
  const { useUpgrades, isMobile, scoutInline, showingFight, asideClassName } =
    resolveSidebarFlags(props);

  // The scouting panel keeps showing the last player while it slides out.
  const [shownScouting, setShownScouting] = useState(scouting);
  if (hasScoutingChanged(scouting, shownScouting)) {
    setShownScouting(scouting);
  }

  const scoutedPlayer = findPlayerByName(players, scouting?.player);
  const shownPlayer = findPlayerByName(players, shownScouting?.player);

  const viewSwitch = renderFight ? (
    <SegmentedFilter
      label="Sidebar view"
      options={FIGHT_SIDEBAR_VIEWS}
      value={fightView}
      onChange={(next) => {
        onFightViewChange(next);
        if (next === "fight" && scouting) onStopScouting();
      }}
      className="w-full"
    />
  ) : null;

  const inlineScout = buildInlineScout({
    scoutInline,
    scouting,
    scoutedPlayer,
    players,
    currentPlayer,
    useUpgrades,
    onScout,
    onStopScouting,
  });

  return (
    <aside
      className={`relative h-full frame-chrome flex flex-col ${asideClassName}`}
      data-guide-target="sidebar-panel"
    >
      <SidebarMainContent
        showingFight={showingFight}
        renderFight={renderFight}
        viewSwitch={viewSwitch}
        isMobile={isMobile}
        inlineScout={inlineScout}
        players={players}
        currentPlayer={currentPlayer}
        scouting={scouting}
        onScout={onScout}
        onStopScouting={onStopScouting}
        renderMicToggle={renderMicToggle}
        watchLink={watchLink}
      />
      {!scoutInline && (
        <SidebarScoutingDrawer
          open={!showingFight && Boolean(scoutedPlayer)}
          shownPlayer={shownPlayer}
          shownScouting={shownScouting}
          players={players}
          currentPlayer={currentPlayer}
          useUpgrades={useUpgrades}
          onScout={onScout}
          onStopScouting={onStopScouting}
        />
      )}
    </aside>
  );
}

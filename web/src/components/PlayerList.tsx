import type { ReactNode } from "react";
import type { PlayerView } from "../types";
import { MoneyBagIcon, PoisonIcon } from "./icons";
import { PlayerCard } from "./PlayerCard";
import { StandingsRank } from "./common/StandingsRank";
import { getLastResultWord, getPlayerActivity } from "../utils/format";
import {
  getSidebarPlacementRank,
  getSidebarPlayerOrder,
  getStanding,
  isSidebarLastPlace,
  type Standing,
} from "../utils/playerPlacement";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName: string;
  /** The player whose scouting panel is open, shown selected. */
  scoutedPlayerName: string | null;
  onPlayerClick: (playerName: string) => void;
  renderMicToggle?: (player: PlayerView) => ReactNode;
}

export const PLAYER_ROW_STACK_CLASS = "space-y-3";

type ShareResultStatus = "viewing" | "alive" | "dead";

function getShownStanding(
  player: PlayerView,
  shareStatus: ShareResultStatus | undefined,
): Standing {
  if (shareStatus) return shareStatus === "dead" ? "out" : "alive";
  return getStanding(player);
}

/** Who a player is when that matters, or else what they're doing now. */
function StatusLabel({
  player,
  standing,
  variant,
  isSelected,
}: {
  player: PlayerView;
  standing: Standing;
  variant: "game" | "share";
  isSelected: boolean;
}) {
  if (standing === "out") {
    // A shared game shows the round each player went out in, since the viewer moves between rounds.
    const round =
      variant === "share" ? ` at ${player.stage}-${player.round}` : "";
    return (
      <span className="player-card-label player-card-label-out">
        Out{round}
      </span>
    );
  }
  if (standing === "ghost")
    return <span className="player-card-label">Ghost</span>;
  if (player.is_puppet)
    return <span className="player-card-label">Puppet</span>;

  const activity = getPlayerActivity(player);
  if (variant === "game" && activity)
    return <span className="player-card-label">{activity}</span>;
  if (isSelected)
    return (
      <span className="player-card-label player-card-label-viewing">
        Viewing
      </span>
    );
  return null;
}

/** The end of the stats line: Sudden Death, which fixes the next pairing, or else the chance of facing this player. */
function Outlook({
  player,
  standing,
  variant,
  isSelf,
}: {
  player: PlayerView;
  standing: Standing;
  variant: "game" | "share";
  isSelf: boolean;
}) {
  if (variant === "share") return null;
  if (player.in_sudden_death) {
    return (
      <span
        className="player-card-label player-card-label-out"
        title="Sudden Death"
      >
        SD
      </span>
    );
  }
  if (isSelf || standing === "out" || player.pairing_probability === null)
    return null;
  return (
    <span title="Chance you face them next">
      {Math.round(player.pairing_probability * 100)}%
    </span>
  );
}

export function PlayerRow({
  player,
  players,
  currentPlayerName,
  isSelected,
  onClick,
  variant = "game",
  shareStatus,
  micToggle,
  showPlacement = true,
}: {
  player: PlayerView;
  players: PlayerView[];
  currentPlayerName: string;
  isSelected: boolean;
  onClick: () => void;
  variant?: "game" | "share";
  shareStatus?: ShareResultStatus;
  micToggle?: ReactNode;
  showPlacement?: boolean;
}) {
  const isSelf = variant === "game" && player.name === currentPlayerName;
  const viewerFighting =
    variant === "game" &&
    players.find(({ name }) => name === currentPlayerName)?.phase === "battle";
  const hiddenInFight = viewerFighting && !isSelf;
  const standing = getShownStanding(
    player,
    variant === "share" ? shareStatus : undefined,
  );
  const rank = showPlacement ? getSidebarPlacementRank(player, players) : null;

  return (
    <PlayerCard
      guideName={player.name}
      lead={
        rank === null ? undefined : (
          <StandingsRank
            rank={rank}
            isLast={isSidebarLastPlace(player, players)}
          />
        )
      }
      name={player.name}
      nameEnd={
        player.last_result && (
          <span
            className={`player-card-result player-card-result-${player.last_result}`}
            title="Last fight"
          >
            {getLastResultWord(player.last_result)}
          </span>
        )
      }
      control={micToggle}
      isSelf={isSelf}
      isOut={standing !== "alive"}
      selected={isSelected}
      onSelect={onClick}
    >
      {!hiddenInFight && (
        <>
          <span className="player-card-stat" title="Poison">
            <PoisonIcon size="sm" />
            {player.poison}
          </span>
          <span className="player-card-stat" title="Treasures">
            <MoneyBagIcon size="sm" />
            {player.treasures}
          </span>
        </>
      )}
      <StatusLabel
        player={player}
        standing={standing}
        variant={variant}
        isSelected={isSelected}
      />
      <span className="player-card-outlook">
        {/* The server has no odds during a Fight and sends 0 for everyone, except in Sudden Death. */}
        {(!hiddenInFight || player.in_sudden_death) && (
          <Outlook
            player={player}
            standing={standing}
            variant={variant}
            isSelf={isSelf}
          />
        )}
      </span>
    </PlayerCard>
  );
}

export function PlayerList({
  players,
  currentPlayerName,
  scoutedPlayerName,
  onPlayerClick,
  renderMicToggle,
}: PlayerListProps) {
  const sortedPlayers = getSidebarPlayerOrder(players);

  return (
    <div className="relative">
      <div
        className={PLAYER_ROW_STACK_CLASS}
        data-guide-target="sidebar-opponent-list"
      >
        {sortedPlayers.map((player) => (
          <PlayerRow
            key={player.name}
            player={player}
            players={players}
            currentPlayerName={currentPlayerName}
            isSelected={scoutedPlayerName === player.name}
            onClick={() => onPlayerClick(player.name)}
            micToggle={renderMicToggle?.(player)}
          />
        ))}
      </div>
    </div>
  );
}

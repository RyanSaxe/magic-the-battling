import type { ReactNode } from "react";
import type { Phase, PlayerView } from "../types";
import { MoneyBagIcon, PoisonIcon } from "./icons";
import { useContextStrip } from "../contexts";
import { getLastResultWord, getOrdinal } from "../utils/format";
import { getSidebarPlacementRank, getSidebarPlayerOrder } from "../utils/playerPlacement";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName: string;
  renderMicToggle?: (player: PlayerView) => ReactNode;
}

export const PLAYER_ROW_STACK_CLASS = "space-y-3";

type ShareResultStatus = "viewing" | "alive" | "dead";

/** Alive, fighting on as the Ghost (the most recently eliminated player), or out of the game. */
type Standing = "alive" | "ghost" | "out";

const ACTIVITY_WORDS: Partial<Record<Phase, string>> = {
  draft: "Drafting",
  build: "Building",
  battle: "Fighting",
  reward: "Wrap-Up",
  awaiting_elimination: "Waiting",
  winner: "Winner",
};

function getStanding(player: PlayerView, shareStatus: ShareResultStatus | undefined): Standing {
  if (shareStatus) return shareStatus === "dead" ? "out" : "alive";
  if (!player.is_ghost) return "alive";
  return player.is_most_recent_ghost ? "ghost" : "out";
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
    const round = variant === "share" ? ` at ${player.stage}-${player.round}` : "";
    return <span className="player-card-label player-card-label-out">Out{round}</span>;
  }
  if (standing === "ghost") return <span className="player-card-label">Ghost</span>;
  if (player.is_puppet) return <span className="player-card-label">Puppet</span>;

  const activity = player.phase === "build" && player.build_ready ? "Ready" : ACTIVITY_WORDS[player.phase];
  if (variant === "game" && activity) return <span className="player-card-label">{activity}</span>;
  if (isSelected) return <span className="player-card-label player-card-label-viewing">Viewing</span>;
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
    return <span className="player-card-label player-card-label-out" title="Sudden Death">SD</span>;
  }
  if (isSelf || standing === "out" || player.pairing_probability === null) return null;
  return <span title="Chance you face them next">{Math.round(player.pairing_probability * 100)}%</span>;
}

/**
 * A player's card. The card is one button that selects the player, and an optional control such as the mic sits
 * beside it, over a space kept free at the start of the name line, because a button can't hold another button.
 */
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
  const standing = getStanding(player, variant === "share" ? shareStatus : undefined);
  const rank = showPlacement ? getSidebarPlacementRank(player, players) : null;
  const ordinal = rank === null ? null : getOrdinal(rank);
  const cardClassName = [
    "player-card",
    rank === null && "is-unranked",
    isSelf && "is-self",
    standing !== "alive" && "is-out",
    micToggle && "has-control",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClassName} data-guide-player-row={player.name}>
      <button type="button" className="player-card-button" aria-pressed={isSelected} onClick={onClick}>
        {rank !== null && (
          <span className={`player-card-rank ${rank === players.length ? "is-last" : ""}`} title={`${ordinal} place`}>
            <span className="player-card-rank-number">{rank}</span>
            <span className="player-card-rank-suffix">{ordinal?.slice(-2)}</span>
          </span>
        )}
        <span className="player-card-body">
          <span className="player-card-line">
            <span className="player-card-name">{player.name}</span>
            {player.last_result && (
              <span className={`player-card-result player-card-result-${player.last_result}`} title="Last fight">
                {getLastResultWord(player.last_result)}
              </span>
            )}
          </span>
          <span className="player-card-line">
            <span className="player-card-stat" title="Poison">
              <PoisonIcon size="sm" />
              {player.poison}
            </span>
            <span className="player-card-stat" title="Treasures">
              <MoneyBagIcon size="sm" />
              {player.treasures}
            </span>
            <StatusLabel player={player} standing={standing} variant={variant} isSelected={isSelected} />
            <span className="player-card-outlook">
              <Outlook player={player} standing={standing} variant={variant} isSelf={isSelf} />
            </span>
          </span>
        </span>
      </button>
      {micToggle && <span className="player-card-control">{micToggle}</span>}
    </div>
  );
}

export function PlayerList({
  players,
  currentPlayerName,
  renderMicToggle,
}: PlayerListProps) {
  const { state, setRevealedPlayerName } = useContextStrip();

  const handlePlayerClick = (player: PlayerView) => {
    if (state.revealedPlayerName === player.name) {
      setRevealedPlayerName(null);
    } else {
      setRevealedPlayerName(player.name, "seen");
    }
  };

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
            isSelected={state.revealedPlayerName === player.name}
            onClick={() => handlePlayerClick(player)}
            micToggle={renderMicToggle?.(player)}
          />
        ))}
      </div>
    </div>
  );
}

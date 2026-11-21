import type { ReactNode } from "react";
import type { LastResult, PlayerView } from "../types";
import {
  GhostIcon,
  HourglassIcon,
  MoneyBagIcon,
  PoisonIcon,
  PuppetIcon,
  SkullIcon,
} from "./icons";
import { useContextStrip } from "../contexts";
import { PlacementTag, Tag } from "./common/Tag";
import { getSidebarPlacementRank } from "../utils/playerPlacement";
import { getSidebarPlayerOrder } from "../utils/playerPlacement";
import { getPlayerPhaseStatusLabel } from "../utils/format";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName: string;
  renderMicToggle?: (player: PlayerView) => ReactNode;
}

export const PLAYER_ROW_STACK_CLASS = "space-y-3";

type ShareResultStatus = "viewing" | "alive" | "dead";

function ResultBadge({
  result,
  inSuddenDeath,
  shareStatus,
}: {
  result: LastResult | null;
  inSuddenDeath: boolean;
  shareStatus?: ShareResultStatus;
}) {
  const resultClassName = "min-w-[1.25rem]";

  if (shareStatus === "viewing") {
    return <Tag tone="gold" small quiet dot>Viewing</Tag>;
  }

  if (shareStatus === "alive") {
    return <Tag tone="emerald" small quiet dot>Alive</Tag>;
  }

  if (shareStatus === "dead") {
    return <Tag tone="crimson" small quiet dot>Dead</Tag>;
  }

  if (inSuddenDeath) {
    return <Tag tone="crimson" small quiet title="Sudden Death" className={resultClassName}>SD</Tag>;
  }

  if (result === null) {
    return <Tag tone="stone" small quiet className={resultClassName}>-</Tag>;
  }

  if (result === "win") {
    return <Tag tone="emerald" small quiet className={resultClassName}>W</Tag>;
  }

  if (result === "draw") {
    return <Tag tone="gold" small quiet className={resultClassName}>D</Tag>;
  }

  return <Tag tone="crimson" small quiet className={resultClassName}>L</Tag>;
}

function PairingProbability({ probability }: { probability: number }) {
  return (
    <span className="text-[10px] text-[var(--ivory-muted)]">
      {Math.round(probability * 100)}%
    </span>
  );
}

function StatusLine({
  player,
  variant,
}: {
  player: PlayerView;
  variant: "game" | "share";
}) {
  const iconWrapClassName = "inline-flex h-4 w-[1.25rem] items-center justify-center";

  if (variant === "share") {
    return player.is_puppet
      ? <span className={iconWrapClassName}><PuppetIcon size="sm" /></span>
      : <span className="block truncate text-right">{player.stage}-{player.round}</span>;
  }

  if (player.is_ghost && !player.is_most_recent_ghost) {
    return <span className={iconWrapClassName}><SkullIcon size="sm" /></span>;
  }

  if (player.is_most_recent_ghost) {
    return <span className={iconWrapClassName}><GhostIcon size="sm" /></span>;
  }

  if (player.phase === "awaiting_elimination") {
    return <span className={iconWrapClassName}><HourglassIcon size="sm" /></span>;
  }

  if (player.is_puppet) {
    return <span className={iconWrapClassName}><PuppetIcon size="sm" /></span>;
  }

  return (
    <span className="block truncate text-right">
      {player.stage}-{player.round} @ {getPlayerPhaseStatusLabel(player.phase, player.build_ready)}
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
  const isSelf = player.name === currentPlayerName;
  const showPairingProbability =
    variant !== "share" && !isSelf && (!player.is_ghost || player.is_most_recent_ghost);
  const showLeadingMicToggle = variant === "game" && !!micToggle;

  return (
    <button
      type="button"
      className={`relative grid w-full appearance-none overflow-hidden border-none bg-transparent grid-cols-[minmax(0,1fr)_max-content] grid-rows-2 items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left transition-colors player-row-etched ${
        isSelected ? "ring-1 ring-[var(--color-gold)]/60" : ""
      } ${player.is_ghost ? "opacity-50" : ""}`}
      data-guide-player-row={player.name}
      onClick={onClick}
    >
      <div className="min-w-0 self-end">
        <div className="flex items-center gap-1.5">
          {showPlacement && (
            <PlacementTag rank={getSidebarPlacementRank(player, players)} total={players.length} />
          )}
          {showLeadingMicToggle ? micToggle : null}
          <span className="block truncate text-sm font-medium text-amber-50">
            {player.name}
          </span>
          {!showLeadingMicToggle ? micToggle : null}
        </div>
      </div>

      <div className="justify-self-end self-end max-w-[8.5rem] text-xs text-[var(--ivory-muted)]">
        <ResultBadge
          result={player.last_result}
          inSuddenDeath={player.in_sudden_death}
          shareStatus={variant === "share" ? shareStatus : undefined}
        />
      </div>

      <div className="min-w-0 self-start">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className="inline-flex items-center gap-1 text-purple-300/90"
            title="Poison"
          >
            <PoisonIcon size="sm" /> {player.poison}
          </span>
          <span
            className="inline-flex items-center gap-1 text-amber-300/90"
            title="Treasures"
          >
            <MoneyBagIcon size="sm" /> {player.treasures}
          </span>
          {variant !== "share" && isSelf && (
            <Tag tone="gold" small>You</Tag>
          )}
          {showPairingProbability && player.pairing_probability !== null && (
            <PairingProbability probability={player.pairing_probability} />
          )}
        </div>
      </div>

      <div className="justify-self-end self-start max-w-[8.5rem] min-w-0 text-xs text-[var(--ivory-muted)]">
        <div className="text-right">
          <StatusLine player={player} variant={variant} />
        </div>
      </div>
    </button>
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

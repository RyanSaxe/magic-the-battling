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
import { PlacementBadge } from "./sidebar/PlacementBadge";
import { getSidebarPlayerOrder } from "../utils/playerPlacement";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName: string;
}

export const PLAYER_ROW_STACK_CLASS = "space-y-3";

function ResultBadge({
  result,
  inSuddenDeath,
}: {
  result: LastResult | null;
  inSuddenDeath: boolean;
}) {
  const baseClassName = "inline-flex h-4 min-w-[1.25rem] shrink-0 items-center justify-center rounded-[3px] border border-[color:rgba(212,175,55,0.22)] bg-black/18 px-1 text-[10px] font-bold leading-none";

  if (inSuddenDeath) {
    return (
      <span className={`${baseClassName} min-w-[1.5rem] text-[9px] text-red-300`} title="Sudden Death">
        SD
      </span>
    );
  }

  if (result === null) {
    return <span className={`${baseClassName} font-semibold text-gray-500`}>-</span>;
  }

  if (result === "win") {
    return <span className={`${baseClassName} text-emerald-300`}>W</span>;
  }

  if (result === "draw") {
    return <span className={`${baseClassName} text-amber-200`}>D</span>;
  }

  return <span className={`${baseClassName} text-red-300`}>L</span>;
}

function PairingProbability({ probability }: { probability: number | null }) {
  if (probability === null) {
    return <span className="text-[10px] text-gray-500">??%</span>;
  }

  return (
    <span className="text-[10px] text-cyan-300/90">
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
      {player.stage}-{player.round} @ {player.phase === "build" && player.build_ready ? "ready" : player.phase}
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
}: {
  player: PlayerView;
  players: PlayerView[];
  currentPlayerName: string;
  isSelected: boolean;
  onClick: () => void;
  variant?: "game" | "share";
}) {
  const isSelf = player.name === currentPlayerName;
  const showPairingProbability =
    variant !== "share" && !isSelf && (!player.is_ghost || player.is_most_recent_ghost);

  return (
    <button
      type="button"
      className={`relative grid w-full appearance-none overflow-hidden border-none bg-transparent grid-cols-[minmax(0,1fr)_max-content] grid-rows-2 items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left transition-colors player-row-etched ${
        isSelected ? "ring-1 ring-[var(--color-gold)]/60" : ""
      } ${player.is_ghost ? "opacity-50" : ""}`}
      data-guide-player-row={player.name}
      onClick={onClick}
    >
      <PlacementBadge
        player={player}
        players={players}
        variant="corner"
        className="pointer-events-none absolute left-0 top-0 z-10"
      />

      <div className="min-w-0 self-end">
        <span className="block truncate text-sm font-medium text-amber-50">
          {player.name}
        </span>
      </div>

      <div className="justify-self-end self-end max-w-[8.5rem] text-xs text-gray-400">
        <ResultBadge
          result={player.last_result}
          inSuddenDeath={player.in_sudden_death}
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
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-cyan-300/90">
              You
            </span>
          )}
          {showPairingProbability && (
            <PairingProbability probability={player.pairing_probability} />
          )}
        </div>
      </div>

      <div className="justify-self-end self-start max-w-[8.5rem] min-w-0 text-xs text-gray-400">
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
          />
        ))}
      </div>
    </div>
  );
}

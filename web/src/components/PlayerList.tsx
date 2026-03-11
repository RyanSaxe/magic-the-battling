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
  if (inSuddenDeath) {
    return (
      <span className="text-[10px] font-bold text-red-300" title="Sudden Death">
        SD
      </span>
    );
  }

  if (result === null) {
    return <span className="text-[10px] font-semibold text-gray-500">-</span>;
  }

  if (result === "win") {
    return <span className="text-[10px] font-bold text-emerald-300">W</span>;
  }

  if (result === "draw") {
    return <span className="text-[10px] font-bold text-amber-200">D</span>;
  }

  return <span className="text-[10px] font-bold text-red-300">L</span>;
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
  if (variant === "share") {
    return player.is_puppet
      ? <PuppetIcon size="sm" />
      : <span className="block truncate text-right">{player.stage}-{player.round}</span>;
  }

  if (player.is_ghost && !player.is_most_recent_ghost) {
    return <SkullIcon size="sm" />;
  }

  if (player.is_most_recent_ghost) {
    return <GhostIcon size="sm" />;
  }

  if (player.phase === "awaiting_elimination") {
    return <HourglassIcon size="sm" />;
  }

  if (player.is_puppet) {
    return <PuppetIcon size="sm" />;
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
      className={`relative grid w-full appearance-none overflow-hidden border-none bg-transparent grid-cols-[minmax(0,1fr)_max-content] grid-rows-2 items-center gap-x-3 gap-y-1 rounded-lg p-3 text-left transition-colors player-row-etched ${
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
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-300">
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

  const byPlacement = (a: PlayerView, b: PlayerView) => {
    if (a.placement === 0 && b.placement === 0) {
      const poisonDiff = a.poison - b.poison;
      if (poisonDiff !== 0) return poisonDiff;
      return a.name.localeCompare(b.name);
    }
    if (a.placement === 0) return -1;
    if (b.placement === 0) return 1;
    if (a.placement !== b.placement) return a.placement - b.placement;
    return a.name.localeCompare(b.name);
  };

  const sortedPlayers = [...players].sort(byPlacement);

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

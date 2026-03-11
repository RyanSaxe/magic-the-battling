import type { PlayerView, LastResult } from "../types";
import {
  PoisonIcon,
  MoneyBagIcon,
  GhostIcon,
  PuppetIcon,
  SkullIcon,
  HourglassIcon,
} from "./icons";
import { useContextStrip } from "../contexts";
import { PlacementBadge } from "./sidebar/PlacementBadge";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName: string;
}

function ResultBadge({
  result,
  inSuddenDeath,
}: {
  result: LastResult | null;
  inSuddenDeath: boolean;
}) {
  if (inSuddenDeath) {
    return (
      <span
        className="text-[10px] font-bold text-red-400 bg-red-900/50 py-0.5 px-2 rounded"
        title="Sudden Death"
      >
        💀
      </span>
    );
  }

  if (result === null) return null;

  if (result === "win") {
    return (
      <span className="text-[10px] font-bold text-green-400 bg-green-900/50 py-0.5 px-2 rounded">
        W
      </span>
    );
  }
  if (result === "draw") {
    return (
      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/50 py-0.5 px-2 rounded">
        D
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-red-400 bg-red-900/50 py-0.5 px-2 rounded">
      L
    </span>
  );
}

function PairingProbability({ probability }: { probability: number | null }) {
  if (probability === null) {
    return <span className="text-[10px] text-gray-500">??%</span>;
  }
  const pct = Math.round(probability * 100);
  return <span className="text-[10px] text-amber-400/80">{pct}%</span>;
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

  return (
    <div
      className={`relative p-3 rounded-lg transition-colors cursor-pointer player-row-etched ${
        isSelected ? "ring-1 ring-[var(--color-gold)]/60" : ""
      } ${
        isSelf
          ? "player-row-etched--self"
          : player.is_puppet
            ? "player-row-etched--puppet"
            : ""
      } ${player.is_ghost ? "opacity-50" : ""}`}
      data-guide-player-row={player.name}
      onClick={onClick}
    >
      <PlacementBadge player={player} players={players} />
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <span className="text-amber-50 font-medium truncate block">
              {player.name}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span
              className="flex items-center gap-1 text-purple-400"
              title="Poison"
            >
              <PoisonIcon size="sm" /> {player.poison}
            </span>
            <span
              className="flex items-center gap-1 text-amber-400"
              title="Treasures"
            >
              <MoneyBagIcon size="sm" /> {player.treasures}
            </span>
            {variant !== "share" && !isSelf &&
              (!player.is_ghost || player.is_most_recent_ghost) && (
                <PairingProbability probability={player.pairing_probability} />
              )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <ResultBadge
            result={player.last_result}
            inSuddenDeath={player.in_sudden_death}
          />
          <span className="text-gray-400 text-xs">
            {variant === "share" ? (
              player.is_puppet ? (
                <PuppetIcon size="sm" />
              ) : (
                `${player.stage}-${player.round}`
              )
            ) : player.is_ghost && !player.is_most_recent_ghost ? (
              <SkullIcon size="sm" />
            ) : player.is_most_recent_ghost ? (
              <GhostIcon size="sm" />
            ) : player.phase === "awaiting_elimination" ? (
              <HourglassIcon size="sm" />
            ) : player.is_puppet ? (
              <PuppetIcon size="sm" />
            ) : (
              `${player.stage}-${player.round} @ ${player.phase === "build" && player.build_ready ? "ready" : player.phase}`
            )}
          </span>
        </div>
      </div>
    </div>
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
      setRevealedPlayerName(player.name);
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
    <div className="relative pt-1">
      <div
        className="space-y-2"
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

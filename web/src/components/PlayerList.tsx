import { useState, useEffect } from "react";
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
import {
  POISON_COUNTER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../constants/assets";
import { UpgradeStack } from "./sidebar/UpgradeStack";
import { ZoneDisplay } from "./sidebar/ZoneDisplay";
import { PlacementBadge } from "./sidebar/PlacementBadge";

type Tab = "you" | "opponents" | "others";

interface PlayerListProps {
  players: PlayerView[];
  currentPlayerName?: string;
  currentPlayer: PlayerView;
  useUpgrades: boolean;
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
  return <span className="text-[10px] text-blue-400">{pct}%</span>;
}

export function PlayerRow({
  player,
  players,
  currentPlayerName,
  isSelected,
  onClick,
}: {
  player: PlayerView;
  players: PlayerView[];
  currentPlayerName: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`relative p-3 rounded-lg transition-colors cursor-pointer hover:bg-gray-800/50 ${
        isSelected ? "ring-2 ring-blue-500" : ""
      } ${
        player.name === currentPlayerName
          ? "bg-amber-900/30 border border-amber-700/50"
          : player.is_puppet
            ? "bg-cyan-900/20 border border-cyan-800/30"
            : "bg-black/30"
      } ${player.is_ghost ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <PlacementBadge player={player} players={players} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-white font-medium truncate max-w-[120px]">
          {player.name}
        </span>
        <ResultBadge
          result={player.last_result}
          inSuddenDeath={player.in_sudden_death}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
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
          {player.name !== currentPlayerName &&
            (!player.is_ghost || player.is_most_recent_ghost) && (
              <PairingProbability probability={player.pairing_probability} />
            )}
        </div>
        <span className="text-gray-500">
          {player.is_ghost && !player.is_most_recent_ghost ? (
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
  );
}

export function PlayerList({
  players,
  currentPlayerName,
  currentPlayer,
  useUpgrades,
}: PlayerListProps) {
  const { state, setRevealedPlayerName } = useContextStrip();
  const [activeTab, setActiveTab] = useState<Tab>("you");

  useEffect(() => {
    setRevealedPlayerName(null);
  }, [setRevealedPlayerName]);

  const handlePlayerClick = (player: PlayerView) => {
    if (state.revealedPlayerName === player.name) {
      setRevealedPlayerName(null);
    } else {
      setRevealedPlayerName(player.name);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "you") {
      setRevealedPlayerName(null);
    }
  };

  const nonSelfPlayers = players.filter((p) => p.name !== currentPlayerName);
  const showOthersTab = players.length > 4;

  const opponents = showOthersTab
    ? nonSelfPlayers.filter(
        (p) => p.pairing_probability !== null && p.pairing_probability > 0,
      )
    : nonSelfPlayers;

  const others = showOthersTab
    ? nonSelfPlayers.filter(
        (p) => p.pairing_probability === null || p.pairing_probability === 0,
      )
    : [];

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

  const sortedOpponents = [...opponents].sort(byPlacement);
  const sortedOthers = [...others].sort(byPlacement);

  useEffect(() => {
    if (
      activeTab === "opponents" &&
      !state.revealedPlayerName &&
      sortedOpponents.length > 0
    ) {
      setRevealedPlayerName(sortedOpponents[0].name);
    } else if (
      activeTab === "others" &&
      !state.revealedPlayerName &&
      sortedOthers.length > 0
    ) {
      setRevealedPlayerName(sortedOthers[0].name);
    }
  }, [activeTab]);

  const appliedUpgrades = currentPlayer.upgrades.filter(
    (u) => u.upgrade_target !== null,
  );
  const pendingUpgrades = currentPlayer.upgrades.filter(
    (u) => u.upgrade_target === null,
  );
  const allUpgrades = [...appliedUpgrades, ...pendingUpgrades];
  const companionIds = new Set(currentPlayer.command_zone.map((c) => c.id));

  const tabs: { key: Tab; label: string }[] = [
    { key: "you", label: "You" },
    { key: "opponents", label: "Opponents" },
    ...(showOthersTab ? [{ key: "others" as Tab, label: "Others" }] : []),
  ];

  return (
    <div className="relative">
      <div className="flex border-b border-gray-700 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "you" && (
        <div className="space-y-2">
          <div className="relative flex items-center justify-center gap-6">
            <PlacementBadge player={currentPlayer} players={players} />
            <div className="relative">
              <img
                src={POISON_COUNTER_IMAGE}
                alt="Poison"
                className="h-24 rounded"
              />
              <span className="absolute bottom-0 right-0 bg-black/70 text-purple-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {currentPlayer.poison}
              </span>
            </div>
            <div className="relative">
              <img
                src={TREASURE_TOKEN_IMAGE}
                alt="Treasure"
                className="h-24 rounded"
              />
              <span className="absolute bottom-0 right-0 bg-black/70 text-amber-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {currentPlayer.treasures}
              </span>
            </div>
          </div>

          {useUpgrades && allUpgrades.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase mb-1">
                Upgrades
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {allUpgrades.map((upgrade) => (
                  <UpgradeStack
                    key={upgrade.id}
                    upgrade={upgrade}
                    dimensions={{ width: 70, height: 98 }}
                  />
                ))}
              </div>
            </div>
          )}

          {currentPlayer.most_recently_revealed_cards.length > 0 && (
            <ZoneDisplay
              title="Seen in Battle"
              cards={currentPlayer.most_recently_revealed_cards}
              maxThumbnails={6}
              companionIds={companionIds}
            />
          )}
        </div>
      )}

      {activeTab === "opponents" && (
        <div className="space-y-2">
          {sortedOpponents.map((player) => (
            <PlayerRow
              key={player.name}
              player={player}
              players={players}
              currentPlayerName={currentPlayerName ?? ""}
              isSelected={state.revealedPlayerName === player.name}
              onClick={() => handlePlayerClick(player)}
            />
          ))}
          {sortedOpponents.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-4">
              No opponents
            </div>
          )}
        </div>
      )}

      {activeTab === "others" && (
        <div className="space-y-2">
          {sortedOthers.map((player) => (
            <PlayerRow
              key={player.name}
              player={player}
              players={players}
              currentPlayerName={currentPlayerName ?? ""}
              isSelected={state.revealedPlayerName === player.name}
              onClick={() => handlePlayerClick(player)}
            />
          ))}
          {sortedOthers.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-4">
              No other players
            </div>
          )}
        </div>
      )}
    </div>
  );
}

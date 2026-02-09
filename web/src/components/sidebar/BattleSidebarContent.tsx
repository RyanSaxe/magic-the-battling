import { useState } from "react";
import type { BattleView, Card as CardType, Zones } from "../../types";
import { DroppableZoneDisplay } from "./DroppableZoneDisplay";
import { UpgradeStack } from "./UpgradeStack";
import { POISON_COUNTER_IMAGE } from "../../constants/assets";

interface BattleSidebarContentProps {
  currentBattle: BattleView;
  selfUpgrades: CardType[];
  yourLife: number;
  opponentLife: number;
  onYourLifeChange: (life: number) => void;
  onOpponentLifeChange: (life: number) => void;
  playerName: string;
  onCreateTreasure?: () => void;
  onPassTurn?: () => void;
  canManipulateOpponent?: boolean;
  hasCompanion?: boolean;
  opponentHasCompanion?: boolean;
}

function LifeCounter({
  life,
  onChange,
}: {
  life: number;
  onChange: (life: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(life.toString());

  const handleBlur = () => {
    setIsEditing(false);
    const newLife = parseInt(inputValue, 10);
    if (!isNaN(newLife)) {
      onChange(newLife);
    } else {
      setInputValue(life.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    }
    if (e.key === "Escape") {
      setInputValue(life.toString());
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(life - 1)}
        className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold"
      >
        -
      </button>
      {isEditing ? (
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-10 h-6 text-center bg-gray-800 text-white text-sm rounded border border-gray-600 focus:outline-none focus:border-amber-500"
          autoFocus
        />
      ) : (
        <button
          onClick={() => {
            setInputValue(life.toString());
            setIsEditing(true);
          }}
          className="w-10 h-6 text-center bg-gray-800 text-white text-sm rounded hover:bg-gray-700"
        >
          {life}
        </button>
      )}
      <button
        onClick={() => onChange(life + 1)}
        className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold"
      >
        +
      </button>
    </div>
  );
}

function PlayerSection({
  zones,
  upgrades,
  isOpponent = false,
  canManipulateOpponent = false,
  hasCompanion = false,
  isReversed = false,
}: {
  zones: Zones;
  upgrades: CardType[];
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  hasCompanion?: boolean;
  isReversed?: boolean;
}) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target);

  const upgradesRow = appliedUpgrades.length > 0 && (
    <div className="flex gap-2 flex-wrap justify-center">
      {appliedUpgrades.map((upgrade) => (
        <UpgradeStack key={upgrade.id} upgrade={upgrade} size="xs" />
      ))}
    </div>
  );

  const commandZone = (zones.command_zone.length > 0 || hasCompanion) && (
    <DroppableZoneDisplay
      title="Special"
      zone="command_zone"
      cards={zones.command_zone}
      validFromZones={[
        "hand",
        "battlefield",
        "graveyard",
        "exile",
        "sideboard",
        "command_zone",
      ]}
      isOpponent={isOpponent}
      canManipulateOpponent={canManipulateOpponent}
      titleClassName="text-amber-400"
      hideCount
      size="sm"
    />
  );

  return (
    <div className="flex flex-col justify-between h-full">
      {isReversed ? (
        <>
          <div className="space-y-2">
            {commandZone}
          </div>
          <div className="space-y-2">
            {upgradesRow}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            {upgradesRow}
          </div>
          <div className="space-y-2">
            {commandZone}
          </div>
        </>
      )}
    </div>
  );
}

export function BattleSidebarContent({
  currentBattle,
  selfUpgrades,
  yourLife,
  opponentLife,
  onYourLifeChange,
  onOpponentLifeChange,
  playerName,
  onCreateTreasure,
  onPassTurn,
  canManipulateOpponent = false,
  hasCompanion = false,
  opponentHasCompanion = false,
}: BattleSidebarContentProps) {
  const { opponent_name, current_turn_name, your_zones, opponent_zones } =
    currentBattle;

  const yourPoison = currentBattle.your_poison;
  const opponentPoison = currentBattle.opponent_poison;

  return (
    <div className="flex flex-col h-full">
      {/* Opponent section - top */}
      <div className="flex-1 pb-3 pl-3 pr-3 border-b border-gray-700">
        <PlayerSection
          zones={opponent_zones}
          upgrades={opponent_zones.upgrades}
          isOpponent
          canManipulateOpponent={canManipulateOpponent}
          hasCompanion={opponentHasCompanion}
          isReversed
        />
      </div>

      {/* Life counters */}
      <div className="flex items-center justify-center">
        <div className="p-3 bg-black/40 w-full">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase mb-1 truncate max-w-[80px]">
                {opponent_name}
              </div>
              <div className="flex justify-center">
                <LifeCounter
                  life={opponentLife}
                  onChange={onOpponentLifeChange}
                />
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <img
                  src={POISON_COUNTER_IMAGE}
                  alt="Poison"
                  className="w-4 h-4 rounded object-cover"
                />
                <span className="text-purple-400 text-xs font-medium">
                  {opponentPoison}
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase mb-1">You</div>
              <div className="flex justify-center">
                <LifeCounter life={yourLife} onChange={onYourLifeChange} />
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <img
                  src={POISON_COUNTER_IMAGE}
                  alt="Poison"
                  className="w-4 h-4 rounded object-cover"
                />
                <span className="text-purple-400 text-xs font-medium">
                  {yourPoison}
                </span>
              </div>
            </div>
          </div>
          {current_turn_name && (
            <div className="text-center text-xs mt-2">
              {current_turn_name === playerName ? (
                <span className="text-green-400">It is your turn</span>
              ) : (
                <span className="text-amber-400">Opponent's turn</span>
              )}
            </div>
          )}
          {(onPassTurn || onCreateTreasure) && (
            <div className="flex gap-2 mt-3">
              {onPassTurn && (
                <button
                  onClick={onPassTurn}
                  disabled={current_turn_name !== playerName}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Pass
                </button>
              )}
              {onCreateTreasure && (
                <button
                  onClick={onCreateTreasure}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white"
                >
                  Treasure
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Your section - bottom */}
      <div className="flex-1 p-3 border-t border-gray-700">
        <PlayerSection
          zones={your_zones}
          upgrades={selfUpgrades}
          hasCompanion={hasCompanion}
        />
      </div>
    </div>
  );
}

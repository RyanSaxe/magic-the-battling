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
  canManipulateOpponent?: boolean;
  hasCompanion?: boolean;
  opponentHasCompanion?: boolean;
  sideboardCount?: number;
  onShowSideboard?: () => void;
  opponentSideboardCount?: number;
  onShowOpponentSideboard?: () => void;
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
  sideboardButton,
}: {
  zones: Zones;
  upgrades: CardType[];
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  hasCompanion?: boolean;
  isReversed?: boolean;
  sideboardButton?: React.ReactNode;
}) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target);

  const graveyardExileRow = (
    <div className="flex flex-row gap-2">
      <DroppableZoneDisplay
        title="Yard"
        zone="graveyard"
        cards={zones.graveyard}
        maxThumbnails={2}
        validFromZones={["hand", "battlefield", "exile", "command_zone"]}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
      />
      <DroppableZoneDisplay
        title="Exile"
        zone="exile"
        cards={zones.exile}
        maxThumbnails={2}
        validFromZones={["hand", "battlefield", "graveyard", "command_zone"]}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
      />
    </div>
  );

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
            {sideboardButton}
            {commandZone}
          </div>
          <div className="space-y-2">
            {upgradesRow}
            {graveyardExileRow}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            {graveyardExileRow}
            {upgradesRow}
          </div>
          <div className="space-y-2">
            {commandZone}
            {sideboardButton}
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
  canManipulateOpponent = false,
  hasCompanion = false,
  opponentHasCompanion = false,
  sideboardCount = 0,
  onShowSideboard,
  opponentSideboardCount = 0,
  onShowOpponentSideboard,
}: BattleSidebarContentProps) {
  const { opponent_name, on_the_play_name, your_zones, opponent_zones } =
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
          sideboardButton={
            opponentSideboardCount > 0 && onShowOpponentSideboard ? (
              <button
                onClick={onShowOpponentSideboard}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300"
              >
                Sideboard ({opponentSideboardCount})
              </button>
            ) : undefined
          }
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
          {on_the_play_name && (
            <div className="text-center text-xs text-gray-500 mt-2">
              {on_the_play_name === playerName ? (
                <>
                  you are on the <span className="text-green-400">play</span>
                </>
              ) : (
                <>
                  you are on the <span className="text-amber-400">draw</span>
                </>
              )}
            </div>
          )}
          {onCreateTreasure && (
            <button
              onClick={onCreateTreasure}
              className="w-full mt-3 px-3 py-1.5 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white"
            >
              Create Treasure
            </button>
          )}
        </div>
      </div>

      {/* Your section - bottom */}
      <div className="flex-1 p-3 border-t border-gray-700">
        <PlayerSection
          zones={your_zones}
          upgrades={selfUpgrades}
          hasCompanion={hasCompanion}
          sideboardButton={
            sideboardCount > 0 && onShowSideboard ? (
              <button
                onClick={onShowSideboard}
                className="text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded"
              >
                Sideboard ({sideboardCount})
              </button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

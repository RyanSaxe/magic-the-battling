import { useState, useRef, useEffect } from "react";
import type { BattleView, Card as CardType } from "../../types";
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

const ASPECT_RATIO = 7 / 5
const GAP = 8
const PADDING = 12
const MIN_DIMS = { width: 50, height: 70 }
const MAX_DIMS = { width: 130, height: 182 }

function computeUpgradeDims(
  count: number,
  container: { width: number; height: number } | null,
): { width: number; height: number } {
  if (!container || count === 0) return MIN_DIMS
  const availW = container.width - PADDING * 2
  const availH = container.height - PADDING
  let w = Math.floor((availW - GAP * (count - 1)) / count)
  let h = Math.round(w * ASPECT_RATIO)
  if (h > availH) {
    h = availH
    w = Math.round(h / ASPECT_RATIO)
  }
  return {
    width: Math.max(MIN_DIMS.width, Math.min(MAX_DIMS.width, w)),
    height: Math.max(MIN_DIMS.height, Math.min(MAX_DIMS.height, Math.round(w * ASPECT_RATIO))),
  }
}

function PlayerSection({
  upgrades,
  isReversed = false,
}: {
  upgrades: CardType[];
  isReversed?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerDims, setContainerDims] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      setContainerDims({ width: el.clientWidth, height: el.clientHeight })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target);

  if (appliedUpgrades.length === 0) return null;

  const dims = computeUpgradeDims(appliedUpgrades.length, containerDims)

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${isReversed ? 'justify-end' : 'justify-start'} h-full`}
    >
      <div className="flex gap-2 flex-wrap justify-center">
        {appliedUpgrades.map((upgrade) => (
          <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={dims} />
        ))}
      </div>
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
}: BattleSidebarContentProps) {
  const { opponent_name, current_turn_name, opponent_zones } =
    currentBattle;

  const yourPoison = currentBattle.your_poison;
  const opponentPoison = currentBattle.opponent_poison;

  return (
    <div className="flex flex-col h-full">
      {/* Opponent section - top */}
      <div className="flex-1 pb-3 pl-3 pr-3 border-b border-gray-700">
        <PlayerSection
          upgrades={opponent_zones.upgrades}
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
                  className="w-6 h-6 rounded object-cover"
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
                  className="w-6 h-6 rounded object-cover"
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
          {onCreateTreasure && (
            <div className="mt-3">
              <button
                onClick={onCreateTreasure}
                className="w-full px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Create Treasure
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Your section - bottom */}
      <div className="flex-1 p-3 border-t border-gray-700">
        <PlayerSection
          upgrades={selfUpgrades}
        />
      </div>
    </div>
  );
}

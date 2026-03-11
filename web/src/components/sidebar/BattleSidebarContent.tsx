import { useState, useRef, useEffect } from "react";
import type { BattleView, Card as CardType } from "../../types";
import { UpgradeStack } from "./UpgradeStack";

interface BattleSidebarContentProps {
  currentBattle: BattleView;
  selfUpgrades: CardType[];
  yourLife: number;
  opponentLife: number;
  onYourLifeChange: (life: number) => void;
  onOpponentLifeChange: (life: number) => void;
  playerName: string;
  onCreateTreasure?: () => void;
  onUntapAll?: () => void;
  onPassTurn?: () => void;
  canManipulateOpponent?: boolean;
  onCreateOpponentTreasure?: () => void;
  onUntapOpponentAll?: () => void;
  onPassOpponentTurn?: () => void;
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
        className="w-6 h-6 rounded text-white text-sm font-bold" style={{ background: 'var(--chrome)' }}
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
          className="w-10 h-6 text-center text-white text-sm rounded border border-[var(--gold-border)] focus:outline-none focus:border-amber-500" style={{ background: 'var(--chrome)' }}
          autoFocus
        />
      ) : (
        <button
          onClick={() => {
            setInputValue(life.toString());
            setIsEditing(true);
          }}
          className="w-10 h-6 text-center text-white text-sm rounded" style={{ background: 'var(--chrome)' }}
        >
          {life}
        </button>
      )}
      <button
        onClick={() => onChange(life + 1)}
        className="w-6 h-6 rounded text-white text-sm font-bold" style={{ background: 'var(--chrome)' }}
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
  onUntapAll,
  onPassTurn,
  canManipulateOpponent,
  onCreateOpponentTreasure,
  onUntapOpponentAll,
  onPassOpponentTurn,
}: BattleSidebarContentProps) {
  const { opponent_name, current_turn_name, opponent_zones } =
    currentBattle;

  const isYourTurn = current_turn_name === playerName;

  return (
    <div className="flex flex-col h-full">
      {/* Opponent section - top */}
      <div className="flex-1 pb-3 pl-3 pr-3 border-b border-[var(--gold-border-opaque)]">
        <PlayerSection
          upgrades={opponent_zones.upgrades}
          isReversed
        />
      </div>

      {/* Controls panel */}
      <div className="flex items-center justify-center">
        <div className="p-3 w-full space-y-2" style={{ background: 'var(--chrome-modal)' }}>
          {canManipulateOpponent && (onCreateOpponentTreasure || onUntapOpponentAll || onPassOpponentTurn) && (
            <div className="flex gap-2">
              {onCreateOpponentTreasure && (
                <button
                  onClick={onCreateOpponentTreasure}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Treasure
                </button>
              )}
              {onUntapOpponentAll && (
                <button
                  onClick={onUntapOpponentAll}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Untap
                </button>
              )}
              {onPassOpponentTurn && (
                <button
                  onClick={onPassOpponentTurn}
                  disabled={isYourTurn}
                  className={`flex-1 px-3 py-1.5 text-xs rounded text-white font-medium transition-colors ${
                    !isYourTurn
                      ? "bg-indigo-600 hover:bg-indigo-500"
                      : "bg-indigo-600/35 text-white/60 cursor-not-allowed"
                  }`}
                >
                  Pass
                </button>
              )}
            </div>
          )}

          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-1 truncate">
              {opponent_name}
            </div>
            <div className="flex justify-center">
              <LifeCounter
                life={opponentLife}
                onChange={onOpponentLifeChange}
              />
            </div>
          </div>

          {current_turn_name && (
            <div className="text-center text-xs py-1">
              {isYourTurn ? (
                <span className="text-green-400">It is your turn</span>
              ) : (
                <span className="text-amber-400">Opponent's turn</span>
              )}
            </div>
          )}

          <div className="text-center">
            <div className="flex justify-center">
              <LifeCounter life={yourLife} onChange={onYourLifeChange} />
            </div>
            <div className="text-xs text-gray-400 uppercase mt-1 truncate">
              {playerName}
            </div>
          </div>

          {(onCreateTreasure || onUntapAll || onPassTurn) && (
            <div className="flex gap-2">
              {onCreateTreasure && (
                <button
                  onClick={onCreateTreasure}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Treasure
                </button>
              )}
              {onUntapAll && (
                <button
                  onClick={onUntapAll}
                  className="flex-1 px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Untap
                </button>
              )}
              {onPassTurn && (
                <button
                  onClick={onPassTurn}
                  disabled={!isYourTurn}
                  className={`flex-1 px-3 py-1.5 text-xs rounded text-white font-medium transition-colors ${
                    isYourTurn
                      ? "bg-indigo-600 hover:bg-indigo-500"
                      : "bg-indigo-600/35 text-white/60 cursor-not-allowed"
                  }`}
                >
                  Pass
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Your section - bottom */}
      <div className="flex-1 p-3 border-t border-[var(--gold-border-opaque)]">
        <PlayerSection
          upgrades={selfUpgrades}
        />
      </div>
    </div>
  );
}

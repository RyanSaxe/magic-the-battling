import { useState, useRef, useEffect } from "react";
import type { BattleView, Card as CardType } from "../../types";
import type { VoiceChatState } from "../../hooks/useVoiceChat";
import { UpgradeStack } from "./UpgradeStack";
import { MicToggle } from "./MicToggle";
import { getRevealedAppliedUpgrades } from "../../utils/upgrades";
import { bestFit, type ZoneDims } from "../../hooks/cardSizeUtils";

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
  topSectionHeight?: number | null;
  middleLaneHeight?: number | null;
  overlayTopInset?: number;
  voiceChat?: {
    state: VoiceChatState;
    toggleSelfMute: () => void;
    togglePeerMute: (peerName: string) => void;
  };
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

const GAP = 8
const MIN_DIMS = { width: 50, height: 70 }
const SECTION_GUTTER = 12

function resolveUpgradeDims(
  count: number,
  container: { width: number; height: number } | null,
): ZoneDims {
  if (!container || count === 0) return { ...MIN_DIMS, rows: 1, columns: 1 }
  const availWidth = Math.max(1, container.width)
  const availHeight = Math.max(1, container.height)
  return bestFit(count, availWidth, availHeight, GAP, availWidth, 1)
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

  const appliedUpgrades = getRevealedAppliedUpgrades(upgrades);

  if (appliedUpgrades.length === 0) return null;

  const dims = resolveUpgradeDims(appliedUpgrades.length, containerDims)

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-hidden`}
    >
      <div
        className={`grid h-full justify-center gap-2 ${isReversed ? "content-end" : "content-start"}`}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, dims.columns)}, ${dims.width}px)`,
        }}
      >
        {appliedUpgrades.map((upgrade) => (
          <UpgradeStack
            key={upgrade.id}
            upgrade={upgrade}
            dimensions={{ width: dims.width, height: dims.height }}
          />
        ))}
      </div>
    </div>
  );
}

function ActionButtonsRow({
  onCreateTreasure,
  onUntapAll,
  onPassTurn,
  passDisabled,
}: {
  onCreateTreasure?: () => void;
  onUntapAll?: () => void;
  onPassTurn?: () => void;
  passDisabled: boolean;
}) {
  if (!onCreateTreasure && !onUntapAll && !onPassTurn) {
    return null
  }

  return (
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
          disabled={passDisabled}
          className={`flex-1 px-3 py-1.5 text-xs rounded text-white font-medium transition-colors ${
            !passDisabled
              ? "bg-indigo-600 hover:bg-indigo-500"
              : "bg-indigo-600/35 text-white/60 cursor-not-allowed"
          }`}
        >
          Pass
        </button>
      )}
    </div>
  )
}

function ControlsPanel({
  opponentName,
  playerName,
  opponentLife,
  yourLife,
  onOpponentLifeChange,
  onYourLifeChange,
  isYourTurn,
  currentTurnName,
  voiceChat,
  showTopDivider,
}: {
  opponentName: string;
  playerName: string;
  opponentLife: number;
  yourLife: number;
  onOpponentLifeChange: (life: number) => void;
  onYourLifeChange: (life: number) => void;
  isYourTurn: boolean;
  currentTurnName: string | null;
  voiceChat?: BattleSidebarContentProps["voiceChat"];
  showTopDivider: boolean;
}) {
  return (
    <div
      className="relative grid h-full min-h-0 w-full grid-rows-[1fr_auto_1fr] overflow-hidden"
      style={{ background: 'var(--chrome-modal)' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[2px]"
        style={{
          boxShadow:
            'inset 0 10px 18px -14px rgba(255, 236, 181, 0.18), inset 0 0 24px rgba(0, 0, 0, 0.22)',
        }}
      />
      {showTopDivider && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] zone-divider-line zone-divider-line--horizontal"
        />
      )}
      <div className="relative z-10 flex min-h-0 flex-col items-center justify-center gap-2 px-3 py-2">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-xs text-gray-400 uppercase truncate">
              {opponentName}
            </span>
            {voiceChat && voiceChat.state.peers.some((p) => p.name === opponentName) && (
              <MicToggle
                muted={voiceChat.state.mutedPeers.has(opponentName)}
                connectionState={voiceChat.state.peers.find(p => p.name === opponentName)?.connectionState}
                audioLevelKey={opponentName}
                remoteMuted={voiceChat.state.remoteMutedPeers.has(opponentName)}
                onClick={() => voiceChat.togglePeerMute(opponentName)}
              />
            )}
          </div>
          <div className="flex justify-center">
            <LifeCounter
              life={opponentLife}
              onChange={onOpponentLifeChange}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center gap-1 px-3 py-1 text-center text-xs">
        {currentTurnName && (
          isYourTurn ? (
            <span className="text-green-400">It is your turn</span>
          ) : (
            <span className="text-amber-400">Opponent's turn</span>
          )
        )}
      </div>

      <div className="relative z-10 flex min-h-0 flex-col items-center justify-center gap-2 px-3 py-2">
        <div className="text-center">
          <div className="flex justify-center">
            <LifeCounter life={yourLife} onChange={onYourLifeChange} />
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className="text-xs text-gray-400 uppercase truncate">
              {playerName}
            </span>
            {voiceChat && voiceChat.state.peers.length > 0 && (
              <MicToggle
                muted={voiceChat.state.isMuted}
                audioLevelKey="__self__"
                onClick={() => voiceChat.toggleSelfMute()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
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
  topSectionHeight = null,
  middleLaneHeight = null,
  overlayTopInset = 0,
  voiceChat,
}: BattleSidebarContentProps) {
  const { opponent_name, current_turn_name, opponent_zones } =
    currentBattle;

  const isYourTurn = current_turn_name === playerName;
  const hasMeasuredMiddleLane = middleLaneHeight != null;
  const hasMeasuredLayout = topSectionHeight != null && middleLaneHeight != null;
  const hasOpponentActions = !!canManipulateOpponent && !!(onCreateOpponentTreasure || onUntapOpponentAll || onPassOpponentTurn)
  const hasPlayerActions = !!(onCreateTreasure || onUntapAll || onPassTurn)

  if (hasMeasuredLayout) {
    const totalTopSectionHeight = topSectionHeight + overlayTopInset
    const controlsTop = totalTopSectionHeight
    const controlsBottom = controlsTop + middleLaneHeight

    return (
      <div className="relative h-full">
        <div
          className="absolute inset-x-0 top-0 overflow-hidden"
          style={{ height: totalTopSectionHeight }}
        >
          <div
            className="grid h-full min-h-0 px-3 pt-3 pb-3"
            style={{
              gap: SECTION_GUTTER,
              gridTemplateRows: hasOpponentActions ? "minmax(0,1fr) auto" : "minmax(0,1fr)",
            }}
          >
            <div className="min-h-0">
              <PlayerSection
                upgrades={opponent_zones.upgrades}
                isReversed
              />
            </div>
            {hasOpponentActions && (
              <ActionButtonsRow
                onCreateTreasure={onCreateOpponentTreasure}
                onUntapAll={onUntapOpponentAll}
                onPassTurn={onPassOpponentTurn}
                passDisabled={isYourTurn}
              />
            )}
          </div>
        </div>

        <div
          className="absolute inset-x-0 min-h-0"
          style={{ top: controlsTop, height: middleLaneHeight }}
        >
          <ControlsPanel
            opponentName={opponent_name}
            playerName={playerName}
            opponentLife={opponentLife}
            yourLife={yourLife}
            onOpponentLifeChange={onOpponentLifeChange}
            onYourLifeChange={onYourLifeChange}
            isYourTurn={isYourTurn}
            currentTurnName={current_turn_name}
            voiceChat={voiceChat}
            showTopDivider
          />
        </div>

        <div
          className="absolute inset-x-0 bottom-0 min-h-0 overflow-hidden"
          style={{ top: controlsBottom }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px] zone-divider-line zone-divider-line--horizontal"
          />
          <div
            className="grid h-full min-h-0 px-3 pt-3 pb-3"
            style={{
              gap: SECTION_GUTTER,
              gridTemplateRows: hasPlayerActions ? "auto minmax(0,1fr)" : "minmax(0,1fr)",
            }}
          >
            {hasPlayerActions && (
              <ActionButtonsRow
                onCreateTreasure={onCreateTreasure}
                onUntapAll={onUntapAll}
                onPassTurn={onPassTurn}
                passDisabled={!isYourTurn}
              />
            )}
            <div className="min-h-0">
              <PlayerSection
                upgrades={selfUpgrades}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Opponent section - top */}
      <div
        className={`${topSectionHeight != null ? "box-border shrink-0" : "flex-1"} overflow-hidden ${
          hasMeasuredMiddleLane
            ? ""
            : "border-b border-[var(--gold-border-opaque)]"
        }`}
        style={topSectionHeight != null ? { height: topSectionHeight } : undefined}
      >
        <div
          className="grid h-full min-h-0 px-3 pt-3 pb-3"
          style={{
            gap: SECTION_GUTTER,
            gridTemplateRows: hasOpponentActions ? "minmax(0,1fr) auto" : "minmax(0,1fr)",
          }}
        >
          <div className="min-h-0">
            <PlayerSection
              upgrades={opponent_zones.upgrades}
              isReversed
            />
          </div>
          {hasOpponentActions && (
            <ActionButtonsRow
              onCreateTreasure={onCreateOpponentTreasure}
              onUntapAll={onUntapOpponentAll}
              onPassTurn={onPassOpponentTurn}
              passDisabled={isYourTurn}
            />
          )}
        </div>
      </div>

      {/* Controls panel */}
      <div
        className={`${middleLaneHeight != null ? "box-border shrink-0" : "flex-1"} min-h-0`}
        style={middleLaneHeight != null ? { height: middleLaneHeight } : undefined}
      >
        <ControlsPanel
          opponentName={opponent_name}
          playerName={playerName}
          opponentLife={opponentLife}
          yourLife={yourLife}
          onOpponentLifeChange={onOpponentLifeChange}
          onYourLifeChange={onYourLifeChange}
          isYourTurn={isYourTurn}
          currentTurnName={current_turn_name}
          voiceChat={voiceChat}
          showTopDivider={middleLaneHeight != null}
        />
      </div>

      {/* Your section - bottom */}
      <div
        className={`relative min-h-0 flex-1 overflow-hidden ${
          hasMeasuredMiddleLane
            ? ""
            : "border-t border-[var(--gold-border-opaque)]"
        }`}
      >
        {hasMeasuredMiddleLane && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px] zone-divider-line zone-divider-line--horizontal"
          />
        )}
        <div
          className="grid h-full min-h-0 px-3 pt-3 pb-3"
          style={{
            gap: SECTION_GUTTER,
            gridTemplateRows: hasPlayerActions ? "auto minmax(0,1fr)" : "minmax(0,1fr)",
          }}
        >
          {hasPlayerActions && (
            <ActionButtonsRow
              onCreateTreasure={onCreateTreasure}
              onUntapAll={onUntapAll}
              onPassTurn={onPassTurn}
              passDisabled={!isYourTurn}
            />
          )}
          <div className="min-h-0">
            <PlayerSection
              upgrades={selfUpgrades}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

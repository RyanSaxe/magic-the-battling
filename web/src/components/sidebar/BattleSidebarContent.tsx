import { useState } from 'react'
import type { BattleView, Card as CardType, Zones } from '../../types'
import { DroppableZoneDisplay } from './DroppableZoneDisplay'
import { UpgradeStack } from './UpgradeStack'
import { POISON_COUNTER_IMAGE } from '../../constants/assets'

interface BattleSidebarContentProps {
  currentBattle: BattleView
  selfUpgrades: CardType[]
  yourLife: number
  opponentLife: number
  onYourLifeChange: (life: number) => void
  onOpponentLifeChange: (life: number) => void
  playerName: string
  onCreateTreasure?: () => void
  canManipulateOpponent?: boolean
}

function LifeCounter({
  life,
  onChange,
}: {
  life: number
  onChange: (life: number) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(life.toString())

  const handleBlur = () => {
    setIsEditing(false)
    const newLife = parseInt(inputValue, 10)
    if (!isNaN(newLife)) {
      onChange(newLife)
    } else {
      setInputValue(life.toString())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    }
    if (e.key === 'Escape') {
      setInputValue(life.toString())
      setIsEditing(false)
    }
  }

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
            setInputValue(life.toString())
            setIsEditing(true)
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
  )
}


function PlayerSection({
  name,
  poison,
  zones,
  upgrades,
  isOpponent = false,
  canManipulateOpponent = false,
}: {
  name: string
  poison: number
  zones: Zones
  upgrades: CardType[]
  isOpponent?: boolean
  canManipulateOpponent?: boolean
}) {
  const appliedUpgrades = upgrades.filter((u) => u.upgrade_target)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium truncate max-w-[100px]">{name}</span>
        <div className="flex items-center gap-1">
          <img
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="w-5 h-5 rounded object-cover"
          />
          <span className="text-purple-400 text-sm font-medium">{poison}</span>
        </div>
      </div>

      {zones.command_zone.length > 0 && (
        <DroppableZoneDisplay
          title="Command Zone"
          zone="command_zone"
          cards={zones.command_zone}
          validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard']}
          isOpponent={isOpponent}
          canManipulateOpponent={canManipulateOpponent}
          titleClassName="text-amber-400"
        />
      )}

      {isOpponent && appliedUpgrades.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {appliedUpgrades.map((upgrade) => (
            <UpgradeStack key={upgrade.id} upgrade={upgrade} size="xs" />
          ))}
        </div>
      )}

      <DroppableZoneDisplay
        title="Graveyard"
        zone="graveyard"
        cards={zones.graveyard}
        validFromZones={['hand', 'battlefield', 'exile', 'command_zone']}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
      />
      <DroppableZoneDisplay
        title="Exile"
        zone="exile"
        cards={zones.exile}
        validFromZones={['hand', 'battlefield', 'graveyard', 'command_zone']}
        isOpponent={isOpponent}
        canManipulateOpponent={canManipulateOpponent}
      />

      {!isOpponent && appliedUpgrades.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {appliedUpgrades.map((upgrade) => (
            <UpgradeStack key={upgrade.id} upgrade={upgrade} size="xs" />
          ))}
        </div>
      )}
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
  canManipulateOpponent = false,
}: BattleSidebarContentProps) {
  const { opponent_name, coin_flip_name, your_zones, opponent_zones } = currentBattle

  const yourPoison = currentBattle.your_poison
  const opponentPoison = currentBattle.opponent_poison

  return (
    <div className="flex flex-col">
      {/* Opponent section - top */}
      <div className="p-3 border-b border-gray-700">
        <PlayerSection
          name={opponent_name}
          poison={opponentPoison}
          zones={opponent_zones}
          upgrades={opponent_zones.upgrades}
          isOpponent
          canManipulateOpponent={canManipulateOpponent}
        />
      </div>

      {/* Life counters */}
      <div className="flex items-center justify-center">
        <div className="p-3 bg-black/40 w-full">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase mb-1 truncate max-w-[80px]">{opponent_name}</div>
              <div className="flex justify-center">
                <LifeCounter life={opponentLife} onChange={onOpponentLifeChange} />
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase mb-1">You</div>
              <div className="flex justify-center">
                <LifeCounter life={yourLife} onChange={onYourLifeChange} />
              </div>
            </div>
          </div>
          <div className="text-center text-xs text-gray-500 mt-2">
            {coin_flip_name === playerName ? (
              'You go first'
            ) : (
              <><span className="text-amber-400">{coin_flip_name}</span> goes first</>
            )}
          </div>
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
      <div className="p-3 border-t border-gray-700">
        <PlayerSection
          name="You"
          poison={yourPoison}
          zones={your_zones}
          upgrades={selfUpgrades}
        />
      </div>
    </div>
  )
}

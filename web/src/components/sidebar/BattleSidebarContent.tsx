import { useState } from 'react'
import type { BattleView, Card as CardType } from '../../types'
import { Card } from '../card'
import { POISON_COUNTER_IMAGE } from '../../constants/assets'

interface BattleSidebarContentProps {
  currentBattle: BattleView
  selfUpgrades: CardType[]
  yourLife: number
  opponentLife: number
  onYourLifeChange: (life: number) => void
  onOpponentLifeChange: (life: number) => void
}

function LifeCounter({
  life,
  onChange,
  label,
}: {
  life: number
  onChange: (life: number) => void
  label: string
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
    <div className="flex flex-col items-center">
      <div className="text-[10px] text-gray-400 uppercase mb-1">{label}</div>
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
    </div>
  )
}

function ZoneCounts({
  zones,
  label,
  onGraveyardClick,
  onExileClick,
}: {
  zones: { graveyard: CardType[]; exile: CardType[] }
  label: string
  onGraveyardClick: () => void
  onExileClick: () => void
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-gray-500">{label}:</span>
      <button
        onClick={onGraveyardClick}
        disabled={zones.graveyard.length === 0}
        className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        GY: {zones.graveyard.length}
      </button>
      <button
        onClick={onExileClick}
        disabled={zones.exile.length === 0}
        className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Exile: {zones.exile.length}
      </button>
    </div>
  )
}

function ZoneModal({
  title,
  cards,
  onClose,
}: {
  title: string
  cards: CardType[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-medium">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        {cards.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No cards</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <Card key={card.id} card={card} size="sm" enablePreview={false} />
            ))}
          </div>
        )}
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
}: BattleSidebarContentProps) {
  const [zoneModal, setZoneModal] = useState<{
    title: string
    cards: CardType[]
  } | null>(null)

  const { opponent_name, coin_flip_name, your_zones, opponent_zones } = currentBattle

  const yourPoison = your_zones.counters?.poison?.['poison'] ?? 0
  const opponentPoison = opponent_zones.counters?.poison?.['poison'] ?? 0

  const yourAppliedUpgrades = selfUpgrades.filter((u) => u.upgrade_target)
  const opponentAppliedUpgrades = opponent_zones.upgrades.filter((u) => u.upgrade_target)

  return (
    <div className="p-3 space-y-4">
      {/* Battle info header */}
      <div className="text-center">
        <div className="text-sm text-gray-400">vs {opponent_name}</div>
        <div className="text-xs text-gray-500">
          First: <span className="text-amber-400">{coin_flip_name}</span>
        </div>
      </div>

      {/* Life totals and poison */}
      <div className="bg-black/30 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-4">
          {/* You */}
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">You</div>
            <div className="flex items-center justify-center gap-1 mb-2">
              <img
                src={POISON_COUNTER_IMAGE}
                alt="Poison"
                className="w-6 h-6 rounded object-cover"
              />
              <span className="text-purple-400 font-medium">{yourPoison}</span>
            </div>
            <LifeCounter
              life={yourLife}
              onChange={onYourLifeChange}
              label="Life"
            />
          </div>
          {/* Opponent */}
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">{opponent_name}</div>
            <div className="flex items-center justify-center gap-1 mb-2">
              <img
                src={POISON_COUNTER_IMAGE}
                alt="Poison"
                className="w-6 h-6 rounded object-cover"
              />
              <span className="text-purple-400 font-medium">{opponentPoison}</span>
            </div>
            <LifeCounter
              life={opponentLife}
              onChange={onOpponentLifeChange}
              label="Life"
            />
          </div>
        </div>
      </div>

      {/* Your zones */}
      <div className="space-y-2">
        <ZoneCounts
          zones={your_zones}
          label="Your"
          onGraveyardClick={() =>
            setZoneModal({ title: 'Your Graveyard', cards: your_zones.graveyard })
          }
          onExileClick={() =>
            setZoneModal({ title: 'Your Exile', cards: your_zones.exile })
          }
        />
        {yourAppliedUpgrades.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {yourAppliedUpgrades.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                size="sm"
                showUpgradeTarget
                enablePreview={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Opponent zones */}
      <div className="flex gap-2">
        {/* Left: Applied upgrades */}
        {opponentAppliedUpgrades.length > 0 && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            {opponentAppliedUpgrades.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                size="sm"
                showUpgradeTarget
                enablePreview={false}
              />
            ))}
          </div>
        )}
        {/* Right: Zone counts */}
        <div className="flex-1">
          <ZoneCounts
            zones={opponent_zones}
            label={opponent_name}
            onGraveyardClick={() =>
              setZoneModal({
                title: `${opponent_name}'s Graveyard`,
                cards: opponent_zones.graveyard,
              })
            }
            onExileClick={() =>
              setZoneModal({
                title: `${opponent_name}'s Exile`,
                cards: opponent_zones.exile,
              })
            }
          />
        </div>
      </div>

      {/* Zone modal */}
      {zoneModal && (
        <ZoneModal
          title={zoneModal.title}
          cards={zoneModal.cards}
          onClose={() => setZoneModal(null)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from './UpgradeStack'

interface ZoneDisplayProps {
  title: string
  cards: CardType[]
  maxThumbnails?: number
  showUpgradeTargets?: boolean
}

function ZoneModal({
  title,
  cards,
  showUpgradeTargets,
  onClose,
}: {
  title: string
  cards: CardType[]
  showUpgradeTargets?: boolean
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
          <div className="flex flex-wrap gap-3 items-end">
            {cards.map((card) =>
              showUpgradeTargets ? (
                <UpgradeStack key={card.id} upgrade={card} size="sm" />
              ) : (
                <Card key={card.id} card={card} size="sm" />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ZoneDisplay({ title, cards, maxThumbnails = 6, showUpgradeTargets = false }: ZoneDisplayProps) {
  const [showModal, setShowModal] = useState(false)

  const displayedCards = cards.slice(0, maxThumbnails)
  const remainingCount = cards.length - displayedCards.length

  return (
    <>
      <button
        onClick={() => cards.length > 0 && setShowModal(true)}
        className={`flex flex-col items-center p-2 rounded ${
          cards.length > 0
            ? 'hover:bg-gray-700/50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        <div className="text-[10px] text-gray-400 uppercase mb-1">
          {title} ({cards.length})
        </div>
        {cards.length === 0 ? (
          <div className="w-[80px] h-[112px] border border-dashed border-gray-600 rounded flex items-center justify-center">
            <span className="text-gray-600 text-[10px]">Empty</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <div className={`grid gap-1 ${showUpgradeTargets ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {displayedCards.map((card) =>
                showUpgradeTargets ? (
                  <UpgradeStack key={card.id} upgrade={card} size="xs" />
                ) : (
                  <Card key={card.id} card={card} size="sm" />
                )
              )}
            </div>
            {remainingCount > 0 && (
              <div className="text-[10px] text-gray-400">+{remainingCount} more</div>
            )}
          </div>
        )}
      </button>

      {showModal && (
        <ZoneModal
          title={title}
          cards={cards}
          showUpgradeTargets={showUpgradeTargets}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

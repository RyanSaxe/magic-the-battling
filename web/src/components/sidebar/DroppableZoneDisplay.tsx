import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import { Card } from '../card'
import { DraggableCard, DroppableZone } from '../../dnd'

interface DroppableZoneDisplayProps {
  title: string
  zone: ZoneName
  cards: CardType[]
  maxThumbnails?: number
  validFromZones: ZoneName[]
  isOpponent?: boolean
}

function ZoneModal({
  title,
  zone,
  cards,
  isOpponent,
  onClose,
}: {
  title: string
  zone: ZoneName
  cards: CardType[]
  isOpponent: boolean
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
            {cards.map((card) =>
              isOpponent ? (
                <Card key={card.id} card={card} size="sm" />
              ) : (
                <DraggableCard key={card.id} card={card} zone={zone} size="sm" />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function DroppableZoneDisplay({
  title,
  zone,
  cards,
  maxThumbnails = 3,
  validFromZones,
  isOpponent = false,
}: DroppableZoneDisplayProps) {
  const [showModal, setShowModal] = useState(false)

  const displayedCards = cards.slice(0, maxThumbnails)
  const remainingCount = cards.length - displayedCards.length

  return (
    <>
      <DroppableZone
        zone={zone}
        validFromZones={validFromZones}
        disabled={isOpponent}
        className="flex-1"
      >
        <button
          onClick={() => cards.length > 0 && setShowModal(true)}
          className={`w-full flex flex-col items-center p-2 rounded ${
            cards.length > 0
              ? 'hover:bg-gray-700/50 cursor-pointer'
              : 'cursor-default'
          }`}
        >
          <div className="text-[10px] text-gray-400 uppercase mb-1">
            {title} ({cards.length})
          </div>
          {cards.length === 0 ? (
            <div className="w-[50px] h-[70px] border border-dashed border-gray-600 rounded flex items-center justify-center">
              <span className="text-gray-600 text-[10px]">Empty</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex gap-0.5">
                {displayedCards.map((card) =>
                  isOpponent ? (
                    <Card key={card.id} card={card} size="xs" />
                  ) : (
                    <DraggableCard key={card.id} card={card} zone={zone} size="xs" />
                  )
                )}
              </div>
              {remainingCount > 0 && (
                <div className="text-[10px] text-gray-400">+{remainingCount} more</div>
              )}
            </div>
          )}
        </button>
      </DroppableZone>

      {showModal && (
        <ZoneModal
          title={title}
          zone={zone}
          cards={cards}
          isOpponent={isOpponent}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

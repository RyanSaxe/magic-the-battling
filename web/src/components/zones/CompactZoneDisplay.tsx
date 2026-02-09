import { useState } from 'react'
import type { Card as CardType, ZoneName } from '../../types'
import { DroppableZone } from '../../dnd'
import { ZoneModal } from '../sidebar/DroppableZoneDisplay'

interface CompactZoneDisplayProps {
  title: string
  zone: ZoneName
  cards: CardType[]
  height: number
  width: number
  isOpponent?: boolean
  canManipulateOpponent?: boolean
  validFromZones: ZoneName[]
}

export function CompactZoneDisplay({
  title,
  zone,
  cards,
  height,
  width,
  isOpponent = false,
  canManipulateOpponent = false,
  validFromZones,
}: CompactZoneDisplayProps) {
  const [showModal, setShowModal] = useState(false)
  const allowInteraction = !isOpponent || canManipulateOpponent
  const zoneOwner = isOpponent ? 'opponent' : 'player' as const

  const topCard = cards[cards.length - 1]
  const imageUrl = topCard?.image_url

  return (
    <>
      <DroppableZone
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowInteraction}
      >
        <button
          onClick={() => cards.length > 0 && setShowModal(true)}
          className={`relative flex flex-col items-center justify-end overflow-hidden rounded border border-gray-700 ${
            cards.length > 0
              ? 'hover:border-gray-500 cursor-pointer'
              : 'border-dashed cursor-default'
          }`}
          style={{ width, height }}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain rounded"
              draggable={false}
            />
          )}
          <div className="relative z-10 flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5 mb-0.5">
            <span className="text-[8px] uppercase text-gray-300 font-medium leading-none">{title}</span>
            <span className="text-[10px] font-bold text-white leading-none">{cards.length}</span>
          </div>
        </button>
      </DroppableZone>

      {showModal && (
        <ZoneModal
          title={`${title} (${cards.length})`}
          zone={zone}
          cards={cards}
          allowInteraction={allowInteraction}
          isOpponent={isOpponent}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

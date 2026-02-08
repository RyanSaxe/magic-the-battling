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
          className={`flex flex-col items-center justify-center rounded transition-colors ${
            cards.length > 0
              ? 'hover:bg-gray-700/50 cursor-pointer'
              : 'cursor-default'
          }`}
          style={{
            width,
            height,
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className={`flex flex-col items-center justify-center w-full h-full rounded ${imageUrl ? 'bg-black/60' : ''}`}>
            <span className="text-[9px] uppercase text-gray-300 font-medium leading-none">{title}</span>
            {cards.length > 0 ? (
              <span className="text-xs font-bold text-white">{cards.length}</span>
            ) : (
              <span className="text-[8px] text-gray-500 mt-0.5">—</span>
            )}
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
